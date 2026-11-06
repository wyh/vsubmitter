/**
 * vsubmitter - Popup & Form Controller
 */

// Global State
let currentVideoFile = null;
let currentCoverFile = null;
let platformTabsStatus = {};

// Elements
const rawMarkdownEl = document.getElementById('rawMarkdown');
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

const videoFileInput = document.getElementById('videoFileInput');
const videoDropzone = document.getElementById('videoDropzone');
const videoDropContent = document.getElementById('videoDropContent');
const videoFileInfo = document.getElementById('videoFileInfo');
const videoFileName = document.getElementById('videoFileName');
const videoFileSize = document.getElementById('videoFileSize');
const btnRemoveVideo = document.getElementById('btnRemoveVideo');

const coverFileInput = document.getElementById('coverFileInput');
const coverDropzone = document.getElementById('coverDropzone');
const coverDropContent = document.getElementById('coverDropContent');
const coverPreviewWrapper = document.getElementById('coverPreviewWrapper');
const coverPreviewImg = document.getElementById('coverPreviewImg');
const coverFileName = document.getElementById('coverFileName');
const coverFileSize = document.getElementById('coverFileSize');
const btnRemoveCover = document.getElementById('btnRemoveCover');

const btnLoadDemo = document.getElementById('btnLoadDemo');
const btnClearAll = document.getElementById('btnClearAll');
const btnRefreshStatus = document.getElementById('btnRefreshStatus');
const btnSubmitAll = document.getElementById('btnSubmitAll');
const btnSidePanel = document.getElementById('btnSidePanel');

const logListEl = document.getElementById('logList');
const logSummaryBadge = document.getElementById('logSummaryBadge');
const chkAutoOpenTab = document.getElementById('chkAutoOpenTab');

const toggleFieldsHeader = document.getElementById('toggleFieldsHeader');
const fieldsBody = document.getElementById('fieldsBody');
const fieldsToggleIcon = document.getElementById('fieldsToggleIcon');

// ── Markdown Parser ───────────────────────────────────────────────────────────
function parseMarkdownContent(text) {
  if (!text || !text.trim()) {
    return { title: '', description: '', tags: [] };
  }

  const raw = text.trim();
  let title = '';
  let description = '';
  let tags = [];

  // Match tags with regex
  const tagMatches = raw.match(/#([\p{L}\p{N}_\-]+)/gu);
  if (tagMatches) {
    tags = Array.from(new Set(tagMatches.map(t => t.replace(/^#/, '').trim()))).filter(Boolean);
  }

  // Look for headings
  const titleHeaderMatch = raw.match(/(?:^|\n)#*\s*标题[:：]?\s*\n+([\s\S]*?)(?=\n+#*\s*(?:描述|话题|正文|简介|$))/i);
  const descHeaderMatch = raw.match(/(?:^|\n)#*\s*(?:描述|正文|简介)[:：]?\s*\n+([\s\S]*?)(?=\n+#*\s*(?:话题|标签|Hashtag|$))/i);

  if (titleHeaderMatch) {
    title = titleHeaderMatch[1].trim().split('\n')[0].trim();
  }
  if (descHeaderMatch) {
    description = descHeaderMatch[1].trim();
  }

  // Fallbacks if explicit section headers are absent
  if (!title) {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      if (lines[0].toLowerCase().includes('标题') && lines.length > 1) {
        title = lines[1];
      } else {
        title = lines[0].replace(/^#+\s*/, '');
      }
    }
  }

  if (!description) {
    const descLines = [];
    const lines = raw.split('\n');
    let pastTitle = false;

    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed) {
        if (pastTitle) descLines.push('');
        continue;
      }
      if (trimmed === title || (title && trimmed.includes(title))) {
        pastTitle = true;
        continue;
      }
      if (/^#*\s*(?:标题|描述|正文|简介|话题标签|话题|标签)[:：]?$/i.test(trimmed)) {
        continue;
      }
      if (/^(?:#[\p{L}\p{N}_\-]+\s*)+$/u.test(trimmed)) {
        continue;
      }
      descLines.push(l);
    }
    description = descLines.join('\n').trim();
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
  badgeXhs.className = `badge ${title.length > 20 ? 'warn' : ''}`;
  badgeDy.className = `badge ${title.length > 30 ? 'warn' : ''}`;
  badgeWx.className = `badge ${(title.length < 6 || title.length > 16) ? 'warn' : ''}`;
  badgeBili.className = `badge ${title.length > 80 ? 'warn' : ''}`;

  // Parse tags
  const tags = parseTagsString(tagsStr);
  tagsCountEl.textContent = `${tags.length} 个标签`;
  renderTagPills(tags);

  saveDraft();
}

function parseTagsString(str) {
  if (!str) return [];
  const parts = str.split(/[\s,，]+/);
  return Array.from(new Set(parts.map(p => p.replace(/^#/, '').trim()))).filter(Boolean);
}

function renderTagPills(tags) {
  tagsPillsContainer.innerHTML = '';
  tags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `#${escapeHtml(tag)} <span class="tag-remove" data-tag="${escapeHtml(tag)}">×</span>`;
    tagsPillsContainer.appendChild(pill);
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

// ── Tags pill removal ────────────────────────────────────────────────────────
tagsPillsContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('tag-remove')) {
    const removeTag = e.target.getAttribute('data-tag');
    let tags = parseTagsString(fieldTagsEl.value);
    tags = tags.filter(t => t !== removeTag);
    fieldTagsEl.value = tags.map(t => `#${t}`).join(' ');
    updateFieldCounters();
  }
});

// ── Dropzone & File Handling ─────────────────────────────────────────────────
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Video Dropzone
videoDropzone.addEventListener('click', () => videoFileInput.click());
videoFileInput.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    await setVideoFile(e.target.files[0]);
  }
});

videoDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  videoDropzone.classList.add('dragover');
});
videoDropzone.addEventListener('dragleave', () => videoDropzone.classList.remove('dragover'));
videoDropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  videoDropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    await setVideoFile(e.dataTransfer.files[0]);
  }
});

async function setVideoFile(file) {
  if (file.size > 50 * 1024 * 1024) {
    addLogItem('warn', `⚠️ 视频较大 (${formatBytes(file.size)})，扩展内注入大视频可能受浏览器内存限制，建议在对应后台手动拖入，插件将专注自动填表`);
  }
  const dataUrl = await readFileAsDataURL(file);
  currentVideoFile = {
    name: file.name,
    type: file.type || 'video/mp4',
    size: file.size,
    dataUrl
  };

  videoDropContent.classList.add('hidden');
  videoFileInfo.classList.remove('hidden');
  videoFileName.textContent = file.name;
  videoFileSize.textContent = formatBytes(file.size);
}

btnRemoveVideo.addEventListener('click', (e) => {
  e.stopPropagation();
  currentVideoFile = null;
  videoFileInput.value = '';
  videoFileInfo.classList.add('hidden');
  videoDropContent.classList.remove('hidden');
});

// Cover Dropzone
coverDropzone.addEventListener('click', () => coverFileInput.click());
coverFileInput.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    await setCoverFile(e.target.files[0]);
  }
});

coverDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  coverDropzone.classList.add('dragover');
});
coverDropzone.addEventListener('dragleave', () => coverDropzone.classList.remove('dragover'));
coverDropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  coverDropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    await setCoverFile(e.dataTransfer.files[0]);
  }
});

// Clipboard Paste Image (Cmd+V) anywhere on the window
window.addEventListener('paste', async (e) => {
  if (e.clipboardData && e.clipboardData.files.length > 0) {
    const file = e.clipboardData.files[0];
    if (file.type.startsWith('image/')) {
      await setCoverFile(file);
      addLogItem('success', `🖼️ 已通过剪贴板直接粘贴封面图: ${file.name || 'clipboard.png'}`);
    }
  }
});

async function setCoverFile(file) {
  const dataUrl = await readFileAsDataURL(file);
  currentCoverFile = {
    name: file.name || 'cover.png',
    type: file.type || 'image/png',
    size: file.size,
    dataUrl
  };

  coverDropContent.classList.add('hidden');
  coverPreviewWrapper.classList.remove('hidden');
  coverPreviewImg.src = dataUrl;
  coverFileName.textContent = currentCoverFile.name;
  coverFileSize.textContent = formatBytes(file.size);
}

btnRemoveCover.addEventListener('click', (e) => {
  e.stopPropagation();
  currentCoverFile = null;
  coverFileInput.value = '';
  coverPreviewWrapper.classList.add('hidden');
  coverDropContent.classList.remove('hidden');
  coverPreviewImg.src = '';
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
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('.status-text');

        if (plat.tab) {
          dot.className = 'status-dot online';
          text.textContent = '已打开';
          text.title = plat.tab.title || plat.tab.url;
        } else {
          dot.className = 'status-dot offline';
          text.textContent = '未检测到';
          text.title = '未找到打开的对应后台标签页';
        }
      }
    }
  } catch (err) {
    console.warn('Failed to get platform tabs status:', err);
  }
}

// ── Log Display ──────────────────────────────────────────────────────────────
function clearLogs() {
  logListEl.innerHTML = '';
}

function addLogItem(type, message) {
  const empty = logListEl.querySelector('.log-empty');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = `log-item ${type}`;
  item.textContent = message;
  logListEl.appendChild(item);
  logListEl.scrollTop = logListEl.scrollHeight;
}

