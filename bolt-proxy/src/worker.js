/**
 * Bolt — Cloudflare Worker
 *
 * Responsibilities:
 *   1. Proxy chat messages from the Bolt widget to the Anthropic API.
 *   2. Read system prompt from KV (BOLT_CONFIG / system_prompt) with a
 *      sane default if unset.
 *   3. Expose a `submit_lead` tool so Claude can collect lead info and
 *      POST it to web3forms — same payload your funnel uses.
 *   4. Log every conversation turn to D1 keyed by session_id.
 *   5. On lead capture, optionally POST to an alert webhook set in KV.
 *
 * Bindings (wrangler.jsonc):
 *   - BOLT_DB       (D1)
 *   - BOLT_CONFIG   (KV)
 *   - ANTHROPIC_API_KEY (secret)
 */

const ALLOWED_ORIGINS = new Set([
  'https://goratehero.com',
  'https://www.goratehero.com',
]);

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 800;

// web3forms config — matches the funnel in index.html so leads land in
// the same inbox / automation as CTA submissions.
const WEB3FORMS_URL = 'https://api.web3forms.com/submit';
const WEB3FORMS_ACCESS_KEY = '544fd03b-53dd-4844-ae11-af8c8871adf8';

const DEFAULT_SYSTEM_PROMPT = `You are Bolt, Rate Hero's AI Mortgage Assistant. Rate Hero is a non-QM / DSCR lender — 21-day average close, no SSN to start, 30+ states, $200M+ funded by leadership, BiggerPockets Featured Lender, phone (747) 308-1635.

Programs: DSCR (rental income, up to 85% LTV, min DSCR 1.0–1.25), Non-QM (bank statement, P&L, 1099, asset-based), Conventional / FHA / VA, HELOC up to 90% LTV, STR (AirDNA accepted), Foreign Nationals, Hard Money Exit / BRRRR into 30-yr DSCR, LLC lending.

Style: 2–3 sentences max. Direct, warm, never pushy. Never quote specific rates — say rates depend on property / credit / structure and offer a personalized quote.

Lead capture: when a user shares their situation AND shows intent (asks about getting started, a quote, a call, timing), offer to have a strategist reach out. If they agree, call the submit_lead tool with what you have — name + phone (or email) are required, everything else optional. After asking for the phone number, ALSO ask for their email in the same turn — email helps strategists follow up if the call is missed. If they decline email, proceed with phone only.

After the submit_lead tool returns, read its result:
- If "ok":true → confirm in ONE sentence that a strategist will reach out.
- If "ok":false → do NOT claim success. Tell the user you hit a technical issue and give them the phone number (747) 308-1635 to call directly. Do not retry the tool with the same inputs.

Don't interrogate — collect naturally over the chat.`;

const SUBMIT_LEAD_TOOL = {
  name: 'submit_lead',
  description: "Submits the user's contact info and loan situation to Rate Hero so a strategist can follow up. Call this only after the user has agreed to be contacted AND you have at least first name + last name + phone (or email). The rest of the fields are optional — pass whatever you've collected naturally in the conversation.",
  input_schema: {
    type: 'object',
    properties: {
      first_name:    { type: 'string', description: "User's first name" },
      last_name:     { type: 'string', description: "User's last name" },
      phone:         { type: 'string', description: 'Phone number, any format' },
      email:         { type: 'string', description: 'Email address' },
      loan_program:  { type: 'string', description: 'One of: dscr, non-qm, conventional, fha, va, heloc, str, foreign-national, brrrr, other' },
      borrower_type: { type: 'string', description: 'e.g. real estate investor, self-employed, w2, first-time buyer' },
      property_type: { type: 'string', description: 'e.g. single family, multi-family, condo, STR, mixed-use' },
      state:         { type: 'string', description: 'US state, 2-letter or full name' },
      loan_amount:   { type: 'string', description: 'Approximate loan amount, e.g. "$400k"' },
      credit_score:  { type: 'string', description: 'Approximate credit score or range' },
      timeline:      { type: 'string', description: 'When they need to close, e.g. "30 days", "ASAP"' },
      property_address: { type: 'string', description: 'Property address if shared' },
      property_count:   { type: 'string', description: 'Number of properties owned, if mentioned' },
      notes:         { type: 'string', description: 'Short free-text summary of the situation to pass to the strategist.' },
    },
    required: ['first_name', 'last_name'],
  },
};

