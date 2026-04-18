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
      accessKey: '544fd03b-53dd-4844-ae11-af8c8871adf8',
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

/* ── DSCR SCALE BAR ── */
.rh-sim-scale { position: relative; height: 10px; border-radius: 5px; background: linear-gradient(90deg, var(--sim-red) 0%, var(--sim-amber) 12%, var(--sim-green) 22%, var(--sim-green) 100%); margin: 20px 0 28px; }
.rh-sim-scale-marker { position: absolute; top: -6px; width: 22px; height: 22px; border-radius: 50%; background: var(--sim-w); border: 3px solid var(--sim-blue); box-shadow: 0 2px 8px rgba(0,0,0,0.4); transform: translateX(-50%); transition: left 0.3s ease; z-index: 2; }
.rh-sim-scale-line { position: absolute; top: -18px; bottom: -18px; width: 1px; background: rgba(255,255,255,0.3); z-index: 1; }
.rh-sim-scale-line-label { position: absolute; bottom: -28px; transform: translateX(-50%); font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.85); white-space: nowrap; letter-spacing: 0.04em; text-shadow: 0 0 4px rgba(0,0,0,0.8); }

/* Tertiary insight line */
.rh-sim-insight { font-size: 13px; color: var(--sim-w65); line-height: 1.6; padding: 12px 14px; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 3px solid var(--sim-blue); margin-bottom: 16px; }

/* Rate-as-of fine print — NON-NEGOTIABLE on every result state */
.rh-sim-fine { font-size: 12px; color: rgba(255,255,255,0.55); line-height: 1.5; margin-top: 12px; }

