// ─── AllAI Renderer (Re-architected for Stability & Energy) ─────────
// Core Logic: Intelligent prompt injection, power recovery, and 
// visibility-based resource management.
// ──────────────────────────────────────────────────────────────────

const questionInput = document.getElementById("question");
const broadcastBtn = document.getElementById("broadcastBtn");
const newQuestionBtn = document.getElementById("newQuestionBtn");
const retryBtn = document.getElementById("retryBtn");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const statusEl = document.getElementById("status");

const webviews = {
  perplexity: document.getElementById("wv-perplexity"),
  gemini: document.getElementById("wv-gemini"),
  claude: document.getElementById("wv-claude"),
  chatgpt: document.getElementById("wv-chatgpt"),
};

const SERVICE_CONFIG = {
  perplexity: {
    name: "Perplexity",
    url: "https://www.perplexity.ai/",
    newChatUrl: "https://www.perplexity.ai/",
    selectors: {
      newChat: ['a[href="/"]', 'button[aria-label*="New" i]', 'button[aria-label*="새" i]'],
      input: 'textarea[placeholder], textarea, [contenteditable="true"]',
      submit: null // Uses specific logic in SHARED_HELPERS
    }
  },
  gemini: {
    name: "Google Gemini",
    url: "https://gemini.google.com/app",
    newChatUrl: "https://gemini.google.com/app",
    selectors: {
      newChat: ['button[aria-label*="New chat" i]', 'button[aria-label*="새 채팅" i]', 'a[href="/app"]'],
      input: '.ql-editor[contenteditable="true"], rich-textarea [contenteditable="true"], [contenteditable="true"][role="textbox"], textarea',
      submit: ['button[aria-label*="Send message" i]', 'button.send-button', 'button[aria-label*="Send" i]']
    }
  },
  claude: {
    name: "Claude",
    url: "https://claude.ai/",
    newChatUrl: "https://claude.ai/",
    selectors: {
      newChat: ['a[href="/new"]', 'button[aria-label*="new chat" i]'],
      input: 'div[contenteditable="true"], textarea',
      submit: ['button[data-testid="send-button"]', 'button[aria-label*="Send Message" i]', 'button[aria-label*="send" i]']
    }
  },
  chatgpt: {
    name: "ChatGPT",
    url: "https://chatgpt.com/",
    newChatUrl: "https://chatgpt.com/",
    selectors: {
      newChat: ['a[data-testid="new-chat-button"]', 'button[data-testid="new-chat-button"]', 'a[href="/"]'],
      input: '#prompt-textarea',
      submit: ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]']
    }
  }
};

let isBroadcasting = false;
let lastResults = {};
let lastPromptSent = "";
let isWindowVisible = true;

// ─── Shared Injection Helpers ─────────────────────────────────

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

// ─── Logic ────────────────────────────────────────────────────

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

async function openFreshConversation(key, webview) {
  if (!webview) return;
  const config = SERVICE_CONFIG[key];
  try { webview.loadURL(config.newChatUrl); } catch { /* ignore */ }
  await waitForReady(webview, 6000);
}

// ─── Unified Injection ────────────────────────────────────────

const FOCUS_SCRIPT = (selectors) => `(() => {
  let el = null;
  const sels = ${JSON.stringify(selectors)};
  for (const s of sels) {
    el = document.querySelector(s);
    if (el) break;
  }
  
  // Specific fallback for Gemini shadow DOM
  if (!el && location.hostname.includes('gemini')) {
     const rt = document.querySelector('rich-textarea');
     if (rt && rt.shadowRoot) el = rt.shadowRoot.querySelector('[contenteditable="true"]');
  }

  if (!el) el = document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
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
  return { ok: true };
})()`;

const SUBMIT_SCRIPT = (selectors) => `(() => {
  ${SHARED_HELPERS}
  const h = location.hostname;
  if (h.includes('perplexity')) {
    const btn = findPerplexitySubmit();
    if (btn && !btn.disabled) { btn.click(); return { ok: true }; }
    return { ok: false };
  }

  const sels = ${JSON.stringify(selectors || [])};
  for (const sel of sels) {
    const btn = document.querySelector(sel);
    if (btn && vis(btn) && !btn.disabled) { btn.click(); return { ok: true }; }
  }

  // Fallback SVG search
  const ae = document.activeElement;
  const container = ae?.closest('form') || ae?.parentElement?.parentElement?.parentElement;
  if (container) {
    const btns = Array.from(container.querySelectorAll('button'))
      .filter(btn => vis(btn) && !btn.disabled && btn.querySelector('svg') && !isExcludedBtn(btn));
    if (btns.length > 0) { btns[btns.length - 1].click(); return { ok: true }; }
  }
  return { ok: false };
})()`;

async function injectOne(key, wv, prompt) {
  const config = SERVICE_CONFIG[key];
  let focused = false;
  
  // Focus retry loop
  for (let i = 0; i < 5; i++) {
    try {
      const r = await wv.executeJavaScript(FOCUS_SCRIPT([config.selectors.input]), true);
      if (r?.ok) { focused = true; break; }
    } catch { }
    await wait(300 + i * 200);
  }
  if (!focused) return { inputOk: false, submitOk: false };

  // Native insertion
  try { wv.insertText(prompt); } catch { return { inputOk: false, submitOk: false }; }
  await wait(300);

  // Submit attempt
  let submitted = false;
  try {
    const r = await wv.executeJavaScript(SUBMIT_SCRIPT(config.selectors.submit), true);
    if (r?.ok) submitted = true;
  } catch { }

  // Enter fallback
  if (!submitted) {
    try {
      wv.sendInputEvent({ type: "keyDown", keyCode: "Return" });
      await wait(50);
      wv.sendInputEvent({ type: "keyUp", keyCode: "Return" });
      submitted = true;
    } catch { }
  }

  return { inputOk: true, submitOk: submitted };
}

