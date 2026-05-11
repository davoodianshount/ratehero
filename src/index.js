// src/index.js
// Entry for the ratehero Workers Static Assets project.
// Routes API requests to inline handlers, falls through to static assets.

async function handlePublicApproved(env) {
  if (!env.PRICING_KV) return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);
  try {
    const raw = await env.PRICING_KV.get('pricing:approved');
    if (!raw) return jsonResponse({ error: 'No approved pricing config yet.' }, 404);
    return new Response(raw, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch (err) {
    return jsonResponse({ error: 'KV read failed', detail: String(err) }, 500);
  }
}

async function handleAdminDraftGet(env) {
  if (!env.PRICING_KV) return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);
  const draft = await readJSON(env.PRICING_KV, 'pricing:draft');
  if (draft) return jsonResponse({ source: 'draft', config: draft, warnings: softWarnings(draft) });
  const approved = await readJSON(env.PRICING_KV, 'pricing:approved');
  return jsonResponse({
    source: approved ? 'approved-as-starter' : 'empty',
    config: approved,
    warnings: approved ? softWarnings(approved) : []
  });
}

async function handleAdminDraftPost(request, env) {
  if (!env.PRICING_KV) return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);
  let body;
  try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
  const errors = validateConfig(body);
  if (errors.length) return jsonResponse({ error: 'Validation failed', errors }, 400);
  body.lastUpdated = new Date().toISOString();
  const reviewer = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (reviewer) body.lastReviewedBy = reviewer;
  await writeJSON(env.PRICING_KV, 'pricing:draft', body);
  return jsonResponse({
    ok: true,
    lastUpdated: body.lastUpdated,
    lastReviewedBy: body.lastReviewedBy || null,
    warnings: softWarnings(body)
  });
}

async function handleAdminApproved(env) {
  if (!env.PRICING_KV) return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);
  const approved = await readJSON(env.PRICING_KV, 'pricing:approved');
  const lastApproved = await readJSON(env.PRICING_KV, 'pricing:last_approved');
  let archives = [];
  try {
    const listing = await env.PRICING_KV.list({ prefix: 'pricing:archive:' });
    archives = (listing.keys || []).map(k => ({ key: k.name, timestamp: k.name.replace('pricing:archive:', '') }));
    archives.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (_) { archives = []; }
  return jsonResponse({
    approved: approved || null,
    canRevert: !!lastApproved,
    lastApprovedTimestamp: lastApproved && lastApproved.publishedAt ? lastApproved.publishedAt : null,
    archives
  });
}

async function handleAdminPublish(request, env) {
  if (!env.PRICING_KV) return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);
  const draft = await readJSON(env.PRICING_KV, 'pricing:draft');
  if (!draft) return jsonResponse({ error: 'No draft to publish. Save a draft first.' }, 400);
  const errors = validateConfig(draft);
  if (errors.length) return jsonResponse({ error: 'Draft is invalid; cannot publish.', errors }, 400);
  const previousApproved = await readJSON(env.PRICING_KV, 'pricing:approved');
  if (previousApproved) {
    await writeJSON(env.PRICING_KV, archiveKey(), previousApproved);
    await writeJSON(env.PRICING_KV, 'pricing:last_approved', previousApproved);
  }
  draft.publishedAt = new Date().toISOString();
  const publisher = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (publisher) draft.publishedBy = publisher;
  await writeJSON(env.PRICING_KV, 'pricing:approved', draft);
  return jsonResponse({
    ok: true,
    publishedAt: draft.publishedAt,
    publishedBy: draft.publishedBy || null,
    archivedPrevious: !!previousApproved
  });
}

async function handleAdminRevert(request, env) {
  if (!env.PRICING_KV) return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);
  const lastApproved = await readJSON(env.PRICING_KV, 'pricing:last_approved');
  if (!lastApproved) return jsonResponse({ error: 'No previous approved version to revert to.' }, 400);
  const currentApproved = await readJSON(env.PRICING_KV, 'pricing:approved');
  if (currentApproved) {
    await writeJSON(env.PRICING_KV, archiveKey('revert'), currentApproved);
  }
  const restored = Object.assign({}, lastApproved);
  restored.revertedAt = new Date().toISOString();
  const reverter = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (reverter) restored.revertedBy = reverter;
  await writeJSON(env.PRICING_KV, 'pricing:approved', restored);
  return jsonResponse({
    ok: true,
    revertedAt: restored.revertedAt,
    revertedBy: restored.revertedBy || null
  });
}

