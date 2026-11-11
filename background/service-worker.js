/**
 * vsubmitter - Service Worker Background Script (v1.3.0)
 * Manifest V3 compliant, handles tab querying, URL validation, and cross-frame script injection.
 */

const PLATFORMS = {
  xiaohongshu: {
    id: 'xiaohongshu',
    name: '小红书',
    publishKeywords: ['/publish'],
    defaultUrl: 'https://creator.xiaohongshu.com/publish/publish?target=video'
  },
  douyin: {
    id: 'douyin',
    name: '抖音',
    publishKeywords: ['/creator-micro/content'],
    defaultUrl: 'https://creator.douyin.com/creator-micro/content/upload'
  },
  wechat_channels: {
    id: 'wechat_channels',
    name: '微信视频号',
    publishKeywords: ['/post/create', '/post/'],
    defaultUrl: 'https://channels.weixin.qq.com/platform/post/create'
  },
  bilibili: {
    id: 'bilibili',
    name: '哔哩哔哩',
    publishKeywords: ['/platform/upload/video'],
    defaultUrl: 'https://member.bilibili.com/platform/upload/video/frame'
  }
};

/**
 * Click extension icon in toolbar -> open or focus full dashboard tab
 */
chrome.action.onClicked.addListener(async () => {
  const dashboardUrl = chrome.runtime.getURL('dashboard/index.html');
  const tabs = await chrome.tabs.query({});
  const found = tabs.find(t => t.url && t.url.startsWith(dashboardUrl));
  if (found) {
    await chrome.tabs.update(found.id, { active: true });
    if (found.windowId) {
      await chrome.windows.update(found.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url: dashboardUrl });
  }
});

/**
 * Find active or opened tabs for all platforms (prioritizing true publish pages)
 */
async function getPlatformTabs() {
  const tabs = await chrome.tabs.query({});
  const result = {};

  for (const [key, plat] of Object.entries(PLATFORMS)) {
    result[key] = {
      ...plat,
      tab: null
    };
  }

  for (const [key, plat] of Object.entries(PLATFORMS)) {
    // 1. First priority: tabs that are on the actual publish URL
    const publishTabs = tabs.filter(t => {
      const u = t.url || '';
      return plat.publishKeywords.some(kw => u.includes(kw));
    });

    if (publishTabs.length > 0) {
      const activePub = publishTabs.find(t => t.active) || publishTabs[0];
      result[key].tab = { id: activePub.id, title: activePub.title, url: activePub.url };
      continue;
    }

    // 2. Second priority: any tab matching the domain
    const domainMatch = tabs.find(t => {
      const u = t.url || '';
      if (key === 'xiaohongshu') return u.includes('creator.xiaohongshu.com');
      if (key === 'douyin') return u.includes('creator.douyin.com');
      if (key === 'wechat_channels') return u.includes('channels.weixin.qq.com');
      if (key === 'bilibili') return u.includes('member.bilibili.com');
      return false;
    });

    if (domainMatch) {
      result[key].tab = { id: domainMatch.id, title: domainMatch.title, url: domainMatch.url };
    }
  }

  return result;
}

/**
 * Wait for a tab to finish loading
 */
