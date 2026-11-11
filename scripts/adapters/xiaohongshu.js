/**
 * vsubmitter Adapter: 小红书创作者服务平台 (Xiaohongshu)
 * Supported URLs: creator.xiaohongshu.com/publish/publish
 */

window.__vsubmitter_adapters = window.__vsubmitter_adapters || {};

window.__vsubmitter_adapters.xiaohongshu = {
  name: '小红书',
  platformId: 'xiaohongshu',

  // Helper: check if a cover modal is currently open and visible on page
  getVisibleCoverModal() {
    const modals = Array.from(document.querySelectorAll('.d-modal, div[role="dialog"], [class*="modal"]'));
    return modals.find(m => {
      const style = window.getComputedStyle(m);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const txt = m.innerText || '';
      return txt.includes('封面') || txt.includes('上传') || txt.includes('截取') || txt.includes('裁剪');
    });
  },

  // Helper: detect whether the video on Xiaohongshu is horizontal (16:9/4:3) or vertical (3:4/9:16)
  detectVideoOrientation() {
    // 1. Check video tag
    const video = document.querySelector('video');
    if (video && video.videoWidth && video.videoHeight) {
      return video.videoWidth >= video.videoHeight ? 'horizontal' : 'vertical';
    }
    // 2. Check preview thumbnail
    const thumb = document.querySelector('div.upload-cover img, div.cover-plugin-preview img, [class*="upload-cover"] img, [class*="preview"] img');
    if (thumb) {
      const w = thumb.naturalWidth || thumb.clientWidth;
      const h = thumb.naturalHeight || thumb.clientHeight;
      if (w && h) {
        return w >= h ? 'horizontal' : 'vertical';
      }
    }
    // 3. Check preview container
    const box = document.querySelector('div.upload-cover, div.cover-plugin-preview, [class*="cover-preview"]');
    if (box) {
      const rect = box.getBoundingClientRect();
      if (rect.width && rect.height) {
        return rect.width >= rect.height * 1.15 ? 'horizontal' : 'vertical';
      }
    }
    return null;
  },

  // Helper: switch aspect ratio button inside cover modal if available (e.g. 16:9, 4:3, 3:4)
  selectModalRatio(modal, orientation) {
    const H = window.__vsubmitter_helpers;
    const targetKeywords = orientation === 'horizontal' ? ['16:9', '4:3', '横版'] : ['3:4', '竖版'];
    const candidates = Array.from(modal.querySelectorAll('button, div, span, li')).filter(el => {
      if (el.children.length > 1) return false;
      const txt = el.textContent?.trim() || '';
      return targetKeywords.some(kw => txt === kw || txt.includes(kw));
    });
    if (candidates.length > 0) {
      H.clickElement(candidates[0]);
      return true;
    }
    return false;
  },

  // Helper: find innermost leaf element with exact text
  findLeafByText(exactText, tagNames = '*') {
    const nodes = Array.from(document.querySelectorAll(tagNames)).filter(el => {
      return el.children.length === 0 && el.textContent?.trim() === exactText;
    });
    return nodes[nodes.length - 1] || null;
  },

  // Helper: find the cover preview/trigger card on the publish page
  findCoverTrigger() {
    // 1. Direct CSS selectors from Xiaohongshu DOM
    const direct = document.querySelector('div.upload-cover, div.cover-plugin-preview div.default.pointer, div.cover-plugin-preview, [class*="upload-cover"], [class*="cover-preview"]');
    if (direct) return direct;

    // 2. Locate leaf element containing "默认截取第一帧作为封面" or "设置封面"
    const frameLeaf = Array.from(document.querySelectorAll('*')).find(el => {
      return el.children.length === 0 && (el.textContent?.includes('默认截取第一帧') || el.textContent?.trim() === '设置封面');
    });

    if (frameLeaf) {
      let p = frameLeaf.parentElement;
      for (let i = 0; i < 5 && p; i++) {
        const imgOrBox = p.querySelector('img, canvas, [class*="preview"], [class*="thumb"], [class*="cover-img"]');
        if (imgOrBox && imgOrBox !== frameLeaf) return imgOrBox;
        p = p.parentElement;
      }
    }

    return null;
  },

  async run({ title, description, tags, videoFile, coverFile, coverVertical, coverHorizontal, coverOnly, preferredOrientation }) {
    const H = window.__vsubmitter_helpers;
    const logs = [];
    const warnings = [];

    // Check if video is already present on page
    const hasExistingVideo = !!document.querySelector('.preview-video, video, [class*="video-player"], [class*="preview-new"]') ||
      Array.from(document.querySelectorAll('button, div, span')).some(el => {
        const t = el.children.length === 0 ? el.textContent?.trim() : '';
        return t === '重新上传' || t === '编辑封面' || t?.includes('上传成功');
      });

    // 1. Video Upload (skipped if coverOnly or already uploaded)
    if (!coverOnly && videoFile && !hasExistingVideo) {
      const videoInput = H.findElement([
        "div[class^='upload-content'] input.upload-input",
        "input.upload-input",
        "input[type='file'][accept*='video']",
        "input[type='file']"
      ]);
      if (videoInput) {
        const ok = await H.injectFile(videoInput, videoFile);
        if (ok) {
          logs.push(`🎬 视频文件已注入上传: ${videoFile.name}`);
          logs.push('⏳ 正在等待页面初始化发布表单与封面控件（最多等待20秒）...');
          // Wait for publish form to render
          await H.waitForElement(() => {
            return document.querySelector('input[placeholder*="填写标题"], div.upload-cover, div.cover-plugin-preview, [class*="preview-new"]');
          }, 20000, 1000);
        } else {
          warnings.push('⚠️ 视频文件注入失败');
        }
      }
    } else if (hasExistingVideo) {
      logs.push('🎬 检测到小红书已有视频就绪，保留现有视频');
    }

    await H.sleep(600);

    // 2. Title (Max 20 chars strictly on Xiaohongshu)
    if (!coverOnly) {
      let finalTitle = (title || '').trim();
      if (finalTitle) {
        if (finalTitle.length > 20) {
          finalTitle = finalTitle.slice(0, 20);
          warnings.push(`小红书标题严格限制20字，已截取前20字: "${finalTitle}"`);
        }

        const titleInput = await H.waitForElement(() => {
          return H.findElement([
            'input[placeholder*="填写标题"]',
            'input.c-input_inner',
            '.title-input input',
            'input[maxlength="20"]'
          ]) || H.findInputByLabel(['填写标题', '标题', '* 标题']);
        }, 6000);

        if (titleInput) {
          H.setInputValue(titleInput, finalTitle);
          logs.push(`📌 小红书标题已填入 (${finalTitle.length}字): ${finalTitle}`);
        } else {
          warnings.push('⚠️ 未找到小红书标题输入框');
        }
      }

      // 3. Description & Hashtags (自动从下拉弹窗中选中转为真实话题胶囊)
      const descEditor = await H.waitForElement(() => {
        return H.findElement([
          '.tiptap.ProseMirror',
          'div.tiptap',
          'p[data-placeholder*="输入正文描述"]',
          '#post-textarea',
          'div[contenteditable="true"]',
          '.post-content [contenteditable="true"]'
        ]) || H.findEditorByLabel(['正文描述', '描述', '正文']);
      }, 6000);

      if (descEditor) {
        const descText = (description || '').trim();
        if (descText) {
          H.setContentEditable(descEditor, descText);
          await H.sleep(200);
        }

        const cleanTags = (tags || []).map(t => t.replace(/^#/, '').trim()).filter(Boolean).slice(0, 10);
        if (cleanTags.length > 0) {
          logs.push(`🏷️ 正在向小红书录入 ${cleanTags.length} 个话题并自动从下拉浮窗选中激活为话题标签...`);
          const count = await H.insertHashtags(descEditor, cleanTags, {
            platform: 'xiaohongshu',
            customSelectors: ['.tippy-box .item', '.tippy-content .item']
          });
          logs.push(`✅ 小红书 ${count} 个话题已全部自动选中转为话题标签`);
        } else if (descText) {
          logs.push(`📝 小红书正文描述已填入 (${descText.length}字)`);
        }
      } else {
        warnings.push('⚠️ 未找到小红书正文描述输入区');
      }
    }

    // 4. Cover Upload (Support horizontal / vertical / auto detection)
    let targetCover = null;
    let chosenOrientation = 'vertical';

    if (preferredOrientation === 'horizontal') {
      targetCover = coverHorizontal || coverFile || coverVertical;
      chosenOrientation = 'horizontal';
      logs.push('🎯 指定上传【横版封面】');
    } else if (preferredOrientation === 'vertical') {
      targetCover = coverVertical || coverFile || coverHorizontal;
      chosenOrientation = 'vertical';
      logs.push('🎯 指定上传【竖版封面】');
    } else {
      // Auto detection from DOM
      const detected = this.detectVideoOrientation();
      if (detected === 'horizontal') {
        targetCover = coverHorizontal || coverFile || coverVertical;
        chosenOrientation = 'horizontal';
        logs.push('📐 检测到小红书为横屏视频 (16:9)，自动优先选用【横版封面】');
      } else if (detected === 'vertical') {
        targetCover = coverVertical || coverFile || coverHorizontal;
        chosenOrientation = 'vertical';
        logs.push('📐 检测到小红书为竖屏视频 (3:4)，自动优先选用【竖版封面】');
      } else {
        if (coverHorizontal && !coverVertical) {
          targetCover = coverHorizontal;
          chosenOrientation = 'horizontal';
        } else if (coverVertical && !coverHorizontal) {
          targetCover = coverVertical;
          chosenOrientation = 'vertical';
        } else {
          // If both provided, default to horizontal if horizontal exists, or coverFile
          targetCover = coverHorizontal || coverVertical || coverFile;
          chosenOrientation = (targetCover === coverHorizontal) ? 'horizontal' : 'vertical';
        }
      }
    }

    if (targetCover) {
      let coverUploaded = false;

      // Check if modal is already open
      let modal = this.getVisibleCoverModal();
      if (modal) {
        logs.push('🔍 检测到小红书封面编辑弹窗已在页面展开，直接进行上传...');
      } else {
        logs.push('⏳ 正在寻找封面设置入口（等待视频首帧解析就绪，最多等待25秒）...');
        let trigger = null;
        const startWait = Date.now();

        // Extended poll: wait for video first frame to render and trigger to appear
        while (Date.now() - startWait < 25000) {
          modal = this.getVisibleCoverModal();
          if (modal) break;

          trigger = this.findCoverTrigger();
          if (trigger) break;

          await H.sleep(1000);
        }

        if (modal) {
          logs.push('🪟 封面编辑弹窗已在等待过程中展开');
        } else if (trigger) {
          logs.push('👆 已定位到封面首帧卡片，正在模拟点击展开封面设置弹窗...');
          // Scroll and click trigger
          H.clickElement(trigger);
          if (trigger.parentElement && trigger.parentElement !== document.body) {
            H.clickElement(trigger.parentElement);
          }
          await H.sleep(1500);

          // Wait up to 8 seconds for modal to appear
          modal = await H.waitForElement(() => this.getVisibleCoverModal(), 8000, 500);
        }
      }

      // Interact with Modal
      if (modal) {
        logs.push('🪟 封面裁剪弹窗已就绪');

        // Step 1: Switch to "上传封面" Tab
        const uploadTab = Array.from(modal.querySelectorAll('*')).find(el => {
          return el.children.length === 0 && (el.textContent?.trim() === '上传封面' || el.textContent?.trim().includes('上传封面'));
        });

        if (uploadTab) {
          H.clickElement(uploadTab);
          logs.push('📑 已点击切换至「上传封面」标签');
          await H.sleep(1500);
        }

        // Step 1.5: Switch ratio in modal if ratio selectors exist (e.g. 16:9 or 3:4)
        this.selectModalRatio(modal, chosenOrientation);

        // Step 2: Locate image file input
        let fileInput = modal.querySelector('div.upload-wrapper input[type="file"], input[type="file"][accept*="image"], input[type="file"]');
        if (!fileInput) {
          fileInput = document.querySelector('div.d-modal input[type="file"], div.upload-wrapper input[type="file"], input[type="file"][accept*="image"]');
        }

        if (!fileInput) {
          // Click placeholder if input generated on demand
          const uploadBox = Array.from(modal.querySelectorAll('div, span, p')).find(el => {
            const t = el.innerText?.trim();
            return t?.includes('点击上传') || t?.includes('拖拽') || t === '+';
          });
          if (uploadBox) {
            H.clickElement(uploadBox);
            await H.sleep(800);
          }
          fileInput = modal.querySelector('input[type="file"]') || document.querySelector('div.d-modal input[type="file"], input[type="file"][accept*="image"]');
        }

        if (fileInput) {
          const ok = await H.injectFile(fileInput, targetCover);
          if (ok) {
            coverUploaded = true;
            const orientLabel = chosenOrientation === 'horizontal' ? '横版封面(16:9/4:3)' : '竖版封面(3:4)';
            logs.push(`🖼️ 小红书【${orientLabel}】已注入: ${targetCover.name}`);

            // Wait 3.5 seconds for image upload & crop canvas rendering
            logs.push('⏳ 正在等待小红书封面图片加载与裁剪就绪...');
            await H.sleep(3500);

            // Step 3: Click "确定" / "完成" button
            let confirmBtn = modal.querySelector('.d-modal-footer button, .d-modal-footer [role="button"]');
            if (!confirmBtn) {
              confirmBtn = Array.from(modal.querySelectorAll('button, div, span')).find(b => {
                const txt = b.innerText?.trim();
                return (txt === '确定' || txt === '完成' || txt === '保存') && b.children.length === 0 && b.offsetParent !== null;
              });
            }

            if (confirmBtn) {
              H.clickElement(confirmBtn);
              logs.push('✅ 封面弹窗「确定」按钮已自动点击保存');
              await H.sleep(1500);
            } else {
              logs.push('ℹ️ 封面图片已上传完成，请在弹窗中核对并点击「确定」');
            }
          } else {
            warnings.push('⚠️ 弹窗内图片文件注入失败');
          }
        } else {
          warnings.push('⚠️ 弹窗内未找到图片选择控件 input[type="file"]');
        }
      } else {
        // Fallback: direct input on page
        const directInput = document.querySelector('div.upload-wrapper input[type="file"], input[type="file"][accept*="image"]');
        if (directInput) {
          const ok = await H.injectFile(directInput, targetCover);
          if (ok) {
            coverUploaded = true;
            const orientLabel = chosenOrientation === 'horizontal' ? '横版封面' : '竖版封面';
            logs.push(`🖼️ 封面图片已通过页面控件注入【${orientLabel}】: ${targetCover.name}`);
          }
        }
        if (!coverUploaded) {
          warnings.push('ℹ️ 未能唤起封面弹窗（等待超时或视频仍在处理中，您可手动点开“设置封面”后再次点击“传横版封面”或“传竖版封面”）');
        }
      }
    }

    return { success: true, logs, warnings };
  }
};
