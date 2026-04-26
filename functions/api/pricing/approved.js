// functions/api/pricing/approved.js
// PUBLIC, unauthenticated. Cloudflare Access should NOT cover this path.
// Path: GET /api/pricing/approved
//
// Returns the currently-approved pricing config to the public /rates page.
// If KV has no approved value yet (fresh deploy), returns 404 so the public
// page can fall back to its embedded static config and show the warning banner.

import { jsonResponse } from '../../_lib/pricing.js';

export async function onRequestGet({ env }) {
  if (!env.PRICING_KV) {
    return jsonResponse({ error: 'PRICING_KV binding missing' }, 500);
  }
  try {
    const raw = await env.PRICING_KV.get('pricing:approved');
    if (!raw) {
      return jsonResponse({ error: 'No approved pricing config yet.' }, 404);
    }
    // 60s edge cache to soften traffic spikes; admin publish invalidates by overwriting KV.
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
