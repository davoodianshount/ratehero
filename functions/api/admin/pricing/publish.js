// functions/api/admin/pricing/publish.js
// ADMIN, behind Cloudflare Access.
// Path: POST /api/admin/pricing/publish
//
// Promotes draft to approved.
// Steps:
//   1. Read draft (must exist and pass validation).
//   2. Archive the currently-approved config (if any) under pricing:archive:{ts}.
//   3. Save current approved as pricing:last_approved (rollback target).
//   4. Stamp draft with publishedAt + publisher email; write to pricing:approved.
//
// Cloudflare KV is eventually consistent across regions (usually <60s).
// We accept that — public /rates already has a 60s edge cache and a static fallback.

import { validateConfig, jsonResponse, readJSON, writeJSON, archiveKey } from '../../../_lib/pricing.js';

export async function onRequestPost({ request, env }) {
  if (!env.PRICING_KV) return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);

  const draft = await readJSON(env.PRICING_KV, 'pricing:draft');
  if (!draft) {
    return jsonResponse({ error: 'No draft to publish. Save a draft first.' }, 400);
  }

  const errors = validateConfig(draft);
  if (errors.length) {
    return jsonResponse({ error: 'Draft is invalid; cannot publish.', errors }, 400);
  }

  const previousApproved = await readJSON(env.PRICING_KV, 'pricing:approved');
  if (previousApproved) {
    // Archive previous, and stash as last_approved for one-click revert.
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
