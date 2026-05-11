/*!
 * Rate Hero Mobile Header — v1.0
 * Replaces the mobile header on goratehero.com with the redesigned version.
 * Mobile only (max-width: 768px). Desktop is untouched.
 *
 * Deploy:
 *   1) Place this file at /mobile-header.js in the Ratehero repo.
 *   2) Inject <script defer src="/mobile-header.js"></script> into every HTML page
 *      via Cloudflare Worker HTMLRewriter, OR manually add it before </body>.
 *
 * NMLS #2822806
 */
(function () {
  'use strict';

  // Primary desktop guard. Every side effect (fonts, styles, DOM) is gated
  // behind MOBILE_MQ.matches so a >768px viewport gets a true no-op load.
  var MOBILE_MQ = window.matchMedia('(max-width: 768px)');

  // ---------- 1. FONTS ----------
  function injectFonts() {
    if (document.querySelector('link[href*="Bebas+Neue"]')) return;
    var pc1 = document.createElement('link');
    pc1.rel = 'preconnect';
    pc1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(pc1);

    var pc2 = document.createElement('link');
    pc2.rel = 'preconnect';
    pc2.href = 'https://fonts.gstatic.com';
    pc2.crossOrigin = 'anonymous';
    document.head.appendChild(pc2);

    var font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap';
    document.head.appendChild(font);
  }

  // ---------- 2. STYLES ----------
  // All rules wrapped in @media (max-width: 768px) so DESKTOP IS NEVER TOUCHED.
  // All selectors prefixed with .rh-mh- to avoid collisions with the existing site.
  var css = '\
/* Belt-and-suspenders desktop hide: even if the JS viewport guard ever\
   regresses, the injected wrapper stays invisible until the @media rule\
   below flips it on inside mobile breakpoints. */\
#rh-mh-root { display: none; }\
@media (max-width: 768px) {\
  #rh-mh-root { display: block; }\
\
  /* Hide existing top-of-page navigation on mobile. Adjust selector list if your\
     current header lives somewhere different. */\
  body > header,\
  header.site-header,\
  header#header,\
  header.navbar,\
  body > .site-header,\
  body > .navbar,\
  body > nav.site-nav,\
  body > nav[role="navigation"]:first-of-type,\
  nav[aria-label="Main navigation"],\
  body > nav {\
    display: none !important;\
  }\
\
  /* Push page content below the new fixed header */\
  body { padding-top: 64px !important; }\
\
  .rh-mh-header {\
    position: fixed; top: 0; left: 0; right: 0;\
    z-index: 9999;\
    display: flex; align-items: center; justify-content: space-between;\
    padding: 12px 16px;\
    height: 64px;\
    background: rgba(8, 14, 26, 0.92);\
    -webkit-backdrop-filter: saturate(180%) blur(16px);\
    backdrop-filter: saturate(180%) blur(16px);\
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);\
    font-family: "Plus Jakarta Sans", system-ui, sans-serif;\
    color: #E8EDF5;\
    box-sizing: border-box;\
  }\
  .rh-mh-header * { box-sizing: border-box; }\
  .rh-mh-header a { text-decoration: none; color: inherit; }\
\
  .rh-mh-logo { display: flex; align-items: center; gap: 6px; }\
  .rh-mh-bolt {\
    font-size: 22px; line-height: 1;\
    background: linear-gradient(135deg, #F5B731 0%, #E8920A 100%);\
    -webkit-background-clip: text; background-clip: text; color: transparent;\
  }\
  .rh-mh-word {\
    font-family: "Bebas Neue", sans-serif;\
    font-size: 22px; letter-spacing: 0.01em; color: #fff;\
  }\
\
  .rh-mh-actions { display: flex; align-items: center; gap: 10px; }\
\
  .rh-mh-icon {\
    width: 40px; height: 40px;\
    display: grid; place-items: center;\
    border-radius: 50%;\
    border: 1px solid rgba(255, 255, 255, 0.16);\
    background: transparent;\
    color: #E8EDF5;\
    transition: background 160ms, border-color 160ms;\
  }\
  .rh-mh-icon:hover {\
    background: rgba(255, 255, 255, 0.05);\
    border-color: rgba(255, 255, 255, 0.28);\
  }\
\
  .rh-mh-cta {\
    display: inline-flex; align-items: center; justify-content: center;\
    height: 40px; padding: 0 18px;\
    background: #3B82F6; color: #fff;\
    font-size: 14px; font-weight: 700;\
    border-radius: 999px; border: none;\
    box-shadow: 0 6px 18px -6px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.18);\
    transition: background 160ms;\
    white-space: nowrap; cursor: pointer;\
  }\
  .rh-mh-cta:hover { background: #2563EB; }\
\
  .rh-mh-burger {\
    position: relative;\
    width: 44px; height: 44px;\
    display: grid; place-items: center;\
    background: transparent; border: none;\
    color: #E8EDF5; cursor: pointer;\
    border-radius: 12px;\
    transition: background 160ms;\
    padding: 0;\
  }\
  .rh-mh-burger:hover { background: rgba(255,255,255,0.06); }\
\
  /* Amber pulse halo — breathes every 3s */\
  .rh-mh-burger::before {\
    content: ""; position: absolute; inset: 4px;\
    border-radius: 10px;\
    background: radial-gradient(circle, rgba(245,183,49,0.35) 0%, transparent 70%);\
    opacity: 0; pointer-events: none;\
    animation: rh-mh-pulse 3s ease-in-out infinite;\
  }\
  @keyframes rh-mh-pulse {\
    0%, 100% { opacity: 0; transform: scale(0.85); }\
    50%      { opacity: 1; transform: scale(1.1); }\
  }\
\
  .rh-mh-burger .rh-mh-line {\
    position: relative;\
    width: 22px; height: 2px;\
    background: currentColor;\
    border-radius: 2px; display: block;\
    transition: transform 280ms, opacity 200ms, background 200ms;\
  }\
  .rh-mh-burger .rh-mh-line + .rh-mh-line { margin-top: 5px; }\
\
  /* Middle line amber spark every 4s */\
  .rh-mh-burger .rh-mh-line:nth-child(2) {\
    animation: rh-mh-spark 4s ease-in-out infinite;\
  }\
  @keyframes rh-mh-spark {\
    0%, 85%, 100% { background: currentColor; box-shadow: none; }\
    90%, 95%      { background: #F5B731; box-shadow: 0 0 8px #F5B731; }\
  }\
\
  /* Open state: stop pulses, morph into X */\
  .rh-mh-burger.rh-mh-open::before { animation: none; opacity: 0; }\
  .rh-mh-burger.rh-mh-open .rh-mh-line { animation: none; background: currentColor; box-shadow: none; }\
  .rh-mh-burger.rh-mh-open .rh-mh-line:nth-child(1) { transform: translateY(7px) rotate(45deg); }\
  .rh-mh-burger.rh-mh-open .rh-mh-line:nth-child(2) { opacity: 0; }\
  .rh-mh-burger.rh-mh-open .rh-mh-line:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }\
\
  /* ---- Slide-out menu ---- */\
  .rh-mh-overlay {\
    position: fixed; inset: 0;\
    background: rgba(0,0,0,0.55);\
    opacity: 0; pointer-events: none;\
    transition: opacity 320ms;\
    z-index: 9998;\
    backdrop-filter: blur(2px);\
  }\
  .rh-mh-overlay.rh-mh-open { opacity: 1; pointer-events: auto; }\
\
  .rh-mh-panel {\
    position: fixed; top: 0; right: 0;\
    width: 88%; max-width: 400px;\
    height: 100dvh;\
    background: linear-gradient(180deg, #0E1628 0%, #080E1A 100%);\
    border-left: 1px solid rgba(255,255,255,0.08);\
    transform: translateX(100%);\
    transition: transform 360ms cubic-bezier(0.32, 0.72, 0, 1);\
    z-index: 10000;\
    overflow-y: auto;\
    -webkit-overflow-scrolling: touch;\
    box-shadow: -20px 0 60px -20px rgba(0,0,0,0.6);\
    font-family: "Plus Jakarta Sans", system-ui, sans-serif;\
    color: #E8EDF5;\
  }\
  .rh-mh-panel * { box-sizing: border-box; }\
  .rh-mh-panel a { text-decoration: none; color: inherit; }\
  .rh-mh-panel.rh-mh-open { transform: translateX(0); }\
\
  .rh-mh-panel-head {\
    position: sticky; top: 0; z-index: 1;\
    display: flex; align-items: center; justify-content: space-between;\
    padding: 14px 18px;\
    background: rgba(14,22,40,0.92);\
    backdrop-filter: blur(12px);\
    border-bottom: 1px solid rgba(255,255,255,0.06);\
  }\
  .rh-mh-panel-head .rh-mh-word { font-size: 20px; }\
\
  .rh-mh-close {\
    width: 36px; height: 36px;\
    display: grid; place-items: center;\
    background: rgba(255,255,255,0.05);\
    border: 1px solid rgba(255,255,255,0.1);\
    border-radius: 50%; color: #E8EDF5;\
    cursor: pointer;\
  }\
  .rh-mh-close:hover { background: rgba(255,255,255,0.1); }\
\
  .rh-mh-body { padding: 20px 18px 32px; }\
\
  .rh-mh-ctas { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }\
\
  .rh-mh-cta-primary {\
    display: flex; align-items: center; justify-content: space-between;\
    padding: 16px 18px;\
    background: #3B82F6; color: #fff;\
    font-weight: 700; font-size: 15px;\
    border-radius: 14px;\
    box-shadow: 0 8px 22px -8px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.18);\
  }\
  .rh-mh-cta-primary:hover { background: #2563EB; }\
\
  .rh-mh-cta-secondary {\
    display: flex; align-items: center; justify-content: space-between;\
    padding: 14px 18px;\
    background: rgba(245,183,49,0.08);\
    color: #E8EDF5; font-weight: 600; font-size: 15px;\
    border-radius: 14px;\
    border: 1px solid rgba(245,183,49,0.28);\
  }\
  .rh-mh-cta-secondary:hover { background: rgba(245,183,49,0.14); border-color: rgba(245,183,49,0.5); }\
\
  .rh-mh-section { margin-bottom: 22px; }\
  .rh-mh-section-title {\
    font-size: 10px; font-weight: 700;\
    letter-spacing: 0.18em; text-transform: uppercase;\
    color: #6B7B99;\
    padding: 0 4px 8px;\
    border-bottom: 1px solid rgba(255,255,255,0.05);\
    margin-bottom: 4px;\
  }\
\
  .rh-mh-section-link {\
    display: flex; align-items: center; justify-content: space-between;\
    padding: 18px 4px;\
    color: #fff;\
    font-size: 18px; font-weight: 700;\
    letter-spacing: 0.01em;\
    border-bottom: 1px solid rgba(255,255,255,0.05);\
    transition: padding 160ms;\
  }\
  .rh-mh-section-link:hover { padding-left: 8px; }\
  .rh-mh-section-link .rh-mh-row { display: flex; align-items: center; gap: 12px; }\
  .rh-mh-section-link .rh-mh-ico { width: 22px; height: 22px; color: #8FB6FF; }\
  .rh-mh-section-link .rh-mh-chev { color: #45567A; transition: transform 160ms, color 160ms; }\
  .rh-mh-section-link:hover .rh-mh-chev { transform: translateX(4px); color: #F5B731; }\
\
  .rh-mh-link {\
    display: flex; align-items: center; justify-content: space-between;\
    padding: 13px 4px;\
    color: #E8EDF5;\
    font-size: 15px; font-weight: 600;\
    transition: color 160ms, padding 160ms;\
  }\
  .rh-mh-link:hover { color: #fff; padding-left: 8px; }\
  .rh-mh-link .rh-mh-row { display: flex; align-items: center; gap: 12px; }\
  .rh-mh-link .rh-mh-ico { flex: none; width: 22px; height: 22px; color: #8FB6FF; opacity: 0.9; }\
  .rh-mh-link .rh-mh-chev { color: #45567A; transition: transform 160ms; }\
  .rh-mh-link:hover .rh-mh-chev { transform: translateX(3px); color: #8FB6FF; }\
\
  .rh-mh-footer {\
    margin-top: 18px; padding-top: 20px;\
    border-top: 1px solid rgba(255,255,255,0.06);\
    text-align: center;\
  }\
  .rh-mh-footer .rh-mh-contact { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #9FB0CC; }\
  .rh-mh-footer .rh-mh-contact a { color: #E8EDF5; font-weight: 600; }\
  .rh-mh-footer .rh-mh-legal { font-size: 11px; color: #6B7B99; margin-top: 14px; line-height: 1.5; }\
\
  /* Lock scroll when menu is open */\
  body.rh-mh-locked { overflow: hidden; }\
}\
';

  function injectStyles() {
    if (document.getElementById('rh-mh-style')) return;
    var style = document.createElement('style');
    style.id = 'rh-mh-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- 3. MARKUP ----------
  var html = ''
    + '<header class="rh-mh-header">'
    +   '<a href="https://goratehero.com/" class="rh-mh-logo">'
    +     '<span class="rh-mh-bolt">⚡</span>'
    +     '<span class="rh-mh-word">RATE HERO</span>'
    +   '</a>'
    +   '<div class="rh-mh-actions">'
    +     '<a href="tel:+18182086801" class="rh-mh-icon" aria-label="Call Rate Hero">'
    +       '<svg width="18" height="18" viewBox="0 0 24 24" fill="none">'
    +         '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    +       '</svg>'
    +     '</a>'
    +     '<a href="https://goratehero.com/quiz" class="rh-mh-cta">Get Started</a>'
    +     '<button id="rh-mh-burger" class="rh-mh-burger" aria-label="Open menu" aria-expanded="false">'
    +       '<span class="rh-mh-line"></span>'
    +       '<span class="rh-mh-line"></span>'
    +       '<span class="rh-mh-line"></span>'
    +     '</button>'
    +   '</div>'
    + '</header>'

    + '<div id="rh-mh-overlay" class="rh-mh-overlay"></div>'

    + '<aside id="rh-mh-panel" class="rh-mh-panel" aria-hidden="true">'
    +   '<div class="rh-mh-panel-head">'
    +     '<a href="https://goratehero.com/" class="rh-mh-logo">'
    +       '<span class="rh-mh-bolt">⚡</span>'
    +       '<span class="rh-mh-word">RATE HERO</span>'
    +     '</a>'
    +     '<button id="rh-mh-close" class="rh-mh-close" aria-label="Close menu">'
    +       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
    +     '</button>'
    +   '</div>'

    +   '<div class="rh-mh-body">'

    +     '<div class="rh-mh-ctas">'
    +       '<a href="https://goratehero.com/quiz" class="rh-mh-cta-primary">'
    +         '<span>Find My Ideal Loan</span>'
    +         '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    +       '</a>'
    +       '<a href="https://goratehero.com/#bolt" class="rh-mh-cta-secondary">'
    +         '<span>Ask Bolt <span class="rh-mh-bolt">⚡</span></span>'
    +         '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    +       '</a>'
    +     '</div>'

    +     '<a href="https://goratehero.com/programs/" class="rh-mh-section-link">'
    +       '<span class="rh-mh-row">'
    +         '<svg class="rh-mh-ico" viewBox="0 0 24 24" fill="none"><path d="M3 21h18M4 21V10l8-6 8 6v11M9 21v-7h6v7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    +         'Loan Programs'
    +       '</span>'
    +       '<svg class="rh-mh-chev" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
    +     '</a>'

    +     '<a href="https://goratehero.com/resources/" class="rh-mh-section-link">'
    +       '<span class="rh-mh-row">'
    +         '<svg class="rh-mh-ico" viewBox="0 0 24 24" fill="none"><path d="M4 19.5V6a2 2 0 012-2h13v16H6a2 2 0 010-4h13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    +         'Resources'
    +       '</span>'
    +       '<svg class="rh-mh-chev" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
    +     '</a>'

    +     '<div class="rh-mh-section" style="margin-top:22px;">'
    +       '<div class="rh-mh-section-title">Tools</div>'
    +       '<a href="https://goratehero.com/dscr-calculator" class="rh-mh-link">'
    +         '<span class="rh-mh-row">'
    +           '<svg class="rh-mh-ico" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0M8 19h2M12 19h2M16 19h0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    +           'DSCR Calculator'
    +         '</span>'
    +         '<svg class="rh-mh-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
    +       '</a>'
    +       '<a href="https://goratehero.com/quiz" class="rh-mh-link">'
    +         '<span class="rh-mh-row">'
    +           '<svg class="rh-mh-ico" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 4M12 17h0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    +           '60-Second Loan Quiz'
    +         '</span>'
    +         '<svg class="rh-mh-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
    +       '</a>'
    +     '</div>'

    +     '<div class="rh-mh-section">'
    +       '<div class="rh-mh-section-title">Company</div>'
    +       '<a href="https://goratehero.com/pages/about" class="rh-mh-link">'
    +         '<span class="rh-mh-row">'
    +           '<svg class="rh-mh-ico" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    +           'About'
    +         '</span>'
    +         '<svg class="rh-mh-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
    +       '</a>'
    +       '<a href="https://goratehero.com/review" class="rh-mh-link">'
    +         '<span class="rh-mh-row">'
    +           '<svg class="rh-mh-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>'
    +           'Reviews'
    +         '</span>'
    +         '<svg class="rh-mh-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
    +       '</a>'
    +       '<a href="https://goratehero.com/contact/" class="rh-mh-link">'
    +         '<span class="rh-mh-row">'
    +           '<svg class="rh-mh-ico" viewBox="0 0 24 24" fill="none"><path d="M4 4h16v16H4z M4 4l8 8 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    +           'Contact'
    +         '</span>'
    +         '<svg class="rh-mh-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
    +       '</a>'
    +     '</div>'

    +     '<div class="rh-mh-footer">'
    +       '<div class="rh-mh-contact">'
    +         '<a href="tel:+18182086801">(818) 208-6801</a>'
    +         '<a href="mailto:hello@goratehero.com">hello@goratehero.com</a>'
    +       '</div>'
    +       '<p class="rh-mh-legal">5930 San Fernando Rd<br>Glendale, CA 91202<br>NMLS #2822806 · Equal Housing Lender</p>'
    +     '</div>'

    +   '</div>'
    + '</aside>';

  // ---------- 4. INJECT / TEARDOWN ----------
  function injectDom() {
    if (!document.body) return false;
    if (document.getElementById('rh-mh-burger')) return true;

    var wrapper = document.createElement('div');
    wrapper.id = 'rh-mh-root';
    wrapper.innerHTML = html;
    document.body.insertBefore(wrapper, document.body.firstChild);

    // Behavior
    var burger  = document.getElementById('rh-mh-burger');
    var closeEl = document.getElementById('rh-mh-close');
    var overlay = document.getElementById('rh-mh-overlay');
    var panel   = document.getElementById('rh-mh-panel');

    function openMenu() {
      overlay.classList.add('rh-mh-open');
      panel.classList.add('rh-mh-open');
      burger.classList.add('rh-mh-open');
      burger.setAttribute('aria-expanded', 'true');
      panel.setAttribute('aria-hidden', 'false');
      document.body.classList.add('rh-mh-locked');
    }
    function closeMenu() {
      overlay.classList.remove('rh-mh-open');
      panel.classList.remove('rh-mh-open');
      burger.classList.remove('rh-mh-open');
      burger.setAttribute('aria-expanded', 'false');
      panel.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('rh-mh-locked');
    }

    burger.addEventListener('click', openMenu);
    closeEl.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    return true;
  }

  function teardownDom() {
    var root = document.getElementById('rh-mh-root');
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (document.body) document.body.classList.remove('rh-mh-locked');
  }

  // ---------- 5. APPLY (gated on viewport) ----------
  function apply() {
    if (MOBILE_MQ.matches) {
      injectFonts();
      injectStyles();
      injectDom();
    } else {
      teardownDom();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  // Re-apply on viewport crossings (tablet rotation, browser resize).
  if (MOBILE_MQ.addEventListener) {
    MOBILE_MQ.addEventListener('change', apply);
  } else if (MOBILE_MQ.addListener) {
    MOBILE_MQ.addListener(apply); // legacy Safari
  }
})();
