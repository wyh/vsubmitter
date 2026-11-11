/**
 * vsubmitter - DOM Helper Utilities (v1.2.0)
 * Robust DOM discovery, React/Vue synthetic event simulation, and modal automation.
 */

window.__vsubmitter_helpers = (function() {
  /**
   * Set native input/textarea value with execCommand + prototype setter for 100% React/Vue3 reactivity
   */
  function setInputValue(element, value) {
    if (!element) return false;
    element.focus();

    // 1. Try execCommand insertText (most reliable for Vue 3 and React internal listeners)
    try {
      element.select();
      document.execCommand('selectAll', false, null);
      const inserted = document.execCommand('insertText', false, value);
      if (inserted && element.value === value) {
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } catch (e) {}

    // 2. Prototype descriptor setter fallback
    try {
      const proto = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') ||
                         Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ||
                         Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }
    } catch (e) {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  /**
   * Set contenteditable text (Draft.js, Quill, ProseMirror, Slate, Semi UI)
   */
  function setContentEditable(editor, text) {
    if (!editor) return false;
    editor.focus();

    // Strategy 1: execCommand
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);

      document.execCommand('delete', false, null);
      const ok = document.execCommand('insertText', false, text);
      if (ok) {
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } catch (e) {}

    // Strategy 2: HTML Paragraphs
    try {
      const lines = text.split('\n');
      editor.innerHTML = lines.map(line => line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>').join('');
    } catch (e) {
      editor.innerText = text;
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
    return true;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Safely move selection/cursor to the very end of a contenteditable element
   */
  function moveCursorToEnd(element) {
    if (!element) return;
    element.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  /**
   * Sequentially insert hashtags into contenteditable editors (Xiaohongshu TipTap, Douyin Semi/Slate)
   * Automatically triggers platform autocomplete dropdown, waits for suggestions, and clicks the candidate/dispatches enter
   */
  async function insertHashtags(editor, tags, options = {}) {
    if (!editor || !tags || tags.length === 0) return 0;
    const cleanTags = tags.map(t => t.replace(/^#/, '').trim()).filter(Boolean);
    if (cleanTags.length === 0) return 0;

    editor.focus();
    moveCursorToEnd(editor);

    // If editor already has text and doesn't end with newline, add separation
    const existing = (editor.innerText || '').trim();
    if (existing.length > 0) {
      try {
        document.execCommand('insertText', false, '\n\n');
      } catch (e) {}
      await sleep(100);
      moveCursorToEnd(editor);
    }

    const candidateSelectors = [
      ...(options.customSelectors || []),
      // Xiaohongshu TipTap topic popup items
      '.tippy-box .item.is-selected',
      '.tippy-box .item',
      '.tippy-content .item',
      // Douyin Semi UI topic dropdown items
      '.semi-popover .semi-dropdown-item',
      '.semi-portal .semi-dropdown-item',
      'div.semi-dropdown-item',
      'li.semi-dropdown-item',
      // Generic topic / suggestion lists
      '[class*="topic-suggest"] [class*="item"]',
      '[class*="topic-item"]',
      '[class*="suggest-item"]',
      '[role="listbox"] [role="option"]',
      '[role="option"]'
    ];

    let insertedCount = 0;

    for (const tag of cleanTags) {
      moveCursorToEnd(editor);
      await sleep(80);

      // 1. Insert "#tag" via execCommand
      try {
        document.execCommand('insertText', false, '#' + tag);
      } catch (e) {
        const span = document.createElement('span');
        span.textContent = '#' + tag;
        editor.appendChild(span);
      }

      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new KeyboardEvent('keyup', { key: tag.slice(-1) || '#', bubbles: true }));

      // 2. Poll for dropdown suggestions (wait up to 500ms)
      let selected = false;
      const startTime = Date.now();
      const timeout = options.timeout || 500;

      while (Date.now() - startTime < timeout) {
        await sleep(60);

        const candidate = findElement(candidateSelectors);
        if (candidate) {
          const rect = candidate.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            candidate.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            candidate.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            if (typeof candidate.click === 'function') candidate.click();
            selected = true;
            break;
          }
        }
      }

      // 3. Fallback if no dropdown item appeared: confirm with Enter & Space
      if (!selected) {
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        editor.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        await sleep(50);
        document.execCommand('insertText', false, ' ');
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }

      insertedCount++;
      await sleep(150);
    }

    return insertedCount;
  }

  /**
   * Inject File object into <input type="file"> via DataTransfer
   */
  async function injectFile(fileInput, filePayload) {
    if (!fileInput || !filePayload || !filePayload.dataUrl) return false;
    try {
      const res = await fetch(filePayload.dataUrl);
      const blob = await res.blob();
      const file = new File([blob], filePayload.name || 'upload_file.png', {
        type: filePayload.type || blob.type || 'image/png'
      });

      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;

      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch (err) {
      console.error('[vsubmitter] injectFile error:', err);
      return false;
    }
  }

  /**
   * Find input by adjacent or parent label text
   */
  function findInputByLabel(labelKeywords, context = document) {
    if (typeof labelKeywords === 'string') labelKeywords = [labelKeywords];
    const candidates = Array.from(context.querySelectorAll('label, span, div, p, dt, h3, h4'));

    for (const kw of labelKeywords) {
      for (const el of candidates) {
        const txt = el.innerText?.trim() || '';
        // Exact or close match on leaf-ish node
        if (txt === kw || (txt.startsWith(kw) && txt.length < kw.length + 5) || txt.includes(kw)) {
          if (el.children.length > 2) continue; // Skip large parent containers

          // 1. Check inside this element or its parent
          let container = el;
          for (let i = 0; i < 4 && container; i++) {
            const inp = container.querySelector('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])');
            if (inp && inp !== el) return inp;
            // Also check following siblings
            let sibling = container.nextElementSibling;
            for (let j = 0; j < 3 && sibling; j++) {
              const sibInp = sibling.querySelector('input:not([type="hidden"]):not([type="file"])') || (sibling.tagName === 'INPUT' ? sibling : null);
              if (sibInp) return sibInp;
              sibling = sibling.nextElementSibling;
            }
            container = container.parentElement;
          }
        }
      }
    }
    return null;
  }

  /**
   * Find editor (contenteditable or textarea) by label keywords
   */
  function findEditorByLabel(labelKeywords, context = document) {
    if (typeof labelKeywords === 'string') labelKeywords = [labelKeywords];
    const candidates = Array.from(context.querySelectorAll('label, span, div, p, dt'));

    for (const kw of labelKeywords) {
      for (const el of candidates) {
        const txt = el.innerText?.trim() || '';
        if (txt === kw || txt.includes(kw)) {
          if (el.children.length > 2) continue;

          let container = el;
          for (let i = 0; i < 4 && container; i++) {
            const editor = container.querySelector('[contenteditable="true"], textarea');
            if (editor && editor !== el) return editor;

            let sibling = container.nextElementSibling;
            for (let j = 0; j < 3 && sibling; j++) {
              const sibEditor = sibling.querySelector('[contenteditable="true"], textarea') ||
                                (sibling.getAttribute('contenteditable') === 'true' || sibling.tagName === 'TEXTAREA' ? sibling : null);
              if (sibEditor) return sibEditor;
              sibling = sibling.nextElementSibling;
            }
            container = container.parentElement;
          }
        }
      }
    }
    return null;
  }

  /**
   * Click an element simulating native mouse events sequence
   */
  function clickElement(el) {
    if (!el) return false;
    el.scrollIntoView?.({ block: 'center', inline: 'center' });
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };

    ['pointerover', 'pointerenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
      try {
        const C = evt.startsWith('pointer') ? PointerEvent : MouseEvent;
        el.dispatchEvent(new C(evt, opts));
      } catch (e) {
        el.dispatchEvent(new MouseEvent(evt, opts));
      }
    });
    if (typeof el.click === 'function') el.click();
    return true;
  }

  /**
   * Find element matching any selector
   */
  function findElement(selectors, context = document) {
    if (typeof selectors === 'string') selectors = [selectors];
    for (const sel of selectors) {
      try {
        const el = context.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  }

  /**
   * Find file input
   */
  function findFileInput(acceptFilter = '', context = document) {
    const inputs = Array.from(context.querySelectorAll('input[type="file"]'));
    for (const inp of inputs) {
      const accept = (inp.getAttribute('accept') || '').toLowerCase();
      if (!acceptFilter || accept.includes(acceptFilter)) {
        return inp;
      }
    }
    return inputs[0] || null;
  }

  /**
   * Polling element search
   */
  function waitForElement(finder, timeout = 4000, interval = 250) {
    return new Promise((resolve) => {
      const resolveIfFound = () => {
        if (typeof finder === 'function') {
          return finder();
        } else if (Array.isArray(finder) || typeof finder === 'string') {
          return findElement(finder);
        }
        return null;
      };

      const initial = resolveIfFound();
      if (initial) return resolve(initial);

      const startTime = Date.now();
      const timer = setInterval(() => {
        const res = resolveIfFound();
        if (res) {
          clearInterval(timer);
          return resolve(res);
        }
        if (Date.now() - startTime >= timeout) {
          clearInterval(timer);
          return resolve(null);
        }
      }, interval);
    });
  }

  return {
    setInputValue,
    setContentEditable,
    moveCursorToEnd,
    insertHashtags,
    injectFile,
    clickElement,
    findInputByLabel,
    findEditorByLabel,
    findElement,
    findFileInput,
    waitForElement,
    sleep: (ms) => new Promise(r => setTimeout(r, ms))
  };
})();
