// ─── AllAI Renderer ───────────────────────────────────────────
// Uses Electron native APIs (insertText, sendInputEvent) for
// reliable cross-service prompt injection + submission.
// These generate trusted browser events identical to real user input.
// ──────────────────────────────────────────────────────────────

const questionInput = document.getElementById("question");
const broadcastBtn = document.getElementById("broadcastBtn");
const newQuestionBtn = document.getElementById("newQuestionBtn");
const retryBtn = document.getElementById("retryBtn");
const statusEl = document.getElementById("status");

const webviews = {
  chatgpt: document.getElementById("wv-chatgpt"),
  gemini: document.getElementById("wv-gemini"),
  grok: document.getElementById("wv-grok"),
  perplexity: document.getElementById("wv-perplexity"),
};

const NEW_CHAT_URLS = {
  chatgpt: "https://chatgpt.com/",
  gemini: "https://gemini.google.com/app",
  grok: "https://grok.com/",
  perplexity: "https://www.perplexity.ai/",
};

let isBroadcasting = false;
let lastResults = {};
let lastPromptSent = "";

// ─── Helpers ──────────────────────────────────────────────────

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const setStatus = (t) => {
  statusEl.textContent = t;
};

function setBadge(key, text, type) {
  const b = document.querySelector(`[data-badge='${key}']`);
  if (!b) return;
  b.textContent = text;
  b.className = "badge" + (type ? ` badge-${type}` : "");
}

function updateRetryBtn() {
  const fails = Object.values(lastResults).filter((r) => !r.submitOk).length;
  if (retryBtn) retryBtn.style.display = fails > 0 ? "" : "none";
}

function buildNewChatScript(serviceKey) {
  const serviceLiteral = JSON.stringify(serviceKey);
  return `(() => {
    const service = ${serviceLiteral};
    const textOf = (el) => (el?.textContent || '').trim().toLowerCase();

    const clickFirst = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && !element.disabled) {
          element.click();
          return true;
        }
      }
      return false;
    };

    if (service === 'chatgpt') {
      if (clickFirst([
        'a[data-testid="new-chat-button"]',
        'button[data-testid="new-chat-button"]',
        'a[href="/"]'
      ])) return true;
      location.href = 'https://chatgpt.com/';
      return true;
    }

    if (service === 'gemini') {
      if (clickFirst([
        'button[aria-label*="New chat" i]',
        'button[aria-label*="새 채팅" i]',
        'a[href="/app"]'
      ])) return true;
      location.href = 'https://gemini.google.com/app';
      return true;
    }

    if (service === 'grok') {
      if (clickFirst([
        'button[aria-label*="New" i]',
        'a[href="/"]'
      ])) return true;
      location.href = 'https://grok.com/';
      return true;
    }

    if (service === 'perplexity') {
      if (clickFirst([
        'a[href="/"]',
        'button[aria-label*="New" i]',
        'button[aria-label*="새" i]'
      ])) return true;

      const buttons = Array.from(document.querySelectorAll('button')).filter((button) => {
        const label = (button.getAttribute('aria-label') || '').toLowerCase();
        const text = textOf(button);
        if (label.includes('attach') || text.includes('attach')) return false;
        return (label.includes('new') || text.includes('new') || text.includes('새')) && !button.disabled;
      });
      if (buttons[0]) {
        buttons[0].click();
        return true;
      }
      location.href = 'https://www.perplexity.ai/';
      return true;
    }

    return false;
  })();`;
}

async function openFreshConversation(key, webview) {
  if (!webview) return;

  const targetUrl = NEW_CHAT_URLS[key];
  if (targetUrl) {
    try {
      webview.loadURL(targetUrl);
    } catch {
      // ignore URL load failure and continue to script fallback
    }
  }

  await waitForReady(webview, 5000);

  try {
    await webview.executeJavaScript(buildNewChatScript(key), true);
  } catch {
    // site DOM may not be ready yet; fallback is already URL navigation above
  }
}

