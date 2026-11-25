/**
 * vsubmitter Adapter: 微信公众号（贴图模式）(WeChat Official Account Image Post)
 * Supported URLs: mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&...&createType=8...
 *
 * 页面结构要点（实测验证）：
 * - 标题：#js_title_main .title-editor__input .ProseMirror（上限 20 字，ASCII 算 0.5 字）
 * - 正文描述：#guide_words_main .share-text__input .ProseMirror（上限 1000 字）
 *   通过 ClipboardEvent('paste') 粘贴纯文本，ProseMirror 会自动保留换行，并将带空格分隔的 #话题 自动转为 wx_topic_link 话题标签。
 * - 图片上传：#js_content_top .image-selector 内的 input[type="file"][multiple]
 *   空状态在 .image-selector__add 内，已有图片后追加入口在 .image-selector__bottom-add 内，支持单次多图注入。
 */

window.__vsubmitter_adapters = window.__vsubmitter_adapters || {};

window.__vsubmitter_adapters.wechat_mp = {
  name: '微信公众号（贴图）',
  platformId: 'wechat_mp',

  /**
   * 微信公众号贴图标题字数计算：中文/全角记 1 字，ASCII 半角记 0.5 字（向上取整，与页面 0/20 计数器一致）
   */
  calcWechatLength(str) {
    let halfUnits = 0;
    for (const ch of (str || '')) {
      halfUnits += ch.charCodeAt(0) <= 127 ? 1 : 2;
    }
    return Math.ceil(halfUnits / 2);
  },

  truncateWechatTitle(str, maxChars = 20) {
    const maxHalf = maxChars * 2;
    let halfUnits = 0;
    let out = '';
    for (const ch of (str || '')) {
      const w = ch.charCodeAt(0) <= 127 ? 1 : 2;
      if (halfUnits + w > maxHalf) break;
      halfUnits += w;
      out += ch;
    }
    return out.trim();
  },

  findTitleEditor() {
    return document.querySelector('#js_title_main .title-editor__input .ProseMirror') ||
           document.querySelector('.title-editor__input .ProseMirror');
  },

  findDescEditor() {
    return document.querySelector('#guide_words_main .share-text__input .ProseMirror') ||
           document.querySelector('.share-text__input .ProseMirror') ||
           document.querySelector('.js_pmEditorArea .ProseMirror');
  },

  findImageFileInput() {
    // 已有图片时优先使用底部追加上传控件，空状态使用中央上传控件
    const bottomAdd = document.querySelector('.image-selector .image-selector__bottom-add input[type="file"]');
    if (bottomAdd) return bottomAdd;
    const initialAdd = document.querySelector('.image-selector .image-selector__add input[type="file"]');
    if (initialAdd) return initialAdd;
    return document.querySelector('#js_content_top .image-selector input[type="file"]') ||
           document.querySelector('.image-selector input[type="file"]');
  },

  getUploadedImageCount() {
    return document.querySelectorAll('.image-selector .image-selector__bottom-list-item').length;
  },

  /**
   * 安全清空并粘贴内容到微信 ProseMirror 编辑器：
   * 1. 先通过 Range + selectionchange + execCommand('delete') 清空旧内容（避免重复追加）
   * 2. 通过 ClipboardEvent('paste') 注入纯文本，原生触发换行解析与 #话题 自动高亮链接
   */
  async setProseMirrorText(pmEl, text) {
    const H = window.__vsubmitter_helpers;
    if (!pmEl) return false;

    pmEl.focus();
    await H.sleep(60);

    const hasPlaceholderOnly = !!pmEl.querySelector('.editor_placeholder');
    const currentText = (pmEl.textContent || '').replace(/\u200b/g, '').trim();

    if (!hasPlaceholderOnly && currentText.length > 0) {
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(pmEl);
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        await H.sleep(80);
        document.execCommand('delete', false, null);
        await H.sleep(150);
      } catch (e) {}
    }

    pmEl.focus();
    await H.sleep(50);

    // 优先采用 paste 事件（支持多行与 #话题 节点自动转换）
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      pmEl.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      }));
      await H.sleep(300);
    } catch (e) {}

    // 校验是否成功写入；若未写入则回退到 insertText
    const afterText = (pmEl.textContent || '').replace(/\u200b/g, '').trim();
    const stillPlaceholder = !!pmEl.querySelector('.editor_placeholder');
    if (stillPlaceholder || !afterText) {
      pmEl.focus();
      try {
        document.execCommand('insertText', false, text);
        pmEl.dispatchEvent(new Event('input', { bubbles: true }));
        await H.sleep(200);
      } catch (e) {}
    }

    return true;
  },

  async simulateDropImages(target, filePayloads) {
    if (!target || !filePayloads || filePayloads.length === 0) return false;
    try {
      const dt = new DataTransfer();
      for (let i = 0; i < filePayloads.length; i++) {
        const fp = filePayloads[i];
        if (!fp?.dataUrl) continue;
        const blob = await (await fetch(fp.dataUrl)).blob();
        const file = new File([blob], fp.name || `image_${i + 1}.png`, {
          type: fp.type || blob.type || 'image/png'
        });
        dt.items.add(file);
      }
      if (dt.files.length === 0) return false;
      for (const evtType of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(evtType, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt
        }));
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  resolveImages({ mpImages, coverFile, coverVertical, coverHorizontal, preferredOrientation }) {
    const dedupe = (list) => {
      const seen = new Set();
      const out = [];
      for (const item of list) {
        if (!item || !item.dataUrl) continue;
        const key = `${item.name}|${item.dataUrl.slice(0, 80)}|${item.dataUrl.length}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(item);
        }
      }
      return out;
    };

    if (preferredOrientation === 'vertical') {
      return dedupe([coverVertical || coverFile || coverHorizontal]);
    }
    if (preferredOrientation === 'horizontal') {
      return dedupe([coverHorizontal || coverFile || coverVertical]);
    }
    if (preferredOrientation === 'both_covers') {
      return dedupe([coverVertical, coverHorizontal, coverFile]);
    }

    // auto 模式：优先使用「公众号贴图多图区」上传的图片，留空时自动复用竖版/横版封面
    if (Array.isArray(mpImages) && mpImages.length > 0) {
      return dedupe(mpImages).slice(0, 20);
    }
    return dedupe([coverVertical || coverHorizontal || coverFile]);
  },

  async run({ title, description, tags, mpImages, coverFile, coverVertical, coverHorizontal, coverOnly, preferredOrientation }) {
    const H = window.__vsubmitter_helpers;
    const logs = [];
    const warnings = [];

    // 确认处于公众号「贴图」编辑器页面（等待异步渲染最多 8 秒）
    const ready = await H.waitForElement(() => {
      return this.findTitleEditor() || this.findDescEditor() || document.querySelector('.image-selector');
    }, 8000, 300);

    if (!ready) {
      warnings.push('⚠️ 未检测到微信公众号「贴图」编辑界面，请确认已登录 mp.weixin.qq.com 并进入「贴图」发布页');
      return { success: false, logs, warnings };
    }

    if (coverOnly) {
      logs.push('ℹ️ 当前为「仅追加图片」模式（跳过标题与正文；如需填图文请点「🚀 同步图文+贴图」）');
    }

    // 1. 标题（非仅传图模式）
    if (!coverOnly) {
      let finalTitle = (title || '').trim();
      if (finalTitle) {
        const origLen = this.calcWechatLength(finalTitle);
        if (origLen > 20) {
          finalTitle = this.truncateWechatTitle(finalTitle, 20);
          warnings.push(`微信公众号贴图标题限制 20 字（英文/数字算 0.5 字），已自动截取: "${finalTitle}"`);
        }

        const titlePM = this.findTitleEditor();
        if (titlePM) {
          await this.setProseMirrorText(titlePM, finalTitle);
          const finalLen = this.calcWechatLength(finalTitle);
          logs.push(`📌 公众号贴图标题已填入 (${finalLen}/20字): ${finalTitle}`);
        } else {
          const titleTextarea = document.querySelector('#title');
          if (titleTextarea) {
            H.setInputValue(titleTextarea, finalTitle);
            logs.push(`📌 公众号贴图标题已填入: ${finalTitle}`);
          } else {
            warnings.push('⚠️ 未找到公众号贴图标题输入框');
          }
        }
      }

      // 2. 正文描述 + #话题（微信贴图原生解析 #话题 为蓝色话题链接）
      const descPM = this.findDescEditor();
      if (descPM) {
        let descText = (description || '').trim();
        const cleanTags = (tags || []).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
        const tagSuffix = cleanTags.length > 0 ? cleanTags.map(t => `#${t}`).join(' ') + ' ' : '';

        let fullText = descText;
        if (tagSuffix) {
          fullText = descText ? `${descText}\n\n${tagSuffix}` : tagSuffix;
        }

        if (fullText.length > 1000) {
          const allowedDescLen = Math.max(0, 1000 - tagSuffix.length - (tagSuffix ? 2 : 0));
          const trimmedDesc = descText.slice(0, allowedDescLen);
          fullText = tagSuffix ? (trimmedDesc ? `${trimmedDesc}\n\n${tagSuffix}` : tagSuffix.slice(0, 1000)) : descText.slice(0, 1000);
          warnings.push('⚠️ 公众号贴图描述限制 1000 字，已自动截断超长部分');
        }

        if (fullText) {
          await this.setProseMirrorText(descPM, fullText);
          await H.sleep(250);
          const topicLinks = descPM.querySelectorAll('a.wx_topic_link').length;
          if (cleanTags.length > 0) {
            logs.push(`📝 正文描述与 ${cleanTags.length} 个话题已填入（已自动激活 ${topicLinks} 个微信话题标签）`);
          } else {
            logs.push(`📝 公众号贴图正文描述已填入 (${descText.length}字)`);
          }
        }
      } else {
        warnings.push('⚠️ 未找到公众号贴图正文描述编辑区');
      }
    }

    // 3. 图片上传（支持多图批量上传，留空自动回退封面图）
    const imagesToUpload = this.resolveImages({
      mpImages,
      coverFile,
      coverVertical,
      coverHorizontal,
      preferredOrientation
    });

    if (imagesToUpload.length > 0) {
      const existingCount = this.getUploadedImageCount();

      if (existingCount > 0 && !coverOnly) {
        logs.push(`🖼️ 公众号贴图页已有 ${existingCount} 张图片，保留现有图片（如需继续追加请点「仅补传图片」）`);
      } else {
        const remainingSlots = Math.max(0, 20 - existingCount);
        const batch = imagesToUpload.slice(0, remainingSlots);
        if (imagesToUpload.length > remainingSlots) {
          warnings.push(`⚠️ 公众号贴图最多支持 20 张图片，本次仅上传前 ${batch.length} 张`);
        }

        if (batch.length > 0) {
          const fileInput = this.findImageFileInput();
          let injected = false;

          if (fileInput) {
            injected = await H.injectFiles(fileInput, batch);
          }
          if (!injected) {
            const dropTarget = document.querySelector('.image-selector__add, .image-selector');
            if (dropTarget) {
              injected = await this.simulateDropImages(dropTarget, batch);
            }
          }

          if (injected) {
            const namesPreview = batch.length <= 3
              ? batch.map(f => f.name).join('、')
              : `${batch[0].name} 等 ${batch.length} 张`;
            logs.push(`🖼️ 已注入 ${batch.length} 张贴图上传: ${namesPreview}`);

            // 等待图片卡片渲染并完成上传（最多等待 15 秒）
            const targetTotal = existingCount + batch.length;
            const startWait = Date.now();
            while (Date.now() - startWait < 15000) {
              await H.sleep(500);
              const curItems = this.getUploadedImageCount();
              const loadingSpinners = document.querySelectorAll('.image-selector .image-selector__bottom-list-item .weui-desktop-loading').length;
              if (curItems >= targetTotal && loadingSpinners === 0) {
                break;
              }
            }

            const finalCount = this.getUploadedImageCount();
            if (finalCount > existingCount) {
              logs.push(`✅ 公众号贴图已就绪，当前共 ${finalCount} 张图片`);
            } else {
              warnings.push('ℹ️ 图片已提交给页面上传组件，请稍候查看页面缩略图是否上传完成');
            }
          } else {
            warnings.push('⚠️ 未找到公众号贴图图片上传控件，请手动拖拽图片到页面上传区');
          }
        }
      }
    } else if (coverOnly) {
      warnings.push('⚠️ 未上传贴图图片或封面图，无法补传图片');
    } else {
      warnings.push('ℹ️ 未选择贴图图片或封面图，请在左侧上传贴图/封面后再同步，或直接在后台拖入图片');
    }

    return { success: true, logs, warnings };
  }
};
