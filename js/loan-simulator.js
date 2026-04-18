/**
 * LOAN EXPERIENCE SIMULATOR — Rate Hero
 * Self-contained vanilla JS widget. Drop-in like bolt-widget.js.
 * Mount: <div id="loan-simulator"></div>
 * Load:  <script src="/js/loan-simulator.js" defer></script>
 */
(function () {
  'use strict';

  // ====== CONFIG ======
  const SIM_CONFIG = {
    rateAsOf: '2026-04-18',
    rates: {
      dscr30yr: 6.125,
      brrrrCashOut: 6.375,
      conventional30yr: 6.125,
      pmiAnnualPct: 0.005,
    },
    ltv: { dscrPurchase: 0.80, dscrCashOutMax: 0.75, conventionalMax: 0.97 },
    dscr: { qualifyingMin: 1.00, strongThreshold: 1.20, lowRatioFloor: 0.75 },
    stateTaxInsurance: {
      default: 0.018,
      AL: 0.012, AK: 0.014, AZ: 0.014, AR: 0.014, CA: 0.0135, CO: 0.013,
      CT: 0.021, DC: 0.012, DE: 0.012, FL: 0.022, GA: 0.016, HI: 0.008, ID: 0.012,
      IL: 0.023, IN: 0.016, IA: 0.018, KS: 0.018, KY: 0.015, LA: 0.012,
      ME: 0.017, MD: 0.014, MA: 0.019, MI: 0.019, MN: 0.015, MS: 0.014,
      MO: 0.015, MT: 0.015, NE: 0.020, NV: 0.013, NH: 0.021, NJ: 0.024,
      NM: 0.013, NY: 0.022, NC: 0.014, ND: 0.015, OH: 0.017, OK: 0.016,
      OR: 0.014, PA: 0.019, RI: 0.018, SC: 0.015, SD: 0.016, TN: 0.013,
      TX: 0.024, UT: 0.012, VT: 0.019, VA: 0.013, WA: 0.013, WV: 0.014,
      WI: 0.021, WY: 0.011,
    },
    web3forms: {
      endpoint: 'https://api.web3forms.com/submit',
      accessKey: 'PASTE_WEB3FORMS_ACCESS_KEY_HERE',
    },
  };

  // ====== STYLES (injected) ======
  const STYLES = `
/* ── ROOT VARS (fallbacks so widget works on any page) ── */
.rh-sim-root {
  --sim-navy: #080E1A; --sim-navy2: #0D1526; --sim-card: #0F1B30;
  --sim-blue: #3B82F6; --sim-blue-dk: #1D4ED8; --sim-blue-glow: rgba(37,99,235,0.25);
  --sim-amber: #F59E0B; --sim-green: #22C55E; --sim-red: #EF4444;
  --sim-border: rgba(255,255,255,0.08); --sim-w: #fff;
  --sim-w65: rgba(255,255,255,0.65); --sim-w25: rgba(255,255,255,0.25);
  --sim-fd: 'Bebas Neue', sans-serif; --sim-fb: 'Plus Jakarta Sans', sans-serif;
  font-family: var(--sim-fb); color: var(--sim-w); box-sizing: border-box;
}
.rh-sim-root *, .rh-sim-root *::before, .rh-sim-root *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── OUTER LAYOUT ── */
.rh-sim-wrap { max-width: 1100px; margin: 0 auto; padding: 48px 24px; }
.rh-sim-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; }

/* ── SECTION HEADER ── */
.rh-sim-header { text-align: center; margin-bottom: 32px; }
.rh-sim-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(37,99,235,0.12); border: 1px solid rgba(37,99,235,0.3); color: var(--sim-blue); padding: 5px 14px; border-radius: 99px; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 14px; }
.rh-sim-title { font-family: var(--sim-fb); font-size: clamp(26px, 3.5vw, 38px); font-weight: 800; line-height: 1.1; letter-spacing: -0.5px; color: var(--sim-w); margin-bottom: 8px; }
.rh-sim-title em { font-style: italic; color: var(--sim-blue); }
.rh-sim-subtitle { font-size: 15px; color: var(--sim-w65); line-height: 1.7; max-width: 520px; margin: 0 auto; }

/* ── TABS ── */
.rh-sim-tabs { display: flex; gap: 4px; margin-bottom: 24px; background: rgba(255,255,255,0.04); border-radius: 10px; padding: 4px; }
.rh-sim-tab { flex: 1; padding: 10px 8px; border-radius: 8px; border: none; background: transparent; color: var(--sim-w65); font-family: var(--sim-fb); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; text-align: center; white-space: nowrap; }
.rh-sim-tab:hover { color: var(--sim-w); background: rgba(255,255,255,0.06); }
.rh-sim-tab.active { color: var(--sim-w); background: var(--sim-blue); box-shadow: 0 2px 8px rgba(37,99,235,0.35); }

/* ── INPUT PANEL ── */
.rh-sim-inputs { background: var(--sim-card); border: 1px solid var(--sim-border); border-radius: 16px; padding: 24px; }
.rh-sim-scenario { opacity: 1; transition: opacity 0.15s ease; }
.rh-sim-scenario.hidden { opacity: 0; position: absolute; pointer-events: none; }

/* ── SLIDER ROW ── */
.rh-sim-slider-row { margin-bottom: 20px; }
.rh-sim-slider-row:last-child { margin-bottom: 0; }
.rh-sim-slider-label { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.rh-sim-slider-name { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sim-w65); }
.rh-sim-slider-val { font-family: var(--sim-fd); font-size: 28px; letter-spacing: 1px; color: var(--sim-w); line-height: 1; }

/* ── NATIVE RANGE — custom track + thumb ── */
.rh-sim-range { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); outline: none; cursor: pointer; }
.rh-sim-range::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: var(--sim-blue); border: 2px solid var(--sim-w); box-shadow: 0 2px 8px rgba(37,99,235,0.4); cursor: grab; transition: transform 0.15s; }
.rh-sim-range::-webkit-slider-thumb:hover { transform: scale(1.15); }
.rh-sim-range::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.1); }
.rh-sim-range::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: var(--sim-blue); border: 2px solid var(--sim-w); box-shadow: 0 2px 8px rgba(37,99,235,0.4); cursor: grab; }
.rh-sim-range::-moz-range-track { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); border: none; }
.rh-sim-range:focus-visible { outline: 2px solid var(--sim-blue); outline-offset: 4px; border-radius: 3px; }

/* ── STATE DROPDOWN ── */
.rh-sim-select { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--sim-border); background: rgba(255,255,255,0.05); color: var(--sim-w); font-family: var(--sim-fb); font-size: 14px; font-weight: 600; outline: none; cursor: pointer; transition: border-color 0.2s; -webkit-appearance: none; appearance: none; }
.rh-sim-select:focus { border-color: var(--sim-blue); }
.rh-sim-select option { background: #0D1526; color: #fff; }
.rh-sim-select option:disabled { color: rgba(255,255,255,0.35); }

/* ── RESPONSIVE ── */
@media (max-width: 1023px) {
  .rh-sim-grid { gap: 20px; }
  .rh-sim-wrap { padding: 36px 20px; }
}
@media (max-width: 767px) {
  .rh-sim-grid { grid-template-columns: 1fr; }
  .rh-sim-tab { font-size: 12px; padding: 9px 6px; }
  .rh-sim-slider-val { font-size: 24px; }
  .rh-sim-wrap { padding: 28px 16px; }
}
`; /* end STYLES */

  // ====== STATE ======
  /* __STATE_PLACEHOLDER__ */

  // ====== MATH ======
  /* __MATH_PLACEHOLDER__ */

  // ====== DOM SCAFFOLD ======
  /* __DOM_PLACEHOLDER__ */

  // ====== RENDER ======
  /* __RENDER_PLACEHOLDER__ */

  // ====== LEAD CAPTURE ======
  /* __LEAD_PLACEHOLDER__ */

  // ====== PIPELINE ======
  /* __PIPELINE_PLACEHOLDER__ */

  // ====== ANALYTICS ======
  /* __ANALYTICS_PLACEHOLDER__ */

  // ====== INIT ======
  function init() {
    var mount = document.getElementById('loan-simulator');
    if (!mount) return;
    /* init wiring goes here */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