function resetQuestion() {
  questionInput.value = "";
  lastResults = {};
  lastPromptSent = "";
  updateRetryBtn();
  for (const [k, wv] of Object.entries(webviews)) {
    setBadge(k, "새로고침");
    openFreshConversation(k, wv);
  }
  setStatus("새 질문 준비 중...");
  questionInput.focus();
}

async function waitForReady(wv, ms = 5000) {
  if (!wv?.isLoading()) return true;
  return new Promise((res) => {
    let done = false;
    const fin = (v) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      res(v);
    };
    const t = setTimeout(() => fin(false), ms);
    wv.addEventListener("did-stop-loading", () => fin(true), { once: true });
    wv.addEventListener("did-fail-load", () => fin(false), { once: true });
  });
}

// ─── Injection Scripts (run inside webview) ───────────────────

// Finds the best input element, focuses it, and selects all existing content.
// Returns { ok, ce (contenteditable?) } so caller knows what kind of input it is.
const FOCUS_SCRIPT = `(() => {
  const h = location.hostname;
  let el = null;

  if (h.includes('chatgpt')) {
    el = document.querySelector('#prompt-textarea')
      || document.querySelector('[contenteditable="true"][data-placeholder]')
      || document.querySelector('div[contenteditable="true"]');
  } else if (h.includes('gemini')) {
    el = document.querySelector('.ql-editor[contenteditable="true"]')
      || document.querySelector('rich-textarea [contenteditable="true"]');
    if (!el) {
      const rt = document.querySelector('rich-textarea');
      if (rt && rt.shadowRoot) el = rt.shadowRoot.querySelector('[contenteditable="true"]');
    }
    if (!el) el = document.querySelector('[contenteditable="true"][role="textbox"]')
      || document.querySelector('textarea');
  } else if (h.includes('grok') || h.includes('x.ai')) {
    el = document.querySelector('textarea')
      || document.querySelector('[contenteditable="true"]');
  } else if (h.includes('perplexity')) {
    el = document.querySelector('textarea[placeholder]')
      || document.querySelector('textarea')
      || document.querySelector('[contenteditable="true"]');
  } else {
    el = document.querySelector('textarea')
      || document.querySelector('[contenteditable="true"]');
  }

  if (!el) return { ok: false };

  el.focus();

  // Select all existing content so insertText will replace it
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    el.select();
  } else if (el.isContentEditable) {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  return { ok: true, ce: el.isContentEditable };
})()`;

// Finds and clicks the best submit/send button.
// Returns { ok } indicating whether a button was clicked.
const SUBMIT_CLICK_SCRIPT = `(() => {
  const h = location.hostname;
  const vis = (e) => {
    if (!e) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden' && e.offsetParent !== null;
  };
  const isPerplexity = h.includes('perplexity');

  // ── Perplexity: very specific logic to avoid hitting the wrong button ──
  if (isPerplexity) {
    // Perplexity's submit button is an arrow SVG button inside the textarea container.
    // It's usually the LAST visible, enabled button near the textarea.
    // Exclude buttons that are file-attach, add, focus-selector, etc.
    const textarea = document.querySelector('textarea');
    if (textarea) {
      // Walk up to the form or the closest container that holds the submit button
      const form = textarea.closest('form');
      const container = form || textarea.parentElement?.parentElement?.parentElement;
      if (container) {
        const buttons = Array.from(container.querySelectorAll('button'));
        // Filter: visible, enabled, and NOT an attach/add button
        const candidates = buttons.filter(btn => {
          if (!vis(btn) || btn.disabled) return false;
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
          // Exclude known non-submit buttons
          if (label.includes('attach') || label.includes('add') || label.includes('file')
              || label.includes('upload') || label.includes('focus')
              || testId.includes('attach') || testId.includes('add')
              || testId.includes('file') || testId.includes('upload')) return false;
          return true;
        });
        // Prefer button with submit-like label, else take the last candidate (closest to textarea end)
        const submitBtn = candidates.find(btn => {
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          return label.includes('submit') || label.includes('send') || label.includes('ask')
                 || label.includes('search') || label.includes('go');
        }) || candidates[candidates.length - 1];
        if (submitBtn) {
          submitBtn.click();
          return { ok: true, method: 'perplexity-specific' };
        }
      }
    }
    return { ok: false };
  }

  // ── Other services ──
  const sels = [];

  if (h.includes('chatgpt'))
    sels.push('button[data-testid="send-button"]', 'button[aria-label*="Send" i]');
  else if (h.includes('gemini'))
    sels.push('button[aria-label*="Send message" i]', 'button.send-button', 'button[aria-label*="Send" i]');
  else if (h.includes('grok') || h.includes('x.ai'))
    sels.push('button[aria-label*="Send" i]', 'button[data-testid*="send" i]');

  sels.push('button[type="submit"]', 'button[aria-label*="Submit" i]', 'button[aria-label*="Send" i]');

  for (const sel of sels) {
    const btn = document.querySelector(sel);
    if (btn && vis(btn) && !btn.disabled) {
      btn.click();
      return { ok: true, method: 'btn:' + sel };
    }
  }

  // Fallback: SVG icon button near the active input (NOT for Perplexity)
  const ae = document.activeElement;
  const container = ae?.closest('form')
    || ae?.parentElement?.parentElement?.parentElement?.parentElement;
  if (container) {
    for (const btn of container.querySelectorAll('button')) {
      if (vis(btn) && !btn.disabled && btn.querySelector('svg')) {
        btn.click();
        return { ok: true, method: 'svg-btn' };
      }
    }
  }

  return { ok: false };
})()`;

