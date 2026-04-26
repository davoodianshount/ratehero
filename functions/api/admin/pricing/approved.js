// functions/api/admin/pricing/approved.js
// ADMIN, behind Cloudflare Access.
// Path: GET /api/admin/pricing/approved
//
// Returns the current approved pricing config plus an index of archived
// versions (for the rollback / history view in the admin UI).

import { jsonResponse, readJSON } from '../../../_lib/pricing.js';

export async function onRequestGet({ env }) {
  if (!env.PRICING_KV) return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);

  const approved = await readJSON(env.PRICING_KV, 'pricing:approved');
  const lastApproved = await readJSON(env.PRICING_KV, 'pricing:last_approved');

  // List archive entries. KV.list returns up to 1000 keys per call;
  // pricing archives are tiny so we don't paginate at this volume.
  let archives = [];
  try {
    const listing = await env.PRICING_KV.list({ prefix: 'pricing:archive:' });
    archives = (listing.keys || []).map(k => ({
      key: k.name,
      timestamp: k.name.replace('pricing:archive:', '')
    }));
    // Newest first.
    archives.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (_) {
    archives = [];
  }

  return jsonResponse({
    approved: approved || null,
    canRevert: !!lastApproved,
    lastApprovedTimestamp: lastApproved && lastApproved.publishedAt ? lastApproved.publishedAt : null,
    archives
  });
}