/* ── LEAD CAPTURE BRIDGE ── */
.rh-sim-bridge { border-top: 1px solid var(--sim-border); margin-top: 16px; padding-top: 16px; max-height: 0; overflow: hidden; opacity: 0; transition: max-height 0.3s ease, opacity 0.3s ease; border-top-color: transparent; }
.rh-sim-bridge.open { max-height: 200px; opacity: 1; border-top-color: var(--sim-border); }
.rh-sim-bridge-header { font-size: 19px; font-weight: 600; line-height: 1.3; margin-bottom: 6px; }
.rh-sim-bridge-subline { font-size: 14px; color: rgba(255,255,255,0.75); line-height: 1.6; margin-bottom: 20px; }

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

  // ====== COLORS (single source of truth — CSS vars in STYLES mirror these) ======
  var C_GREEN = '#22C55E', C_AMBER = '#F59E0B', C_BLUE = '#3B82F6';

  // ====== STATE ======
  var TIER_VISUALS = {
    'dscr-strong':     { color: 'green', accent: C_GREEN, icon: '\u2713', label: 'Strong Approval', note: 'Numbers look strong. Sean can lock pricing fast.', cta: 'Get Pre-Qualified \u2014 No Credit Pull', ctaColor: 'green', bridgeHeader: 'You qualify \u2014 let\u2019s make it official.', bridgeSubline: 'Sean and the Rate Hero team will text you in 5 minutes to walk through next steps.' },
    'dscr-qualifies':  { color: 'green', accent: C_GREEN, icon: '\u2713', label: 'Qualifies', note: 'Cash flow works. Let\u2019s run the full quote.', cta: 'Get Pre-Qualified \u2014 No Credit Pull', ctaColor: 'green', bridgeHeader: 'You qualify \u2014 let\u2019s make it official.', bridgeSubline: 'Sean and the Rate Hero team will text you in 5 minutes to walk through next steps.' },
    'dscr-close':      { color: 'amber', accent: C_AMBER, icon: '\u2022', label: 'Close Match \u2014 Let\u2019s Structure It', note: 'Close enough to work. Sean has 3\u20134 ways to get this done.', cta: 'See My Custom Options', ctaColor: 'amber', callSean: true, bridgeHeader: 'Close \u2014 let\u2019s shape it together.', bridgeSubline: 'Share your info. Sean will text you 3\u20134 paths to make this work within 5 minutes.' },
    'dscr-path':       { color: 'blue',  accent: C_BLUE,  icon: '\u2192', label: 'Let\u2019s Build a Path', note: 'Numbers need work, but there\u2019s almost always a way. Quick call?', cta: 'Talk to Sean \u2014 15 Min', ctaColor: 'blue', callSean: true, bridgeHeader: 'Every deal has a path.', bridgeSubline: 'Book 15 minutes with Sean. He\u2019ll map the right program for this specific deal.' },
    'brrrr-ready':     { color: 'green', accent: C_GREEN, icon: '\u2713', label: 'Cash-Out Ready', note: '', cta: 'Get Pre-Qualified \u2014 No Credit Pull', ctaColor: 'green', bridgeHeader: 'You qualify \u2014 let\u2019s make it official.', bridgeSubline: 'Sean and the Rate Hero team will text you in 5 minutes to walk through next steps.' },
    'brrrr-structure': { color: 'amber', accent: C_AMBER, icon: '\u2022', label: 'Let\u2019s Structure It', note: 'Refi covers payoff \u2014 we\u2019ll structure the cash flow.', cta: 'See My Custom Options', ctaColor: 'amber', callSean: true, bridgeHeader: 'Close \u2014 let\u2019s shape it together.', bridgeSubline: 'Share your info. Sean will text you 3\u20134 paths to make this work within 5 minutes.' },
    'brrrr-gap':       { color: 'amber', accent: C_AMBER, icon: '\u2022', label: 'Close the Gap \u2014 Let\u2019s Talk', note: '', cta: 'See My Custom Options', ctaColor: 'amber', callSean: true, bridgeHeader: 'Close \u2014 let\u2019s shape it together.', bridgeSubline: 'Share your info. Sean will text you 3\u20134 paths to make this work within 5 minutes.' },
    'brrrr-path':      { color: 'blue',  accent: C_BLUE,  icon: '\u2192', label: 'Let\u2019s Build a Path', note: 'Numbers need work but there\u2019s almost always a way.', cta: 'Talk to Sean \u2014 15 Min', ctaColor: 'blue', callSean: true, bridgeHeader: 'Every deal has a path.', bridgeSubline: 'Book 15 minutes with Sean. He\u2019ll map the right program for this specific deal.' },
    'fthb-range':      { color: 'green', accent: C_GREEN, icon: '\u2713', label: 'You\u2019re in Range', note: 'Budget looks strong for your income.', cta: 'Get Pre-Qualified \u2014 No Credit Pull', ctaColor: 'green', bridgeHeader: 'You qualify \u2014 let\u2019s make it official.', bridgeSubline: 'Sean and the Rate Hero team will text you in 5 minutes to walk through next steps.' },
    'fthb-tight':      { color: 'amber', accent: C_AMBER, icon: '\u2022', label: 'Tight but Workable', note: 'Close to conforming. FHA, buydowns, or a co-borrower may open more room.', cta: 'See My Custom Options', ctaColor: 'amber', callSean: true, bridgeHeader: 'Close \u2014 let\u2019s shape it together.', bridgeSubline: 'Share your info. Sean will text you 3\u20134 paths to make this work within 5 minutes.' },
    'fthb-program':    { color: 'blue',  accent: C_BLUE,  icon: '\u2192', label: 'Let\u2019s Find the Right Program', note: 'DTI\u2019s high \u2014 but there are FHA, VA, and 2-1 buydown programs built for this.', cta: 'Talk to Sean \u2014 15 Min', ctaColor: 'blue', callSean: true, bridgeHeader: 'Every deal has a path.', bridgeSubline: 'Book 15 minutes with Sean. He\u2019ll map the right program for this specific deal.' },
  };

  var state = {
    scenario: 'dscr',
    approvalTier: 'dscr-qualifies',
    inputs: {
      // DSCR
      propertyValue: 425000, rent: 3400, downPct: 0.25, state: '',
      // BRRRR
      arv: 525000, hmBalance: 360000, brrrrRent: 3800,
      // FTHB
      price: 500000, income: 140000, fthbDownPct: 0.05,
    },
    outputs: {
      preApproval: 0, pitia: 0, dscr: 0, cashFlow: 0,
      maxSupportedLoan: 0, rateRange: null, programChips: [],
      // BRRRR extras
      cashOut: 0, coversPayoff: false, shortfall: 0,
      // FTHB extras
      loanAmount: 0, frontDTI: 0, backDTI: 0,
    },
    leadCapture: { firstName: '', phone: '', email: '', consentTcpa: false },
    submitStatus: 'idle',
    hasInteracted: false,
    leadFormShown: false,
  };

  // ====== MATH ======
  // All rates from SIM_CONFIG — zero hardcoded rate literals in this section.

  function monthlyPI(loan, annualRatePct, years) {
    var r = annualRatePct / 100 / 12;
    var n = years * 12;
    if (r === 0) return loan / n;
    var rn = Math.pow(1 + r, n);
    return loan * (r * rn) / (rn - 1);
  }

  function lookupStateTI(code) {
    return SIM_CONFIG.stateTaxInsurance[code] || SIM_CONFIG.stateTaxInsurance['default'];
  }

  function maxLoanAtDscr(rent, annualRatePct, years, tiMonthly, targetDscr) {
    // Solve: rent / (PI(L) + tiMonthly) = targetDscr
    // → PI(L) = rent/targetDscr - tiMonthly
    var targetPI = rent / targetDscr - tiMonthly;
    if (targetPI <= 0) return 0;
    var r = annualRatePct / 100 / 12;
    var n = years * 12;
    if (r === 0) return targetPI * n;
    var rn = Math.pow(1 + r, n);
    return targetPI * (rn - 1) / (r * rn);
  }

  function computeRateRange(scenario, tier) {
    var baseKey = scenario === 'brrrr' ? 'brrrrCashOut' :
                  scenario === 'fthb'  ? 'conventional30yr' : 'dscr30yr';
    var base = SIM_CONFIG.rates[baseKey];
    var spreads = {
      'dscr-strong':     [0.000, 0.250],
      'dscr-qualifies':  [0.125, 0.500],
      'dscr-close':      [0.375, 0.875],
      'dscr-path':       null,
      'brrrr-ready':     [0.000, 0.250],
      'brrrr-structure': [0.250, 0.625],
      'brrrr-gap':       [0.250, 0.750],
      'brrrr-path':      null,
      'fthb-range':      [0.000, 0.375],
      'fthb-tight':      [0.125, 0.625],
      'fthb-program':    null,
    };
    var s = spreads[tier];
    if (!s) return { custom: true };
    return { low: base + s[0], high: base + s[1] };
  }

  function computeProgramMatches(scenario, inputs, outputs) {
    if (scenario === 'dscr') {
      return [
        { name: 'DSCR 30-yr Fixed', fit: outputs.dscr >= SIM_CONFIG.dscr.qualifyingMin ? 'good' : 'possible' },
        { name: 'No-Ratio DSCR',    fit: 'possible' },
        { name: 'Bank Statement',    fit: 'possible' },
      ];
    }
    if (scenario === 'brrrr') {
      var refiGood = outputs.coversPayoff && outputs.dscr >= SIM_CONFIG.dscr.qualifyingMin;
      return [
        { name: 'DSCR Cash-Out Refi', fit: refiGood ? 'good' : 'possible' },
        { name: 'Hard Money Exit',    fit: 'possible' },
        { name: 'DSCR Rate-and-Term', fit: 'possible' },
      ];
    }
    // fthb
    var convGood = outputs.frontDTI <= 0.36 && inputs.fthbDownPct >= 0.05;
    var buydownGood = outputs.frontDTI > 0.36;
    return [
      { name: 'Conventional 30-yr', fit: convGood ? 'good' : 'possible' },
      { name: 'FHA 30-yr',          fit: 'possible' },
      { name: '2-1 Buydown',        fit: buydownGood ? 'good' : 'possible' },
    ];
  }

  function computeDSCR(inp) {
    var loan = inp.propertyValue * (1 - inp.downPct);
    var tiRate = lookupStateTI(inp.state);
    var tiMonthly = inp.propertyValue * tiRate / 12;
    // Use LOW end of rate range for PITIA — determined after tier, so
    // we compute with base rate first to find tier, then recalc with low rate.
    var basePitia = monthlyPI(loan, SIM_CONFIG.rates.dscr30yr, 30) + tiMonthly;
    var baseDscr = inp.rent / basePitia;
    var tier = baseDscr >= SIM_CONFIG.dscr.strongThreshold ? 'dscr-strong' :
               baseDscr >= SIM_CONFIG.dscr.qualifyingMin   ? 'dscr-qualifies' :
               baseDscr >= SIM_CONFIG.dscr.lowRatioFloor   ? 'dscr-close' : 'dscr-path';
    var rr = computeRateRange('dscr', tier);
    // Recalculate PITIA at the LOW end of the rate range
    var rate = rr.custom ? SIM_CONFIG.rates.dscr30yr : rr.low;
    var pi = monthlyPI(loan, rate, 30);
    var pitia = pi + tiMonthly;
    var dscr = inp.rent / pitia;
    var cashFlow = inp.rent - pitia;
    var maxLoan = maxLoanAtDscr(inp.rent, rate, 30, tiMonthly, SIM_CONFIG.dscr.qualifyingMin);
    var out = { preApproval: loan, pitia: pitia, dscr: dscr, cashFlow: cashFlow,
                maxSupportedLoan: maxLoan, approvalTier: tier, rateRange: rr };
    out.programChips = computeProgramMatches('dscr', inp, out);
    return out;
  }

  function computeBRRRR(inp) {
    var maxCashOut = inp.arv * SIM_CONFIG.ltv.dscrCashOutMax;
    var coversPayoff = maxCashOut >= inp.hmBalance;
    var cashOutAmount = coversPayoff ? maxCashOut - inp.hmBalance : 0;
    var gapAmount = coversPayoff ? 0 : inp.hmBalance - maxCashOut;
    var refiLoan = Math.min(maxCashOut, inp.hmBalance);
    var tiMonthly = inp.arv * lookupStateTI(inp.state || '') / 12;
    var basePitia = monthlyPI(refiLoan, SIM_CONFIG.rates.brrrrCashOut, 30) + tiMonthly;
    var baseDscr = inp.brrrrRent / basePitia;
    var tier;
    if (coversPayoff && baseDscr >= SIM_CONFIG.dscr.qualifyingMin) tier = 'brrrr-ready';
    else if (coversPayoff) tier = 'brrrr-structure';
    else if (baseDscr >= SIM_CONFIG.dscr.lowRatioFloor) tier = 'brrrr-gap';
    else tier = 'brrrr-path';
    var rr = computeRateRange('brrrr', tier);
    var rate = rr.custom ? SIM_CONFIG.rates.brrrrCashOut : rr.low;
    var pi = monthlyPI(refiLoan, rate, 30);
    var pitia = pi + tiMonthly;
    var dscr = inp.brrrrRent / pitia;
    // Rent needed for DSCR 1.0 at this payment
    var rentNeeded = pitia * SIM_CONFIG.dscr.qualifyingMin;
    var out = { cashOut: maxCashOut, coversPayoff: coversPayoff, cashOutAmount: cashOutAmount,
                gapAmount: gapAmount, pitia: pitia, dscr: dscr, rentNeeded: rentNeeded,
                approvalTier: tier, rateRange: rr, preApproval: maxCashOut };
    out.programChips = computeProgramMatches('brrrr', inp, out);
    return out;
  }

  function computeFTHB(inp) {
    var loan = inp.price * (1 - inp.fthbDownPct);
    var tiMonthly = inp.price * lookupStateTI(inp.state || '') / 12;
    var basePi = monthlyPI(loan, SIM_CONFIG.rates.conventional30yr, 30);
    var pmi = inp.fthbDownPct < 0.20 ? loan * SIM_CONFIG.rates.pmiAnnualPct / 12 : 0;
    var basePitia = basePi + tiMonthly + pmi;
    var monthlyIncome = inp.income / 12;
    var frontDTI = basePitia / monthlyIncome;
    var tier = frontDTI <= 0.28 ? 'fthb-range' :
               frontDTI <= 0.36 ? 'fthb-tight' : 'fthb-program';
    var rr = computeRateRange('fthb', tier);
    var rate = rr.custom ? SIM_CONFIG.rates.conventional30yr : rr.low;
    var pi = monthlyPI(loan, rate, 30);
    var pitia = pi + tiMonthly + pmi;
    frontDTI = pitia / monthlyIncome;
    var backDTI = (pitia + 400) / monthlyIncome;
    var out = { loanAmount: loan, pitia: pitia, pmi: pmi, frontDTI: frontDTI,
                backDTI: backDTI, approvalTier: tier, rateRange: rr, preApproval: loan };
    out.programChips = computeProgramMatches('fthb', inp, out);
    return out;
  }

  function computeOutputs() {
    var o;
    if (state.scenario === 'dscr')  o = computeDSCR(state.inputs);
    else if (state.scenario === 'brrrr') o = computeBRRRR(state.inputs);
    else o = computeFTHB(state.inputs);
    state.outputs = o;
    state.approvalTier = o.approvalTier;
  }

  // ====== DOM SCAFFOLD ======
  var US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','ID','IL',
    'IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE',
    'NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
    'TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ];
  var STATE_NAMES = {
    AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
    CT:'Connecticut',DC:'District of Columbia',DE:'Delaware',FL:'Florida',GA:'Georgia',
    HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',
    LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',
    MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
    NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',
    OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
    SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',
    WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'
  };

  function stateOptions() {
    var html = '<option value="">Select state</option>';
    US_STATES.forEach(function (s) {
      html += '<option value="' + s + '">' + STATE_NAMES[s] + '</option>';
    });
    return html;
  }

  function sliderHTML(id, label, min, max, step, val, fmt) {
    return '<div class="rh-sim-slider-row">' +
      '<div class="rh-sim-slider-label">' +
        '<span class="rh-sim-slider-name">' + label + '</span>' +
        '<span class="rh-sim-slider-val" id="' + id + '-val">' + fmt(val) + '</span>' +
      '</div>' +
      '<input type="range" class="rh-sim-range" id="' + id + '" ' +
        'min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" ' +
        'aria-label="' + label + '">' +
    '</div>';
  }

  var fmtDollar = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var fmtPct = function (n) { return Math.round(n * 100) + '%'; };

  function buildInitialDOM(mount) {
    mount.innerHTML =
    '<div class="rh-sim-root">' +
      '<div class="rh-sim-wrap">' +
        '<div class="rh-sim-header">' +
          '<div class="rh-sim-badge">\u26A1 Loan Simulator</div>' +
          '<div class="rh-sim-title">See Your Numbers <em>Before You Apply</em></div>' +
          '<div class="rh-sim-subtitle">Drag the sliders. Get your pre-approval estimate, rate range, and cash flow \u2014 instantly. No credit pull.</div>' +
        '</div>' +
        '<div class="rh-sim-tabs" role="tablist">' +
          '<button class="rh-sim-tab active" data-tab="dscr" role="tab" aria-selected="true">Cash-Flow Investor</button>' +
          '<button class="rh-sim-tab" data-tab="brrrr" role="tab" aria-selected="false">Fix &amp; Flip / BRRRR</button>' +
          '<button class="rh-sim-tab" data-tab="fthb" role="tab" aria-selected="false">First-Time Buyer</button>' +
        '</div>' +
        '<div class="rh-sim-grid">' +
          /* ── LEFT: INPUTS ── */
          '<div class="rh-sim-inputs">' +
            '<div class="rh-sim-scenario" id="rh-sim-dscr">' +
              sliderHTML('sim-propval', 'Property Value', 150000, 1200000, 5000, 425000, fmtDollar) +
              sliderHTML('sim-rent', 'Monthly Rent Estimate', 800, 8000, 50, 3400, fmtDollar) +
              sliderHTML('sim-down', 'Down Payment', 0.20, 0.40, 0.01, 0.25, fmtPct) +
              '<div class="rh-sim-slider-row">' +
                '<div class="rh-sim-slider-label"><span class="rh-sim-slider-name">Where is the property?</span></div>' +
                '<select class="rh-sim-select" id="sim-state" aria-label="Where is the property?">' + stateOptions() + '</select>' +
                '<div style="font-size:10px;color:rgba(255,255,255,0.25);margin-top:5px;">Used to estimate your property taxes and insurance.</div>' +
              '</div>' +
            '</div>' +
            '<div class="rh-sim-scenario hidden" id="rh-sim-brrrr">' +
              sliderHTML('sim-arv', 'After-Repair Value (ARV)', 200000, 1500000, 10000, 525000, fmtDollar) +
              sliderHTML('sim-hm', 'Hard Money Balance', 100000, 1000000, 5000, 360000, fmtDollar) +
              sliderHTML('sim-brent', 'Monthly Rent Estimate', 800, 8000, 50, 3800, fmtDollar) +
            '</div>' +
            '<div class="rh-sim-scenario hidden" id="rh-sim-fthb">' +
              sliderHTML('sim-price', 'Purchase Price', 200000, 1500000, 5000, 500000, fmtDollar) +
              sliderHTML('sim-income', 'Annual Income', 50000, 400000, 5000, 140000, fmtDollar) +
              sliderHTML('sim-fdown', 'Down Payment', 0.03, 0.25, 0.01, 0.05, fmtPct) +
            '</div>' +
          '</div>' +
          /* ── RIGHT: RESULT CARD ── */
          '<div class="rh-sim-result" id="rh-sim-result" aria-live="polite">' +
            '<div class="rh-sim-primary-label" id="rh-sim-primary-label">Pre-Approval Estimate</div>' +
            '<div class="rh-sim-primary-num" id="rh-sim-primary-num">\u2014</div>' +
            '<div class="rh-sim-rate-range" id="rh-sim-rate-range"></div>' +
            '<div class="rh-sim-approval" id="rh-sim-approval"><span class="rh-sim-approval-icon" id="rh-sim-approval-icon"></span><div><div id="rh-sim-approval-label"></div><div class="rh-sim-approval-note" id="rh-sim-approval-note"></div></div></div>' +
            '<div class="rh-sim-bridge" id="rh-sim-bridge-wrap">' +
              '<h3 class="rh-sim-bridge-header" id="rh-sim-bridge-header"></h3>' +
              '<p class="rh-sim-bridge-subline" id="rh-sim-bridge-subline"></p>' +
            '</div>' +
            '<div class="rh-sim-metrics" id="rh-sim-metrics">' +
              '<div class="rh-sim-metric"><span class="rh-sim-metric-val" id="rh-sim-m1-val">\u2014</span><span class="rh-sim-metric-lbl" id="rh-sim-m1-lbl">Monthly PITIA</span></div>' +
              '<div class="rh-sim-metric"><span class="rh-sim-metric-val" id="rh-sim-m2-val">\u2014</span><span class="rh-sim-metric-lbl" id="rh-sim-m2-lbl">DSCR Ratio</span></div>' +
              '<div class="rh-sim-metric"><span class="rh-sim-metric-val" id="rh-sim-m3-val">\u2014</span><span class="rh-sim-metric-lbl" id="rh-sim-m3-lbl">Net Cash Flow</span></div>' +
            '</div>' +
            '<div class="rh-sim-chips" id="rh-sim-chips"></div>' +
            '<div class="rh-sim-scale" id="rh-sim-scale">' +
              '<div class="rh-sim-scale-marker" id="rh-sim-marker" style="left:25%"></div>' +
              '<div class="rh-sim-scale-line" style="left:25%"><span class="rh-sim-scale-line-label">1.00\u00d7 Qualifies</span></div>' +
            '</div>' +
            '<div class="rh-sim-insight" id="rh-sim-insight"></div>' +
            '<div class="rh-sim-lead" id="rh-sim-lead">' +
              '<div class="rh-sim-lead-inner">' +
                '<div class="rh-sim-error" id="rh-sim-error"></div>' +
                '<div class="rh-sim-field">' +
                  '<label for="rh-sim-fname">First Name</label>' +
                  '<input type="text" id="rh-sim-fname" autocomplete="given-name" placeholder="First name" aria-label="First name">' +
                  '<div class="err-msg" id="rh-sim-fname-err">First name is required</div>' +
                '</div>' +
                '<div class="rh-sim-field">' +
                  '<label for="rh-sim-phone">Phone</label>' +
                  '<input type="tel" id="rh-sim-phone" autocomplete="tel" placeholder="(555) 123-4567" aria-label="Phone number">' +
                  '<div class="err-msg" id="rh-sim-phone-err">Enter a 10-digit phone number</div>' +
                '</div>' +
                '<div class="rh-sim-field">' +
                  '<label for="rh-sim-email">Email</label>' +
                  '<input type="email" id="rh-sim-email" autocomplete="email" placeholder="you@email.com" aria-label="Email address">' +
                  '<div class="err-msg" id="rh-sim-email-err">Enter a valid email address</div>' +
                '</div>' +
                '<div class="rh-sim-tcpa">' +
                  '<input type="checkbox" id="rh-sim-tcpa" aria-describedby="rh-sim-tcpa-text">' +
                  '<span class="rh-sim-tcpa-text" id="rh-sim-tcpa-text">I agree to receive calls and texts from Rate Hero at the number provided, including via automated means. Consent is not a condition of any purchase. Message &amp; data rates may apply. Reply STOP to opt out.</span>' +
                '</div>' +
                '<button class="rh-sim-submit" id="rh-sim-submit" type="button"></button>' +
                '<a class="rh-sim-fallback" id="rh-sim-fallback" href="/apply.html">Or fill out the full application \u2192</a>' +
                '<div class="rh-sim-trust">\uD83D\uDD12 No credit pull \u00b7 No SSN \u00b7 We never sell your info</div>' +
                '<div class="rh-sim-fine">Rate range and program matching are informational. Example rate as of ' + SIM_CONFIG.rateAsOf + '. Final rate and eligibility determined by full application and underwriting.</div>' +
              '</div>' +
            '</div>' +
            '<div class="rh-sim-success" id="rh-sim-success"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  // ====== RENDER ======
  var _prevNums = {};

  function animateNumber(el, to, prefix, suffix) {
    var key = el.id || el.className;
    var from = _prevNums[key] || 0;
    _prevNums[key] = to;
    if (Math.abs(from - to) < 0.5) { el.textContent = prefix + formatNum(to) + suffix; return; }
    var start = performance.now();
    var dur = 250;
    function tick(now) {
      var t = Math.min((now - start) / dur, 1);
      t = 1 - Math.pow(1 - t, 3); // ease-out cubic
      var cur = from + (to - from) * t;
      el.textContent = prefix + formatNum(cur) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function formatNum(n) { return Math.round(n).toLocaleString('en-US'); }

  function renderRateRange() {
    var el = document.getElementById('rh-sim-rate-range');
    if (!el) return;
    var rr = state.outputs.rateRange;
    if (!rr) { el.textContent = ''; return; }
    if (rr.custom) {
      el.innerHTML = '<span class="custom">Custom pricing \u2014 call Sean</span>';
    } else {
      el.textContent = 'Est. ' + rr.low.toFixed(3) + '% \u2013 ' + rr.high.toFixed(3) + '% APR';
    }
  }

  function renderProgramChips() {
    var el = document.getElementById('rh-sim-chips');
    if (!el) return;
    var chips = state.outputs.programChips || [];
    el.innerHTML = chips.map(function (c) {
      var cls = c.fit === 'good' ? 'good' : 'possible';
      return '<span class="rh-sim-chip ' + cls + '"><span class="dot"></span>' + c.name + '</span>';
    }).join('');
  }

  function renderDSCRScale() {
    var scaleEl = document.getElementById('rh-sim-scale');
    var marker = document.getElementById('rh-sim-marker');
    if (!scaleEl || !marker) return;
    // Show scale only for DSCR and BRRRR scenarios (which have a DSCR ratio)
    var hasDscr = state.scenario === 'dscr' || state.scenario === 'brrrr';
    scaleEl.style.display = hasDscr ? '' : 'none';
    if (!hasDscr) return;
    var dscr = state.outputs.dscr || 0;
    // Scale range: 0.80 to 1.60
    var pct = Math.max(0, Math.min(100, ((dscr - 0.80) / (1.60 - 0.80)) * 100));
    marker.style.left = pct + '%';
  }

  function renderApprovalState() {
    var tier = state.approvalTier;
    var vis = TIER_VISUALS[tier];
    if (!vis) return;
    var card = document.getElementById('rh-sim-result');
    var banner = document.getElementById('rh-sim-approval');
    var icon = document.getElementById('rh-sim-approval-icon');
    var label = document.getElementById('rh-sim-approval-label');
    var note = document.getElementById('rh-sim-approval-note');
    if (card) card.style.setProperty('--sim-accent', vis.accent);
    if (banner) { banner.className = 'rh-sim-approval ' + vis.color; }
    if (icon) icon.textContent = vis.icon;
    if (label) label.textContent = vis.label;
    if (note) {
      var noteHTML = vis.note ? vis.note : '';
      if (vis.callSean) {
        noteHTML += (noteHTML ? ' ' : '') + 'Or call Sean directly: <a href="tel:7473081635" style="color:' + vis.accent + ';text-decoration:none;font-weight:700">(747) 308-1635</a>';
      }
      note.innerHTML = noteHTML;
    }
  }

  function renderResultCard() {
    var o = state.outputs;
    var primaryLabel = document.getElementById('rh-sim-primary-label');
    var primaryNum = document.getElementById('rh-sim-primary-num');
    var m1v = document.getElementById('rh-sim-m1-val');
    var m1l = document.getElementById('rh-sim-m1-lbl');
    var m2v = document.getElementById('rh-sim-m2-val');
    var m2l = document.getElementById('rh-sim-m2-lbl');
    var m3v = document.getElementById('rh-sim-m3-val');
    var m3l = document.getElementById('rh-sim-m3-lbl');
    var insight = document.getElementById('rh-sim-insight');

    if (state.scenario === 'dscr') {
      if (primaryLabel) primaryLabel.textContent = 'Pre-Approval Estimate';
      if (primaryNum) animateNumber(primaryNum, o.preApproval, '$', '');
      if (m1v) { animateNumber(m1v, o.pitia, '$', ''); }
      if (m1l) m1l.textContent = 'Monthly PITIA';
      if (m2v) { m2v.textContent = o.dscr.toFixed(2) + '\u00d7'; m2v.className = 'rh-sim-metric-val' + (o.dscr >= 1.0 ? ' pos' : o.dscr >= 0.75 ? ' amber' : ''); }
      if (m2l) m2l.textContent = 'DSCR Ratio';
      if (m3v) {
        animateNumber(m3v, Math.abs(o.cashFlow), o.cashFlow >= 0 ? '+$' : '-$', '');
        // Negative cash flow: red only on green tiers (unusual edge case), amber on amber/blue tiers (softer signal)
        var cfClass = o.cashFlow >= 0 ? ' pos' : (TIER_VISUALS[state.approvalTier].color === 'green' ? ' neg' : ' amber');
        m3v.className = 'rh-sim-metric-val' + cfClass;
      }
      if (m3l) m3l.textContent = 'Net Cash Flow';
      if (insight) insight.textContent = 'Your $' + formatNum(state.inputs.rent) + ' rent supports up to $' + formatNum(o.maxSupportedLoan) + ' in financing at 1.00\u00d7 DSCR.';
      if (insight) insight.style.display = '';
    } else if (state.scenario === 'brrrr') {
      if (primaryLabel) primaryLabel.textContent = 'Max Cash-Out Refi';
      if (primaryNum) animateNumber(primaryNum, o.cashOut, '$', '');
      if (m1v) {
        if (o.coversPayoff) { animateNumber(m1v, o.cashOutAmount, '+$', ''); m1v.className = 'rh-sim-metric-val pos'; }
        else { animateNumber(m1v, o.gapAmount, '-$', ''); m1v.className = 'rh-sim-metric-val neg'; }
      }
      if (m1l) m1l.textContent = o.coversPayoff ? 'Cash Out' : 'Short by';
      if (m2v) { animateNumber(m2v, o.pitia, '$', ''); }
      if (m2l) m2l.textContent = 'New PITIA';
      if (m3v) { m3v.textContent = o.dscr.toFixed(2) + '\u00d7'; m3v.className = 'rh-sim-metric-val' + (o.dscr >= 1.0 ? ' pos' : ' amber'); }
      if (m3l) m3l.textContent = 'DSCR';
      if (insight) {
        if (!o.coversPayoff) insight.textContent = 'Close the gap: bring $' + formatNum(o.gapAmount) + ' to close, raise rent to $' + formatNum(o.rentNeeded) + ', or restructure the deal.';
        else if (o.dscr < 1.0) insight.textContent = 'Refi covers payoff \u2014 rent needs to hit $' + formatNum(o.rentNeeded) + '/mo for DSCR to qualify.';
        else insight.textContent = 'Refi covers payoff with $' + formatNum(o.cashOutAmount) + ' cash out at ' + o.dscr.toFixed(2) + '\u00d7 DSCR.';
        insight.style.display = '';
      }
    } else { // fthb
      if (primaryLabel) primaryLabel.textContent = 'Estimated Loan Amount';
      if (primaryNum) animateNumber(primaryNum, o.loanAmount, '$', '');
      if (m1v) { animateNumber(m1v, o.pitia, '$', ''); }
      if (m1l) m1l.textContent = o.pmi > 0 ? 'PITIA + PMI' : 'Monthly PITIA';
      if (m2v) { m2v.textContent = (o.frontDTI * 100).toFixed(1) + '%'; m2v.className = 'rh-sim-metric-val' + (o.frontDTI <= 0.28 ? ' pos' : o.frontDTI <= 0.36 ? ' amber' : ''); }
      if (m2l) m2l.textContent = 'Front-End DTI';
      if (m3v) { m3v.textContent = (o.backDTI * 100).toFixed(1) + '%'; m3v.className = 'rh-sim-metric-val' + (o.backDTI <= 0.36 ? ' pos' : o.backDTI <= 0.43 ? ' amber' : ''); }
      if (m3l) m3l.textContent = 'Back-End DTI';
      if (insight) { insight.textContent = 'Back-end DTI assumes $400/mo in other debt (cards, auto, student loans). Actual DTI uses your real obligations.'; insight.style.display = ''; }
    }

    renderRateRange();
    renderProgramChips();
    renderDSCRScale();
    renderApprovalState();
  }

  function render() {
    computeOutputs();
    renderResultCard();
    updateLeadFormUI();
    // Show form on first user interaction (not at page load)
    if (state.hasInteracted) showLeadForm();
  }

  // ====== EVENT HANDLERS ======
  var _debounceTimer = null;

  function onSliderInput() {
    if (!state.hasInteracted) {
      state.hasInteracted = true;
      trackEvent('sim_interact', { scenario: state.scenario });
    }
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () {
      readInputs();
      render();
    }, 50);
  }

  function readInputs() {
    var v = function (id) { return parseFloat(document.getElementById(id).value) || 0; };
    if (state.scenario === 'dscr') {
      state.inputs.propertyValue = v('sim-propval');
      state.inputs.rent = v('sim-rent');
      state.inputs.downPct = v('sim-down');
      state.inputs.state = document.getElementById('sim-state').value;
      // Update displayed slider values
      document.getElementById('sim-propval-val').textContent = fmtDollar(state.inputs.propertyValue);
      document.getElementById('sim-rent-val').textContent = fmtDollar(state.inputs.rent);
      document.getElementById('sim-down-val').textContent = fmtPct(state.inputs.downPct);
    } else if (state.scenario === 'brrrr') {
      state.inputs.arv = v('sim-arv');
      state.inputs.hmBalance = v('sim-hm');
      state.inputs.brrrrRent = v('sim-brent');
      document.getElementById('sim-arv-val').textContent = fmtDollar(state.inputs.arv);
      document.getElementById('sim-hm-val').textContent = fmtDollar(state.inputs.hmBalance);
      document.getElementById('sim-brent-val').textContent = fmtDollar(state.inputs.brrrrRent);
    } else {
      state.inputs.price = v('sim-price');
      state.inputs.income = v('sim-income');
      state.inputs.fthbDownPct = v('sim-fdown');
      document.getElementById('sim-price-val').textContent = fmtDollar(state.inputs.price);
      document.getElementById('sim-income-val').textContent = fmtDollar(state.inputs.income);
      document.getElementById('sim-fdown-val').textContent = fmtPct(state.inputs.fthbDownPct);
    }
  }

  function switchTab(scenario) {
    state.scenario = scenario;
    // Update tab active states
    var tabs = document.querySelectorAll('.rh-sim-tab');
    tabs.forEach(function (t) {
      var isActive = t.getAttribute('data-tab') === scenario;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    // Crossfade scenario panels
    var panels = document.querySelectorAll('.rh-sim-scenario');
    panels.forEach(function (p) {
      var match = p.id === 'rh-sim-' + scenario;
      p.classList.toggle('hidden', !match);
    });
    _prevNums = {};
    readInputs();
    render();
  }

  function attachEventListeners() {
    // Tab clicks
    document.querySelectorAll('.rh-sim-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchTab(tab.getAttribute('data-tab')); });
    });
    // All sliders
    document.querySelectorAll('.rh-sim-range').forEach(function (slider) {
      slider.addEventListener('input', onSliderInput);
    });
    // State dropdown
    var stateSelect = document.getElementById('sim-state');
    if (stateSelect) {
      stateSelect.addEventListener('change', function () {
        state.inputs.state = stateSelect.value;
        render();
      });
    }
  }

  // ====== LEAD CAPTURE ======
  // ====== LEAD CAPTURE ======
  function formatPhone(val) {
    var digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length <= 3) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function phoneDigits(formatted) {
    return (formatted || '').replace(/\D/g, '');
  }

  function isFormValid() {
    var lc = state.leadCapture;
    return lc.firstName.trim().length > 0 &&
           phoneDigits(lc.phone).length === 10 &&
           /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lc.email) &&
           lc.consentTcpa;
  }

  function buildFallbackHref() {
    var inp = state.inputs;
    var o = state.outputs;
    var params = 'source=simulator&scenario=' + state.scenario + '&tier=' + state.approvalTier;
    if (state.scenario === 'dscr') {
      params += '&propertyValue=' + inp.propertyValue + '&rent=' + inp.rent +
                '&downPct=' + Math.round(inp.downPct * 100) + '&state=' + (inp.state || '') +
                '&dscr=' + (o.dscr ? o.dscr.toFixed(2) : '');
    } else if (state.scenario === 'brrrr') {
      params += '&arv=' + inp.arv + '&hmBalance=' + inp.hmBalance + '&rent=' + inp.brrrrRent;
    } else {
      params += '&price=' + inp.price + '&income=' + inp.income +
                '&downPct=' + Math.round(inp.fthbDownPct * 100);
    }
    return '/apply.html?' + params;
  }

  function showLeadForm() {
    var el = document.getElementById('rh-sim-lead');
    var bridge = document.getElementById('rh-sim-bridge-wrap');
    if (!el || el.classList.contains('open')) return;
    el.classList.add('open');
    if (bridge) bridge.classList.add('open');
    if (!state.leadFormShown) {
      state.leadFormShown = true;
      trackEvent('sim_lead_form_view', { scenario: state.scenario, tier: state.approvalTier });
    }
  }

  function renderLeadBridge() {
    var vis = TIER_VISUALS[state.approvalTier];
    if (!vis) return;
    var header = document.getElementById('rh-sim-bridge-header');
    var subline = document.getElementById('rh-sim-bridge-subline');
    if (header) { header.textContent = vis.bridgeHeader || ''; header.style.color = vis.accent; }
    if (subline) subline.textContent = vis.bridgeSubline || '';
  }

  function updateLeadFormUI() {
    var vis = TIER_VISUALS[state.approvalTier];
    if (!vis) return;
    renderLeadBridge();
    var btn = document.getElementById('rh-sim-submit');
    if (btn) {
      btn.textContent = vis.cta;
      btn.className = 'rh-sim-submit ' + vis.ctaColor;
    }
    var fallback = document.getElementById('rh-sim-fallback');
    if (fallback) fallback.href = buildFallbackHref();
  }

  function attachLeadListeners() {
    var fname = document.getElementById('rh-sim-fname');
    var phone = document.getElementById('rh-sim-phone');
    var email = document.getElementById('rh-sim-email');
    var tcpa = document.getElementById('rh-sim-tcpa');
    var btn = document.getElementById('rh-sim-submit');

    if (fname) fname.addEventListener('input', function () {
      state.leadCapture.firstName = fname.value;
      fname.classList.remove('error');
    });
    if (phone) phone.addEventListener('input', function () {
      phone.value = formatPhone(phone.value);
      state.leadCapture.phone = phone.value;
      phone.classList.remove('error');
    });
    if (email) email.addEventListener('input', function () {
      state.leadCapture.email = email.value;
      email.classList.remove('error');
    });
    if (tcpa) tcpa.addEventListener('change', function () {
      state.leadCapture.consentTcpa = tcpa.checked;
    });
    if (btn) btn.addEventListener('click', function () {
      // Phase 4A will wire real submission here
      console.log('Phase 4A: submit', { valid: isFormValid(), state: state.leadCapture });
    });

    var fallback = document.getElementById('rh-sim-fallback');
    if (fallback) fallback.addEventListener('click', function () {
      trackEvent('sim_cta_fallback_click', { scenario: state.scenario, tier: state.approvalTier });
    });
  }

  // ====== PIPELINE ======
  /* __PIPELINE_PLACEHOLDER__ */

  // ====== ANALYTICS ======
  function trackEvent(name, data) {
    if (window.dataLayer) {
      window.dataLayer.push(Object.assign({ event: name }, data || {}));
    }
  }

  // ====== INIT ======
  function init() {
    var mount = document.getElementById('loan-simulator');
    if (!mount) return;
    injectStyles();
    buildInitialDOM(mount);
    attachEventListeners();
    attachLeadListeners();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