// Check if the submit button exists but is disabled (text not yet recognized)
const CHECK_SUBMIT_READY_SCRIPT = `(() => {
  const h = location.hostname;
  const vis = (e) => {
    if (!e) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden' && e.offsetParent !== null;
  };

  // Perplexity: find the correct submit button near the textarea
  if (h.includes('perplexity')) {
    const textarea = document.querySelector('textarea');
    const container = textarea?.closest('form')
      || textarea?.parentElement?.parentElement?.parentElement;
    if (container) {
      const buttons = Array.from(container.querySelectorAll('button'));
      const candidates = buttons.filter(btn => {
        if (!vis(btn)) return false;
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
        if (label.includes('attach') || label.includes('add') || label.includes('file')
            || label.includes('upload') || label.includes('focus')
            || testId.includes('attach') || testId.includes('add')) return false;
        return true;
      });
      const submitBtn = candidates.find(btn => {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        return label.includes('submit') || label.includes('send') || label.includes('ask');
      }) || candidates[candidates.length - 1];
      if (submitBtn) return { found: true, enabled: !submitBtn.disabled };
    }
    return { found: false, enabled: false };
  }

  const sels = [];
  if (h.includes('chatgpt'))    sels.push('button[data-testid="send-button"]');
  if (h.includes('gemini'))    sels.push('button[aria-label*="Send message" i]', 'button.send-button');
  if (h.includes('grok'))      sels.push('button[aria-label*="Send" i]');
  sels.push('button[type="submit"]');

  for (const sel of sels) {
    const btn = document.querySelector(sel);
    if (btn && vis(btn)) return { found: true, enabled: !btn.disabled };
  }
  return { found: false, enabled: false };
})()`;

// ─── Core Injection (per-service) ─────────────────────────────

