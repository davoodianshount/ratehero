/**
 * BOLT — Rate Hero Deal Agent
 * Floating chat widget for goratehero.com
 * Matched to worker.js v2: sends { messages, session_id, page }
 * Receives { reply, lead_captured, lead_submission }
 * When lead_captured=true, POSTs to Web3Forms from the browser
 */
(function () {
  'use strict';

  const WORKER_URL     = 'https://bolt-proxy.davoodianshount.workers.dev';
  const WEB3FORMS_URL  = 'https://api.web3forms.com/submit';
  const FALLBACK_PHONE = '(747) 308-1635';
  const FALLBACK_SITE  = 'goratehero.com';
  const SESSION_ID     = 'bolt-' + Math.random().toString(36).slice(2) + '-' + Date.now();

  const CHIPS = [
    { e: '\u{1F3E0}', t: 'Purchase' },
    { e: '\u{1F504}', t: 'Refinance' },
    { e: '\u{1F513}', t: 'Exit hard money' },
    { e: '\u{1F4BC}', t: 'I wrote off too much income' },
    { e: '\u{1F3D8}\u{FE0F}', t: 'I want to use rental income' },
  ];

  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    #bolt-fab {
      position:fixed;bottom:24px;right:24px;z-index:99999;
      width:58px;height:58px;border-radius:50%;
      background:linear-gradient(135deg,#1D4ED8,#3B82F6);
      border:none;cursor:pointer;font-size:22px;color:#fff;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 20px rgba(59,130,246,0.5);
      animation:bolt-pulse 3s ease-in-out infinite;
      transition:transform 0.2s;
    }
    #bolt-fab:hover{transform:scale(1.08);}
    #bolt-window {
      position:fixed;bottom:94px;right:24px;z-index:99998;
      width:364px;height:586px;border-radius:22px;
      background:linear-gradient(160deg,#080E1A,#0D1526);
      border:1px solid rgba(59,130,246,0.2);
      box-shadow:0 24px 64px rgba(0,0,0,0.7);
      display:flex;flex-direction:column;overflow:hidden;
      font-family:'Plus Jakarta Sans',sans-serif;
      transform:scale(0.95) translateY(10px);
      opacity:0;pointer-events:none;
      transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);
    }
    #bolt-window.bolt-open{transform:scale(1) translateY(0);opacity:1;pointer-events:all;}
    @media(max-width:480px){
      #bolt-window{width:calc(100vw - 24px);right:12px;bottom:88px;height:72vh;max-height:586px;border-radius:20px;}
      #bolt-fab{bottom:20px;right:16px;}
    }
    .bolt-header{padding:13px 16px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.025);flex-shrink:0;}
    .bolt-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#1D4ED8,#3B82F6);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;animation:bolt-pulse 3s ease-in-out infinite;}
    .bolt-close{background:rgba(255,255,255,0.08);border:none;color:#94A3B8;cursor:pointer;border-radius:50%;width:28px;height:28px;font-size:14px;display:flex;align-items:center;justify-content:center;}
    .bolt-messages{flex:1;overflow-y:auto;padding:16px 14px 8px;scroll-behavior:smooth;}
    .bolt-messages::-webkit-scrollbar{width:3px;}
    .bolt-messages::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px;}
    .bolt-bubble-row{display:flex;margin-bottom:10px;animation:bolt-fade 0.3s ease;}
    .bolt-bubble-row.user{justify-content:flex-end;}
    .bolt-bubble-row.bot{justify-content:flex-start;align-items:flex-end;gap:7px;}
    .bolt-bubble-avatar{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#1D4ED8,#3B82F6);display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;}
    .bolt-bubble{max-width:78%;padding:9px 13px;font-size:13px;line-height:1.6;color:#fff;}
    .bolt-bubble.user{background:linear-gradient(135deg,#1D4ED8,#3B82F6);border-radius:16px 16px 4px 16px;}
    .bolt-bubble.bot{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:16px 16px 16px 4px;}
    .bolt-chips{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0 8px 29px;}
    .bolt-chip{background:rgba(255,255,255,0.05);border:1px solid rgba(59,130,246,0.28);border-radius:20px;color:#CBD5E1;font-size:11.5px;padding:5px 11px;cursor:pointer;transition:all 0.15s;font-family:'Plus Jakarta Sans',sans-serif;}
    .bolt-chip:hover{background:rgba(59,130,246,0.18);border-color:rgba(59,130,246,0.6);color:#fff;}
    .bolt-trust{padding:6px 16px;border-top:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(0,0,0,0.2);flex-shrink:0;}
    .bolt-input-row{padding:10px 12px;display:flex;gap:8px;border-top:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);flex-shrink:0;}
    .bolt-input{flex:1;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:10px 13px;color:#fff;font-size:13px;font-family:'Plus Jakarta Sans',sans-serif;transition:border-color 0.2s;outline:none;}
    .bolt-input::placeholder{color:rgba(255,255,255,0.28);}
    .bolt-input:focus{border-color:rgba(59,130,246,0.5);}
    .bolt-send{width:40px;height:40px;border-radius:12px;border:none;background:linear-gradient(135deg,#1D4ED8,#3B82F6);color:#fff;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:filter 0.2s;flex-shrink:0;}
    .bolt-send:disabled{background:rgba(255,255,255,0.07);cursor:default;}
    .bolt-send:not(:disabled):hover{filter:brightness(1.15);}
    .bolt-typing{display:flex;gap:4px;align-items:center;padding:2px 0;}
    .bolt-dot{width:6px;height:6px;border-radius:50%;background:#3B82F6;}
    .bolt-dot:nth-child(1){animation:bolt-bounce 1.2s ease-in-out 0.0s infinite;}
    .bolt-dot:nth-child(2){animation:bolt-bounce 1.2s ease-in-out 0.2s infinite;}
    .bolt-dot:nth-child(3){animation:bolt-bounce 1.2s ease-in-out 0.4s infinite;}
    .bolt-toast{position:absolute;bottom:70px;left:12px;right:12px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);border-radius:10px;padding:10px 14px;color:#6EE7B7;font-size:12px;line-height:1.5;font-family:'Plus Jakarta Sans',sans-serif;animation:bolt-fade 0.3s ease;}
    @keyframes bolt-pulse{0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,0.45);}60%{box-shadow:0 0 0 10px rgba(59,130,246,0);}}
    @keyframes bolt-fade{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
    @keyframes bolt-bounce{0%,80%,100%{transform:translateY(0);opacity:0.35;}40%{transform:translateY(-5px);opacity:1;}}
  `;
  document.head.appendChild(style);

  let messages = [], busy = false, open = false, welcomed = false;

  const fab = document.createElement('button');
  fab.id = 'bolt-fab'; fab.innerHTML = '⚡';
  fab.setAttribute('aria-label', 'Ask Bolt — Rate Hero Deal Agent');

  const win = document.createElement('div');
  win.id = 'bolt-window';
  win.innerHTML = `
    <div class="bolt-header">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="bolt-avatar">⚡</div>
        <div>
          <div style="color:#fff;font-weight:700;font-size:14px;letter-spacing:-0.2px;">Bolt</div>
          <div style="color:#94A3B8;font-size:9px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Rate Hero Deal Agent</div>
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
      <input class="bolt-input" id="bolt-input" placeholder="Tell me about your deal..." />
      <button class="bolt-send" id="bolt-send" disabled>↑</button>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(win);

  const msgsEl = document.getElementById('bolt-msgs');
  const inputEl = document.getElementById('bolt-input');
  const sendBtn = document.getElementById('bolt-send');

  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  function renderWelcome() {
    if (welcomed) return; welcomed = true;
    const w = document.createElement('div');
    w.innerHTML = `
      <div class="bolt-bubble-row bot" style="margin-bottom:10px;">
        <div class="bolt-bubble-avatar">⚡</div>
        <div class="bolt-bubble bot">Looking at an investment property? I can run the deal in under 60 seconds and tell you if it looks like a DSCR fit. Is this a purchase, refinance, or hard money exit?</div>
      </div>
      <div class="bolt-chips" id="bolt-chips"></div>`;
    msgsEl.appendChild(w);
    const ce = document.getElementById('bolt-chips');
    CHIPS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'bolt-chip'; b.textContent = c.e + ' ' + c.t;
      b.onclick = () => send(c.t); ce.appendChild(b);
    });
    scroll();
  }

  function addBubble(role, content) {
    const row = document.createElement('div');
    row.className = 'bolt-bubble-row ' + (role === 'user' ? 'user' : 'bot');
    if (role === 'user') {
      row.innerHTML = `<div class="bolt-bubble user">${esc(content)}</div>`;
    } else {
      row.innerHTML = `<div class="bolt-bubble-avatar">⚡</div><div class="bolt-bubble bot">${esc(content).replace(/\n/g,'<br>')}</div>`;
    }
    msgsEl.appendChild(row); scroll();
  }

  function showTyping() {
    const row = document.createElement('div');
    row.className = 'bolt-bubble-row bot'; row.id = 'bolt-typing';
    row.innerHTML = `<div class="bolt-bubble-avatar">⚡</div><div class="bolt-bubble bot"><div class="bolt-typing"><div class="bolt-dot"></div><div class="bolt-dot"></div><div class="bolt-dot"></div></div></div>`;
    msgsEl.appendChild(row); scroll();
  }

  function hideTyping() { const t = document.getElementById('bolt-typing'); if (t) t.remove(); }

  function showToast(html) {
    const old = win.querySelector('.bolt-toast'); if (old) old.remove();
    const t = document.createElement('div'); t.className = 'bolt-toast'; t.innerHTML = html;
    win.appendChild(t); setTimeout(() => { if (t.parentNode) t.remove(); }, 6000);
  }

  function scroll() { msgsEl.scrollTop = msgsEl.scrollHeight; }

  async function submitLead(sub) {
    if (!sub || !sub.fields) return;
    try {
      const fd = new FormData();
      Object.entries(sub.fields).forEach(([k, v]) => fd.append(k, v || ''));
      const r = await fetch(WEB3FORMS_URL, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.success) showToast('✓ Your info has been sent to Rate Hero. A strategist will reach out shortly.');
    } catch(e) { console.warn('Bolt: Web3Forms failed', e); }
  }

  async function send(text) {
    const t = (text !== undefined ? text : inputEl.value).trim();
    if (!t || busy) return;
    inputEl.value = ''; sendBtn.disabled = true; busy = true;
    messages.push({ role: 'user', content: t });
    addBubble('user', t); showTyping();
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, session_id: SESSION_ID, page: window.location.pathname }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      hideTyping();
      const reply = data.reply || data?.content?.[0]?.text || `Reach a Rate Hero strategist at ${FALLBACK_PHONE} or visit ${FALLBACK_SITE}.`;
      messages.push({ role: 'assistant', content: reply });
      addBubble('assistant', reply);
      if (data.lead_captured && data.lead_submission) submitLead(data.lead_submission);
    } catch(err) {
      hideTyping();
      const msg = `Reach a Rate Hero strategist at ${FALLBACK_PHONE} or visit ${FALLBACK_SITE}.`;
      messages.push({ role: 'assistant', content: msg }); addBubble('assistant', msg);
      console.warn('Bolt error:', err);
    }
    busy = false; inputEl.focus();
  }

  fab.addEventListener('click', () => {
    open = !open; win.classList.toggle('bolt-open', open);
    fab.innerHTML = open ? '✕' : '⚡';
    if (open) { renderWelcome(); inputEl.focus(); }
  });
  document.getElementById('bolt-close-btn').addEventListener('click', () => {
    open = false; win.classList.remove('bolt-open'); fab.innerHTML = '⚡';
  });
  inputEl.addEventListener('input', () => { sendBtn.disabled = !inputEl.value.trim() || busy; });
  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  sendBtn.addEventListener('click', () => send());

  window.openBolt = function() { if (!open) fab.click(); };
})();
