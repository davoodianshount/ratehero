// functions/api/admin/pricing/draft.js
// ADMIN, behind Cloudflare Access.
// Path: GET, POST /api/admin/pricing/draft
//
// GET  — returns current draft. If no draft exists yet, returns the approved
//        config as a starting point (or null if neither exists).
// POST — body is the full pricing config JSON. Validates shape, then writes
//        to KV under 'pricing:draft' and stamps lastUpdated.

import { validateConfig, softWarnings, jsonResponse, readJSON, writeJSON } from '../../../_lib/pricing.js';

export async function onRequestGet({ env }) {
  if (!env.PRICING_KV) return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);

  const draft = await readJSON(env.PRICING_KV, 'pricing:draft');
  if (draft) {
    return jsonResponse({
      source: 'draft',
      config: draft,
      warnings: softWarnings(draft)
    });
  }

  // No draft — use approved as the starting point so admin doesn't begin from blank.
  const approved = await readJSON(env.PRICING_KV, 'pricing:approved');
  return jsonResponse({
    source: approved ? 'approved-as-starter' : 'empty',
    config: approved,
    warnings: approved ? softWarnings(approved) : []
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.PRICING_KV) return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const errors = validateConfig(body);
  if (errors.length) {
    return jsonResponse({ error: 'Validation failed', errors }, 400);
  }

  body.lastUpdated = new Date().toISOString();
  // lastReviewedBy is set by the admin UI from the authenticated user header
  // (Cloudflare Access injects Cf-Access-Authenticated-User-Email).
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