/* ─────────────── helpers ─────────────── */

const now = () => Date.now();

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://goratehero.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

async function sha256(text) {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function loadSystemPrompt(env) {
  if (!env.BOLT_CONFIG) return DEFAULT_SYSTEM_PROMPT;
  const stored = await env.BOLT_CONFIG.get('system_prompt');
  return stored && stored.trim() ? stored : DEFAULT_SYSTEM_PROMPT;
}

async function loadAlertWebhook(env) {
  if (!env.BOLT_CONFIG) return null;
  const url = await env.BOLT_CONFIG.get('alert_webhook_url');
  return url && /^https?:\/\//.test(url) ? url : null;
}

/* ─────────────── D1 logging ─────────────── */

async function logTurn(env, { sessionId, messages, ipHash, userAgent, referer, leadCaptured, leadPayload }) {
  if (!env.BOLT_DB) return;
  const ts = now();
  const msgJson = JSON.stringify(messages);
  try {
    await env.BOLT_DB.prepare(
      `INSERT INTO conversations
        (session_id, started_at, updated_at, messages, lead_captured, lead_payload, ip_hash, user_agent, referer, msg_count)
       VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(session_id) DO UPDATE SET
         updated_at    = excluded.updated_at,
         messages      = excluded.messages,
         lead_captured = MAX(conversations.lead_captured, excluded.lead_captured),
         lead_payload  = COALESCE(excluded.lead_payload, conversations.lead_payload),
         msg_count     = excluded.msg_count`
    ).bind(
      sessionId,
      ts,
      msgJson,
      leadCaptured ? 1 : 0,
      leadPayload ? JSON.stringify(leadPayload) : null,
      ipHash || null,
      userAgent || null,
      referer || null,
      messages.length,
    ).run();
  } catch (err) {
    console.error('D1 logTurn failed:', err.message);
  }
}

/* ─────────────── submit_lead tool ─────────────── */

async function submitLead(input, sourcePage, sessionId) {
  const fullName = [input.first_name, input.last_name].filter(Boolean).join(' ').trim();

  // web3forms rejects submissions where "email" is not a valid address, so if
  // Bolt didn't collect one, synthesize a deterministic placeholder.
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((input.email || '').trim());
  const emailToSend = validEmail
    ? input.email.trim()
    : `bolt-${(sessionId || 'unknown').replace(/[^a-z0-9]/gi, '').slice(0, 16)}@leads.goratehero.com`;

  // web3forms accepts JSON with `application/json` — more reliable from
  // Cloudflare Workers than multipart FormData.
  const payload = {
    access_key:        WEB3FORMS_ACCESS_KEY,
    subject:           'New Bolt Lead — ' + (input.loan_program || 'Chat'),
    from_name:         'Rate Hero — Bolt AI',
    Name:              fullName || 'Not provided',
    email:             emailToSend,                             // lowercase — web3forms built-in field
    Email:             emailToSend,                             // also expose in the email body
    'Email Provided':  validEmail ? 'Yes' : 'No — phone-only lead from Bolt',
    Phone:             input.phone            || 'Not provided',
    'Loan Program':    input.loan_program     || 'Not specified',
    'Borrower Type':   input.borrower_type    || 'Not specified',
    'Property Type':   input.property_type    || 'Not specified',
    State:             input.state            || 'Not specified',
    'Loan Amount':     input.loan_amount      || 'Not specified',
    'Credit Score':    input.credit_score     || 'Not specified',
    Timeline:          input.timeline         || 'Not specified',
    'Property Address':input.property_address || 'Not provided',
    Properties:        input.property_count   || 'Not specified',
    Source:            'Bolt AI Chat' + (sourcePage ? ` · ${sourcePage}` : ''),
    Notes:             input.notes            || '',
    botcheck:          '',
  };

  const res = await fetch(WEB3FORMS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  let raw = '';
  try { raw = await res.text(); data = JSON.parse(raw); } catch {}

  const ok = res.ok && (data?.success !== false);
  const msg = ok
    ? 'Lead submitted. A strategist will follow up.'
    : `Submission failed (${res.status}): ${data?.message || raw || 'unknown error'}`;

  // Log richer diagnostics so Worker tail / admin dashboard can show what happened.
  console.log('submit_lead →', res.status, data || raw);
  return { ok, message: msg, status: res.status, upstream: data };
}

async function fireAlertWebhook(env, { payload, sessionId, origin }) {
  const url = await loadAlertWebhook(env);
  if (!url) return;
  const text = `🔥 New Bolt lead — *${payload.first_name || ''} ${payload.last_name || ''}* (${payload.phone || payload.email || 'no contact'})`
    + `\nProgram: ${payload.loan_program || '—'}  ·  State: ${payload.state || '—'}  ·  Amount: ${payload.loan_amount || '—'}`
    + `\nNotes: ${payload.notes || '—'}`
    + `\nSession: ${sessionId}  ·  From: ${origin || '—'}`;
  try {
    // Generic shape — works for Slack, Discord (with content key), and most Zapier/Make hooks
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text, payload, session_id: sessionId }),
    });
  } catch (err) {
    console.error('alert webhook failed:', err.message);
  }
}