// ── Submit & Fill Logic ───────────────────────────────────────────────────────
async function runSubmit(targetPlatforms = null) {
  const title = fieldTitleEl.value.trim();
  const description = fieldDescEl.value.trim();
  const tags = parseTagsString(fieldTagsEl.value);

  if (!title && !description) {
    alert('请先输入或粘贴视频标题/描述！');
    return;
  }

  btnSubmitAll.disabled = true;
  btnSubmitAll.innerHTML = '<span class="btn-icon-text">⏳</span> 正在同步填入...';
  logSummaryBadge.textContent = '同步中...';
  logSummaryBadge.className = 'badge badge-info';
  clearLogs();

  const payload = {
    title,
    description,
    tags,
    videoFile: currentVideoFile ? {
      name: currentVideoFile.name,
      type: currentVideoFile.type,
      dataUrl: currentVideoFile.dataUrl
    } : null,
    coverFile: currentCoverFile ? {
      name: currentCoverFile.name,
      type: currentCoverFile.type,
      dataUrl: currentCoverFile.dataUrl
    } : null
  };

  // Determine platforms to fill
  const platforms = targetPlatforms || ['xiaohongshu', 'douyin', 'wechat_channels', 'bilibili'].filter(key => {
    const chk = document.getElementById(`chk_${key}`);
    return chk && chk.checked;
  });

  if (platforms.length === 0) {
    addLogItem('warn', '未选中任何平台进行填入。');
    btnSubmitAll.disabled = false;
    btnSubmitAll.innerHTML = '<span class="btn-icon-text">🚀</span> 一键同步填入所选平台';
    return;
  }

  let totalSuccess = 0;
  const autoOpen = chkAutoOpenTab.checked;

  for (const platId of platforms) {
    const platInfo = platformTabsStatus[platId] || {};
    const platName = platInfo.name || platId;
    let tabId = platInfo.tab?.id;

    addLogItem('info', `⏳ 开始处理 [${platName}]...`);

    if (!tabId && !autoOpen) {
      addLogItem('warn', `⚠️ [${platName}] 后台未打开，且已关闭自动新建标签页，跳过`);
      continue;
    }

    try {
      const fillRes = await chrome.runtime.sendMessage({
        action: 'FILL_PLATFORM',
        platformId: platId,
        tabId: tabId || null,
        payload
      });

      if (fillRes?.success && fillRes.result) {
        const { logs, warnings } = fillRes.result;
        (logs || []).forEach(msg => addLogItem('success', `[${platName}] ${msg}`));
        (warnings || []).forEach(msg => addLogItem('warn', `[${platName}] ${msg}`));
        totalSuccess++;
      } else {
        addLogItem('error', `❌ [${platName}] 填写失败: ${fillRes?.error || '未知错误'}`);
      }
    } catch (err) {
      addLogItem('error', `❌ [${platName}] 通信异常: ${err.message}`);
    }
  }

  btnSubmitAll.disabled = false;
  btnSubmitAll.innerHTML = '<span class="btn-icon-text">🚀</span> 一键同步填入所选平台';
  logSummaryBadge.textContent = `完成 ${totalSuccess}/${platforms.length}`;
  logSummaryBadge.className = 'badge';

  addLogItem('success', '🎉 表单已自动填写完毕！请切换到各标签页核对，确认无误后手动点击发布。');
  refreshPlatformStatus();
}

// ── Single Platform Fill ─────────────────────────────────────────────────────
document.querySelectorAll('.btn-action-single').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const plat = e.target.getAttribute('data-plat');
    if (plat) {
      runSubmit([plat]);
    }
  });
});

btnSubmitAll.addEventListener('click', () => runSubmit());

// ── Demo Template ────────────────────────────────────────────────────────────
const DEMO_MARKDOWN = `标题

AI 从两篇PDF开始完成一篇实证研究

# 描述

两篇读过、觉得有意思的论文，怎样变成自己研究的起点？

从种子文献中寻找启发，围绕初步想法检索核实，再写引言、分析数据、合稿和审阅。这期视频把五个步骤接起来，并展示通过研飞 Clipper 在知网、万方和 Web of Science 检索的真实页面，让找到的文献、讨论的思路和写下的草稿能持续接着用。


# 话题标签

#AI科研 #实证研究 #文献检索 #论文写作 #研飞`;

btnLoadDemo.addEventListener('click', () => {
  rawMarkdownEl.value = DEMO_MARKDOWN;
  handleMarkdownInput();
});

btnClearAll.addEventListener('click', () => {
  if (confirm('确定要清空已填写的内容吗？')) {
    rawMarkdownEl.value = '';
    fieldTitleEl.value = '';
    fieldDescEl.value = '';
    fieldTagsEl.value = '';
    updateFieldCounters();
    clearLogs();
    chrome.storage.local.remove(['draft']);
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
  if (draft) {
    rawMarkdownEl.value = draft.rawMarkdown || '';
    fieldTitleEl.value = draft.title || '';
    fieldDescEl.value = draft.description || '';
    fieldTagsEl.value = draft.tags || '';
    updateFieldCounters();
  } else {
    // If empty on first launch, load demo by default so user can immediately test!
    rawMarkdownEl.value = DEMO_MARKDOWN;
    handleMarkdownInput();
  }
}

// ── Side Panel Trigger ───────────────────────────────────────────────────────
btnSidePanel.addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
    window.close();
  } catch (e) {
    console.error('Failed to open side panel:', e);
  }
});

// Collapsible Fields
toggleFieldsHeader.addEventListener('click', () => {
  fieldsBody.classList.toggle('hidden');
  fieldsToggleIcon.classList.toggle('collapsed');
});

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
