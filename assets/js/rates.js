/**
 * Rate Hero — /rates Scenario Pricer (v3)
 *
 * Changes from v2:
 *   - Pricing config is fetched from /api/pricing/approved (Cloudflare KV).
 *     If the fetch fails, falls back to window.RATE_HERO_FALLBACK_CONFIG
 *     (loaded from rates-config.js) and shows a warning banner.
 *   - Profile-based pricing. (program, purpose) -> profile lookup, with
 *     graceful fallback if no exact profile exists ("advisor review required").
 *   - Eligibility checks (minFico, maxLtv, minDscr) — when a scenario
 *     violates a profile's box, the page still renders an estimate but
 *     flags it for advisor review and adds the reasons to the Bolt summary.
 *   - Bolt CTA generates a clean text summary and calls window.openBolt(text).
 *
 * All values are estimates. No live pricing is claimed.
 *
 * Run inline tests by appending ?test=1 to the page URL.
 */

(function () {
  'use strict';

  // ===== Math helpers ==================================================

  function calcMonthlyPayment(principal, annualRate, termYears, interestOnly) {
    if (!principal || principal <= 0) return 0;
    if (!termYears || termYears <= 0) return 0;
    const monthlyRate = (annualRate / 100) / 12;
    if (interestOnly) return principal * monthlyRate;
    if (monthlyRate === 0) return principal / (termYears * 12);
    const n = termYears * 12;
    return principal * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  }

  function calcDSCR(monthlyRent, monthlyPitia) {
    if (!monthlyPitia || monthlyPitia <= 0) return 0;
    if (!monthlyRent || monthlyRent < 0) return 0;
    return monthlyRent / monthlyPitia;
  }

  function fmtUsd(n) {
    if (!isFinite(n)) return '$0';
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  function fmtPct(n, dp) {
    if (!isFinite(n)) return '0.000%';
    return n.toFixed(dp == null ? 3 : dp) + '%';
  }
  function fmtRatio(n) {
    if (!isFinite(n)) return '0.00x';
    return n.toFixed(2) + 'x';
  }
  function fmtPoints(low, high) {
    return low.toFixed(3) + ' – ' + high.toFixed(3);
  }
  function parseNum(v) {
    if (v == null) return 0;
    const cleaned = String(v).replace(/[^0-9.\-]/g, '');
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : 0;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Parse a credit-score bracket id like "700-719" or "780+" into a numeric floor.
  function ficoFloor(bracketId) {
    if (!bracketId) return 0;
    if (bracketId.endsWith('+')) return parseInt(bracketId, 10) || 0;
    const m = bracketId.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  // ===== Profile lookup =================================================

  /**
   * Return the active profile that best matches (program, purpose).
   * Priority: exact match → "any" purpose → purchase fallback → first active in program → null.
   */
  function findProfile(cfg, program, purpose) {
    if (!cfg || !Array.isArray(cfg.profiles)) return { profile: null, exact: false };
    const active = cfg.profiles.filter(p => p && p.active);

    let p = active.find(x => x.program === program && x.purpose === purpose);
    if (p) return { profile: p, exact: true };

    p = active.find(x => x.program === program && x.purpose === 'any');
    if (p) return { profile: p, exact: false };

    p = active.find(x => x.program === program && x.purpose === 'purchase');
    if (p) return { profile: p, exact: false };

    p = active.find(x => x.program === program);
    if (p) return { profile: p, exact: false };

    return { profile: null, exact: false };
  }

  /**
   * Build the unique (program, displayName) list for the program select.
   * Deduplicates by program id, prefers the active "purchase" profile's name as canonical.
   */
  function uniqueProgramOptions(cfg) {
    if (!cfg || !Array.isArray(cfg.profiles)) return [];
    const seen = {};
    const out = [];
    cfg.profiles.forEach(p => {
      if (!p || !p.active) return;
      if (seen[p.program]) return;
      seen[p.program] = true;
      const programName = p.displayName.replace(/\s+(Purchase|Rate\/Term Refi|Cash-Out Refi|Hard Money Exit|Refi)$/i, '').trim() || p.displayName;
      out.push({ value: p.program, label: programName });
    });
    return out;
  }

  // ===== Bracket / band lookups (adjustments) ==========================

  function findCreditAdj(cfg, value) {
    const arr = (cfg.adjustments && cfg.adjustments.creditScore) || [];
    const b = arr.find(br => br.match === value);
    return b && b.active !== false ? b.rateAdj : 0;
  }
  function findCreditLabel(cfg, value) {
    const arr = (cfg.adjustments && cfg.adjustments.creditScore) || [];
    const b = arr.find(br => br.match === value);
    return b ? b.label : '—';
  }
  function findLtvBracket(cfg, ltvPct) {
    const arr = (cfg.adjustments && cfg.adjustments.ltv) || [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].active !== false && ltvPct <= arr[i].ltvMax) return arr[i];
    }
    return arr[arr.length - 1] || { rateAdj: 0, label: '—' };
  }
  function findDscrBracket(cfg, dscr) {
    const arr = (cfg.adjustments && cfg.adjustments.dscr) || [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].active !== false && dscr >= arr[i].dscrMin) return arr[i];
    }
    return arr[arr.length - 1] || { rateAdj: 0, label: '—' };
  }
  function findLoanAmountBracket(cfg, amount) {
    const arr = (cfg.adjustments && cfg.adjustments.loanAmount) || [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].active !== false && amount <= arr[i].amountMax) return arr[i];
    }
    return arr[arr.length - 1] || { rateAdj: 0, label: '—' };
  }
  function findStateBand(cfg, code) {
    const bands = (cfg.adjustments && cfg.adjustments.state && cfg.adjustments.state.bands) || {};
    const ks = ['low','mid','high'];
    for (let i = 0; i < ks.length; i++) {
      const band = bands[ks[i]];
      if (band && band.active !== false && Array.isArray(band.states) && band.states.indexOf(code) !== -1) {
        return { key: ks[i], label: band.label, rateAdj: band.rateAdj };
      }
    }
    // Default to mid if state not listed.
    const mid = bands.mid || { rateAdj: 0, label: 'Mid-cost states' };
    return { key: 'mid', label: mid.label, rateAdj: mid.rateAdj };
  }
  function findSimpleAdj(cfg, key, value) {
    const arr = (cfg.adjustments && cfg.adjustments[key]) || [];
    const b = arr.find(br => br.match === value);
    return b && b.active !== false ? b.rateAdj : 0;
  }

  // ===== The pricer =====================================================

  /**
   * Price a scenario.
   * Returns:
   *   { profile, profileExact, advisorReview, advisorReasons, ltvPct, piMid,
   *     pitiaMid, dscr, strength, midRate, lowRate, highRate, pointsLow,
   *     pointsHigh, lenderFee, grid, breakdown, suggested }
   * advisorReview=true means the scenario sits outside the profile's box;
   * we still produce numbers but the UI flags it.
   */
  function priceScenario(cfg, inputs) {
    const lookup = findProfile(cfg, inputs.program, inputs.loanPurpose);
    if (!lookup.profile) {
      return {
        profile: null,
        profileExact: false,
        advisorReview: true,
        advisorReasons: ['No active pricing profile for this program.'],
        suggested: ['Send the scenario to an advisor for manual review.'],
        bolt: 'noProfile'
      };
    }
    const profile = lookup.profile;

    const purchase = parseNum(inputs.purchasePrice);
    const loan     = parseNum(inputs.loanAmount);
    const rent     = parseNum(inputs.monthlyRent);
    const taxesMo  = parseNum(inputs.taxesMonthly);
    const insMo    = parseNum(inputs.insuranceMonthly);
    const hoaMo    = parseNum(inputs.hoaMonthly);

    const loanForCalc = loan > 0 ? loan : (purchase > 0 ? purchase * 0.75 : 0);
    const ltvPct = (purchase > 0 && loanForCalc > 0) ? (loanForCalc / purchase) * 100 : 0;

    const termYears = (cfg.defaultTermYears) || 30;
    const isIO = inputs.interestOnly === 'yes';

    // Sum adjustments. Profile baseRate is the starting point.
    let totalAdj = 0;
    const breakdown = [];
    function add(label, val, adj) {
      totalAdj += adj;
      breakdown.push({ label, value: val, adj });
    }

    add('Credit', findCreditLabel(cfg, inputs.creditScore), findCreditAdj(cfg, inputs.creditScore));
    if (ltvPct > 0) {
      const b = findLtvBracket(cfg, ltvPct);
      add('LTV', b.label, b.rateAdj);
    }
    if (loanForCalc > 0) {
      const b = findLoanAmountBracket(cfg, loanForCalc);
      add('Loan size', b.label, b.rateAdj);
    }
    add('Property', inputs.propertyType, findSimpleAdj(cfg, 'propertyType', inputs.propertyType));
    if (inputs.state) {
      const band = findStateBand(cfg, inputs.state);
      add('State', inputs.state + ' (' + band.key + ')', band.rateAdj);
    }
    add('Lock', inputs.lockPeriod + 'd', findSimpleAdj(cfg, 'lockPeriod', inputs.lockPeriod));
    add('Prepay', inputs.prepay, findSimpleAdj(cfg, 'prepay', inputs.prepay));
    add('IO', inputs.interestOnly, isIO ? findSimpleAdj(cfg, 'interestOnly', 'yes') : 0);

    // DSCR: provisional payment at profile baseRate to avoid chicken/egg.
    const provisionalPI = calcMonthlyPayment(loanForCalc, profile.baseRate, termYears, isIO);
    const provisionalPitia = provisionalPI + taxesMo + insMo + hoaMo;
    const dscrProvisional = calcDSCR(rent, provisionalPitia);
    if (dscrProvisional > 0) {
      const b = findDscrBracket(cfg, dscrProvisional);
      add('DSCR', b.label, b.rateAdj);
    }

    const midRate = +(profile.baseRate + totalAdj).toFixed(3);
    const lowRate = +(midRate - profile.spreadLow).toFixed(3);
    const highRate = +(midRate + profile.spreadHigh).toFixed(3);

    const piMid = calcMonthlyPayment(loanForCalc, midRate, termYears, isIO);
    const pitiaMid = piMid + taxesMo + insMo + hoaMo;
    const finalDscr = calcDSCR(rent, pitiaMid);
    const strength = labelDscrStrength(finalDscr);

    // Eligibility check against this profile's box.
    const reasons = [];
    const fico = ficoFloor(inputs.creditScore);
    if (profile.minFico && fico && fico < profile.minFico) {
      reasons.push('credit ' + inputs.creditScore + ' below program min ' + profile.minFico);
    }
    if (profile.maxLtv && ltvPct > profile.maxLtv) {
      reasons.push('LTV ' + ltvPct.toFixed(1) + '% above program max ' + profile.maxLtv + '%');
    }
    if (profile.minDscr != null && finalDscr > 0 && finalDscr < profile.minDscr) {
      reasons.push('DSCR ' + finalDscr.toFixed(2) + ' below program min ' + profile.minDscr.toFixed(2));
    }
    if (!lookup.exact) {
      reasons.push('purpose "' + (inputs.loanPurpose || '(none)') + '" mapped to closest active profile');
    }
    if (isIO && profile.ioAllowed === false) {
      reasons.push('interest-only not available on this program');
    }

    // Three-row trade-off grid.
    const grid = [
      {
        rate: lowRate,
        pointsLabel: 'Higher cost',
        pointsRange: (profile.pointsHigh - 0.5).toFixed(2) + ' – ' + (profile.pointsHigh + 0.5).toFixed(2),
        payment: calcMonthlyPayment(loanForCalc, lowRate, termYears, isIO),
        note: 'Best if holding the property long-term.'
      },
      {
        rate: midRate,
        pointsLabel: 'Mid cost',
        pointsRange: ((profile.pointsLow + profile.pointsHigh) / 2).toFixed(2),
        payment: piMid,
        note: 'The most common investor structure.'
      },
      {
        rate: highRate,
        pointsLabel: 'Lower cost',
        pointsRange: profile.pointsLow.toFixed(2) + ' or rebate',
        payment: calcMonthlyPayment(loanForCalc, highRate, termYears, isIO),
        note: 'Better if you plan a short-term exit.'
      }
    ];

    return {
      profile,
      profileExact: lookup.exact,
      advisorReview: reasons.length > 0,
      advisorReasons: reasons,
      ltvPct,
      loanForCalc,
      piMid,
      pitiaMid,
      dscr: finalDscr,
      strength,
      midRate, lowRate, highRate,
      pointsLow: profile.pointsLow,
      pointsHigh: profile.pointsHigh,
      lenderFee: { low: profile.feeLow, high: profile.feeHigh },
      grid,
      breakdown,
      suggested: suggestStructure(inputs, { ltvPct, dscr: finalDscr, midRate, profile, advisorReasons: reasons })
    };
  }

  function labelDscrStrength(dscr) {
    if (!dscr || dscr <= 0) return { label: 'Enter your numbers', tone: 'neutral' };
    if (dscr >= 1.25) return { label: 'Strong deal', tone: 'strong' };
    if (dscr >= 1.10) return { label: 'Solid deal', tone: 'solid' };
    if (dscr >= 1.00) return { label: 'Tight but workable', tone: 'tight' };
    if (dscr >= 0.75) return { label: 'Sub-1.0 — likely no-ratio', tone: 'weak' };
    return { label: 'Negative DSCR', tone: 'weak' };
  }

  function suggestStructure(inputs, ctx) {
    const lines = [];
    if (ctx.advisorReasons && ctx.advisorReasons.length) {
      lines.push('Heads up: ' + ctx.advisorReasons.join('; ') + '. An advisor will review this scenario.');
    }
    if (ctx.ltvPct > 80) {
      lines.push('Above 80% LTV is a tight box for investor loans. Lowering to 75% usually opens better tiers.');
    } else if (ctx.ltvPct > 75) {
      lines.push('Above 75% LTV adds pricing hits on most investor programs. 75% is the common sweet spot.');
    }
    if (inputs.program === 'dscr' && ctx.dscr > 0 && ctx.dscr < 1.00) {
      lines.push('DSCR under 1.00 will likely route to no-ratio. Same down-payment story, slightly different rate band.');
    } else if (inputs.program === 'dscr' && ctx.dscr >= 1.25) {
      lines.push('A 1.25+ DSCR with a 5-year prepay generally unlocks the program\'s best pricing.');
    }
    if (inputs.prepay === 'none' && (inputs.program === 'dscr' || inputs.program === 'noRatio')) {
      lines.push('A no-prepay structure typically adds half a point or more. Even 1 year improves the rate materially.');
    }
    if (inputs.interestOnly === 'yes') {
      lines.push('IO lowers the monthly payment but adds about 0.250% to the rate.');
    }
    if (inputs.propertyType === 'str') {
      lines.push('Short-term rental adds to pricing on most programs. Some lenders cap LTV on STR.');
    }
    if (inputs.loanPurpose === 'cashout') {
      lines.push('Cash-out adds a small pricing hit on top of the rate-and-term band.');
    }
    if (lines.length === 0) {
      lines.push('This scenario looks clean for the program you selected. Bolt can pull lender-specific quotes when you are ready.');
    }
    return lines;
  }

  // ===== Bolt summary text ============================================

  /**
   * Build a clean text summary for window.openBolt(text).
   * Format chosen so a human or LLM agent can parse it at a glance.
   */
  function buildBoltSummary(inputs, result) {
    const v = parseNum(inputs.purchasePrice);
    const l = parseNum(inputs.loanAmount);
    const r = parseNum(inputs.monthlyRent);

    const programLabel = result && result.profile ? result.profile.displayName : (inputs.program || 'unknown program');

    const parts = [];
    parts.push('Pricing scenario: ' + programLabel);
    if (inputs.state) parts.push(inputs.state);
    if (inputs.propertyType) parts.push(humanPropertyType(inputs.propertyType));
    if (v) parts.push(fmtUsd(v) + ' value');
    if (l) parts.push(fmtUsd(l) + ' loan');
    if (result && result.ltvPct) parts.push(result.ltvPct.toFixed(0) + '% LTV');
    if (inputs.creditScore) parts.push(inputs.creditScore + ' FICO');
    if (r) parts.push(fmtUsd(r) + ' rent');
    if (result && result.dscr) parts.push('DSCR ' + result.dscr.toFixed(2));
    if (result && result.lowRate != null && result.highRate != null) {
      parts.push('est rate ' + result.lowRate.toFixed(3) + '–' + result.highRate.toFixed(3) + '%');
    }
    if (result && result.pointsLow != null && result.pointsHigh != null) {
      parts.push('points ' + result.pointsLow.toFixed(2) + '–' + result.pointsHigh.toFixed(2));
    }
    if (inputs.lockPeriod) parts.push(inputs.lockPeriod + '-day lock');
    if (inputs.prepay) parts.push('prepay: ' + inputs.prepay);
    if (inputs.interestOnly === 'yes') parts.push('IO');

    let suffix = '';
    if (result && result.advisorReview) {
      suffix = '. ADVISOR REVIEW REQUIRED — ' + (result.advisorReasons || []).join('; ');
    } else {
      suffix = '. Borrower wants a real quote.';
    }
    return parts.join(', ') + suffix;
  }

  function humanPropertyType(id) {
    const map = {
      'sfr': 'SFR', 'condo': 'condo', '2-4': '2-4 unit',
      'multi-5-8': 'multi 5-8', 'str': 'STR', 'condotel': 'condotel', 'mfg': 'manufactured'
    };
    return map[id] || id;
  }

  // ===== Bolt integration =============================================

  function openBoltWithSummary(text) {
    try {
      if (typeof window.openBolt === 'function') {
        window.openBolt(text);
        return true;
      }
    } catch (_) { /* fallthrough */ }
    const contact = document.getElementById('contact') || document.querySelector('[data-rh-contact]');
    if (contact) {
      contact.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
    window.location.href = '/#contact';
    return true;
  }

  // ===== Form rendering ===============================================

  function buildSelect(name, options, currentValue) {
    return '<select id="rh-' + name + '" name="' + name + '" data-pricer>'
      + options.map(function (o) {
        const v = (typeof o === 'string') ? o : o.value;
        const l = (typeof o === 'string') ? o : o.label;
        const sel = (currentValue === v) ? ' selected' : '';
        return '<option value="' + escapeHtml(v) + '"' + sel + '>' + escapeHtml(l) + '</option>';
      }).join('') + '</select>';
  }

  function renderInputs(cfg) {
    const programOpts  = uniqueProgramOptions(cfg);
    const purposeOpts  = [
      { value: 'purchase', label: 'Purchase' },
      { value: 'rt-refi',  label: 'Rate-term refi' },
      { value: 'cashout',  label: 'Cash-out refi' },
      { value: 'hm-exit',  label: 'Hard money exit' }
    ];
    const propTypeOpts = [
      { value: 'sfr',       label: 'Single-family' },
      { value: 'condo',     label: 'Warrantable condo' },
      { value: '2-4',       label: '2-4 unit' },
      { value: 'multi-5-8', label: 'Multi 5-8 unit' },
      { value: 'str',       label: 'Short-term rental' },
      { value: 'condotel',  label: 'Condotel' },
      { value: 'mfg',       label: 'Manufactured' }
    ];
    const creditOpts = ((cfg.adjustments && cfg.adjustments.creditScore) || []).map(b => ({ value: b.match, label: b.label }));
    const lockOpts   = ((cfg.adjustments && cfg.adjustments.lockPeriod) || []).map(b => ({ value: b.match, label: b.label }));
    const prepayOpts = ((cfg.adjustments && cfg.adjustments.prepay) || []).map(b => ({ value: b.match, label: b.label }));
    const ioOpts     = ((cfg.adjustments && cfg.adjustments.interestOnly) || []).map(b => ({ value: b.match, label: b.label }));
    // Build state list from band membership (alphabetical).
    const stateBands = (cfg.adjustments && cfg.adjustments.state && cfg.adjustments.state.bands) || {};
    const allStates = []
      .concat(stateBands.low ? stateBands.low.states : [])
      .concat(stateBands.mid ? stateBands.mid.states : [])
      .concat(stateBands.high ? stateBands.high.states : []);
    const stateOpts = [...new Set(allStates)].sort();

    return '<div class="rh-form">'
      + field('Loan Purpose',   buildSelect('loanPurpose',  purposeOpts,  'purchase'))
      + field('Program',        buildSelect('program',      programOpts,  programOpts[0] ? programOpts[0].value : 'dscr'))
      + field('Property Type',  buildSelect('propertyType', propTypeOpts, 'sfr'))
      + field('State',          buildSelect('state',        stateOpts,    stateOpts.indexOf('CA') !== -1 ? 'CA' : (stateOpts[0] || '')))
      + field('Credit Score',   buildSelect('creditScore',  creditOpts,   '740-779'))
      + numField('Purchase Price / Value', 'purchasePrice', '400000')
      + numField('Loan Amount',            'loanAmount',    '300000')
      + numField('Monthly Rent',           'monthlyRent',   '2800')
      + numField('Taxes (monthly)',        'taxesMonthly',  '320')
      + numField('Insurance (monthly)',    'insuranceMonthly','110')
      + numField('HOA (monthly)',          'hoaMonthly',    '0')
      + field('Lock Period',     buildSelect('lockPeriod',     lockOpts,   '30'))
      + field('Prepay Option',   buildSelect('prepay',         prepayOpts, '5-yr'))
      + field('Interest-Only',   buildSelect('interestOnly',   ioOpts,     'no'))
    + '</div>';

    function field(label, control) {
      return '<label class="rh-field"><span class="rh-field__label">' + escapeHtml(label) + '</span>' + control + '</label>';
    }
    function numField(label, name, defaultVal) {
      return '<label class="rh-field"><span class="rh-field__label">' + escapeHtml(label) + '</span>'
        + '<input type="text" inputmode="numeric" id="rh-' + name + '" name="' + name + '" data-pricer value="' + defaultVal + '" /></label>';
    }
  }

  function readInputs(form) {
    const get = (name) => (form.elements[name] ? form.elements[name].value : '');
    return {
      loanPurpose:   get('loanPurpose'),
      program:       get('program'),
      propertyType:  get('propertyType'),
      state:         get('state'),
      creditScore:   get('creditScore'),
      purchasePrice: get('purchasePrice'),
      loanAmount:    get('loanAmount'),
      monthlyRent:   get('monthlyRent'),
      taxesMonthly:  get('taxesMonthly'),
      insuranceMonthly: get('insuranceMonthly'),
      hoaMonthly:    get('hoaMonthly'),
      lockPeriod:    get('lockPeriod'),
      prepay:        get('prepay'),
      interestOnly:  get('interestOnly')
    };
  }

  // ===== Output rendering =============================================

  function renderOutputs(cfg, result, inputs, host) {
    if (!result) {
      host.innerHTML = '<p class="rh-out-empty">Pick a program and enter a scenario.</p>';
      return;
    }

    // No-profile path (program has zero active profiles).
    if (!result.profile) {
      host.innerHTML = ''
        + '<div class="rh-out-head">'
        +   '<div class="rh-eyebrow">Scenario Pricing Snapshot</div>'
        +   '<h3 class="rh-out-program">Advisor review required</h3>'
        +   '<p class="rh-out-blurb">' + escapeHtml(cfg.compliance && cfg.compliance.advisorReviewMessage || 'This scenario sits outside our standard pricing brackets.') + '</p>'
        + '</div>'
        + '<div class="rh-out-cta">'
        +   '<button type="button" class="rh-btn rh-btn--primary rh-btn--block" id="rh-out-cta-btn">'
        +     'Send This Scenario to Rate Hero <span class="rh-bolt" aria-hidden="true">&#9889;</span>'
        +   '</button>'
        +   '<p class="rh-out-cta-sub">Bolt routes the scenario to a real human review.</p>'
        + '</div>'
        + '<div class="rh-compliance" role="note"><strong>Important.</strong> '
        + escapeHtml(cfg.compliance && cfg.compliance.disclaimer || '') + '</div>';
      const cta = document.getElementById('rh-out-cta-btn');
      if (cta) cta.addEventListener('click', () => openBoltWithSummary(buildBoltSummary(inputs, result)));
      return;
    }

    const grid = result.grid.map(function (row) {
      return '<tr>'
        + '<td class="rh-grid__rate">' + fmtPct(row.rate) + '</td>'
        + '<td><span class="rh-tag">' + row.pointsLabel + '</span><div class="rh-grid__pts">' + row.pointsRange + ' pts</div></td>'
        + '<td class="rh-grid__pmt">' + fmtUsd(row.payment) + '/mo</td>'
        + '<td class="rh-grid__note">' + escapeHtml(row.note) + '</td>'
        + '</tr>';
    }).join('');

    const suggested = result.suggested.map(s => '<li>' + escapeHtml(s) + '</li>').join('');

    const costLow  = result.loanForCalc * result.pointsLow  / 100;
    const costHigh = result.loanForCalc * result.pointsHigh / 100;
    const midPts   = (result.pointsLow + result.pointsHigh) / 2;
    const costMid  = result.loanForCalc * midPts / 100;

    const advisorBadge = result.advisorReview
      ? '<div class="rh-advisor-badge" title="' + escapeHtml((result.advisorReasons || []).join('; ')) + '">'
        + '<strong>Advisor review</strong> — ' + escapeHtml((result.advisorReasons || []).slice(0, 2).join('; '))
        + '</div>'
      : '';

    host.innerHTML = ''
      + '<div class="rh-out-head">'
      +   '<div class="rh-eyebrow">Scenario Pricing Snapshot</div>'
      +   '<h3 class="rh-out-program">' + escapeHtml(result.profile.displayName) + '</h3>'
      +   (result.profile.notes ? '<p class="rh-out-blurb">' + escapeHtml(result.profile.notes) + '</p>' : '')
      +   advisorBadge
      + '</div>'

      + '<div class="rh-out-stack">'
      +   row('LTV',                  fmtPct(result.ltvPct, 1),                                 'val')
      +   row('Estimated P&amp;I',    fmtUsd(result.piMid),                                     'val')
      +   row('Estimated PITIA',      fmtUsd(result.pitiaMid),                                  'val')
      +   row('Estimated DSCR',       fmtRatio(result.dscr),                                    'val val--ratio',
            '<span class="rh-strength" data-tone="' + result.strength.tone + '">' + escapeHtml(result.strength.label) + '</span>')
      +   row('Estimated rate range', fmtPct(result.lowRate, 3) + ' &ndash; ' + fmtPct(result.highRate, 3), 'val val--rate')
      +   '<div class="rh-out-foot">' + escapeHtml(cfg.compliance.rateRangeFootnote) + '</div>'
      +   row('Estimated cost / points',
            fmtPoints(result.pointsLow, result.pointsHigh) + ' pts <span class="rh-out-aux">&asymp; ' + fmtUsd(costLow) + ' &ndash; ' + fmtUsd(costHigh) + '</span>',
            'val')
      +   row('Approx. total upfront pricing cost',
            '&asymp; ' + fmtUsd(costMid) + ' <span class="rh-out-aux">at ' + midPts.toFixed(2) + ' pts</span>',
            'val')
      +   '<div class="rh-out-foot">' + escapeHtml(cfg.compliance.upfrontCostNote) + '</div>'
      +   row('Estimated lender/admin fee', fmtUsd(result.lenderFee.low) + ' &ndash; ' + fmtUsd(result.lenderFee.high), 'val')
      + '</div>'

      + '<div class="rh-out-grid">'
      +   '<div class="rh-eyebrow">Rate / Cost trade-off</div>'
      +   '<table class="rh-grid">'
      +     '<thead><tr><th>Rate</th><th>Points / cost</th><th>Est. payment</th><th>Notes</th></tr></thead>'
      +     '<tbody>' + grid + '</tbody>'
      +   '</table>'
      +   '<div class="rh-grid-note">' + escapeHtml(cfg.compliance.rateGridDisclaimer) + '</div>'
      + '</div>'

      + '<div class="rh-out-suggested">'
      +   '<div class="rh-eyebrow">Suggested Structure</div>'
      +   '<ul class="rh-suggested-list">' + suggested + '</ul>'
      + '</div>'

      + '<div class="rh-out-cta">'
      +   '<button type="button" class="rh-btn rh-btn--primary rh-btn--block" id="rh-out-cta-btn">'
      +     'Send This Scenario to Rate Hero '
      +     '<span class="rh-bolt" aria-hidden="true">&#9889;</span>'
      +   '</button>'
      +   '<p class="rh-out-cta-sub">Bolt routes the scenario to a real human review. No commitment.</p>'
      + '</div>'

      + '<div class="rh-compliance" role="note">'
      +   '<strong>Important.</strong> ' + escapeHtml(cfg.compliance.disclaimer)
      + '</div>';

    const cta = document.getElementById('rh-out-cta-btn');
    if (cta) cta.addEventListener('click', () => openBoltWithSummary(buildBoltSummary(inputs, result)));

    function row(label, value, valClass, extra) {
      return '<div class="rh-out-row">'
        + '<span class="rh-out-label">' + label + '</span>'
        + '<span class="rh-out-' + valClass + '">' + value + (extra || '') + '</span>'
        + '</div>';
    }
  }

  // ===== Adjustments cards (read from cfg.adjustments) ================

  function renderAdjustments(cfg, host) {
    const sections = [
      { key: 'creditScore',  label: 'Credit score',  explain: 'Lower scores increase rate or points. 740 is the common breakpoint.' },
      { key: 'ltv',          label: 'LTV / down payment', explain: 'Higher LTV usually increases cost. 75% is the sweet spot for most investor programs.' },
      { key: 'dscr',         label: 'DSCR ratio',    explain: 'Stronger DSCR typically improves pricing. Sub-1.00 may push to no-ratio.' },
      { key: 'propertyType', label: 'Property type', explain: 'SFR is the cheapest. Condos, multi-units, and STRs add to pricing.' },
      { key: 'loanAmount',   label: 'Loan size',     explain: 'Very small and very large balances often carry add-ons.' },
      { key: 'state',        label: 'State',         explain: 'Some states price slightly higher because of foreclosure timelines.' },
      { key: 'lockPeriod',   label: 'Lock period',   explain: '30-day is standard. Longer locks cost slightly more.' },
      { key: 'prepay',       label: 'Prepayment penalty', explain: 'Longer prepay buys down the rate. No-prepay loans cost more.' },
      { key: 'interestOnly', label: 'Interest-only', explain: 'IO lowers payment but adds to the rate.' }
    ];

    const html = sections.map(function (s) {
      const data = cfg.adjustments && cfg.adjustments[s.key];
      let listHtml = '';
      if (s.key === 'state' && data && data.bands) {
        ['low','mid','high'].forEach(function (k) {
          const b = data.bands[k];
          if (!b || b.active === false) return;
          listHtml += '<li><span class="rh-adj__b">' + escapeHtml(b.label) + '</span>'
            + '<span class="rh-adj__rest">' + (b.states || []).join(', ') + '</span></li>';
        });
      } else if (Array.isArray(data)) {
        listHtml = data.filter(b => b && b.active !== false).map(function (b) {
          const sign = b.rateAdj > 0 ? '+' : '';
          const adjStr = b.rateAdj === 0 ? 'baseline' : sign + b.rateAdj.toFixed(3) + '%';
          return '<li><span class="rh-adj__b">' + escapeHtml(b.label) + '</span>'
            + '<span class="rh-adj__rest">' + adjStr + '</span></li>';
        }).join('');
      }

      return '<article class="rh-adj">'
        + '<h4 class="rh-adj__title">' + escapeHtml(s.label) + '</h4>'
        + '<p class="rh-adj__explain">' + escapeHtml(s.explain) + '</p>'
        + '<ul class="rh-adj__list">' + listHtml + '</ul>'
      + '</article>';
    }).join('');
    host.innerHTML = html;
  }

  function renderFees(cfg, host) {
    const fees = (cfg.fees || []).filter(f => f && f.active !== false);
    const rows = fees.map(function (f) {
      const range = (f.low === 0 && f.high === 0) ? 'Varies' :
        (fmtUsd(f.low) + ' &ndash; ' + fmtUsd(f.high));
      return '<tr>'
        + '<td class="rh-fees__name">' + escapeHtml(f.name) + '</td>'
        + '<td class="rh-fees__range">' + range + '</td>'
        + '<td class="rh-fees__note">' + escapeHtml(f.notes || '') + '</td>'
      + '</tr>';
    }).join('');
    host.innerHTML = ''
      + '<table class="rh-fees">'
      + '<thead><tr><th>Cost</th><th>Estimated range</th><th>Notes</th></tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table>';
  }

  // ===== Active config: live fetch with static fallback ===============

  let ACTIVE_CONFIG = null;

  async function loadConfig() {
    // Try the live KV-backed endpoint first.
    try {
      const res = await fetch('/api/pricing/approved', { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const cfg = await res.json();
        if (cfg && Array.isArray(cfg.profiles) && cfg.profiles.length) {
          return { config: cfg, source: 'live' };
        }
      }
    } catch (_) { /* fall through to fallback */ }

    if (window.RATE_HERO_FALLBACK_CONFIG) {
      return { config: window.RATE_HERO_FALLBACK_CONFIG, source: 'fallback' };
    }
    return { config: null, source: 'none' };
  }

  function showFallbackBanner() {
    const banner = document.getElementById('rh-fallback-banner');
    if (banner) banner.style.display = 'block';
  }

  // ===== Bootstrap ====================================================

  async function init() {
    const { config, source } = await loadConfig();
    if (!config) {
      const inputsHost = document.getElementById('rh-pricer-inputs');
      const outputsHost = document.getElementById('rh-pricer-outputs');
      if (inputsHost) inputsHost.innerHTML = '<p class="rh-out-empty">Pricing temporarily unavailable. Please try again shortly.</p>';
      if (outputsHost) outputsHost.innerHTML = '';
      return;
    }
    ACTIVE_CONFIG = config;
    if (source === 'fallback') showFallbackBanner();

    // Last-updated stamp.
    const stamp = document.getElementById('rh-last-updated');
    if (stamp && config.lastUpdated) {
      stamp.textContent = (config.lastUpdated || '').slice(0, 10);
    }

    const inputsHost = document.getElementById('rh-pricer-inputs');
    if (inputsHost) inputsHost.innerHTML = renderInputs(config);

    const adjHost = document.getElementById('rh-adjustments');
    if (adjHost) renderAdjustments(config, adjHost);
    const feesHost = document.getElementById('rh-fees');
    if (feesHost) renderFees(config, feesHost);

    const form = document.getElementById('rh-pricer-form');
    const outputsHost = document.getElementById('rh-pricer-outputs');
    function recompute() {
      if (!form || !outputsHost) return;
      const inputs = readInputs(form);
      const result = priceScenario(ACTIVE_CONFIG, inputs);
      renderOutputs(ACTIVE_CONFIG, result, inputs, outputsHost);
    }
    if (form) {
      form.addEventListener('input', recompute);
      form.addEventListener('change', recompute);
    }
    recompute();

    document.querySelectorAll('[data-bolt-cta]').forEach(function (el) {
      el.addEventListener('click', function () {
        const inputs = form ? readInputs(form) : {};
        const result = ACTIVE_CONFIG ? priceScenario(ACTIVE_CONFIG, inputs) : null;
        openBoltWithSummary(buildBoltSummary(inputs, result));
      });
    });

    if (/[?&]test=1\b/.test(window.location.search)) runTests();
  }

  // ===== Inline tests =================================================

  function runTests() {
    const cfg = ACTIVE_CONFIG || window.RATE_HERO_FALLBACK_CONFIG;
    const results = [];
    function assert(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail || '' }); }
    function approx(a, b, tol) { return Math.abs(a - b) <= (tol || 0.01); }

    // Math
    assert('P&I 200k @ 7.625%/30y', approx(calcMonthlyPayment(200000, 7.625, 30, false), 1415.55, 1.0));
    assert('IO 300k @ 8% = $2000/mo', approx(calcMonthlyPayment(300000, 8.0, 30, true), 2000, 0.1));

    // Strength
    assert('DSCR 1.30 -> strong', labelDscrStrength(1.30).tone === 'strong');
    assert('DSCR 1.05 -> tight',  labelDscrStrength(1.05).tone === 'tight');
    assert('DSCR 0.90 -> weak',   labelDscrStrength(0.90).tone === 'weak');

    // Profile lookup
    const dscrPurchase = findProfile(cfg, 'dscr', 'purchase');
    assert('DSCR Purchase exact match', dscrPurchase.exact === true && dscrPurchase.profile.id === 'dscr-purchase');

    const dscrCashout = findProfile(cfg, 'dscr', 'cashout');
    assert('DSCR Cash-Out exact match', dscrCashout.exact === true && dscrCashout.profile.id === 'dscr-cashout');

    const helocAny = findProfile(cfg, 'heloc', 'cashout');
    assert('HELOC any-purpose match',  !helocAny.exact && helocAny.profile && helocAny.profile.id === 'heloc');

    const noMatch = findProfile(cfg, 'fakeprogram', 'purchase');
    assert('Unknown program returns null', noMatch.profile === null);

    // FICO floor parser
    assert('ficoFloor("700-719") === 700', ficoFloor('700-719') === 700);
    assert('ficoFloor("780+") === 780',    ficoFloor('780+') === 780);

    // End-to-end scenarios
    const r1 = priceScenario(cfg, {
      loanPurpose: 'purchase', program: 'dscr', propertyType: 'sfr', state: 'TX',
      creditScore: '740-779', purchasePrice: '400000', loanAmount: '300000',
      monthlyRent: '2800', taxesMonthly: '320', insuranceMonthly: '110', hoaMonthly: '0',
      lockPeriod: '30', prepay: '5-yr', interestOnly: 'no'
    });
    assert('DSCR Purchase clean scenario priced', !!r1.profile && r1.profile.id === 'dscr-purchase');
    assert('Mid rate within 5–11%', r1.midRate > 5 && r1.midRate < 11);
    assert('Grid has 3 rows', r1.grid.length === 3);
    assert('Clean scenario no advisor flag', r1.advisorReview === false);

    // Out-of-box scenario should set advisorReview true
    const r2 = priceScenario(cfg, {
      loanPurpose: 'purchase', program: 'dscr', propertyType: 'sfr', state: 'CA',
      creditScore: '620-639', purchasePrice: '400000', loanAmount: '360000', // 90% LTV
      monthlyRent: '1500', taxesMonthly: '320', insuranceMonthly: '110', hoaMonthly: '0',
      lockPeriod: '30', prepay: '5-yr', interestOnly: 'no'
    });
    assert('Out-of-box scenario flagged for advisor', r2.advisorReview === true);
    assert('Advisor reasons populated', r2.advisorReasons.length > 0);

    // Bolt summary
    const summary = buildBoltSummary({
      program: 'dscr', loanPurpose: 'cashout', state: 'CA', propertyType: 'sfr',
      purchasePrice: 500000, loanAmount: 375000, monthlyRent: 3800, creditScore: '720-739',
      lockPeriod: '30', prepay: '5-yr', interestOnly: 'no'
    }, priceScenario(cfg, {
      program: 'dscr', loanPurpose: 'cashout', state: 'CA', propertyType: 'sfr',
      purchasePrice: '500000', loanAmount: '375000', monthlyRent: '3800', creditScore: '720-739',
      taxesMonthly: '500', insuranceMonthly: '150', hoaMonthly: '0',
      lockPeriod: '30', prepay: '5-yr', interestOnly: 'no'
    }));
    assert('Bolt summary mentions program', summary.indexOf('DSCR Cash-Out') !== -1);
    assert('Bolt summary mentions state',   summary.indexOf('CA') !== -1);
    assert('Bolt summary mentions rate',    summary.indexOf('est rate') !== -1);

    const passed = results.filter(x => x.pass).length;
    const failed = results.length - passed;
    console.group('%cRate Hero — pricer tests', 'font-weight:bold;color:#3B82F6');
    results.forEach(x => {
      const tag = x.pass ? '%c✓' : '%c✗';
      const color = x.pass ? 'color:#22c55e' : 'color:#ef4444';
      console.log(tag + ' ' + x.name + (x.detail ? ' (' + x.detail + ')' : ''), color);
    });
    console.log('%c' + passed + ' passed, ' + failed + ' failed', 'font-weight:bold');
    console.groupEnd();
    return { passed, failed, results };
  }

  // Public surface for tests / external use.
  window.RateHeroPricer = {
    calcMonthlyPayment, calcDSCR,
    priceScenario, findProfile, ficoFloor,
    buildBoltSummary,
    runTests
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
