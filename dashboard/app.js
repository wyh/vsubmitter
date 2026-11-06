/**
 * vsubmitter Dashboard Workbench Controller (v1.2.0)
 * Full-page interactive management for video multi-platform distribution.
 */

// Global State
let currentVideoFile = null;
let currentCoverVertical = null;
let currentCoverHorizontal = null;
let platformTabsStatus = {};

// Elements: Form Inputs
const rawMarkdownEl = document.getElementById('rawMarkdown');
const mdFileInput = document.getElementById('mdFileInput');
const mdDropzone = document.getElementById('mdDropzone');
const mdDropIdle = document.getElementById('mdDropIdle');
const mdLoaded = document.getElementById('mdLoaded');
const mdFileName = document.getElementById('mdFileName');
const mdFileSize = document.getElementById('mdFileSize');
const btnChangeMd = document.getElementById('btnChangeMd');
const btnRemoveMd = document.getElementById('btnRemoveMd');

const fieldTitleEl = document.getElementById('fieldTitle');
const fieldDescEl = document.getElementById('fieldDescription');
const fieldTagsEl = document.getElementById('fieldTags');
const tagsPillsContainer = document.getElementById('tagsPillsContainer');

const titleCharCountEl = document.getElementById('titleCharCount');
const descCharCountEl = document.getElementById('descCharCount');
const tagsCountEl = document.getElementById('tagsCount');

const badgeXhs = document.getElementById('badgeXhs');
const badgeDy = document.getElementById('badgeDy');
const badgeWx = document.getElementById('badgeWx');
const badgeBili = document.getElementById('badgeBili');

// Video Elements
const videoFileInput = document.getElementById('videoFileInput');
const videoDropzone = document.getElementById('videoDropzone');
const videoDropIdle = document.getElementById('videoDropIdle');
const videoLoaded = document.getElementById('videoLoaded');
const videoFileName = document.getElementById('videoFileName');
const videoFileSize = document.getElementById('videoFileSize');
const btnChangeVideo = document.getElementById('btnChangeVideo');
const btnRemoveVideo = document.getElementById('btnRemoveVideo');

// Vertical Cover Elements
const coverVerticalFileInput = document.getElementById('coverVerticalFileInput');
const coverVerticalDropzone = document.getElementById('coverVerticalDropzone');
const coverVerticalDropIdle = document.getElementById('coverVerticalDropIdle');
const coverVerticalLoaded = document.getElementById('coverVerticalLoaded');
const coverVerticalPreviewImg = document.getElementById('coverVerticalPreviewImg');
const coverVerticalFileName = document.getElementById('coverVerticalFileName');
const coverVerticalFileSize = document.getElementById('coverVerticalFileSize');
const btnChangeCoverVertical = document.getElementById('btnChangeCoverVertical');
const btnRemoveCoverVertical = document.getElementById('btnRemoveCoverVertical');

// Horizontal Cover Elements
const coverHorizontalFileInput = document.getElementById('coverHorizontalFileInput');
const coverHorizontalDropzone = document.getElementById('coverHorizontalDropzone');
const coverHorizontalDropIdle = document.getElementById('coverHorizontalDropIdle');
const coverHorizontalLoaded = document.getElementById('coverHorizontalLoaded');
const coverHorizontalPreviewImg = document.getElementById('coverHorizontalPreviewImg');
const coverHorizontalFileName = document.getElementById('coverHorizontalFileName');
const coverHorizontalFileSize = document.getElementById('coverHorizontalFileSize');
const btnChangeCoverHorizontal = document.getElementById('btnChangeCoverHorizontal');
const btnRemoveCoverHorizontal = document.getElementById('btnRemoveCoverHorizontal');

// Action Buttons
const btnLoadDemo = document.getElementById('btnLoadDemo');
const btnClearAll = document.getElementById('btnClearAll');
const btnRefreshStatus = document.getElementById('btnRefreshStatus');
const btnSubmitAll = document.getElementById('btnSubmitAll');
const btnClearLogs = document.getElementById('btnClearLogs');
const chkAutoOpenTab = document.getElementById('chkAutoOpenTab');

// Log & Console
const logListEl = document.getElementById('logList');
const logSummaryBadge = document.getElementById('logSummaryBadge');