function waitForTabReady(tabId, timeout = 12000) {
  return new Promise((resolve) => {
    const listener = (tid, changeInfo) => {
      if (tid === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeout);
  });
}

/**
 * Open platform tab if not open, or activate & redirect existing tab to publish page
 */
async function ensurePlatformTab(platformId) {
  const plat = PLATFORMS[platformId];
  if (!plat) throw new Error(`Unknown platform: ${platformId}`);

  const status = await getPlatformTabs();
  const existingTab = status[platformId]?.tab;

  if (existingTab) {
    const isPublish = plat.publishKeywords.some(kw => (existingTab.url || '').includes(kw));
    if (!isPublish) {
      // Auto redirect to publish page
      await chrome.tabs.update(existingTab.id, { url: plat.defaultUrl, active: true });
      await waitForTabReady(existingTab.id);
    } else {
      await chrome.tabs.update(existingTab.id, { active: true });
    }
    return existingTab.id;
  }

  // Open new tab
  const newTab = await chrome.tabs.create({ url: plat.defaultUrl, active: false });
  await waitForTabReady(newTab.id);
  return newTab.id;
}

/**
 * Execute fill script on tab (injecting into main frame + all child iframes)
 */
async function executeFill(tabId, platformId, payload) {
  const plat = PLATFORMS[platformId];
  try {
    // If the current tab URL is not on the publish page, navigate it first
    const tab = await chrome.tabs.get(tabId);
    if (tab && plat && !plat.publishKeywords.some(kw => (tab.url || '').includes(kw))) {
      await chrome.tabs.update(tabId, { url: plat.defaultUrl });
      await waitForTabReady(tabId);
    }

    // Bring the tab to front: background tabs throttle CSS transitions/rAF,
    // which leaves dialogs stuck in "fade-leave" and breaks popover/dialog flows.
    try {
      const t = await chrome.tabs.update(tabId, { active: true });
      if (t?.windowId) await chrome.windows.update(t.windowId, { focused: true });
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {}

    // Determine target frame:
    // Bilibili uses an embedded iframe for uploads; WeChat Channels, Xiaohongshu, and Douyin are in the main top-level frame.
    const isBili = platformId === 'bilibili';
    const scriptTarget = isBili ? { tabId, allFrames: true } : { tabId };

    // 1. Inject dom helpers & platform adapter
    await chrome.scripting.executeScript({
      target: scriptTarget,
      files: ['scripts/dom-helpers.js', `scripts/adapters/${platformId}.js`]
    });

    // 2. Invoke adapter runner
    const results = await chrome.scripting.executeScript({
      target: scriptTarget,
      func: async (pid, data) => {
        try {
          const adapter = window.__vsubmitter_adapters?.[pid];
          if (!adapter) {
            return { success: false, logs: [], warnings: [`未在当前frame找到适配器: ${pid}`] };
          }
          return await adapter.run(data);
        } catch (err) {
          return { success: false, logs: [], warnings: [`适配器执行异常: ${err.message || err}`] };
        }
      },
      args: [platformId, payload]
    });

    // 3. Merge logs and warnings across frames
    const allLogs = [];
    const allWarnings = [];
    let hasSuccess = false;

    for (const r of results) {
      if (r.result?.logs?.length > 0) {
        hasSuccess = true;
        allLogs.push(...r.result.logs);
        // Only include warnings from the frame that actually ran
        if (r.result.warnings) {
          allWarnings.push(...r.result.warnings);
        }
      }
    }

    // If no frame succeeded, collect warnings from all frames that had adapters
    if (!hasSuccess) {
      for (const r of results) {
        if (r.result?.warnings?.length > 0) {
          const meaningful = r.result.warnings.filter(w => !w.includes('未在当前frame找到适配器'));
          allWarnings.push(...meaningful);
        }
      }
    }

    const uniqueWarnings = Array.from(new Set(allWarnings));

    if (hasSuccess || allLogs.length > 0) {
      return { success: true, logs: allLogs, warnings: uniqueWarnings };
    }

    // If no progress was made in any frame
    return {
      success: false,
      logs: allLogs,
      warnings: uniqueWarnings.length > 0 ? uniqueWarnings : ['未能定位到发布表单元素，请确认页面是否已打开且处于视频发布页']
    };
  } catch (err) {
    return {
      success: false,
      logs: [],
      warnings: [`执行注入失败: ${err.message || err}`]
    };
  }
}

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === 'GET_STATUS') {
        const status = await getPlatformTabs();
        sendResponse({ success: true, status });
      } else if (message.action === 'OPEN_TAB') {
        const tabId = await ensurePlatformTab(message.platformId);
        sendResponse({ success: true, tabId });
      } else if (message.action === 'FILL_PLATFORM') {
        let tabId = message.tabId;
        if (!tabId) {
          tabId = await ensurePlatformTab(message.platformId);
        }
        const result = await executeFill(tabId, message.platformId, message.payload);
        sendResponse({ success: true, result });
      } else if (message.action === 'RELOAD_EXTENSION') {
        chrome.runtime.reload();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  return true; // Keep channel open for async response
});
