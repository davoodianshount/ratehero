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
      CT: 0.021, DE: 0.012, FL: 0.022, GA: 0.016, HI: 0.008, ID: 0.012,
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
  /* __STYLES_PLACEHOLDER__ */

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