// ── Bulletproof Markdown & Tags Parser ────────────────────────────────────────
function parseMarkdownContent(text) {
  if (!text || !text.trim()) {
    return { title: '', description: '', tags: [] };
  }

  const raw = text.trim();
  let tags = [];
  let textWithoutTags = raw;

  // 1. Tag Section Regex (Matches # Tags, Tags:, 话题标签:, 标签:, etc.)
  const tagSectionRegex = /(?:^|\n)#*\s*(?:话题标签|话题|标签|tags?|hashtags?)[:：]?\s*\n*([\s\S]*?)(?=\n+#*\s*(?:标题|描述|正文|简介|$)|$)/i;
  const tagMatch = raw.match(tagSectionRegex);

  if (tagMatch) {
    const rawTagBlock = tagMatch[1].trim();
    tags = rawTagBlock
      .split(/[\n,，、;；\s#]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0 && !/^(?:tags?|话题|标签|hashtags?)$/i.test(t));
    textWithoutTags = raw.replace(tagSectionRegex, '\n');
  }

  // 2. Also capture inline #tag from the text
  const inlineHashtags = textWithoutTags.match(/#([\p{L}\p{N}_\-]+)/gu);
  if (inlineHashtags) {
    for (const ht of inlineHashtags) {
      const clean = ht.replace(/^#/, '').trim();
      if (clean && !tags.includes(clean)) tags.push(clean);
    }
  }
  tags = Array.from(new Set(tags));

  // 3. Title Extraction
  let title = '';
  const inlineTitle = textWithoutTags.match(/(?:^|\n)#*\s*标题[:：]?\s*([^\n]+)/i);
  if (inlineTitle && inlineTitle[1].trim() && !/^(?:描述|正文|简介|tags?|话题|标签)/i.test(inlineTitle[1].trim())) {
    title = inlineTitle[1].trim().replace(/^#+\s*/, '');
  } else {
    const multiTitle = textWithoutTags.match(/(?:^|\n)#*\s*标题[:：]?\s*\n+([^\n]+)/i);
    if (multiTitle && multiTitle[1].trim()) {
      title = multiTitle[1].trim().replace(/^#+\s*/, '');
    }
  }

  // 4. Description Extraction
  let description = '';
  const descMatch = textWithoutTags.match(/(?:^|\n)#*\s*(?:描述|正文|简介)[:：]?\s*\n*([\s\S]*?)(?=\n+#*\s*(?:标题|tags?|话题|标签)|$)/i);
  if (descMatch && descMatch[1].trim()) {
    description = descMatch[1].trim();
  } else {
    // Fallback: exclude title lines and section headers
    const lines = textWithoutTags.split('\n');
    const result = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (result.length > 0) result.push('');
        continue;
      }
      if (trimmed === title || (title && trimmed.includes(title))) continue;
      if (/^#*\s*(?:标题|描述|正文|简介|tags?|话题|标签)[:：]?$/i.test(trimmed)) continue;
      result.push(line);
    }
    description = result.join('\n').trim();
  }

  return { title, description, tags };
}

// ── UI Updates ───────────────────────────────────────────────────────────────
function updateFieldCounters() {
  const title = fieldTitleEl.value;
  const desc = fieldDescEl.value;
  const tagsStr = fieldTagsEl.value;

  titleCharCountEl.textContent = `${title.length} 字`;
  descCharCountEl.textContent = `${desc.length} 字`;

  // Warning badges for length
  badgeXhs.className = `limit-badge ${title.length > 20 ? 'warn' : ''}`;
  badgeDy.className = `limit-badge ${title.length > 30 ? 'warn' : ''}`;
  badgeWx.className = `limit-badge ${(title.length < 6 || title.length > 16) ? 'warn' : ''}`;
  badgeBili.className = `limit-badge ${title.length > 80 ? 'warn' : ''}`;

  // Parse tags
  const tags = parseTagsString(tagsStr);
  tagsCountEl.textContent = `${tags.length} 个标签`;
  renderTagPills(tags);

  saveDraft();
}

function parseTagsString(str) {
  if (!str) return [];
  const parts = str.split(/[\n,，、;；\s#]+/);
  return Array.from(new Set(parts.map(p => p.replace(/^#/, '').trim()))).filter(Boolean);
}

function renderTagPills(tags) {
  tagsPillsContainer.innerHTML = '';
  tags.forEach(tag => {
    const item = document.createElement('span');
    item.className = 'tag-item';
    item.innerHTML = `#${escapeHtml(tag)} <span class="tag-close" data-tag="${escapeHtml(tag)}">×</span>`;
    tagsPillsContainer.appendChild(item);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function handleMarkdownInput() {
  const md = rawMarkdownEl.value;
  const parsed = parseMarkdownContent(md);

  fieldTitleEl.value = parsed.title;
  fieldDescEl.value = parsed.description;
  fieldTagsEl.value = parsed.tags.map(t => `#${t}`).join(' ');

  updateFieldCounters();
}

tagsPillsContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('tag-close')) {
    const removeTag = e.target.getAttribute('data-tag');
    let tags = parseTagsString(fieldTagsEl.value);
    tags = tags.filter(t => t !== removeTag);
    fieldTagsEl.value = tags.map(t => `#${t}`).join(' ');
    updateFieldCounters();
  }
});

// ── Dropzone & File Handling Utilities ────────────────────────────────────────
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

async function setMarkdownFile(file) {
  try {
    const text = await readFileAsText(file);
    rawMarkdownEl.value = text;
    handleMarkdownInput();

    mdDropIdle.classList.add('hidden');
    mdLoaded.classList.remove('hidden');
    mdFileName.textContent = file.name;
    mdFileSize.textContent = formatBytes(file.size);
    addConsoleLog('info', `📄 Markdown 文件已载入并智能解析: ${file.name} (${formatBytes(file.size)})`);
  } catch (err) {
    addConsoleLog('error', `❌ 读取 Markdown 文件失败: ${err.message}`);
  }
}

// ── Markdown Dropzone Handlers ────────────────────────────────────────────────
mdDropzone.addEventListener('click', () => mdFileInput.click());
btnChangeMd.addEventListener('click', (e) => {
  e.stopPropagation();
  mdFileInput.click();
});
mdFileInput.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    await setMarkdownFile(e.target.files[0]);
  }
});
setupDragDrop(mdDropzone, async (files) => {
  if (files.length > 0) {
    await setMarkdownFile(files[0]);
  }
});
btnRemoveMd.addEventListener('click', (e) => {
  e.stopPropagation();
  mdFileInput.value = '';
  rawMarkdownEl.value = '';
  handleMarkdownInput();
  mdLoaded.classList.add('hidden');
  mdDropIdle.classList.remove('hidden');
  addConsoleLog('info', '已移除 Markdown 文件');
});

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ── Video File Handlers ───────────────────────────────────────────────────────
videoDropzone.addEventListener('click', () => videoFileInput.click());
btnChangeVideo.addEventListener('click', (e) => {
  e.stopPropagation();
  videoFileInput.click();
});
videoFileInput.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    await setVideoFile(e.target.files[0]);
  }
});

setupDragDrop(videoDropzone, async (files) => {
  if (files.length > 0) {
    await setVideoFile(files[0]);
  }
});

async function setVideoFile(file) {
  if (file.size > 80 * 1024 * 1024) {
    addConsoleLog('warn', `⚠️ 视频文件较大 (${formatBytes(file.size)})，若注入超时建议在各后台手动拖入`);
  }
  const dataUrl = await readFileAsDataURL(file);
  currentVideoFile = {
    name: file.name,
    type: file.type || 'video/mp4',
    size: file.size,
    dataUrl
  };

  videoDropIdle.classList.add('hidden');
  videoLoaded.classList.remove('hidden');
  videoFileName.textContent = file.name;
  videoFileSize.textContent = formatBytes(file.size);
  addConsoleLog('info', `🎬 视频文件已载入: ${file.name} (${formatBytes(file.size)})`);
}

btnRemoveVideo.addEventListener('click', (e) => {
  e.stopPropagation();
  currentVideoFile = null;
  videoFileInput.value = '';
  videoLoaded.classList.add('hidden');
  videoDropIdle.classList.remove('hidden');
  addConsoleLog('info', '已移除选中的视频文件');
});

// ── Vertical Cover Handlers ───────────────────────────────────────────────────
coverVerticalDropzone.addEventListener('click', () => coverVerticalFileInput.click());
btnChangeCoverVertical.addEventListener('click', (e) => {
  e.stopPropagation();
  coverVerticalFileInput.click();
});
coverVerticalFileInput.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    await setVerticalCover(e.target.files[0]);
  }
});
setupDragDrop(coverVerticalDropzone, async (files) => {
  if (files.length > 0) {
    await setVerticalCover(files[0]);
  }
});

async function setVerticalCover(file) {
  const dataUrl = await readFileAsDataURL(file);
  currentCoverVertical = {
    name: file.name || 'vertical_cover.png',
    type: file.type || 'image/png',
    size: file.size,
    dataUrl
  };

  coverVerticalDropIdle.classList.add('hidden');
  coverVerticalLoaded.classList.remove('hidden');
  coverVerticalPreviewImg.src = dataUrl;
  coverVerticalFileName.textContent = currentCoverVertical.name;
  coverVerticalFileSize.textContent = formatBytes(file.size);
  addConsoleLog('info', `📱 竖版封面已载入: ${currentCoverVertical.name}`);
}

btnRemoveCoverVertical.addEventListener('click', (e) => {
  e.stopPropagation();
  currentCoverVertical = null;
  coverVerticalFileInput.value = '';
  coverVerticalLoaded.classList.add('hidden');
  coverVerticalDropIdle.classList.remove('hidden');
  coverVerticalPreviewImg.src = '';
});

// ── Horizontal Cover Handlers ─────────────────────────────────────────────────
coverHorizontalDropzone.addEventListener('click', () => coverHorizontalFileInput.click());
btnChangeCoverHorizontal.addEventListener('click', (e) => {
  e.stopPropagation();
  coverHorizontalFileInput.click();
});
coverHorizontalFileInput.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    await setHorizontalCover(e.target.files[0]);
  }
});
setupDragDrop(coverHorizontalDropzone, async (files) => {
  if (files.length > 0) {
    await setHorizontalCover(files[0]);
  }
});

async function setHorizontalCover(file) {
  const dataUrl = await readFileAsDataURL(file);
  currentCoverHorizontal = {
    name: file.name || 'horizontal_cover.png',
    type: file.type || 'image/png',
    size: file.size,
    dataUrl
  };

  coverHorizontalDropIdle.classList.add('hidden');
  coverHorizontalLoaded.classList.remove('hidden');
  coverHorizontalPreviewImg.src = dataUrl;
  coverHorizontalFileName.textContent = currentCoverHorizontal.name;
  coverHorizontalFileSize.textContent = formatBytes(file.size);
  addConsoleLog('info', `🖥️ 横版封面已载入: ${currentCoverHorizontal.name}`);
}

btnRemoveCoverHorizontal.addEventListener('click', (e) => {
  e.stopPropagation();
  currentCoverHorizontal = null;
  coverHorizontalFileInput.value = '';
  coverHorizontalLoaded.classList.add('hidden');
  coverHorizontalDropIdle.classList.remove('hidden');
  coverHorizontalPreviewImg.src = '';
});

// ── Global Drag & Drop Helper ─────────────────────────────────────────────────
function setupDragDrop(el, onDropFiles) {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('dragover');
  });
  el.addEventListener('dragleave', () => el.classList.remove('dragover'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      await onDropFiles(e.dataTransfer.files);
    }
  });
}

