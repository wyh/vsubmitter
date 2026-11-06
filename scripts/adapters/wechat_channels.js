/**
 * vsubmitter Adapter: 微信视频号助手 (WeChat Channels)
 * Supported URLs: channels.weixin.qq.com/platform/post/create
 *
 * 关键点：视频号助手使用 wujie 微前端，发布表单渲染在 <wujie-app> 的 Shadow DOM 中，
 * 普通 document.querySelector 无法查到。因此所有查询都通过 getRoots() 穿透 Shadow DOM
 * 与同源 iframe 进行。
 */

window.__vsubmitter_adapters = window.__vsubmitter_adapters || {};

window.__vsubmitter_adapters.wechat_channels = {
  name: '微信视频号',
  platformId: 'wechat_channels',

  // ── Shadow DOM / iframe 穿透查询 ────────────────────────────────────────────
  getRoots() {
    const roots = [];
    const visit = (root, depth) => {
      if (!root || depth > 6 || roots.includes(root)) return;
      roots.push(root);
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.shadowRoot) visit(el.shadowRoot, depth + 1);
        if (el.tagName === 'IFRAME') {
          try {
            const d = el.contentDocument;
            if (d && d.body) visit(d, depth + 1);
          } catch (e) { /* cross-origin, skip */ }
        }
      }
    };
    visit(document, 0);
    return roots;
  },

  $(selector) {
    for (const r of this.getRoots()) {
      try {
        const el = r.querySelector(selector);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  },

  $$(selector) {
    const out = [];
    for (const r of this.getRoots()) {
      try { out.push(...r.querySelectorAll(selector)); } catch (e) {}
    }
    return out;
  },

  $first(selectors) {
    for (const s of selectors) {
      const el = this.$(s);
      if (el) return el;
    }
    return null;
  },

  // 根据可见的标签文字（如“短标题”“视频描述”）找到同一表单行内的输入控件
  findByRowLabel(labelText, controlSelector) {
    const labels = this.$$('*').filter(el => {
      if (el.children.length > 0) return false;
      return (el.textContent || '').trim() === labelText;
    });
    for (const label of labels) {
      let p = label.parentElement;
      for (let i = 0; i < 5 && p; i++) {
        const ctrl = p.querySelector(controlSelector);
        if (ctrl) return ctrl;
        p = p.parentElement;
      }
    }
    return null;
  },

  formatShortTitle(originTitle) {
    if (!originTitle) return '';
    const allowed = '《》“”:+?%°';
    let cleaned = '';
    for (const char of originTitle) {
      if (/[\p{L}\p{N}]/u.test(char) || allowed.includes(char)) {
        cleaned += char;
      } else if (' ,，-_'.includes(char)) {
        cleaned += ' ';
      }
    }
    cleaned = cleaned.trim().replace(/\s+/g, ' ');
    return cleaned.length > 16 ? cleaned.slice(0, 16) : cleaned;
  },

  findShortTitleInput() {
    return this.$first([
      'input[placeholder*="短标题"]',
      '.short-title-wrap input',
      '.post-short-title-wrap input'
    ]) || this.findByRowLabel('短标题', 'input:not([type="file"]):not([type="hidden"])');
  },

  findDescEditor() {
    return this.$first([
      'div.input-editor[contenteditable]',
      'div.input-editor',
      '[data-placeholder*="添加描述"]',
      '[placeholder*="添加描述"]',
      '.post-desc-box [contenteditable="true"]'
    ]) || this.findByRowLabel('视频描述', '[contenteditable="true"], textarea');
  },

  findVideoUploadBox() {
    const leaf = this.$$('*').find(el => {
      if (el.children.length > 0) return false;
      const t = el.textContent || '';
      return t.includes('支持上传') && (t.includes('小时') || t.includes('20GB'));
    });
    if (leaf) {
      let p = leaf.parentElement;
      for (let i = 0; i < 6 && p; i++) {
        if (p.querySelector('input[type="file"]')) return p;
        p = p.parentElement;
      }
      return leaf.parentElement;
    }
    return this.$first(['.post-upload-wrap', '.upload-content', '.ant-upload', '[class*="upload-wrap"]']);
  },

  findVideoFileInput(box) {
    if (box) {
      const inside = box.querySelector('input[type="file"]');
      if (inside) return inside;
    }
    const inputs = this.$$('input[type="file"]');
    return inputs.find(i => /video|mp4|mov/i.test(i.accept || '')) ||
           inputs.find(i => !/image|png|jpe?g/i.test(i.accept || '')) ||
           null;
  },

  hasExistingVideo() {
    if (this.$('video')) return true;
    return this.$$('span, div, button').some(el => {
      if (el.children.length > 0) return false;
      const t = (el.textContent || '').trim();
      return t === '更换视频' || t === '删除' || t.includes('上传中') || t.includes('转码中');
    });
  },

  async simulateDrop(target, filePayload) {
    try {
      const blob = await (await fetch(filePayload.dataUrl)).blob();
      const file = new File([blob], filePayload.name || 'video.mp4', { type: filePayload.type || 'video/mp4' });
      const dt = new DataTransfer();
      dt.items.add(file);
      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  // 找不到元素时输出页面结构，便于定位问题
  diagnose() {
    const roots = this.getRoots();
    const hosts = Array.from(document.querySelectorAll('*'))
      .filter(el => el.shadowRoot).map(el => el.tagName.toLowerCase());
    const iframes = Array.from(document.querySelectorAll('iframe'))
      .map(f => (f.src || '(about:blank)').slice(0, 60));
    const inputs = this.$$('input').map(i => `${i.type}:${(i.placeholder || i.accept || '').slice(0, 15)}`).slice(0, 8);
    const editables = this.$$('[contenteditable="true"]').length;
    return `🔬 诊断: roots=${roots.length}, shadowHosts=[${hosts.join(',')}], iframes=[${iframes.join(' | ')}], inputs=[${inputs.join(', ')}], contenteditable=${editables}`;
  },

  async run({ title, description, tags, videoFile, coverFile, coverVertical, coverHorizontal, coverOnly, preferredOrientation }) {
    const H = window.__vsubmitter_helpers;
    const logs = [];
    const warnings = [];
    let anyMissing = false;

    // 等待表单渲染（wujie 子应用异步挂载），最多 8 秒
    await H.waitForElement(() => this.findShortTitleInput() || this.findDescEditor() || this.findVideoUploadBox(), 8000, 300);

    // 1. 短标题
    if (!coverOnly) {
      const shortTitle = this.formatShortTitle(title);
      const input = this.findShortTitleInput();
      if (shortTitle && input) {
        H.setInputValue(input, shortTitle);
        logs.push(`🏷️ 短标题已填入 (${shortTitle.length}字): ${shortTitle}`);
      } else if (shortTitle) {
        anyMissing = true;
        warnings.push('⚠️ 未找到短标题输入框');
      }

      // 2. 描述 + 话题
      const editor = this.findDescEditor();
      if (editor) {
        let content = (description || '').trim();
        const cleanTags = (tags || []).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
        if (cleanTags.length) {
          const tagLine = cleanTags.map(t => `#${t}`).join(' ') + ' ';
          content = content ? `${content}\n\n${tagLine}` : tagLine;
        }
        if (content) {
          if (editor.tagName === 'TEXTAREA') H.setInputValue(editor, content);
          else H.setContentEditable(editor, content);
          logs.push(`📝 描述与 ${cleanTags.length} 个话题已填入`);
        }
      } else {
        anyMissing = true;
        warnings.push('⚠️ 未找到视频描述输入框');
      }
    }

    // 3. 视频
    if (!coverOnly && videoFile) {
      if (this.hasExistingVideo()) {
        logs.push('🎬 页面已有视频，跳过视频上传');
      } else {
        const box = this.findVideoUploadBox();
        const input = this.findVideoFileInput(box);
        if (input && await H.injectFile(input, videoFile)) {
          logs.push(`🎬 视频文件已注入上传: ${videoFile.name}`);
        } else if (box && await this.simulateDrop(box, videoFile)) {
          logs.push(`🎬 视频文件已通过拖放注入: ${videoFile.name}`);
        } else {
          anyMissing = true;
          warnings.push('⚠️ 未找到视频上传控件');
        }
      }
    }

    // 4. 声明原创
    if (!coverOnly) {
      await this.declareOriginal(H, logs, warnings);
    }

    // 5. 封面（视频号需视频处理完成后才出现封面入口）
    const wantHoriz = preferredOrientation === 'horizontal' ||
      (preferredOrientation !== 'vertical' && coverHorizontal && !coverVertical);
    const targetCover = wantHoriz ? (coverHorizontal || coverFile || coverVertical)
                                  : (coverVertical || coverFile || coverHorizontal);
    if (targetCover) {
      await this.uploadCover(H, wantHoriz, targetCover, logs, warnings,
        (this.hasExistingVideo() || (videoFile && !coverOnly)) ? 15000 : 1500);
    }

    if (anyMissing) warnings.push(this.diagnose());
    return { success: true, logs, warnings };
  },

  isVisible(el) {
    if (!el) return false;
    return el.offsetWidth > 0 || el.offsetHeight > 0 || (el.getBoundingClientRect().width > 0);
  },

  visibleDialog(textIncludes) {
    return this.$$('.weui-desktop-dialog').find(d => this.isVisible(d) && (d.textContent || '').includes(textIncludes));
  },

  visibleButton(container, text) {
    return Array.from(container.querySelectorAll('button')).find(b => this.isVisible(b) && (b.textContent || '').trim() === text);
  },

  // 勾选“声明原创” → 弹出“原创权益” → 勾选同意 → 点击“声明原创”
  async declareOriginal(H, logs, warnings) {
    const box = this.$('.declare-original-checkbox');
    if (!box) {
      warnings.push('⚠️ 未找到“声明原创”选项');
      return;
    }
    const cb = box.querySelector('input[type="checkbox"]');
    if (cb && cb.checked) {
      logs.push('✅ 已是原创声明状态');
      return;
    }
    (box.querySelector('label.ant-checkbox-wrapper') || box).click();

    const dlg = await H.waitForElement(() => this.visibleDialog('原创权益'), 4000, 200);
    if (dlg) {
      const agree = Array.from(dlg.querySelectorAll('label.ant-checkbox-wrapper')).find(l => this.isVisible(l));
      const agreeInput = agree?.querySelector('input[type="checkbox"]');
      if (agree && !agreeInput?.checked) agree.click();
      await H.sleep(400);
      const btn = this.visibleButton(dlg, '声明原创');
      if (btn && !btn.className.includes('disabled')) {
        btn.click();
        await H.sleep(600);
      } else {
        warnings.push('⚠️ “声明原创”确认按钮不可用，请手动确认');
        return;
      }
    }
    const ok = box.querySelector('input[type="checkbox"]')?.checked;
    if (ok) logs.push('✅ 已勾选“声明原创”');
    else warnings.push('⚠️ 声明原创未成功，请手动勾选');
  },

  // 横版：.horizon-cover-wrap .edit-btn 直接弹出“编辑分享卡片”
  // 竖版：.vertical-cover-wrap .edit-btn 先弹出“使用此素材作为封面？”气泡，需要点“直接编辑”才会弹出“编辑个人主页卡片”
  async uploadCover(H, wantHoriz, cover, logs, warnings, waitMs) {
    const label = wantHoriz ? '横版封面(4:3)' : '竖版封面(3:4)';
    const wrapSel = wantHoriz ? '.horizon-cover-wrap' : '.vertical-cover-wrap';
    const dialogTitle = wantHoriz ? '编辑分享卡片' : '编辑个人主页卡片';

    const editBtn = await H.waitForElement(() => this.$(`${wrapSel} .edit-btn`), waitMs, 500);
    if (!editBtn) {
      logs.push('ℹ️ 暂未出现封面入口（视频上传/转码完成后，点「传横版封面 / 传竖版封面」补传）');
      return;
    }

    H.clickElement(editBtn);

    let dialog = await H.waitForElement(() => {
      const d = this.visibleDialog(dialogTitle);
      if (d) return d;
      // 竖版推荐素材气泡 → 点“直接编辑”
      const direct = this.$$('.img-recommend-wrap button').find(b => this.isVisible(b) && (b.textContent || '').trim() === '直接编辑');
      if (direct) direct.click();
      return null;
    }, 6000, 300);

    if (!dialog) {
      warnings.push(`⚠️ 未能打开「${dialogTitle}」弹窗`);
      return;
    }

    const fileInput = dialog.querySelector('.single-cover-uploader-wrap input[type="file"]') ||
                      dialog.querySelector('input[type="file"][accept*="image"]');
    if (!fileInput || !(await H.injectFile(fileInput, cover))) {
      warnings.push('⚠️ 封面弹窗中未找到图片上传控件');
      return;
    }
    logs.push(`🖼️ 【${label}】已注入: ${cover.name}`);

    // 上传后可能弹出“裁剪封面图”，点击“确定”
    await H.sleep(1500);
    const cropDialog = Array.from(this.$$('.weui-desktop-dialog, .finder-common-dialog')).find(d => {
      const t = d.textContent || '';
      return t.includes('裁剪封面图') && (d.offsetWidth > 0 || d.offsetHeight > 0);
    });
    if (cropDialog) {
      const okCrop = Array.from(cropDialog.querySelectorAll('button')).find(b => {
        const t = (b.textContent || '').trim();
        return (b.offsetWidth > 0 || b.offsetHeight > 0) && (t === '确定' || t === '确认' || b.className.includes('primary'));
      });
      if (okCrop) {
        okCrop.click();
        await H.sleep(1200);
      }
    }

    // 主弹窗“确认” / “确定”
    const confirmBtn = await H.waitForElement(() => {
      const btns = Array.from(dialog.querySelectorAll('button'));
      return btns.find(b => {
        const t = (b.textContent || '').trim();
        const isVis = (b.offsetWidth > 0 || b.getBoundingClientRect().width > 0);
        return isVis && (t === '确认' || t === '确定');
      }) || btns.find(b => (b.offsetWidth > 0 || b.getBoundingClientRect().width > 0) && b.className.includes('primary'));
    }, 6000, 300);

    if (confirmBtn) {
      confirmBtn.click();
      logs.push(`✅ 【${label}】已自动点击确认保存`);
      await H.sleep(800);
    } else {
      logs.push('ℹ️ 封面已上传，请在弹窗中手动点击「确认」');
    }
  }
};
