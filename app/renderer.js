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
  perplexity: document.getElementById("wv-perplexity"),
  gemini: document.getElementById("wv-gemini"),
  claude: document.getElementById("wv-claude"),
  chatgpt: document.getElementById("wv-chatgpt"),
};

const NEW_CHAT_URLS = {
  perplexity: "https://www.perplexity.ai/",
  gemini: "https://gemini.google.com/app",
  claude: "https://claude.ai/",
  chatgpt: "https://chatgpt.com/",
};

let isBroadcasting = false;
let lastResults = {};
let lastPromptSent = "";

// ─── Helpers ──────────────────────────────────────────────────

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const setStatus = (t) => { statusEl.textContent = t; };

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

// ─── Shared Script Helpers ────────────────────────────────────
// Common utilities injected into webview scripts to avoid duplication.

const SHARED_HELPERS = `
  const vis = (e) => {
    if (!e) return false;
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden' && e.offsetParent !== null;
  };
  const isExcludedBtn = (btn) => {
    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
    const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
    return label.includes('attach') || label.includes('add') || label.includes('file')
        || label.includes('upload') || label.includes('focus')
        || testId.includes('attach') || testId.includes('add')
        || testId.includes('file') || testId.includes('upload');
  };
  const findPerplexitySubmit = () => {
    const textarea = document.querySelector('textarea');
    const container = textarea?.closest('form')
      || textarea?.parentElement?.parentElement?.parentElement;
    if (!container) return null;
    const candidates = Array.from(container.querySelectorAll('button'))
      .filter(btn => vis(btn) && !isExcludedBtn(btn));
    return candidates.find(btn => {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      return label.includes('submit') || label.includes('send') || label.includes('ask')
             || label.includes('search') || label.includes('go');
    }) || candidates[candidates.length - 1] || null;
  };
`;

// ─── New Chat Scripts ─────────────────────────────────────────