// ── Smart Clipboard Paste (Cmd + V Anywhere) ──────────────────────────────────
window.addEventListener('paste', async (e) => {
  // If user is focused on an input/textarea, let native paste handle text
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && (!e.clipboardData.files || e.clipboardData.files.length === 0)) {
    return;
  }

  if (e.clipboardData && e.clipboardData.files.length > 0) {
    const file = e.clipboardData.files[0];
    if (file.type.startsWith('image/')) {
      const dataUrl = await readFileAsDataURL(file);
      const dims = await getImageDimensions(dataUrl);
      const isPortrait = dims.height >= dims.width;

      if (isPortrait) {
        await setVerticalCover(file);
        addConsoleLog('success', `🖼️ 截屏自动识别为竖版 (${dims.width}×${dims.height})，已填入【竖版封面】！`);
      } else {
        await setHorizontalCover(file);
        addConsoleLog('success', `🖼️ 截屏自动识别为横版 (${dims.width}×${dims.height})，已填入【横版封面】！`);
      }
    }
  }
});

// ── Smart Window Drag & Drop (Any File Anywhere) ──────────────────────────────
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  // If dropped directly inside a specific dropzone, that dropzone handles it
  if (e.target.closest('.big-dropzone')) return;

  e.preventDefault();
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    for (const file of e.dataTransfer.files) {
      const name = (file.name || '').toLowerCase();
      if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) {
        await setMarkdownFile(file);
      } else if (file.type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.mkv')) {
        await setVideoFile(file);
      } else if (file.type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp')) {
        const dataUrl = await readFileAsDataURL(file);
        const dims = await getImageDimensions(dataUrl);
        if (dims.height >= dims.width) {
          await setVerticalCover(file);
        } else {
          await setHorizontalCover(file);
        }
      }
    }
  }
});

