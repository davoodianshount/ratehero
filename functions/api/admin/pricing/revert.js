// functions/api/admin/pricing/revert.js
// ADMIN, behind Cloudflare Access.
// Path: POST /api/admin/pricing/revert
//
// One-shot rollback to the previous approved config.
// Steps:
//   1. Read pricing:last_approved (the version before the most recent publish).
//   2. Archive the currently-approved config under pricing:archive:{ts}-revert.
//   3. Write last_approved back to pricing:approved.
//
// Note: revert is only "one step back" — it restores the *previous* approved.
// Going further back means restoring from pricing:archive:{ts} (admin UI shows
// the archive list; a future endpoint can support arbitrary-archive restore).

import { jsonResponse, readJSON, writeJSON, archiveKey } from '../../../_lib/pricing.js';

export async function onRequestPost({ request, env }) {
  if (!env.PRICING_KV) return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);

  const lastApproved = await readJSON(env.PRICING_KV, 'pricing:last_approved');
  if (!lastApproved) {
    return jsonResponse({ error: 'No previous approved version to revert to.' }, 400);
  }

  const currentApproved = await readJSON(env.PRICING_KV, 'pricing:approved');
  if (currentApproved) {
    await writeJSON(env.PRICING_KV, archiveKey('revert'), currentApproved);
  }

  // Stamp the revert event onto the restored config without mutating the archive copy.
  const restored = { ...lastApproved };
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
