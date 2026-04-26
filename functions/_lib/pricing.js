// functions/_lib/pricing.js
// Shared utilities for the pricing admin API.
// Imported by Pages Functions in functions/api/admin/pricing/*.js

/**
 * Hard validation. Returns array of error strings (empty = valid).
 * Soft warnings (e.g. unusual rate ranges) are the admin UI's job, not the API's.
 */
export function validateConfig(cfg) {
  const errors = [];

  if (!cfg || typeof cfg !== 'object') {
    errors.push('Config must be an object.');
    return errors; // bail early, nothing else makes sense
  }

  // Profiles
  if (!Array.isArray(cfg.profiles)) {
    errors.push('profiles must be an array.');
  } else {
    cfg.profiles.forEach((p, i) => {
      const ctx = `profiles[${i}]`;
      if (!p || typeof p !== 'object') { errors.push(`${ctx} must be an object.`); return; }
      if (typeof p.id !== 'string' || !p.id) errors.push(`${ctx}.id required`);
      if (typeof p.program !== 'string') errors.push(`${ctx}.program required`);
      if (typeof p.purpose !== 'string') errors.push(`${ctx}.purpose required`);
      if (typeof p.baseRate !== 'number' || p.baseRate < 0) errors.push(`${ctx}.baseRate must be non-negative`);
      if (typeof p.spreadLow !== 'number' || p.spreadLow < 0) errors.push(`${ctx}.spreadLow must be non-negative`);
      if (typeof p.spreadHigh !== 'number' || p.spreadHigh < 0) errors.push(`${ctx}.spreadHigh must be non-negative`);
      if (typeof p.pointsLow !== 'number') errors.push(`${ctx}.pointsLow required (negative allowed for rebate)`);
      if (typeof p.pointsHigh !== 'number') errors.push(`${ctx}.pointsHigh required`);
      if (typeof p.feeLow !== 'number' || p.feeLow < 0) errors.push(`${ctx}.feeLow must be non-negative`);
      if (typeof p.feeHigh !== 'number' || p.feeHigh < 0) errors.push(`${ctx}.feeHigh must be non-negative`);
      if (typeof p.active !== 'boolean') errors.push(`${ctx}.active must be boolean`);
    });

    // Duplicate id check
    const ids = cfg.profiles.map(p => p && p.id).filter(Boolean);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) errors.push(`Duplicate profile ids: ${[...new Set(dupes)].join(', ')}`);
  }

  // Adjustments
  if (!cfg.adjustments || typeof cfg.adjustments !== 'object') {
    errors.push('adjustments object required.');
  } else {
    const required = ['creditScore','ltv','dscr','propertyType','loanAmount','state','lockPeriod','prepay','interestOnly'];
    required.forEach(k => {
      if (!(k in cfg.adjustments)) errors.push(`adjustments.${k} missing`);
    });
  }

  // Fees
  if (!Array.isArray(cfg.fees)) errors.push('fees must be an array.');

  // Compliance
  if (!cfg.compliance || typeof cfg.compliance !== 'object') {
    errors.push('compliance object required.');
  } else {
    ['disclaimer','rateRangeFootnote','upfrontCostNote','rateGridDisclaimer'].forEach(k => {
      if (typeof cfg.compliance[k] !== 'string' || !cfg.compliance[k].trim()) {
        errors.push(`compliance.${k} required (non-empty string)`);
      }
    });
  }

  return errors;
}

/**
 * Build a soft-warnings list for admin UI. Non-blocking.
 */
export function softWarnings(cfg) {
  const warnings = [];
  if (!cfg || !Array.isArray(cfg.profiles)) return warnings;

  cfg.profiles.forEach(p => {
    if (!p || !p.active) return;
    if (typeof p.baseRate === 'number' && (p.baseRate < 4 || p.baseRate > 14)) {
      warnings.push(`${p.id || '(unnamed)'}: baseRate ${p.baseRate}% looks unusual`);
    }
    if (typeof p.maxLtv === 'number' && p.maxLtv > 90) {
      warnings.push(`${p.id || '(unnamed)'}: maxLtv ${p.maxLtv}% above 90 — verify`);
    }
    if (typeof p.minFico === 'number' && p.minFico < 600) {
      warnings.push(`${p.id || '(unnamed)'}: minFico ${p.minFico} below 600 — verify`);
    }
    ['baseRate','spreadLow','spreadHigh','pointsLow','pointsHigh','feeLow','feeHigh','minFico','maxLtv']
      .forEach(k => {
        if (p[k] === undefined || p[k] === null || p[k] === '') {
          warnings.push(`${p.id || '(unnamed)'}: ${k} is missing`);
        }
      });
  });

  return warnings;
}

/**
 * Standard JSON response with CORS-safe headers.
 */
export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders }
  });
}

/**
 * Read a JSON value from KV. Returns null if missing or unparseable.
 */
export async function readJSON(kv, key) {
  try {
    const raw = await kv.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Write a JSON value to KV.
 */
export async function writeJSON(kv, key, value) {
  return kv.put(key, JSON.stringify(value));
}

/**
 * Build an archive key from the current ISO timestamp.
 * Colons replaced with dashes (Cloudflare KV keys handle dashes cleanly in lists).
 */
export function archiveKey(suffix = '') {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return 'pricing:archive:' + ts + (suffix ? '-' + suffix : '');
}

/**
 * Strip very large fields before returning to admin (future-proof against big notes blobs).
 * Currently a passthrough but kept here for future use.
 */
export function sanitizeForAdmin(cfg) {
  return cfg;
}