// ── Platform Tabs Status ──────────────────────────────────────────────────────
async function refreshPlatformStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'GET_STATUS' });
    if (response?.success && response.status) {
      platformTabsStatus = response.status;
      for (const [key, plat] of Object.entries(platformTabsStatus)) {
        const statusEl = document.getElementById(`status_${key}`);
        if (!statusEl) continue;
        const dot = statusEl.querySelector('.status-indicator');
        const label = statusEl.querySelector('.status-label');

        if (plat.tab) {
          dot.className = 'status-indicator online';
          label.textContent = `已打开 (标签页 #${plat.tab.id})`;
          label.title = plat.tab.title || plat.tab.url;
        } else {
          dot.className = 'status-indicator offline';
          label.textContent = '未检测到后台';
          label.title = '未找到打开的对应后台标签页';
        }
      }
    }
  } catch (err) {
    console.warn('Failed to refresh platform tabs:', err);
  }
}

// Open individual platform tab button
document.querySelectorAll('.btn-open-tab').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const platId = e.target.getAttribute('data-plat');
    if (platId) {
      addConsoleLog('info', `🌐 正在打开/激活 ${platId} 后台...`);
      await chrome.runtime.sendMessage({ action: 'OPEN_TAB', platformId: platId });
      await refreshPlatformStatus();
    }
  });
});

