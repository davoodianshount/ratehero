/**
 * BOLT — AI Mortgage Assistant
 * Floating chat widget for goratehero.com
 * 
 * USAGE: Drop this <script> tag before </body> on any page.
 * Update WORKER_URL to your deployed Cloudflare Worker URL.
 */

(function () {
  const WORKER_URL = 'https://bolt-proxy.davoodianshount.workers.dev';

  const CHIPS = [
    { e: '🏘️', t: "I'm a real estate investor" },
    { e: '💼', t: "I'm self-employed" },
    { e: '💵', t: 'Get cash out of my home' },
    { e: '🔓', t: 'Exit a hard money loan' },
    { e: '🏠', t: 'Buy my first home' },
    { e: '📊', t: 'What is a DSCR loan?' },
  ];

  /* ── Inject styles ── */
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');

    #bolt-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 99999;
      width: 58px; height: 58px; border-radius: 50%;
      background: linear-gradient(135deg, #1D4ED8, #3B82F6);
      border: none; cursor: pointer; font-size: 22px; color: #fff;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(59,130,246,0.5);
      animation: bolt-pulse 3s ease-in-out infinite;
      transition: transform 0.2s;
      font-family: 'DM Sans', sans-serif;
    }
    #bolt-fab:hover { transform: scale(1.08); }

    #bolt-window {
      position: fixed; bottom: 94px; right: 24px; z-index: 99998;
      width: 360px; height: 580px; border-radius: 22px;
      background: linear-gradient(160deg, #080E1A, #0D1526);
      border: 1px solid rgba(59,130,246,0.2);
      box-shadow: 0 24px 64px rgba(0,0,0,0.7);
      display: flex; flex-direction: column; overflow: hidden;
      font-family: 'DM Sans', sans-serif;
      transform: scale(0.95) translateY(10px);
      opacity: 0; pointer-events: none;
      transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
    }
    #bolt-window.bolt-open {
      transform: scale(1) translateY(0);
      opacity: 1; pointer-events: all;
    }

    /* Mobile — fullscreen, follow visualViewport so keyboard never covers input */
    @media (max-width: 480px) {
      #bolt-window {
        width: 100vw;
        right: 0; left: 0; top: 0; bottom: 0;
        height: 100vh;               /* fallback */
        height: 100dvh;              /* shrinks when keyboard opens */
        max-height: none;
        border-radius: 0;
        padding-bottom: env(safe-area-inset-bottom);
        padding-top: env(safe-area-inset-top);
      }
      #bolt-fab { bottom: 20px; right: 16px; }
      body.bolt-open-mobile #bolt-fab { display: none; }
      /* Lock the page under the widget so it can't scroll behind */
      body.bolt-open-mobile { overflow: hidden; position: fixed; width: 100%; }
      /* iOS auto-zooms on inputs with font-size < 16px — bump on mobile */
      .bolt-input { font-size: 16px !important; }
      /* Bigger, tappier close button on mobile */
      .bolt-close { width: 36px !important; height: 36px !important; font-size: 18px !important; }
      .bolt-header { padding: 14px 16px !important; }
    }

    .bolt-header {
      padding: 13px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      display: flex; align-items: center; justify-content: space-between;
      background: rgba(255,255,255,0.025); flex-shrink: 0;
    }
    .bolt-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg,#1D4ED8,#3B82F6);
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; flex-shrink: 0;
      animation: bolt-pulse 3s ease-in-out infinite;
    }
    .bolt-close {
      background: rgba(255,255,255,0.08); border: none;
      color: #94A3B8; cursor: pointer; border-radius: 50%;
      width: 28px; height: 28px; font-size: 14px;
      display: flex; align-items: center; justify-content: center;
    }
    .bolt-messages {
      flex: 1; overflow-y: auto; padding: 16px 14px 8px;
      scroll-behavior: smooth;
    }
    .bolt-messages::-webkit-scrollbar { width: 3px; }
    .bolt-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

    .bolt-bubble-row {
      display: flex; margin-bottom: 10px;
      animation: bolt-fade 0.3s ease;
    }
    .bolt-bubble-row.user { justify-content: flex-end; }
    .bolt-bubble-row.bot { justify-content: flex-start; align-items: flex-end; gap: 7px; }
    .bolt-bubble-avatar {
      width: 22px; height: 22px; border-radius: 50%;
      background: linear-gradient(135deg,#1D4ED8,#3B82F6);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; flex-shrink: 0;
    }
    .bolt-bubble {
      max-width: 78%; padding: 9px 13px;
      font-size: 13px; line-height: 1.58; color: #fff;
    }
    .bolt-bubble.user {
      background: linear-gradient(135deg,#1D4ED8,#3B82F6);
      border-radius: 16px 16px 4px 16px;
    }
    .bolt-bubble.bot {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px 16px 16px 4px;
    }

    .bolt-chips {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 0 0 6px 29px;
    }
    .bolt-chip {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(59,130,246,0.25);
      border-radius: 20px; color: #CBD5E1;
      font-size: 11.5px; padding: 5px 11px;
      cursor: pointer; transition: all 0.15s;
      font-family: 'DM Sans', sans-serif;
      display: flex; align-items: center; gap: 5px;
    }
    .bolt-chip:hover {
      background: rgba(59,130,246,0.18);
      border-color: rgba(59,130,246,0.6); color: #fff;
    }

    .bolt-trust {
      padding: 6px 16px;
      border-top: 1px solid rgba(255,255,255,0.05);
      display: flex; align-items: center; justify-content: center;
      gap: 8px; background: rgba(0,0,0,0.2); flex-shrink: 0;
    }

    .bolt-input-row {
      padding: 10px 12px; display: flex; gap: 8px;
      border-top: 1px solid rgba(255,255,255,0.07);
      background: rgba(255,255,255,0.02); flex-shrink: 0;
    }
    .bolt-input {
      flex: 1; background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; padding: 10px 13px;
      color: #fff; font-size: 13px;
      font-family: 'DM Sans', sans-serif;
      transition: border-color 0.2s; outline: none;
    }
    .bolt-input::placeholder { color: rgba(255,255,255,0.28); }
    .bolt-input:focus { border-color: rgba(59,130,246,0.5); }
    .bolt-send {
      width: 40px; height: 40px; border-radius: 12px; border: none;
      background: linear-gradient(135deg,#1D4ED8,#3B82F6);
      color: #fff; font-size: 17px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: filter 0.2s; flex-shrink: 0;
    }
    .bolt-send:disabled {
      background: rgba(255,255,255,0.07); cursor: default;
    }
    .bolt-send:not(:disabled):hover { filter: brightness(1.15); }

    .bolt-typing {
      display: flex; gap: 4px; align-items: center; padding: 2px 0;
    }
    .bolt-dot {
      width: 6px; height: 6px; border-radius: 50%; background: #3B82F6;
    }
    .bolt-dot:nth-child(1) { animation: bolt-bounce 1.2s ease-in-out 0s infinite; }
    .bolt-dot:nth-child(2) { animation: bolt-bounce 1.2s ease-in-out 0.2s infinite; }
    .bolt-dot:nth-child(3) { animation: bolt-bounce 1.2s ease-in-out 0.4s infinite; }

    @keyframes bolt-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.45); }
      60% { box-shadow: 0 0 0 10px rgba(59,130,246,0); }
    }
    @keyframes bolt-fade {
      from { opacity:0; transform: translateY(6px); }
      to { opacity:1; transform: translateY(0); }
    }
    @keyframes bolt-bounce {
      0%,80%,100% { transform: translateY(0); opacity:0.35; }
      40% { transform: translateY(-5px); opacity:1; }
    }
  `;
  document.head.appendChild(style);

  /* ── State ── */
  let messages = [];
  let busy = false;
  let started = false;
  let open = false;

  /* ── Stable session id (persists across pages & reloads) ── */
  const SESSION_KEY = 'bolt-session-id';
  function getSessionId() {
    try {
      let id = localStorage.getItem(SESSION_KEY);
      if (!id) {
        id = 'bolt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch {
      // Private mode / storage blocked — fall back to per-load id.
      return 'bolt_mem_' + Math.random().toString(36).slice(2, 12);
    }
  }
  const sessionId = getSessionId();

  /* ── DOM ── */
  const fab = document.createElement('button');
  fab.id = 'bolt-fab';
  fab.innerHTML = '⚡';
  fab.title = 'Ask Bolt — AI Mortgage Assistant';

  const win = document.createElement('div');
  win.id = 'bolt-window';
  win.innerHTML = `
    <div class="bolt-header">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="bolt-avatar">⚡</div>
        <div>
          <div style="color:#fff;font-weight:700;font-size:14px;letter-spacing:-0.2px;">Bolt</div>
          <div style="color:#94A3B8;font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">AI Mortgage Assistant</div>
          <div style="color:#3B82F6;font-size:10.5px;font-weight:500;margin-top:1px;">● Online · Rate Hero</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.22);border-radius:8px;padding:3px 9px;color:#3B82F6;font-size:10px;font-weight:700;">No SSN</div>
        <button class="bolt-close" id="bolt-close-btn">✕</button>
      </div>
    </div>
    <div class="bolt-messages" id="bolt-msgs"></div>
    <div class="bolt-trust">
      <span style="color:#475569;font-size:10px;">Featured on</span>
      <span style="color:#60748A;font-size:10.5px;font-weight:700;">BiggerPockets</span>
      <span style="color:#1E3A5F;font-size:14px;">·</span>
      <span style="color:#475569;font-size:10px;">No SSN · No Credit Pull</span>
    </div>
    <div class="bolt-input-row">
      <input class="bolt-input" id="bolt-input" placeholder="Ask about loans, rates, programs..." />
      <button class="bolt-send" id="bolt-send" disabled>↑</button>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(win);

  const msgsEl = document.getElementById('bolt-msgs');
  const inputEl = document.getElementById('bolt-input');
  const sendBtn = document.getElementById('bolt-send');

  /* ── Render welcome ── */
  function renderWelcome() {
    const welcome = document.createElement('div');
    welcome.innerHTML = `
      <div class="bolt-bubble-row bot" style="margin-bottom:12px;">
        <div class="bolt-bubble-avatar">⚡</div>
        <div class="bolt-bubble bot">Hey! I'm <strong>Bolt</strong>, your AI Mortgage Assistant from Rate Hero. What are you trying to do with your home or investment property?</div>
      </div>
      <div class="bolt-chips" id="bolt-chips"></div>
    `;
    msgsEl.appendChild(welcome);
    const chipsEl = document.getElementById('bolt-chips');
    CHIPS.forEach(c => {
      const chip = document.createElement('button');
      chip.className = 'bolt-chip';
      chip.textContent = `${c.e} ${c.t}`;
      chip.onclick = () => send(c.t);
      chipsEl.appendChild(chip);
    });
  }

  /* ── Add bubble ── */
  function addBubble(role, content) {
    const row = document.createElement('div');
    row.className = `bolt-bubble-row ${role === 'user' ? 'user' : 'bot'}`;
    if (role === 'assistant') {
      row.innerHTML = `<div class="bolt-bubble-avatar">⚡</div><div class="bolt-bubble bot">${content}</div>`;
    } else {
      row.innerHTML = `<div class="bolt-bubble user">${content}</div>`;
    }
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return row;
  }

  /* ── Typing indicator ── */
  function showTyping() {
    const row = document.createElement('div');
    row.className = 'bolt-bubble-row bot';
    row.id = 'bolt-typing';
    row.innerHTML = `<div class="bolt-bubble-avatar">⚡</div><div class="bolt-bubble bot"><div class="bolt-typing"><div class="bolt-dot"></div><div class="bolt-dot"></div><div class="bolt-dot"></div></div></div>`;
    msgsEl.appendChild(row);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function hideTyping() {
    const t = document.getElementById('bolt-typing');
    if (t) t.remove();
  }

  /* ── Send message ── */
  async function send(text) {
    const t = (text || inputEl.value).trim();
    if (!t || busy) return;
    inputEl.value = '';
    sendBtn.disabled = true;
    busy = true;
    if (!started) { started = true; }

    messages.push({ role: 'user', content: t });
    addBubble('user', t);
    showTyping();

    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          session_id: sessionId,
          page: location.pathname + location.search,
        }),
      });
      const data = await res.json();
      const reply = data?.reply || data?.content?.[0]?.text
        || 'Reach a Rate Hero strategist at (747) 308-1635 or visit goratehero.com.';
      hideTyping();
      messages.push({ role: 'assistant', content: reply });
      addBubble('assistant', reply);
      if (data?.lead_captured) {
        // Subtle affirmation row
        const row = document.createElement('div');
        row.className = 'bolt-bubble-row bot';
        row.innerHTML = '<div class="bolt-bubble-avatar">✓</div><div class="bolt-bubble bot" style="background:rgba(16,185,129,0.1);border-color:rgba(16,185,129,0.35);color:#A7F3D0;">A strategist will reach out shortly. Text (747) 308-1635 if you need them sooner.</div>';
        msgsEl.appendChild(row);
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }
    } catch {
      hideTyping();
      addBubble('assistant', 'Reach a Rate Hero strategist at (747) 308-1635 or visit goratehero.com.');
    }

    busy = false;
  }

  /* ── Mobile viewport tracking — keep the window locked to the visible viewport
        so the iOS keyboard can never overlap the input. ── */
  const isMobile = () => window.matchMedia('(max-width: 480px)').matches;
  function syncMobileViewport() {
    if (!open || !isMobile()) {
      win.style.height = '';
      win.style.top = '';
      return;
    }
    const vv = window.visualViewport;
    if (vv) {
      win.style.height = vv.height + 'px';
      win.style.top = vv.offsetTop + 'px';
    }
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncMobileViewport);
    window.visualViewport.addEventListener('scroll', syncMobileViewport);
  }
  window.addEventListener('orientationchange', () => setTimeout(syncMobileViewport, 100));

  /* ── Events ── */
  fab.addEventListener('click', () => {
    open = !open;
    win.classList.toggle('bolt-open', open);
    fab.innerHTML = open ? '✕' : '⚡';
    document.body.classList.toggle('bolt-open-mobile', open && isMobile());
    if (open && msgsEl.children.length === 0) renderWelcome();
    if (open) {
      syncMobileViewport();
      // Don't autofocus on mobile — that forces the keyboard open before the
      // user has seen the welcome chips.
      if (!isMobile()) inputEl.focus();
    }
  });

  document.getElementById('bolt-close-btn').addEventListener('click', () => {
    open = false;
    win.classList.remove('bolt-open');
    fab.innerHTML = '⚡';
    document.body.classList.remove('bolt-open-mobile');
    inputEl.blur();
  });

  // When the input gains focus on mobile, scroll the latest message into view
  // so the user sees what they're typing in context.
  inputEl.addEventListener('focus', () => {
    setTimeout(() => {
      msgsEl.scrollTop = msgsEl.scrollHeight;
      syncMobileViewport();
    }, 50);
  });

  inputEl.addEventListener('input', () => {
    sendBtn.disabled = !inputEl.value.trim();
  });
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener('click', () => send());

})();