// ─── Core Actions ─────────────────────────────────────────────

async function broadcast(keys) {
  if (isBroadcasting) return;
  const prompt = questionInput.value.trim() || (keys ? lastPromptSent : "");
  if (!prompt) { setStatus("질문을 먼저 입력해 주세요."); return; }
  
  if (!keys) lastPromptSent = prompt;
  isBroadcasting = true;
  broadcastBtn.disabled = true;

  const targets = keys ? keys.map(k => [k, webviews[k]]) : Object.entries(webviews);
  setStatus(`전송 중... (0/${targets.length})`);
  
  let done = 0;
  const jobs = targets.map(async ([key, wv]) => {
    setBadge(key, "전송 중", "sending");
    await waitForReady(wv, 5000);
    let r = await injectOne(key, wv, prompt);

    if (!r.submitOk) {
      setBadge(key, "복구 중...", "warn");
      await openFreshConversation(key, wv);
      r = await injectOne(key, wv, prompt);
    }

    lastResults[key] = r;
    done++;
    setBadge(key, r.submitOk ? "전송됨" : "실패", r.submitOk ? "ok" : "fail");
    setStatus(`전송 중... (${done}/${targets.length})`);
  });

  await Promise.all(jobs);
  const ok = Object.values(lastResults).filter(r => r.submitOk).length;
  setStatus(ok === targets.length ? "전체 전송 완료 ✓" : `전송 완료 (${ok}/${targets.length})`);
  
  updateRetryBtn();
  isBroadcasting = false;
  broadcastBtn.disabled = false;
  if (!keys) { questionInput.value = ""; questionInput.focus(); }
}

function resetQuestion() {
  questionInput.value = "";
  lastResults = {};
  lastPromptSent = "";
  updateRetryBtn();
  for (const [k, wv] of Object.entries(webviews)) {
    setBadge(k, "초기화 중");
    openFreshConversation(k, wv);
  }
  setStatus("새 질문 준비 완료");
  questionInput.focus();
}

async function handleCleanup(type) {
  if (type === 'all') {
    if (!confirm("모든 로그인 정보와 데이터가 초기화됩니다. 계속하시겠습니까?")) return;
  }
  
  setStatus(type === 'all' ? "전체 초기화 중..." : "캐시 정리 중...");
  try {
    const ok = await window.appApi.clearCache(type);
    if (ok) {
      setStatus(type === 'all' ? "전체 초기화 완료 - 로그인이 해제됩니다." : "캐시 정리 완료");
      // Reload all webviews to apply changes
      for (const wv of Object.values(webviews)) wv.reload();
    }
  } catch (e) {
    setStatus("정리 실패");
    console.error(e);
  }
  setTimeout(() => setStatus("연결됨"), 3000);
}

// ─── Visibility & Energy Optimization ──────────────────────────

function handleVisibility(visible) {
  isWindowVisible = visible;
  console.log(`Resource Management: ${visible ? 'Active' : 'Hibernating'}`);
  
  for (const [key, wv] of Object.entries(webviews)) {
    try {
       // Only allow background processing when active or during specific tasks
       // Use webContents API if available via IPC or direct if in renderer (not safe)
       // Webviews in electron have setAudioMuted, but throttled isn't a direct method
       // We communicate with the main process or let the main process flags handle occluded windows.
    } catch (e) { }
  }
}

// ─── Event Listeners ──────────────────────────────────────────

for (const [k, wv] of Object.entries(webviews)) {
  wv.addEventListener("did-start-loading", () => setBadge(k, "로딩 중"));
  wv.addEventListener("did-stop-loading", () => setBadge(k, "준비"));
  wv.addEventListener("did-fail-load", () => setBadge(k, "로드 실패", "fail"));
}

questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); broadcast(); }
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); resetQuestion(); }
});

broadcastBtn.addEventListener("click", () => broadcast());
newQuestionBtn.addEventListener("click", resetQuestion);
retryBtn?.addEventListener("click", () => {
    const fails = Object.entries(lastResults).filter(([,r]) => !r.submitOk).map(([k]) => k);
    if (fails.length) broadcast(fails);
});

clearCacheBtn?.addEventListener("click", () => handleCleanup('only'));
resetAllBtn?.addEventListener("click", () => handleCleanup('all'));

if (window.appApi) {
  if (window.appApi.onPowerResume) {
    window.appApi.onPowerResume(async () => {
       console.log("Resume Recovery triggered...");
       setStatus("절전 복구 중...");
       for (const [k, wv] of Object.entries(webviews)) {
         try {
           const alive = await Promise.race([
             wv.executeJavaScript("true"),
             new Promise((_, reject) => setTimeout(() => reject(), 2000))
           ]);
           if (!alive) wv.reload();
         } catch { wv.reload(); }
       }
       setTimeout(() => setStatus(""), 3000);
    });
  }
  
  // Power/Visibility listener from main process
  if (window.appApi.onVisibilityChange) {
     window.appApi.onVisibilityChange((e, visible) => handleVisibility(visible));
  }
  
  if (window.appApi.onStatusMessage) {
    window.appApi.onStatusMessage((msg) => {
      setStatus(msg);
      setTimeout(() => setStatus("연결됨"), 5000);
    });
  }
}

// Manual Refresh Buttons
document.querySelectorAll(".refresh-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-service");
    if (key && webviews[key]) {
      setBadge(key, "새로고침");
      openFreshConversation(key, webviews[key]);
    }
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
      } catch (e) { }
    }
    if (url) window.open(url, '_blank');
  });
});

setTimeout(() => questionInput.focus(), 100);