// Single platform sync button
document.querySelectorAll('.btn-single-sync').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const platId = e.target.getAttribute('data-plat');
    if (platId) {
      runSubmit([platId]);
    }
  });
});

// Single platform horizontal cover sync
document.querySelectorAll('.btn-cover-horizontal').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const platId = e.target.getAttribute('data-plat');
    if (platId) {
      runSubmit([platId], { coverOnly: true, forceOrientation: 'horizontal' });
    }
  });
});

// Single platform vertical cover sync
document.querySelectorAll('.btn-cover-vertical').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const platId = e.target.getAttribute('data-plat');
    if (platId) {
      runSubmit([platId], { coverOnly: true, forceOrientation: 'vertical' });
    }
  });
});

// Single platform cover-only sync button (legacy / fallback)
document.querySelectorAll('.btn-cover-only').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const platId = e.target.getAttribute('data-plat');
    if (platId) {
      runSubmit([platId], { coverOnly: true });
    }
  });
});

// Reload extension
const btnReloadExt = document.getElementById('btnReloadExt');
if (btnReloadExt) {
  btnReloadExt.addEventListener('click', async () => {
    addConsoleLog('info', '⚡ 正在重载插件 Service Worker 与全部适配器...');
    try {
      await chrome.runtime.sendMessage({ action: 'RELOAD_EXTENSION' });
    } catch (e) {}
    setTimeout(() => {
      window.location.reload();
    }, 400);
  });
}

// ── Console Log Utilities ─────────────────────────────────────────────────────
function clearConsoleLogs() {
  logListEl.innerHTML = '';
}

