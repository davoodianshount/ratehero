/**
 * Bolt — Cloudflare Worker
 * Proxies requests from the Bolt widget to the Anthropic API.
 *
 * Deploy:
 *   cd bolt-proxy
 *   wrangler secret put ANTHROPIC_API_KEY    # paste key when prompted
 *   wrangler deploy
 */

const ALLOWED_ORIGIN = 'https://goratehero.com';

const SYSTEM_PROMPT = `You are Bolt, an AI Mortgage Assistant for Rate Hero, a modern non-QM and DSCR mortgage lender. You help real estate investors, self-employed borrowers, homeowners, and first-time buyers understand their loan options.

Rate Hero specializes in:
- DSCR Loans: qualify on rental income, no tax returns required. Available up to 85% LTV on purchases for strong borrowers, 80% standard. Minimum DSCR ratio typically 1.0–1.25 depending on program.
- Non-QM Loans: bank statement, P&L, 1099, asset-based qualification
- Conventional / FHA / VA for W-2 borrowers
- HELOCs up to 90% LTV
- Short-Term Rental Loans (Airbnb/VRBO — AirDNA projections accepted)
- Foreign National Loans (no US credit or SSN required)
- Hard Money Exit / BRRRR refinances into 30-year DSCR — average 21-day close
- LLC and entity lending — investments stay off personal credit

Key facts:
- 21-day average close time
- No SSN or credit pull required to start
- Available in 30+ states
- $200M+ funded by leadership team
- BiggerPockets Featured Lender
- Phone: (747) 308-1635
- Website: goratehero.com

Keep answers concise (3–5 sentences), conversational, and helpful. Always end by offering to connect them with a loan strategist or start a 60-second qualification. Never give specific rate quotes — say rates depend on property type, credit, and loan structure, and offer a personalized quote. Be warm, direct, never pushy.`;

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Validate origin
    const origin = request.headers.get('Origin');
    if (origin !== ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const { messages } = await request.json();

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages,
        }),
      });

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        },
      });
    }
  },
};
