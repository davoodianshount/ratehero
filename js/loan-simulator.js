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
  --sim-navy: #080E1A; --sim-navy2: #0C1527; --sim-card: #0E1A2E;
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

/* ── RESULT CARD ── */
.rh-sim-result { background: var(--sim-card); border: 1px solid var(--sim-border); border-radius: 16px; padding: 24px; position: relative; overflow: hidden; }
.rh-sim-result::before { content: ''; display: block; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--sim-accent, var(--sim-blue)), transparent); }

/* Primary number */
.rh-sim-primary-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--sim-w65); margin-bottom: 4px; }
.rh-sim-primary-num { font-family: var(--sim-fd); font-size: clamp(42px, 5vw, 56px); letter-spacing: 2px; color: var(--sim-w); line-height: 1; margin-bottom: 2px; }

/* Rate range (directly under primary number) */
.rh-sim-rate-range { font-size: 14px; font-weight: 700; color: var(--sim-blue); margin-bottom: 16px; }
.rh-sim-rate-range .custom { color: var(--sim-amber); font-style: italic; }
.rh-sim-rate-fine { font-size: 10px; color: var(--sim-w25); line-height: 1.5; margin-top: 2px; }

/* Approval state banner */
.rh-sim-approval { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; font-size: 14px; font-weight: 700; transition: all 0.3s ease; }
.rh-sim-approval.green { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); color: var(--sim-green); }
.rh-sim-approval.amber { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); color: var(--sim-amber); }
.rh-sim-approval.blue { background: rgba(37,99,235,0.08); border: 1px solid rgba(37,99,235,0.2); color: var(--sim-blue); }
.rh-sim-approval-icon { font-size: 18px; flex-shrink: 0; }
.rh-sim-approval-note { font-size: 12px; font-weight: 500; color: var(--sim-w65); margin-top: 2px; }

/* Metric boxes row */
.rh-sim-metrics { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.rh-sim-metric { background: rgba(255,255,255,0.03); border: 1px solid var(--sim-border); border-radius: 10px; padding: 12px; text-align: center; }
.rh-sim-metric-val { font-family: var(--sim-fd); font-size: 22px; letter-spacing: 1px; color: var(--sim-w); display: block; margin-bottom: 2px; }
.rh-sim-metric-val.pos { color: var(--sim-green); }
.rh-sim-metric-val.neg { color: var(--sim-red); }
.rh-sim-metric-val.amber { color: var(--sim-amber); }
.rh-sim-metric-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--sim-w65); }

/* ── PROGRAM MATCH CHIPS ── */
.rh-sim-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.rh-sim-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; border: 1px solid var(--sim-border); background: rgba(255,255,255,0.03); }
.rh-sim-chip .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.rh-sim-chip.good .dot { background: var(--sim-green); }
.rh-sim-chip.good { color: var(--sim-green); border-color: rgba(34,197,94,0.2); }
.rh-sim-chip.possible .dot { background: var(--sim-amber); }
.rh-sim-chip.possible { color: var(--sim-amber); border-color: rgba(245,158,11,0.15); }
.rh-sim-chips-fine { font-size: 10px; color: var(--sim-w25); line-height: 1.4; margin-bottom: 14px; }

/* ── DSCR SCALE BAR ── */
.rh-sim-scale { position: relative; height: 10px; border-radius: 5px; background: linear-gradient(90deg, var(--sim-red) 0%, var(--sim-amber) 12%, var(--sim-green) 22%, var(--sim-green) 100%); margin: 20px 0 28px; }
.rh-sim-scale-marker { position: absolute; top: -6px; width: 22px; height: 22px; border-radius: 50%; background: var(--sim-w); border: 3px solid var(--sim-blue); box-shadow: 0 2px 8px rgba(0,0,0,0.4); transform: translateX(-50%); transition: left 0.3s ease; z-index: 2; }
.rh-sim-scale-line { position: absolute; top: -18px; bottom: -18px; width: 1px; background: rgba(255,255,255,0.3); z-index: 1; }
.rh-sim-scale-line-label { position: absolute; bottom: -28px; transform: translateX(-50%); font-size: 9px; font-weight: 700; color: var(--sim-w25); white-space: nowrap; letter-spacing: 0.04em; }

/* Tertiary insight line */
.rh-sim-insight { font-size: 13px; color: var(--sim-w65); line-height: 1.6; padding: 12px 14px; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 3px solid var(--sim-blue); margin-bottom: 16px; }

/* Rate-as-of fine print — NON-NEGOTIABLE on every result state */
.rh-sim-fine { font-size: 11px; color: var(--sim-w25); line-height: 1.5; margin-top: 12px; }