function addConsoleLog(type, message) {
  const placeholder = logListEl.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();

  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${time}] ${message}`;
  logListEl.appendChild(entry);
  logListEl.scrollTop = logListEl.scrollHeight;
}

btnClearLogs.addEventListener('click', () => {
  clearConsoleLogs();
  logListEl.innerHTML = `
    <div class="log-placeholder">
      <div class="placeholder-icon">☕</div>
      <div>日志已清空</div>
    </div>
  `;
});

// ── Submit & Execute Flow ─────────────────────────────────────────────────────
async function runSubmit(targetPlatforms = null, options = {}) {
  // Always fetch latest opened tabs immediately
  await refreshPlatformStatus();

  const isCoverOnly = !!options.coverOnly;
  const title = fieldTitleEl.value.trim();
  const description = fieldDescEl.value.trim();
  const tags = parseTagsString(fieldTagsEl.value);

  if (!isCoverOnly && !title && !description) {
    alert('请先输入或粘贴视频标题/描述！');
    return;
  }

  if (isCoverOnly && !currentCoverVertical && !currentCoverHorizontal) {
    alert('请先在左侧上传或通过 Cmd+V 粘贴封面图片！');
    return;
  }

  btnSubmitAll.disabled = true;
  btnSubmitAll.querySelector('.hero-btn-title').textContent = isCoverOnly ? '正在补传封面中...' : '正在同步填入中...';
  logSummaryBadge.textContent = '执行中';
  logSummaryBadge.className = 'badge badge-running';

  const platforms = targetPlatforms || ['xiaohongshu', 'douyin', 'wechat_channels', 'bilibili'].filter(key => {
    const chk = document.getElementById(`chk_${key}`);
    return chk && chk.checked;
  });

  if (platforms.length === 0) {
    addConsoleLog('warn', '未选中任何平台进行填入。');
    btnSubmitAll.disabled = false;
    btnSubmitAll.querySelector('.hero-btn-title').textContent = '一键同步填入所选平台';
    logSummaryBadge.textContent = '未选平台';
    return;
  }

  addConsoleLog('info', isCoverOnly
    ? `🖼️ 开始向 ${platforms.length} 个目标平台补传封面...`
    : `🚀 开始向 ${platforms.length} 个目标平台同步内容...`);

  let successCount = 0;
  const autoOpen = chkAutoOpenTab.checked;

  for (const platId of platforms) {
    const platInfo = platformTabsStatus[platId] || {};
    const platName = platInfo.name || platId;
    let tabId = platInfo.tab?.id;

    if (isCoverOnly) {
      addConsoleLog('info', `🖼️ 正在向 [${platName}] 补传封面...`);
    } else {
      addConsoleLog('info', `👉 正在处理 [${platName}]...`);
    }

    if (!tabId) {
      if (autoOpen) {
        addConsoleLog('info', `[${platName}] 后台未打开，正在新建标签页并等待就绪...`);
        try {
          const openRes = await chrome.runtime.sendMessage({ action: 'OPEN_TAB', platformId: platId });
          tabId = openRes?.tabId;
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          addConsoleLog('error', `[${platName}] 打开标签页失败: ${e.message}`);
          continue;
        }
      } else {
        addConsoleLog('warn', `⚠️ [${platName}] 后台未打开且未开启自动新建，跳过`);
        continue;
      }
    }

    // Determine cover and orientation for this specific platform
    const coverChoiceEl = document.getElementById(`coverType_${platId}`);
    const coverChoice = coverChoiceEl ? coverChoiceEl.value : 'auto';

    let preferredOrientation = options.forceOrientation || coverChoice || 'auto';
    let coverForPlat = null;

    if (preferredOrientation === 'horizontal') {
      coverForPlat = currentCoverHorizontal || currentCoverVertical;
    } else if (preferredOrientation === 'vertical') {
      coverForPlat = currentCoverVertical || currentCoverHorizontal;
    } else {
      if (platId === 'bilibili') {
        coverForPlat = currentCoverHorizontal || currentCoverVertical;
        preferredOrientation = 'horizontal';
      } else {
        coverForPlat = currentCoverHorizontal || currentCoverVertical;
      }
    }

    const payload = {
      title,
      description,
      tags,
      coverOnly: isCoverOnly,
      preferredOrientation,
      videoFile: (currentVideoFile && !isCoverOnly) ? {
        name: currentVideoFile.name,
        type: currentVideoFile.type,
        dataUrl: currentVideoFile.dataUrl
      } : null,
      coverFile: coverForPlat ? {
        name: coverForPlat.name,
        type: coverForPlat.type,
        dataUrl: coverForPlat.dataUrl
      } : null,
      coverVertical: currentCoverVertical ? {
        name: currentCoverVertical.name,
        type: currentCoverVertical.type,
        dataUrl: currentCoverVertical.dataUrl
      } : null,
      coverHorizontal: currentCoverHorizontal ? {
        name: currentCoverHorizontal.name,
        type: currentCoverHorizontal.type,
        dataUrl: currentCoverHorizontal.dataUrl
      } : null
    };

    try {
      const fillRes = await chrome.runtime.sendMessage({
        action: 'FILL_PLATFORM',
        platformId: platId,
        tabId: tabId || null,
        payload
      });

      if (fillRes?.success && fillRes.result) {
        const { logs, warnings } = fillRes.result;
        (logs || []).forEach(msg => addConsoleLog('success', `[${platName}] ${msg}`));
        (warnings || []).forEach(msg => addConsoleLog('warn', `[${platName}] ${msg}`));
        if (logs && logs.length > 0) successCount++;
      } else {
        const errMsg = fillRes?.result?.warnings?.join('; ') || fillRes?.error || '页面未响应';
        addConsoleLog('error', `❌ [${platName}] 填写反馈: ${errMsg}`);
      }
    } catch (err) {
      addConsoleLog('error', `❌ [${platName}] 发生异常: ${err.message}`);
    }
  }

  btnSubmitAll.disabled = false;
  btnSubmitAll.querySelector('.hero-btn-title').textContent = '一键同步填入所选平台';
  logSummaryBadge.textContent = `成功 ${successCount}/${platforms.length}`;
  logSummaryBadge.className = 'badge badge-success';

  addConsoleLog('success', '🎉 填表任务执行完毕！请切换到各平台标签页核对，最后由您手动点击发布提交。');
  refreshPlatformStatus();
}

btnSubmitAll.addEventListener('click', () => runSubmit());

// ── Demo Template ────────────────────────────────────────────────────────────
const DEMO_MARKDOWN = `标题