function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object') { errors.push('Config must be an object.'); return errors; }
  if (!Array.isArray(cfg.profiles)) errors.push('profiles must be an array.');
  else {
    cfg.profiles.forEach(function(p, i) {
      const ctx = 'profiles[' + i + ']';
      if (!p || typeof p !== 'object') { errors.push(ctx + ' must be an object.'); return; }
      if (typeof p.id !== 'string' || !p.id) errors.push(ctx + '.id required');
      if (typeof p.program !== 'string') errors.push(ctx + '.program required');
      if (typeof p.purpose !== 'string') errors.push(ctx + '.purpose required');
      if (typeof p.baseRate !== 'number' || p.baseRate < 0) errors.push(ctx + '.baseRate must be non-negative');
      if (typeof p.spreadLow !== 'number' || p.spreadLow < 0) errors.push(ctx + '.spreadLow must be non-negative');
      if (typeof p.spreadHigh !== 'number' || p.spreadHigh < 0) errors.push(ctx + '.spreadHigh must be non-negative');
      if (typeof p.pointsLow !== 'number') errors.push(ctx + '.pointsLow required');
      if (typeof p.pointsHigh !== 'number') errors.push(ctx + '.pointsHigh required');
      if (typeof p.feeLow !== 'number' || p.feeLow < 0) errors.push(ctx + '.feeLow must be non-negative');
      if (typeof p.feeHigh !== 'number' || p.feeHigh < 0) errors.push(ctx + '.feeHigh must be non-negative');
      if (typeof p.active !== 'boolean') errors.push(ctx + '.active must be boolean');
    });
    const ids = cfg.profiles.map(function(p){ return p && p.id; }).filter(Boolean);
    const dupes = ids.filter(function(id, i){ return ids.indexOf(id) !== i; });
    if (dupes.length) errors.push('Duplicate profile ids: ' + Array.from(new Set(dupes)).join(', '));
  }
  if (!cfg.adjustments || typeof cfg.adjustments !== 'object') errors.push('adjustments object required.');
  else {
    ['creditScore','ltv','dscr','propertyType','loanAmount','state','lockPeriod','prepay','interestOnly'].forEach(function(k){
      if (!(k in cfg.adjustments)) errors.push('adjustments.' + k + ' missing');
    });
  }
  if (!Array.isArray(cfg.fees)) errors.push('fees must be an array.');
  if (!cfg.compliance || typeof cfg.compliance !== 'object') errors.push('compliance object required.');
  else {
    ['disclaimer','rateRangeFootnote','upfrontCostNote','rateGridDisclaimer'].forEach(function(k){
      if (typeof cfg.compliance[k] !== 'string' || !cfg.compliance[k].trim()) {
        errors.push('compliance.' + k + ' required (non-empty string)');
      }
    });
  }
  return errors;
}

function softWarnings(cfg) {
  const warnings = [];
  if (!cfg || !Array.isArray(cfg.profiles)) return warnings;
  cfg.profiles.forEach(function(p) {
    if (!p || !p.active) return;
    const tag = p.id || '(unnamed)';
    if (typeof p.baseRate === 'number' && (p.baseRate < 4 || p.baseRate > 14)) {
      warnings.push(tag + ': baseRate ' + p.baseRate + '% looks unusual');
    }
    if (typeof p.maxLtv === 'number' && p.maxLtv > 90) {
      warnings.push(tag + ': maxLtv ' + p.maxLtv + '% above 90 - verify');
    }
    if (typeof p.minFico === 'number' && p.minFico < 600) {
      warnings.push(tag + ': minFico ' + p.minFico + ' below 600 - verify');
    }
    ['baseRate','spreadLow','spreadHigh','pointsLow','pointsHigh','feeLow','feeHigh','minFico','maxLtv']
      .forEach(function(k) {
        if (p[k] === undefined || p[k] === null || p[k] === '') {
          warnings.push(tag + ': ' + k + ' is missing');
        }
      });
  });
  return warnings;
}

function jsonResponse(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extraHeaders || {})
  });
}

async function readJSON(kv, key) {
  try { const raw = await kv.get(key); return raw ? JSON.parse(raw) : null; }
  catch (_) { return null; }
}

async function writeJSON(kv, key, value) { return kv.put(key, JSON.stringify(value)); }

function archiveKey(suffix) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return 'pricing:archive:' + ts + (suffix ? '-' + suffix : '');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === '/api/pricing/approved' && method === 'GET') {
      return handlePublicApproved(env);
    }
    if (path === '/api/admin/pricing/draft') {
      if (method === 'GET') return handleAdminDraftGet(env);
      if (method === 'POST') return handleAdminDraftPost(request, env);
      return new Response('Method not allowed', { status: 405 });
    }
    if (path === '/api/admin/pricing/approved' && method === 'GET') {
      return handleAdminApproved(env);
    }
    if (path === '/api/admin/pricing/publish' && method === 'POST') {
      return handleAdminPublish(request, env);
    }
    if (path === '/api/admin/pricing/revert' && method === 'POST') {
      return handleAdminRevert(request, env);
    }

    const cookie = request.headers.get('cookie') || '';
    const hasDesktopCookie = /(?:^|;\s*)rh_desktop=1/.test(cookie);
    const hasDesktopParam = url.searchParams.get('desktop') === '1';
    if (hasDesktopCookie || hasDesktopParam) {
      const response = await env.ASSETS.fetch(request);
      if (hasDesktopParam) {
        const r = new Response(response.body, response);
        r.headers.append('Set-Cookie', 'rh_desktop=1; Path=/; Max-Age=2592000; SameSite=Lax');
        return r;
      }
      return response;
    }
    return env.ASSETS.fetch(request);
  }
};