function buildNewChatScript(serviceKey) {
  const serviceLiteral = JSON.stringify(serviceKey);
  return `(() => {
    const service = ${serviceLiteral};
    const textOf = (el) => (el?.textContent || '').trim().toLowerCase();
    const clickFirst = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && !element.disabled) { element.click(); return true; }
      }
      return false;
    };

    if (service === 'chatgpt') {
      if (clickFirst(['a[data-testid="new-chat-button"]', 'button[data-testid="new-chat-button"]', 'a[href="/"]'])) return true;
      location.href = 'https://chatgpt.com/';
      return true;
    }
    if (service === 'gemini') {
      if (clickFirst(['button[aria-label*="New chat" i]', 'button[aria-label*="새 채팅" i]', 'a[href="/app"]'])) return true;
      location.href = 'https://gemini.google.com/app';
      return true;
    }
    if (service === 'claude') {
      if (clickFirst(['a[href="/new"]', 'button[aria-label*="new chat" i]'])) return true;
      location.href = 'https://claude.ai/';
      return true;
    }
    if (service === 'perplexity') {
      if (clickFirst(['a[href="/"]', 'button[aria-label*="New" i]', 'button[aria-label*="새" i]'])) return true;
      const buttons = Array.from(document.querySelectorAll('button')).filter((button) => {
        const label = (button.getAttribute('aria-label') || '').toLowerCase();
        const text = textOf(button);
        if (label.includes('attach') || text.includes('attach')) return false;
        return (label.includes('new') || text.includes('new') || text.includes('새')) && !button.disabled;
      });
      if (buttons[0]) { buttons[0].click(); return true; }
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
    try { webview.loadURL(targetUrl); } catch { /* ignore */ }
  }
  await waitForReady(webview, 5000);
  try {
    await webview.executeJavaScript(buildNewChatScript(key), true);
  } catch { /* site DOM may not be ready; fallback is URL navigation */ }
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
    const fin = (v) => { if (done) return; done = true; clearTimeout(t); res(v); };
    const t = setTimeout(() => fin(false), ms);
    wv.addEventListener("did-stop-loading", () => fin(true), { once: true });
    wv.addEventListener("did-fail-load", () => fin(false), { once: true });
  });
}

// ─── Injection Scripts (run inside webview) ───────────────────

// Finds the best input element, focuses it, and selects all existing content.
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
  } else if (h.includes('claude')) {
    el = document.querySelector('div[contenteditable="true"]')
      || document.querySelector('textarea');
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
const SUBMIT_CLICK_SCRIPT = `(() => {
  ${SHARED_HELPERS}
  const h = location.hostname;

  // ── Perplexity: specific logic to avoid wrong button ──
  if (h.includes('perplexity')) {
    const btn = findPerplexitySubmit();
    if (btn && !btn.disabled) { btn.click(); return { ok: true, method: 'perplexity-specific' }; }
    return { ok: false };
  }

  // ── Other services ──
  const sels = [];
  if (h.includes('chatgpt'))
    sels.push('button[data-testid="send-button"]', 'button[aria-label*="Send" i]');
  else if (h.includes('gemini'))
    sels.push('button[aria-label*="Send message" i]', 'button.send-button', 'button[aria-label*="Send" i]');
  else if (h.includes('claude'))
    sels.push('button[data-testid="send-button"]', 'button[aria-label*="Send Message" i]', 'button[aria-label*="send" i]');

  sels.push('button[type="submit"]', 'button[aria-label*="Submit" i]', 'button[aria-label*="Send" i]');

  for (const sel of sels) {
    const btn = document.querySelector(sel);
    if (btn && vis(btn) && !btn.disabled) { btn.click(); return { ok: true, method: 'btn:' + sel }; }
  }

  // Fallback: SVG icon button near the active input
  const ae = document.activeElement;
  const container = ae?.closest('form')
    || ae?.parentElement?.parentElement?.parentElement?.parentElement;
  if (container) {
    const btns = Array.from(container.querySelectorAll('button'))
      .filter(btn => vis(btn) && !btn.disabled && btn.querySelector('svg') && !isExcludedBtn(btn));
    const target = btns.find(b => {
      const l = (b.getAttribute('aria-label') || '').toLowerCase();
      return l.includes('send') || l.includes('submit') || l.includes('전송') || l.includes('보내기');
    }) || btns[btns.length - 1];
    if (target) { target.click(); return { ok: true, method: 'svg-btn-filtered' }; }
  }

  return { ok: false };
})()`;

// Check if the submit button exists and is enabled.
const CHECK_SUBMIT_READY_SCRIPT = `(() => {
  ${SHARED_HELPERS}
  const h = location.hostname;

  if (h.includes('perplexity')) {
    const btn = findPerplexitySubmit();
    if (btn) return { found: true, enabled: !btn.disabled };
    return { found: false, enabled: false };
  }

  const sels = [];
  if (h.includes('chatgpt'))  sels.push('button[data-testid="send-button"]');
  if (h.includes('gemini'))   sels.push('button[aria-label*="Send message" i]', 'button.send-button');
  if (h.includes('claude'))   sels.push('button[data-testid="send-button"]', 'button[aria-label*="Send Message" i]', 'button[aria-label*="send" i]');
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
      if (r?.ok) { focused = true; break; }
    } catch { /* webview not ready */ }
    await wait(200 + i * 200);
  }
  if (!focused) return { inputOk: false, submitOk: false };

  await wait(50);

  // ── Phase 2: Type text using Electron native insertText ──
  try { wv.insertText(prompt); } catch { return { inputOk: false, submitOk: false }; }

  // ── Phase 3: Wait for framework to recognize the input ──
  let submitReady = false;
  for (let i = 0; i < 10; i++) {
    await wait(150);
    try {
      const c = await wv.executeJavaScript(CHECK_SUBMIT_READY_SCRIPT, true);
      if (c?.found && c?.enabled) { submitReady = true; break; }
    } catch { /* ignore */ }
  }

  // ── Phase 4: Submit – click button first ──
  let submitted = false;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await wv.executeJavaScript(SUBMIT_CLICK_SCRIPT, true);
      if (r?.ok) { submitted = true; break; }
    } catch { /* ignore */ }
    await wait(300);
  }

  // ── Phase 5: Fallback – send native Enter keystroke ──
  if (!submitted) {
    try {
      await wv.executeJavaScript(FOCUS_SCRIPT, true);
      await wait(100);
      wv.sendInputEvent({ type: "keyDown", keyCode: "Return" });
      await wait(30);
      wv.sendInputEvent({ type: "keyUp", keyCode: "Return" });
      submitted = true;
    } catch { submitted = false; }
  }

  return { inputOk: true, submitOk: submitted };
}