AI 从两篇PDF开始完成一篇实证研究

# 描述

两篇读过、觉得有意思的论文，怎样变成自己研究的起点？

从种子文献中寻找启发，围绕初步想法检索核实，再写引言、分析数据、合稿和审阅。这期视频把五个步骤接起来，并展示通过研飞 Clipper 在知网、万方和 Web of Science 检索的真实页面，让找到的文献、讨论的思路和写下的草稿能持续接着用。

# 话题标签
AI科研, 实证研究, 种子文献, 文献检索, 文献管理, 论文写作, 研飞, ivySCI, MCP, 科研工作流`;

btnLoadDemo.addEventListener('click', () => {
  rawMarkdownEl.value = DEMO_MARKDOWN;
  handleMarkdownInput();
  addConsoleLog('info', '已成功载入示例文案');
});

btnClearAll.addEventListener('click', () => {
  if (confirm('确定要清空已填写的内容和素材吗？')) {
    rawMarkdownEl.value = '';
    fieldTitleEl.value = '';
    fieldDescEl.value = '';
    fieldTagsEl.value = '';
    updateFieldCounters();

    // Reset markdown file
    mdFileInput.value = '';
    mdLoaded.classList.add('hidden');
    mdDropIdle.classList.remove('hidden');

    // Reset video
    currentVideoFile = null;
    videoFileInput.value = '';
    videoLoaded.classList.add('hidden');
    videoDropIdle.classList.remove('hidden');

    // Reset covers
    currentCoverVertical = null;
    coverVerticalFileInput.value = '';
    coverVerticalLoaded.classList.add('hidden');
    coverVerticalDropIdle.classList.remove('hidden');

    currentCoverHorizontal = null;
    coverHorizontalFileInput.value = '';
    coverHorizontalLoaded.classList.add('hidden');
    coverHorizontalDropIdle.classList.remove('hidden');

    chrome.storage.local.remove(['draft']);
    addConsoleLog('info', '工作台已清空重置');
  }
});

// ── Draft Persistence ────────────────────────────────────────────────────────
async function saveDraft() {
  const draft = {
    rawMarkdown: rawMarkdownEl.value,
    title: fieldTitleEl.value,
    description: fieldDescEl.value,
    tags: fieldTagsEl.value
  };
  await chrome.storage.local.set({ draft });
}

async function loadDraft() {
  const { draft } = await chrome.storage.local.get('draft');
  if (draft && (draft.rawMarkdown || draft.title || draft.description)) {
    rawMarkdownEl.value = draft.rawMarkdown || '';
    fieldTitleEl.value = draft.title || '';
    fieldDescEl.value = draft.description || '';
    fieldTagsEl.value = draft.tags || '';
    updateFieldCounters();
  } else {
    rawMarkdownEl.value = DEMO_MARKDOWN;
    handleMarkdownInput();
  }
}

// Event Listeners
rawMarkdownEl.addEventListener('input', handleMarkdownInput);
fieldTitleEl.addEventListener('input', updateFieldCounters);
fieldDescEl.addEventListener('input', updateFieldCounters);
fieldTagsEl.addEventListener('input', updateFieldCounters);
btnRefreshStatus.addEventListener('click', refreshPlatformStatus);

// Init
(async () => {
  await loadDraft();
  await refreshPlatformStatus();
})();