async function injectOne(key, wv, prompt) {
  // ── Phase 1: Focus the input element + select all ──
  let focused = false;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await wv.executeJavaScript(FOCUS_SCRIPT, true);
      if (r?.ok) {
        focused = true;
        break;
      }
    } catch {
      /* webview not ready */
    }
    await wait(400 + i * 300);
  }
  if (!focused) return { inputOk: false, submitOk: false };

  await wait(150);

  // ── Phase 2: Type text using Electron native insertText ──
  // This uses Chromium's InputMethod, generating trusted InputEvents.
  // Works with React, Lexical, ProseMirror, Quill, plain textareas—all of them.
  try {
    wv.insertText(prompt);
  } catch {
    return { inputOk: false, submitOk: false };
  }

  // ── Phase 3: Wait for framework to recognize the input ──
  // React, Lexical etc. need time to process InputEvents and enable submit button.
  // We poll until the submit button becomes enabled, up to 3 seconds.
  let submitReady = false;
  for (let i = 0; i < 15; i++) {
    await wait(200);
    try {
      const c = await wv.executeJavaScript(CHECK_SUBMIT_READY_SCRIPT, true);
      if (c?.found && c?.enabled) {
        submitReady = true;
        break;
      }
    } catch {
      /* ignore */
    }
  }

  // Even if poll didn't find an enabled button, still try to submit
  // (some services don't have a dedicated button; Enter key works)

  // ── Phase 4: Submit – click button first ──
  let submitted = false;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await wv.executeJavaScript(SUBMIT_CLICK_SCRIPT, true);
      if (r?.ok) {
        submitted = true;
        break;
      }
    } catch {
      /* ignore */
    }
    await wait(300);
  }

  // ── Phase 5: Fallback – send native Enter keystroke ──
  // sendInputEvent generates a trusted KeyboardEvent (isTrusted: true)
  // which React/frameworks properly handle, unlike JS-dispatched events.
  if (!submitted) {
    try {
      // Re-focus input first
      await wv.executeJavaScript(FOCUS_SCRIPT, true);
      await wait(100);
      wv.sendInputEvent({ type: "keyDown", keyCode: "Return" });
      await wait(30);
      wv.sendInputEvent({ type: "keyUp", keyCode: "Return" });
      submitted = true;
    } catch {
      submitted = false;
    }
  }

  return { inputOk: true, submitOk: submitted };
}

// ─── Broadcast ────────────────────────────────────────────────

async function broadcast(keys) {
  if (isBroadcasting) return;

  const typedPrompt = questionInput.value.trim();
  const prompt = typedPrompt || (keys ? lastPromptSent : "");
  if (!prompt) {
    setStatus("질문을 먼저 입력해 주세요.");
    return;
  }

  if (!keys) {
    lastPromptSent = prompt;
  }

  isBroadcasting = true;
  broadcastBtn.disabled = true;
  if (retryBtn) retryBtn.disabled = true;

  const targets = keys
    ? keys.map((k) => [k, webviews[k]])
    : Object.entries(webviews);

  let done = 0;
  setStatus(`전송 중... (0/${targets.length})`);

  for (const [key, wv] of targets) {
    setBadge(key, "전송 중", "sending");
    await waitForReady(wv, 5000);

    const r = await injectOne(key, wv, prompt);
    lastResults[key] = r;
    done++;

    setBadge(
      key,
      r.submitOk ? "전송됨" : r.inputOk ? "입력됨" : "실패",
      r.submitOk ? "ok" : r.inputOk ? "warn" : "fail"
    );
    setStatus(`전송 중... (${done}/${targets.length})`);
    await wait(200);
  }

  const total = Object.keys(webviews).length;
  const ok = Object.values(lastResults).filter((r) => r.submitOk).length;
  setStatus(ok === total ? "전체 전송 완료 ✓" : `전송 ${ok}/${total}`);

  updateRetryBtn();
  isBroadcasting = false;
  broadcastBtn.disabled = false;
  if (retryBtn) retryBtn.disabled = false;

  if (!keys) {
    questionInput.value = "";
    questionInput.focus();
  }
}

// ─── Events ───────────────────────────────────────────────────

for (const [k, wv] of Object.entries(webviews)) {
  wv.addEventListener("did-start-loading", () => setBadge(k, "로딩 중"));
  wv.addEventListener("did-stop-loading", () => setBadge(k, "준비"));
  wv.addEventListener("did-fail-load", () => setBadge(k, "로드 실패", "fail"));
}

questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    broadcast();
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    resetQuestion();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    broadcast();
  }
});

broadcastBtn.addEventListener("click", () => broadcast());
newQuestionBtn.addEventListener("click", resetQuestion);
retryBtn?.addEventListener("click", () => {
  const fails = Object.entries(lastResults)
    .filter(([, r]) => !r.submitOk)
    .map(([k]) => k);
  if (fails.length) broadcast(fails);
});

questionInput.value = "";
setStatus("");
updateRetryBtn();
setTimeout(() => questionInput.focus(), 100);