// ─── Broadcast (parallel) ─────────────────────────────────────

async function broadcast(keys) {
  if (isBroadcasting) return;

  const typedPrompt = questionInput.value.trim();
  const prompt = typedPrompt || (keys ? lastPromptSent : "");
  if (!prompt) { setStatus("질문을 먼저 입력해 주세요."); return; }

  if (!keys) lastPromptSent = prompt;

  isBroadcasting = true;
  broadcastBtn.disabled = true;
  if (retryBtn) retryBtn.disabled = true;

  const targets = keys
    ? keys.map((k) => [k, webviews[k]])
    : Object.entries(webviews);

  setStatus(`전송 중... (0/${targets.length})`);
  let done = 0;

  // ── Parallel injection ──
  const jobs = targets.map(async ([key, wv]) => {
    setBadge(key, "전송 중", "sending");
    await waitForReady(wv, 5000);

    let r = await injectOne(key, wv, prompt);

    // 자동 복구: 전송 실패 시 해당 연결만 1회 새로고침 후 재시도
    if (!r.submitOk) {
      setBadge(key, "복구 중...", "warn");
      await openFreshConversation(key, wv);
      r = await injectOne(key, wv, prompt);
    }

    lastResults[key] = r;
    done++;

    setBadge(
      key,
      r.submitOk ? "전송됨" : r.inputOk ? "입력됨" : "실패",
      r.submitOk ? "ok" : r.inputOk ? "warn" : "fail"
    );
    setStatus(`전송 중... (${done}/${targets.length})`);
  });

  await Promise.all(jobs);

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

  wv.addEventListener("dom-ready", () => {
    if (k === "perplexity") {
      wv.insertCSS(`
        * {
          font-family: "Pretendard", -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif !important;
        }
      `).catch(() => {});
    }
  });
}

questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); broadcast(); }
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") { e.preventDefault(); resetQuestion(); }
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); broadcast(); }
});

broadcastBtn.addEventListener("click", () => broadcast());
newQuestionBtn.addEventListener("click", resetQuestion);
retryBtn?.addEventListener("click", () => {
  const fails = Object.entries(lastResults).filter(([, r]) => !r.submitOk).map(([k]) => k);
  if (fails.length) broadcast(fails);
});

// Individual Refresh Buttons
document.querySelectorAll(".refresh-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-service");
    const wv = webviews[key];
    if (key && wv) { setBadge(key, "새로고침"); openFreshConversation(key, wv); }
  });
});

// External browser links
document.querySelectorAll('.open-ext').forEach(btn => {
  btn.addEventListener('click', async () => {
    const panel = btn.closest('.panel.ai');
    const wv = panel ? panel.querySelector('webview') : null;
    let url = btn.getAttribute('data-url');
    if (wv) {
      try {
        const currentUrl = await wv.executeJavaScript("location.href");
        if (currentUrl) url = currentUrl;
      } catch (e) {
        if (typeof wv.getURL === 'function') url = wv.getURL() || url;
      }
    }
    if (url) window.open(url, '_blank');
  });
});

questionInput.value = "";
setStatus("");
updateRetryBtn();
setTimeout(() => questionInput.focus(), 100);