/* ── LEAD CAPTURE FORM (inside result card) ── */
.rh-sim-lead { max-height: 0; overflow: hidden; transition: max-height 0.3s ease, opacity 0.3s ease; opacity: 0; }
.rh-sim-lead.open { max-height: 800px; opacity: 1; }
.rh-sim-lead-inner { padding-top: 16px; border-top: 1px solid var(--sim-border); margin-top: 16px; }
.rh-sim-field { margin-bottom: 12px; }
.rh-sim-field label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sim-w65); margin-bottom: 5px; }
.rh-sim-field input { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--sim-border); background: rgba(255,255,255,0.05); color: var(--sim-w); font-family: var(--sim-fb); font-size: 15px; font-weight: 600; outline: none; transition: border-color 0.2s; }
.rh-sim-field input:focus { border-color: var(--sim-blue); }
.rh-sim-field input.error { border-color: var(--sim-red); }
.rh-sim-field .err-msg { font-size: 10px; color: var(--sim-red); margin-top: 3px; display: none; }
.rh-sim-field input.error + .err-msg { display: block; }

/* TCPA checkbox */
.rh-sim-tcpa { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
.rh-sim-tcpa input[type="checkbox"] { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--sim-blue); flex-shrink: 0; cursor: pointer; }
.rh-sim-tcpa-text { font-size: 10px; color: var(--sim-w25); line-height: 1.5; }

/* Submit CTA */
.rh-sim-submit { width: 100%; padding: 14px; border-radius: 10px; border: none; font-family: var(--sim-fb); font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s; color: var(--sim-w); }
.rh-sim-submit.green { background: var(--sim-green); }
.rh-sim-submit.green:hover { background: #16a34a; transform: translateY(-1px); }
.rh-sim-submit.amber { background: var(--sim-amber); color: #000; }
.rh-sim-submit.amber:hover { background: #d97706; transform: translateY(-1px); }
.rh-sim-submit.blue { background: var(--sim-blue); }
.rh-sim-submit.blue:hover { background: var(--sim-blue-dk); transform: translateY(-1px); }
.rh-sim-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
.rh-sim-submit .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: var(--sim-w); border-radius: 50%; animation: rh-sim-spin 0.6s linear infinite; margin-right: 8px; vertical-align: middle; }
@keyframes rh-sim-spin { to { transform: rotate(360deg); } }

/* Secondary link + trust row */
.rh-sim-fallback { display: block; text-align: center; margin-top: 10px; font-size: 13px; color: var(--sim-w65); text-decoration: none; transition: color 0.15s; }
.rh-sim-fallback:hover { color: var(--sim-w); }
.rh-sim-trust { text-align: center; margin-top: 10px; font-size: 11px; color: var(--sim-w25); }

/* ── SUCCESS STATE ── */
.rh-sim-success { display: none; text-align: center; padding: 20px 0; }
.rh-sim-success.show { display: block; }
.rh-sim-success-title { font-family: var(--sim-fd); font-size: 36px; letter-spacing: 1px; color: var(--sim-green); margin-bottom: 6px; }
.rh-sim-success-sub { font-size: 15px; color: var(--sim-w65); line-height: 1.7; margin-bottom: 14px; }
.rh-sim-success-recap { font-size: 13px; color: var(--sim-w25); margin-bottom: 16px; }
.rh-sim-success-cta { display: inline-block; padding: 12px 28px; border-radius: 10px; background: var(--sim-green); color: var(--sim-w); font-family: var(--sim-fb); font-size: 15px; font-weight: 700; text-decoration: none; transition: all 0.2s; }
.rh-sim-success-cta:hover { background: #16a34a; transform: translateY(-1px); }

/* ── ERROR STATE ── */
.rh-sim-error { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; color: var(--sim-red); display: none; }
.rh-sim-error.show { display: block; }
.rh-sim-error a { color: var(--sim-blue); }

/* ── RESPONSIVE part 2 ── */
@media (max-width: 767px) {
  .rh-sim-result { position: sticky; bottom: 0; z-index: 10; border-radius: 16px 16px 0 0; border-bottom: none; box-shadow: 0 -8px 32px rgba(0,0,0,0.5); }
  .rh-sim-metrics { grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .rh-sim-metric { padding: 8px 6px; }
  .rh-sim-metric-val { font-size: 18px; }
  .rh-sim-primary-num { font-size: 36px; }
  .rh-sim-chips { gap: 4px; }
  .rh-sim-chip { font-size: 10px; padding: 4px 8px; }
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
