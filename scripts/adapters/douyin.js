/**
 * vsubmitter Adapter: 抖音创作者服务平台 (Douyin)
 * Supported URLs: creator.douyin.com/creator-micro/content/upload, .../post/video
 */

window.__vsubmitter_adapters = window.__vsubmitter_adapters || {};

window.__vsubmitter_adapters.douyin = {
  name: '抖音',
  platformId: 'douyin',

  // Helper: switch Tab inside dy-creator-content-modal ("设置横封面" or "设置竖封面")
  switchTab(modal, tabName) {
    const H = window.__vsubmitter_helpers;
    const isHoriz = tabName.includes('横');
    const targetKeywords = isHoriz
      ? ['设置横封面', '横封面', '4:3', '横版封面', '横版']
      : ['设置竖封面', '竖封面', '3:4', '竖版封面', '竖版'];

    const candidates = Array.from(modal.querySelectorAll('*')).filter(el => {
      if (el.children.length > 0) return false;
      const t = el.textContent?.trim() || '';
      return targetKeywords.some(kw => t === kw || t.includes(kw));
    });
    if (candidates.length > 0) {
      const target = candidates[candidates.length - 1];
      H.clickElement(target);
      if (target.parentElement && target.parentElement !== modal) {
        H.clickElement(target.parentElement);
      }
      return true;
    }
    return false;
  },

  // Helper: find genuine cover upload input in modal (avoiding AI reference image input)
  findCoverUploadInput(modal) {
    // 1. Look for upload area with text like '点击上传' or '拖拽' (ignoring AI reference box)
    const dragTexts = Array.from(modal.querySelectorAll('*')).filter(el => {
      const t = el.textContent?.trim() || '';
      return (t.includes('点击上传') || t.includes('拖拽')) && !t.includes('参考图');
    });

    for (const dt of dragTexts) {
      let p = dt;
      for (let i = 0; i < 5 && p; i++) {
        const inp = p.querySelector('input.semi-upload-hidden-input, input[type="file"]');
        if (inp) return inp;
        p = p.parentElement;
      }
    }

    // 2. Query container without reference image text
    const uploadContainers = Array.from(modal.querySelectorAll('.semi-upload, [class*="upload"]'));
    for (const c of uploadContainers) {
      if (c.innerText?.includes('参考图')) continue;
      const inp = c.querySelector('input.semi-upload-hidden-input, input[type="file"]');
      if (inp) return inp;
    }

    // 3. Fallback: last input (first is AI reference)
    const allInputs = Array.from(modal.querySelectorAll('input.semi-upload-hidden-input, input[type="file"]'));
    if (allInputs.length > 1) return allInputs[allInputs.length - 1];
    return allInputs[0] || null;
  },

  // Helper: find trigger on the main publish page ("横封面4:3" or "竖封面3:4")
  findCoverTrigger(preferredOrientation) {
    const targetLabel = preferredOrientation === 'horizontal' ? '横封面' : '竖封面';
    const labelEl = Array.from(document.querySelectorAll('*')).find(el => {
      return el.children.length === 0 && el.textContent?.trim().includes(targetLabel);
    });

    if (labelEl) {
      let p = labelEl.parentElement;
      for (let i = 0; i < 4 && p; i++) {
        const imgOrBox = p.querySelector('img, [class*="cover"], [class*="preview"], [class*="card"]');
        if (imgOrBox && imgOrBox !== labelEl) return imgOrBox;
        p = p.parentElement;
      }
      return labelEl;
    }

    return document.querySelector('[class*="cover-"]') || document.querySelector('button:has-text("设置封面")');
  },

  // Helper: wait for "完成" button and close modal safely
  async finishModal(modal, logs) {
    const H = window.__vsubmitter_helpers;
    let finished = false;

    for (let i = 0; i < 25; i++) {
      await H.sleep(600);
      const finishBtn = Array.from(modal.querySelectorAll('button')).find(b => {
        const t = b.innerText?.trim();
        return (t === '完成' || t === '确定') && !b.classList.contains('semi-button-disabled');
      });

      if (finishBtn) {
        H.clickElement(finishBtn);
        await H.sleep(1200);

        // Check if secondary confirm dialog popped up (e.g. "仍然完成", "确定", "继续")
        const confirmDialogBtn = Array.from(document.querySelectorAll('.semi-modal-content button, div.semi-modal button')).find(b => {
          const txt = b.innerText?.trim();
          return ['确定', '确认', '仍然完成', '仍要完成', '继续'].includes(txt);
        });
        if (confirmDialogBtn) {
          H.clickElement(confirmDialogBtn);
          await H.sleep(800);
        }

        finished = true;
        logs.push('✅ 抖音封面弹窗已成功点击完成保存');
        break;
      }
    }

    if (!finished) {
      logs.push('ℹ️ 封面文件已上传，请核对后手动点击弹窗右下角「完成」保存');
    }
  },

  async run({ title, description, tags, videoFile, coverFile, coverVertical, coverHorizontal, coverOnly, preferredOrientation }) {
    const H = window.__vsubmitter_helpers;
    const logs = [];
    const warnings = [];

    // Remove any shepherd onboarding guide overlay
    document.querySelectorAll('.shepherd-element, .shepherd-modal-overlay-container').forEach(e => e.remove());

    // Check if video is already uploaded
    const hasExistingVideo = !!document.querySelector('.upload-btn-input, [class*="upload-success"], video, [class*="preview-video"]') ||
      Array.from(document.querySelectorAll('button, span, div')).some(el => {
        const t = el.children.length === 0 ? el.textContent?.trim() : '';
        return t === '更换视频' || t === '重新上传' || t?.includes('上传成功');
      });

    // 1. Video Upload
    if (!coverOnly && videoFile && !hasExistingVideo) {
      const videoInput = H.findElement([
        "div[class^='container'] input[type='file']",
        "input.upload-btn-input",
        "input[type='file'][accept*='video']",
        "input[type='file']"
      ]);
      if (videoInput) {
        const ok = await H.injectFile(videoInput, videoFile);
        if (ok) {
          logs.push(`🎬 视频文件已注入上传: ${videoFile.name}`);
          logs.push('⏳ 正在等待抖音后台表单初始化（最多等待20秒）...');
          await H.waitForElement(() => {
            return document.querySelector('input[placeholder*="作品标题"], div.zone-container[contenteditable="true"]');
          }, 20000, 1000);
        } else {
          warnings.push('⚠️ 视频文件注入失败');
        }
      }
    } else if (hasExistingVideo) {
      logs.push('🎬 检测到抖音已有视频就绪，保留现有视频');
    }

    await H.sleep(600);

    // 2. Title (Max 30 chars on Douyin)
    if (!coverOnly) {
      let finalTitle = (title || '').trim();
      if (finalTitle) {
        if (finalTitle.length > 30) {
          finalTitle = finalTitle.slice(0, 30);
          warnings.push(`抖音标题限制30字，已截取前30字: "${finalTitle}"`);
        }

        const titleInput = await H.waitForElement(() => {
          return H.findElement([
            'input[placeholder*="填写作品标题"]',
            'input[placeholder*="作品标题"]',
            'input.semi-input[placeholder*="标题"]',
            'input[maxlength="30"]'
          ]) || H.findInputByLabel(['作品标题', '标题']);
        }, 6000);

        if (titleInput) {
          H.setInputValue(titleInput, finalTitle);
          logs.push(`📌 抖音作品标题已填入 (${finalTitle.length}字): ${finalTitle}`);
        } else {
          warnings.push('⚠️ 未找到抖音作品标题输入框');
        }
      }

      // 3. Description & Hashtags (自动从下拉弹窗中选中转为真实话题标签)
      const descEditor = await H.waitForElement(() => {
        return H.findElement([
          'div.zone-container[contenteditable="true"]',
          'div.notranslate[contenteditable="true"]',
          'div[contenteditable="true"]'
        ]) || H.findEditorByLabel(['作品描述', '描述']);
      }, 6000);

      if (descEditor) {
        const descText = (description || '').trim();
        if (descText) {
          H.setContentEditable(descEditor, descText);
          await H.sleep(200);
        }

        const cleanTags = (tags || []).map(t => t.replace(/^#/, '').trim()).filter(Boolean).slice(0, 10);
        if (cleanTags.length > 0) {
          logs.push(`🏷️ 正在向抖音录入 ${cleanTags.length} 个话题并自动从下拉浮窗选中激活为话题标签...`);
          const count = await H.insertHashtags(descEditor, cleanTags, {
            platform: 'douyin',
            customSelectors: [
              '.semi-popover .semi-dropdown-item',
              '.semi-portal .semi-dropdown-item',
              'div.semi-dropdown-item',
              'li.semi-dropdown-item',
              '[class*="suggest-item"]',
              '[class*="topic-item"]'
            ]
          });
          logs.push(`✅ 抖音 ${count} 个话题已全部自动选中转为话题标签`);
        } else if (descText) {
          logs.push(`📝 抖音作品描述已填入 (${descText.length}字)`);
        }
      } else {
        warnings.push('⚠️ 未找到抖音作品描述编辑区');
      }
    }

    // 4. Cover Upload (Dialog-driven, supports horizontal, vertical, or dual-upload)
    const hasHorizontal = !!coverHorizontal;
    const hasVertical = !!coverVertical;
    const shouldUploadHorizontal = (preferredOrientation === 'horizontal') || (preferredOrientation === 'auto' && hasHorizontal);
    const shouldUploadVertical = (preferredOrientation === 'vertical') || (preferredOrientation === 'auto' && hasVertical);

    if (shouldUploadHorizontal || shouldUploadVertical || coverFile) {
      let modal = document.querySelector('div.dy-creator-content-modal, div.semi-modal');
      if (modal && (modal.innerText?.includes('封面') || modal.innerText?.includes('完成'))) {
        logs.push('🔍 检测到抖音封面编辑弹窗已展开，直接进行上传...');
      } else {
        modal = null;
        logs.push('⏳ 正在寻找抖音封面入口（最多等待20秒）...');

        const triggerOrientation = preferredOrientation === 'horizontal' ? 'horizontal' : 'vertical';
        const trigger = await H.waitForElement(() => this.findCoverTrigger(triggerOrientation), 20000, 1000);

        if (trigger) {
          logs.push('👆 正在模拟触发封面设置卡片展开弹窗...');
          // Hover multiple times to ensure hover state triggers
          for (let i = 0; i < 3; i++) {
            try {
              trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
              trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            } catch (e) {}
            await H.sleep(200);
          }

          H.clickElement(trigger);
          await H.sleep(1500);

          modal = await H.waitForElement(() => {
            return document.querySelector('div.dy-creator-content-modal, div.semi-modal');
          }, 6000);
        }
      }

      if (modal) {
        logs.push('🪟 抖音封面弹窗已就绪');

        // Mode A: Upload Horizontal Cover
        if (shouldUploadHorizontal && (coverHorizontal || coverFile)) {
          const targetHoriz = coverHorizontal || coverFile;
          logs.push('📑 正在切换至「设置横封面」标签...');
          this.switchTab(modal, '设置横封面');
          await H.sleep(1200);

          const coverInput = this.findCoverUploadInput(modal);
          if (coverInput) {
            const ok = await H.injectFile(coverInput, targetHoriz);
            if (ok) {
              logs.push(`🖼️ 抖音【横版封面(4:3)】已注入: ${targetHoriz.name}`);
              await H.sleep(3000);
            } else {
              warnings.push('⚠️ 抖音横版封面图片注入失败');
            }
          } else {
            warnings.push('⚠️ 未找到抖音横版封面文件输入控件');
          }
        }

        // Mode B: Upload Vertical Cover
        if (shouldUploadVertical && (coverVertical || coverFile)) {
          const targetVert = coverVertical || coverFile;
          logs.push('📑 正在切换至「设置竖封面」标签...');
          this.switchTab(modal, '设置竖封面');
          await H.sleep(1200);

          const coverInput = this.findCoverUploadInput(modal);
          if (coverInput) {
            const ok = await H.injectFile(coverInput, targetVert);
            if (ok) {
              logs.push(`🖼️ 抖音【竖版封面(3:4)】已注入: ${targetVert.name}`);
              await H.sleep(3000);
            } else {
              warnings.push('⚠️ 抖音竖版封面图片注入失败');
            }
          } else {
            warnings.push('⚠️ 未找到抖音竖版封面文件输入控件');
          }
        }

        // Finish and close dialog
        await this.finishModal(modal, logs);
      } else {
        warnings.push('ℹ️ 未能展开抖音封面弹窗（可在“设置封面”处手动点开后再次点击“传横版封面”或“传竖版封面”）');
      }
    }

    return { success: true, logs, warnings };
  }
};