/* ─────────────── main fetch ─────────────── */

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const baseCors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: baseCors });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: baseCors });
    }
    if (!ALLOWED_ORIGINS.has(origin)) {
      return new Response('Forbidden', { status: 403, headers: baseCors });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400, baseCors);
    }

    const { messages, session_id: sessionId, page } = payload || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: 'messages required' }, 400, baseCors);
    }
    if (!sessionId || typeof sessionId !== 'string') {
      return json({ error: 'session_id required' }, 400, baseCors);
    }

    const systemPrompt = await loadSystemPrompt(env);
    const ua      = request.headers.get('User-Agent') || '';
    const referer = request.headers.get('Referer') || page || '';
    const ip      = request.headers.get('CF-Connecting-IP') || '';
    const ipHash  = ip ? await sha256(ip + '::' + sessionId) : null;

    // Work on a growing transcript so we can capture tool-use exchanges too.
    const transcript = messages.slice();
    let leadCaptured = false;
    let leadPayload = null;

    // Agentic loop: call model, if it returns tool_use, run the tool, feed
    // the result back, repeat. Hard-capped to avoid runaway loops.
    let finalText = '';
    for (let hop = 0; hop < 3; hop++) {
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          tools: [SUBMIT_LEAD_TOOL],
          messages: transcript,
        }),
      });

      const data = await apiRes.json();
      if (!apiRes.ok || data.type === 'error') {
        return json({ error: data?.error?.message || 'Upstream error', upstream: data }, 502, baseCors);
      }

      // Capture assistant turn in the transcript
      transcript.push({ role: 'assistant', content: data.content });

      const toolUse = (data.content || []).find(b => b.type === 'tool_use');
      const textBlock = (data.content || []).find(b => b.type === 'text');
      if (textBlock) finalText = textBlock.text;

      if (data.stop_reason !== 'tool_use' || !toolUse) break;

      // Execute the tool
      let toolResult;
      if (toolUse.name === 'submit_lead') {
        try {
          const r = await submitLead(toolUse.input || {}, referer, sessionId);
          toolResult = JSON.stringify(r);
          if (r.ok) {
            leadCaptured = true;
            leadPayload = toolUse.input || {};
            // Fire alert webhook without blocking the response
            ctx.waitUntil(fireAlertWebhook(env, { payload: leadPayload, sessionId, origin }));
          }
        } catch (err) {
          toolResult = JSON.stringify({ ok: false, message: err.message });
        }
      } else {
        toolResult = JSON.stringify({ ok: false, message: 'Unknown tool' });
      }

      transcript.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: toolResult }],
      });
    }

    // Persist the conversation (fire-and-forget)
    ctx.waitUntil(logTurn(env, {
      sessionId,
      messages: transcript,
      ipHash,
      userAgent: ua,
      referer,
      leadCaptured,
      leadPayload,
    }));

    return json({
      reply: finalText || "I'm here — tell me about your property or loan situation.",
      lead_captured: leadCaptured,
    }, 200, baseCors);
  },
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
