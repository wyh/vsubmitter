/**
 * vsubmitter Adapter: 哔哩哔哩创作中心 (Bilibili)
 * Supported URLs: member.bilibili.com/platform/upload/video/frame
 */

window.__vsubmitter_adapters = window.__vsubmitter_adapters || {};

window.__vsubmitter_adapters.bilibili = {
  name: '哔哩哔哩 (B站)',
  platformId: 'bilibili',

  async run({ title, description, tags, videoFile, coverFile, coverVertical, coverHorizontal, coverOnly }) {
    const H = window.__vsubmitter_helpers;
    const logs = [];
    const warnings = [];

    // Check if video is already uploaded
    const hasExistingVideo = !!document.querySelector('.upload-success, .video-success, [class*="upload-complete"]') ||
      Array.from(document.querySelectorAll('button, span, div')).some(el => {
        const t = el.children.length === 0 ? el.textContent?.trim() : '';
        return t === '更换视频' || t === '重新上传' || t === '上传完成';
      });

    // 1. Video Upload
    if (!coverOnly && videoFile && !hasExistingVideo) {
      const videoInput = H.findElement([
        "input[type='file'][accept*='video']",
        ".bcc-upload input[type='file']",
        "input[type='file']"
      ]);
      if (videoInput) {
        const ok = await H.injectFile(videoInput, videoFile);
        if (ok) {
          logs.push(`🎬 视频文件已注入上传: ${videoFile.name}`);
          logs.push('⏳ 正在等待B站后台表单与封面区域初始化（最多等待20秒）...');
          await H.waitForElement(() => {
            return document.querySelector('input[placeholder*="稿件标题"], input.input-val, [placeholder*="按回车键Enter创建标签"]');
          }, 20000, 1000);
        } else {
          warnings.push('⚠️ 视频文件注入失败');
        }
      }
    } else if (hasExistingVideo) {
      logs.push('🎬 检测到B站已有视频就绪，保留现有视频');
    }

    await H.sleep(600);

    // 2. Title (Max 80 chars)
    if (!coverOnly) {
      let finalTitle = (title || '').trim();
      if (finalTitle) {
        if (finalTitle.length > 80) {
          finalTitle = finalTitle.slice(0, 80);
          warnings.push(`B站标题限制80字，已截取前80字`);
        }

        const titleInput = await H.waitForElement(() => {
          return H.findInputByLabel(['* 标题', '标题', '稿件标题']) ||
                 H.findElement([
                   'input.input-val[placeholder*="标题"]',
                   'input[placeholder*="稿件标题"]',
                   'input[placeholder*="请输入标题"]',
                   'input[maxlength="80"]',
                   '.video-title input',
                   '.content-title-v2 input'
                 ]);
        }, 8000);

        if (titleInput) {
          H.setInputValue(titleInput, finalTitle);
          logs.push(`📌 B站稿件标题已填入 (${finalTitle.length}字): ${finalTitle}`);

          // Re-check after 1.5s in case Bilibili automatically set the title to the video filename
          setTimeout(() => {
            try {
              if (titleInput && titleInput.value !== finalTitle) {
                H.setInputValue(titleInput, finalTitle);
              }
            } catch (e) {}
          }, 1500);
        } else {
          warnings.push('⚠️ 未找到B站标题输入框');
        }
      }

      // 3. Description (B站仅填入首段内容，避免塞入全文)
      const rawDesc = (description || '').trim();
      if (rawDesc) {
        // 优先按空行（连续换行）分割段落；若无空行则按首行截取
        const paragraphs = rawDesc.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        let descText = paragraphs.length > 0 ? paragraphs[0] : rawDesc;
        if (paragraphs.length <= 1 && descText.includes('\n')) {
          const lines = descText.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length > 1) {
            descText = lines[0];
          }
        }

        const descEditor = await H.waitForElement(() => {
          return H.findElement([
            '.ql-editor',
            'div[contenteditable="true"]',
            'textarea.content-desc',
            'textarea[placeholder*="相关信息"]',
            'textarea[placeholder*="简介"]'
          ]) || H.findEditorByLabel(['简介', '视频简介', '描述']);
        }, 6000);

        if (descEditor) {
          if (descEditor.tagName === 'TEXTAREA') {
            H.setInputValue(descEditor, descText);
          } else {
            H.setContentEditable(descEditor, descText);
          }
          const snippet = descText.length > 40 ? descText.slice(0, 40) + '...' : descText;
          logs.push(`📝 B站视频简介（仅截取第一段，${descText.length}字): "${snippet}"`);
        } else {
          warnings.push('⚠️ 未找到B站简介编辑区');
        }
      }

      // 4. Tags (Tag Pills with Enter Key)
      if (tags && tags.length > 0) {
        const tagInput = await H.waitForElement(() => {
          return H.findElement([
            'input[placeholder*="按回车键Enter创建标签"]',
            'input[placeholder*="创建标签"]',
            'input[placeholder*="标签"]',
            '.tag-input-wrp input',
            '.tag-container input'
          ]) || H.findInputByLabel(['* 标签', '标签']);
        }, 6000);

        if (tagInput) {
          let addedCount = 0;
          const maxTagsToAdd = 10;
          const cleanTags = tags.map(t => t.replace(/^#/, '').trim()).filter(Boolean).slice(0, maxTagsToAdd);

          for (const cleanTag of cleanTags) {
            tagInput.focus();
            try {
              document.execCommand('selectAll', false, null);
              document.execCommand('insertText', false, cleanTag);
              tagInput.dispatchEvent(new Event('input', { bubbles: true }));
            } catch (e) {
              tagInput.value = cleanTag;
              tagInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            await H.sleep(150);

            // Dispatch Enter sequence
            const kDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
            const kPress = new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
            const kUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });

            tagInput.dispatchEvent(kDown);
            tagInput.dispatchEvent(kPress);
            tagInput.dispatchEvent(kUp);

            await H.sleep(250);
            addedCount++;
          }
          logs.push(`🏷️ 标签已成功录入 (${addedCount}个): ${cleanTags.join(', ')}`);
        } else {
          warnings.push('⚠️ 未找到B站标签输入框');
        }
      }
    }

    // 5. Cover Upload (Prefers Horizontal 16:9)
    const targetCover = coverHorizontal || coverFile || coverVertical;
    if (targetCover) {
      let fileInput = H.findElement([
        '.cover-upload input[type="file"]',
        'input[type="file"][accept*="image"]'
      ]);

      if (!fileInput) {
        logs.push('⏳ 正在寻找B站封面添加入口（最多等待20秒）...');
        const findCoverBtn = () => {
          return Array.from(document.querySelectorAll('button, div, span, p')).find(el => {
            const t = el.innerText?.trim();
            // Strictly match button text, ignore standalone header "主封面"
            return t === '+ 添加主封面' || t === '添加主封面' || (t?.includes('添加主封面') && el.children.length === 0);
          });
        };

        const addCoverBtn = await H.waitForElement(findCoverBtn, 20000, 1000);
        if (addCoverBtn) {
          logs.push('👆 正在点击「+ 添加主封面」展开裁剪弹窗...');
          H.clickElement(addCoverBtn);
          await H.sleep(1500);

          fileInput = await H.waitForElement([
            '.bcc-dialog input[type="file"]',
            '.modal input[type="file"]',
            'input[type="file"][accept*="image"]'
          ], 6000);
        }
      }

      if (fileInput) {
        const ok = await H.injectFile(fileInput, targetCover);
        if (ok) {
          logs.push(`🖼️ 横版封面已注入: ${targetCover.name}`);
          await H.sleep(2000);

          // Click "确定" in crop modal
          const confirmBtn = Array.from(document.querySelectorAll('.bcc-dialog button, .modal button')).find(b => {
            const txt = b.innerText?.trim();
            return txt === '确定' || txt === '完成';
          });
          if (confirmBtn) {
            confirmBtn.click();
            logs.push('✅ 封面裁剪确认已自动完成');
            await H.sleep(1000);
          }
        } else {
          warnings.push('⚠️ 封面图片文件注入失败');
        }
      } else {
        warnings.push('ℹ️ 未检测到B站封面上传输入控件（可在表单中点击“+ 添加主封面”手动选定）');
      }
    }

    return { success: true, logs, warnings };
  }
};
