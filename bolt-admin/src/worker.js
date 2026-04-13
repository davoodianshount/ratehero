/**
 * bolt-admin — Admin dashboard for Bolt.
 *
 * Routes (served at goratehero.com/admin/*):
 *   GET  /admin                         → dashboard HTML shell (SPA-ish)
 *   GET  /admin/api/stats               → overview counts
 *   GET  /admin/api/conversations       → list (paginated)
 *   GET  /admin/api/conversations/:id   → full conversation
 *   GET  /admin/api/config              → { system_prompt, alert_webhook_url }
 *   POST /admin/api/config              → update KV keys
 *
 * Auth: Cloudflare Access is expected to sit in front of this Worker.
 * As a defense-in-depth check we also require the CF-Access-Authenticated-User-Email
 * header, which Access injects on authenticated requests. If it's missing,
 * we return 401.
 */

const ADMIN_EMAILS = new Set([
  'davoodianshount@gmail.com',
  'admin@goratehero.com',
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Require Cloudflare Access auth on everything except the raw HTML shell
    // (the browser needs to load the page; Access's own login flow handles it
    // outside our Worker). We still gate the APIs.
    const accessEmail = (request.headers.get('Cf-Access-Authenticated-User-Email') || '').toLowerCase();
    const isApi = path.startsWith('/admin/api/');

    if (isApi) {
      if (!accessEmail) return json({ error: 'Not authenticated' }, 401);
      if (!ADMIN_EMAILS.has(accessEmail)) return json({ error: 'Forbidden' }, 403);
    }

    try {
      if (path === '/admin' || path === '/admin/') {
        return htmlResponse(renderDashboard(accessEmail));
      }
      if (path === '/admin/api/stats' && request.method === 'GET') {
        return json(await getStats(env));
      }
      if (path === '/admin/api/conversations' && request.method === 'GET') {
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const filter = url.searchParams.get('filter') || 'all';
        const q = url.searchParams.get('q') || '';
        return json(await listConversations(env, { page, filter, q }));
      }
      const convMatch = path.match(/^\/admin\/api\/conversations\/([A-Za-z0-9_-]+)$/);
      if (convMatch && request.method === 'GET') {
        return json(await getConversation(env, convMatch[1]));
      }
      if (path === '/admin/api/config' && request.method === 'GET') {
        return json(await getConfig(env));
      }
      if (path === '/admin/api/config' && request.method === 'POST') {
        const body = await request.json();
        return json(await updateConfig(env, body, accessEmail));
      }
      return new Response('Not found', { status: 404 });
    } catch (err) {
      return json({ error: err.message, stack: err.stack }, 500);
    }
  },
};

/* ─────────────── data access ─────────────── */

async function getStats(env) {
  const day  = 24 * 60 * 60 * 1000;
  const now  = Date.now();
  const d1   = now - day;
  const d7   = now - 7 * day;

  const total = await env.BOLT_DB.prepare('SELECT COUNT(*) AS c, SUM(lead_captured) AS leads FROM conversations').first();
  const today = await env.BOLT_DB.prepare('SELECT COUNT(*) AS c, SUM(lead_captured) AS leads FROM conversations WHERE updated_at >= ?1').bind(d1).first();
  const week  = await env.BOLT_DB.prepare('SELECT COUNT(*) AS c, SUM(lead_captured) AS leads FROM conversations WHERE updated_at >= ?1').bind(d7).first();

  return {
    total:  { conversations: total?.c || 0, leads: total?.leads || 0 },
    today:  { conversations: today?.c || 0, leads: today?.leads || 0 },
    week:   { conversations: week?.c  || 0, leads: week?.leads  || 0 },
  };
}

async function listConversations(env, { page, filter, q }) {
  const pageSize = 50;
  const offset = Math.max(0, (page - 1) * pageSize);

  let where = '1=1';
  const binds = [];
  if (filter === 'leads') where += ' AND lead_captured = 1';

  if (q) {
    where += ' AND messages LIKE ?' + (binds.length + 1);
    binds.push('%' + q.replace(/[%_]/g, '') + '%');
  }

  const rows = await env.BOLT_DB
    .prepare(`SELECT session_id, started_at, updated_at, lead_captured, msg_count, substr(messages, 1, 600) AS preview
              FROM conversations
              WHERE ${where}
              ORDER BY updated_at DESC
              LIMIT ${pageSize} OFFSET ${offset}`)
    .bind(...binds)
    .all();

  const items = (rows.results || []).map(r => {
    let firstUser = '';
    try {
      const msgs = JSON.parse(r.preview + (r.preview.endsWith(']') ? '' : ']'));
      firstUser = (msgs.find(m => m.role === 'user')?.content || '').toString().slice(0, 160);
    } catch { /* preview may be truncated mid-json */ }
    return {
      session_id: r.session_id,
      started_at: r.started_at,
      updated_at: r.updated_at,
      lead_captured: !!r.lead_captured,
      msg_count: r.msg_count,
      first_user_message: firstUser,
    };
  });

  return { items, page, pageSize };
}

async function getConversation(env, sessionId) {
  const row = await env.BOLT_DB
    .prepare('SELECT * FROM conversations WHERE session_id = ?1')
    .bind(sessionId)
    .first();
  if (!row) return { error: 'Not found' };
  let messages = [];
  try { messages = JSON.parse(row.messages); } catch { /* corrupt */ }
  let leadPayload = null;
  if (row.lead_payload) {
    try { leadPayload = JSON.parse(row.lead_payload); } catch {}
  }
  return {
    session_id: row.session_id,
    started_at: row.started_at,
    updated_at: row.updated_at,
    lead_captured: !!row.lead_captured,
    lead_payload: leadPayload,
    ip_hash: row.ip_hash,
    user_agent: row.user_agent,
    referer: row.referer,
    msg_count: row.msg_count,
    messages,
  };
}

async function getConfig(env) {
  const [prompt, webhook, promptMeta] = await Promise.all([
    env.BOLT_CONFIG.get('system_prompt'),
    env.BOLT_CONFIG.get('alert_webhook_url'),
    env.BOLT_CONFIG.get('system_prompt_meta', { type: 'json' }),
  ]);
  return {
    system_prompt: prompt || '',
    alert_webhook_url: webhook || '',
    system_prompt_updated_at: promptMeta?.updated_at || null,
    system_prompt_updated_by: promptMeta?.updated_by || null,
    system_prompt_length: (prompt || '').length,
  };
}

async function updateConfig(env, body, accessEmail) {
  const ops = [];
  if (typeof body.system_prompt === 'string') {
    ops.push(env.BOLT_CONFIG.put('system_prompt', body.system_prompt));
    ops.push(env.BOLT_CONFIG.put('system_prompt_meta', JSON.stringify({
      updated_at: Date.now(),
      updated_by: accessEmail || 'unknown',
    })));
  }
  if (typeof body.alert_webhook_url === 'string') {
    const clean = body.alert_webhook_url.trim();
    if (clean === '') ops.push(env.BOLT_CONFIG.delete('alert_webhook_url'));
    else              ops.push(env.BOLT_CONFIG.put('alert_webhook_url', clean));
  }
  await Promise.all(ops);
  return { ok: true, updated_at: Date.now() };
}

/* ─────────────── responses ─────────────── */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function htmlResponse(html) {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/* ─────────────── dashboard HTML ─────────────── */

function renderDashboard(email) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>Bolt Admin · Rate Hero</title>
<style>
  :root {
    --bg:#0B1220; --panel:#111A2E; --panel2:#0E1628; --border:rgba(255,255,255,.08);
    --muted:#64748B; --text:#E2E8F0; --blue:#3B82F6; --blue2:#1D4ED8;
    --green:#10B981; --amber:#F59E0B; --red:#EF4444;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:var(--bg); color:var(--text); font-size:14px;
  }
  a { color:var(--blue); text-decoration:none; }
  header {
    display:flex; align-items:center; justify-content:space-between;
    padding:16px 28px; border-bottom:1px solid var(--border); background:var(--panel2);
    position:sticky; top:0; z-index:10;
  }
  header .brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:-.2px; }
  header .brand .bolt { background:linear-gradient(135deg,var(--blue2),var(--blue)); width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center; }
  header .user { font-size:12px; color:var(--muted); }
  nav.tabs {
    display:flex; gap:6px; padding:14px 28px 0; border-bottom:1px solid var(--border); background:var(--panel2);
    position:sticky; top:61px; z-index:9;
  }
  nav.tabs button {
    background:transparent; border:none; color:var(--muted); padding:10px 14px;
    border-bottom:2px solid transparent; font-size:13px; font-weight:600; cursor:pointer;
    font-family:inherit;
  }
  nav.tabs button.active { color:var(--text); border-bottom-color:var(--blue); }
  main { padding:20px 28px 80px; max-width:1240px; margin:0 auto; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:20px; }
  .card {
    background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:14px 16px;
  }
  .card .k { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; margin-bottom:6px; }
  .card .v { font-size:22px; font-weight:700; }
  .card .sub { color:var(--muted); font-size:11px; margin-top:3px; }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
  input, textarea, select, button {
    font-family:inherit; font-size:13px; color:var(--text);
  }
  input[type="text"], input[type="url"], textarea, select {
    background:var(--panel); border:1px solid var(--border); border-radius:8px;
    padding:9px 12px; color:var(--text); outline:none;
  }
  input[type="text"]:focus, input[type="url"]:focus, textarea:focus {
    border-color:var(--blue);
  }
  textarea { width:100%; min-height:300px; line-height:1.5; resize:vertical; }
  button.btn {
    background:linear-gradient(135deg,var(--blue2),var(--blue)); border:none; color:#fff;
    padding:9px 16px; border-radius:8px; font-weight:600; cursor:pointer;
  }
  button.btn.ghost { background:transparent; border:1px solid var(--border); color:var(--text); }
  button.btn:disabled { opacity:.5; cursor:default; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--border); font-size:13px; vertical-align:top; }
  th { color:var(--muted); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.06em; background:var(--panel2); }
  tbody tr { cursor:pointer; }
  tbody tr:hover { background:rgba(59,130,246,.06); }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; }
  .badge.lead { background:rgba(16,185,129,.15); color:var(--green); border:1px solid rgba(16,185,129,.3); }
  .badge.dim  { background:rgba(100,116,139,.15); color:var(--muted); border:1px solid var(--border); }
  .preview { color:var(--muted); max-width:620px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .panel { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:16px; }
  .panel h3 { margin:0 0 10px; font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); font-weight:700; }
  .muted { color:var(--muted); font-size:12px; }
  /* Modal */
  .modal-mask { position:fixed; inset:0; background:rgba(0,0,0,.65); display:none; align-items:flex-start; justify-content:center; padding:40px 20px; z-index:50; overflow-y:auto; }
  .modal-mask.open { display:flex; }
  .modal { background:var(--panel); border:1px solid var(--border); border-radius:14px; max-width:760px; width:100%; padding:22px 24px 28px; }
  .modal header { background:transparent; border:0; padding:0 0 12px; position:static; }
  .msg { padding:10px 12px; border-radius:10px; margin-bottom:8px; max-width:85%; line-height:1.5; }
  .msg.user { background:linear-gradient(135deg,var(--blue2),var(--blue)); color:#fff; margin-left:auto; border-radius:12px 12px 4px 12px; }
  .msg.assistant { background:rgba(255,255,255,.05); border:1px solid var(--border); border-radius:12px 12px 12px 4px; }
  .msg.tool { background:rgba(245,158,11,.08); border:1px dashed rgba(245,158,11,.3); font-family:ui-monospace,monospace; font-size:12px; color:#FCD34D; }
  .role { font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); margin-bottom:4px; }
  .kv { display:grid; grid-template-columns:130px 1fr; gap:6px 14px; font-size:12px; }
  .kv b { color:var(--muted); font-weight:500; }
  .toast { position:fixed; bottom:20px; right:20px; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:10px; font-size:13px; z-index:100; display:none; }
  .toast.ok { border-color:rgba(16,185,129,.5); }
  .toast.err { border-color:rgba(239,68,68,.5); }
</style>
</head>
<body>
<header>
  <div class="brand">
    <div class="bolt">⚡</div>
    <div>Bolt Admin <span class="muted" style="font-weight:400">· Rate Hero</span></div>
  </div>
  <div class="user">${escapeHtml(email || 'unauthenticated')}</div>
</header>
<nav class="tabs">
  <button class="active" data-tab="conversations">Conversations</button>
  <button data-tab="leads">Leads</button>
  <button data-tab="prompt">System Prompt</button>
  <button data-tab="settings">Settings</button>
</nav>
<main>
  <section id="tab-conversations"></section>
  <section id="tab-leads" hidden></section>
  <section id="tab-prompt" hidden></section>
  <section id="tab-settings" hidden></section>
</main>

<div class="modal-mask" id="modal-mask"><div class="modal" id="modal"></div></div>
<div class="toast" id="toast"></div>

<script>
const $  = q => document.querySelector(q);
const $$ = q => document.querySelectorAll(q);

function fmtDate(ms){ return new Date(ms).toLocaleString(); }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function toast(msg, kind='ok'){ const t=$('#toast'); t.textContent=msg; t.className='toast '+kind; t.style.display='block'; setTimeout(()=>t.style.display='none',2600); }

async function api(path, opts={}){
  const res = await fetch('/admin/api'+path, { credentials:'same-origin', ...opts });
  if (!res.ok) {
    const msg = (await res.json().catch(()=>({}))).error || res.statusText;
    throw new Error(msg);
  }
  return res.json();
}

/* ─── tabs ─── */
$$('nav.tabs button').forEach(b=>{
  b.onclick = () => {
    $$('nav.tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    ['conversations','leads','prompt','settings'].forEach(t=>{
      $('#tab-'+t).hidden = (t !== b.dataset.tab);
    });
    loadTab(b.dataset.tab);
  };
});

function loadTab(t){
  if (t==='conversations') return renderConversations('all');
  if (t==='leads')         return renderConversations('leads');
  if (t==='prompt')        return renderPrompt();
  if (t==='settings')      return renderSettings();
}

/* ─── conversations ─── */
async function renderConversations(filter){
  const el = $('#tab-' + (filter==='leads' ? 'leads' : 'conversations'));
  el.innerHTML = '<div class="muted">Loading…</div>';
  let stats, list;
  try {
    [stats, list] = await Promise.all([
      api('/stats'),
      api('/conversations?filter='+filter+'&page=1'),
    ]);
  } catch (err) {
    el.innerHTML = '<div class="panel">Error: '+escapeHtml(err.message)+'</div>';
    return;
  }

  const cards = \`
    <div class="cards">
      <div class="card"><div class="k">Today</div><div class="v">\${stats.today.conversations}</div><div class="sub">\${stats.today.leads} leads</div></div>
      <div class="card"><div class="k">This Week</div><div class="v">\${stats.week.conversations}</div><div class="sub">\${stats.week.leads} leads</div></div>
      <div class="card"><div class="k">All Time</div><div class="v">\${stats.total.conversations}</div><div class="sub">\${stats.total.leads} leads</div></div>
      <div class="card"><div class="k">Lead Rate</div><div class="v">\${stats.total.conversations ? ((stats.total.leads/stats.total.conversations)*100).toFixed(1)+'%' : '—'}</div><div class="sub">leads / conversations</div></div>
    </div>\`;

  const rows = list.items.map(c => \`
    <tr data-id="\${c.session_id}">
      <td>\${fmtDate(c.updated_at)}</td>
      <td>\${c.lead_captured ? '<span class="badge lead">Lead</span>' : '<span class="badge dim">—</span>'}</td>
      <td class="preview">\${escapeHtml(c.first_user_message || '(no user message)')}</td>
      <td>\${c.msg_count}</td>
    </tr>\`).join('');

  el.innerHTML = cards + \`
    <div class="panel" style="padding:0; overflow:hidden;">
      <table>
        <thead><tr><th>Last activity</th><th>Status</th><th>First message</th><th>Msgs</th></tr></thead>
        <tbody>\${rows || '<tr><td colspan="4" class="muted" style="padding:20px">No conversations yet.</td></tr>'}</tbody>
      </table>
    </div>\`;

  el.querySelectorAll('tbody tr[data-id]').forEach(tr=>{
    tr.onclick = () => openConversation(tr.dataset.id);
  });
}

async function openConversation(id){
  const data = await api('/conversations/'+id);
  const msgs = (data.messages||[]).map(m => renderMsg(m)).join('');
  const lead = data.lead_payload ? \`
    <div class="panel">
      <h3>Lead payload</h3>
      <div class="kv">\${Object.entries(data.lead_payload).map(([k,v])=>\`<b>\${escapeHtml(k)}</b><span>\${escapeHtml(String(v))}</span>\`).join('')}</div>
    </div>\` : '';
  const meta = \`
    <div class="kv" style="margin-bottom:14px">
      <b>Started</b><span>\${fmtDate(data.started_at)}</span>
      <b>Last msg</b><span>\${fmtDate(data.updated_at)}</span>
      <b>Messages</b><span>\${data.msg_count}</span>
      <b>Session</b><span style="font-family:ui-monospace,monospace">\${escapeHtml(data.session_id)}</span>
      <b>Referrer</b><span>\${escapeHtml(data.referer||'—')}</span>
      <b>User-Agent</b><span style="word-break:break-all">\${escapeHtml(data.user_agent||'—')}</span>
      <b>IP hash</b><span style="font-family:ui-monospace,monospace">\${escapeHtml(data.ip_hash||'—')}</span>
    </div>\`;
  $('#modal').innerHTML = \`
    <header style="display:flex;justify-content:space-between;align-items:center;">
      <div style="font-weight:700;font-size:16px;">Conversation \${data.lead_captured?'<span class="badge lead">Lead</span>':''}</div>
      <button class="btn ghost" onclick="closeModal()">Close</button>
    </header>
    \${meta}
    \${lead}
    <div>\${msgs || '<div class="muted">Empty.</div>'}</div>\`;
  $('#modal-mask').classList.add('open');
}

function renderMsg(m){
  const role = m.role;
  if (typeof m.content === 'string') {
    return \`<div class="msg \${role}"><div class="role">\${role}</div>\${escapeHtml(m.content)}</div>\`;
  }
  // content is an array of blocks (Anthropic format)
  return (m.content||[]).map(b => {
    if (b.type === 'text')        return \`<div class="msg \${role}"><div class="role">\${role}</div>\${escapeHtml(b.text)}</div>\`;
    if (b.type === 'tool_use')    return \`<div class="msg tool"><div class="role">tool call · \${escapeHtml(b.name)}</div>\${escapeHtml(JSON.stringify(b.input,null,2))}</div>\`;
    if (b.type === 'tool_result') return \`<div class="msg tool"><div class="role">tool result</div>\${escapeHtml(typeof b.content==='string'?b.content:JSON.stringify(b.content))}</div>\`;
    return '';
  }).join('');
}

function closeModal(){ $('#modal-mask').classList.remove('open'); }
$('#modal-mask').addEventListener('click', e => { if (e.target.id==='modal-mask') closeModal(); });

/* ─── prompt ─── */
async function renderPrompt(){
  const el = $('#tab-prompt');
  el.innerHTML = '<div class="muted">Loading…</div>';
  const cfg = await api('/config');
  const lastUpdated = cfg.system_prompt_updated_at
    ? fmtDate(cfg.system_prompt_updated_at) + (cfg.system_prompt_updated_by ? \` · by \${escapeHtml(cfg.system_prompt_updated_by)}\` : '')
    : 'Never — using built-in default';
  el.innerHTML = \`
    <div class="panel">
      <h3>System prompt</h3>
      <div class="muted" style="margin-bottom:8px">Bolt's instructions. Save → live on the next message, no redeploy.</div>
      <div class="row" style="margin-bottom:10px">
        <span class="badge dim">Last saved: \${lastUpdated}</span>
        <span class="badge dim" id="prompt-chars">\${cfg.system_prompt_length} chars</span>
      </div>
      <textarea id="prompt-ta">\${escapeHtml(cfg.system_prompt)}</textarea>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="save-prompt">Save</button>
        <button class="btn ghost" id="reset-prompt">Revert</button>
        <button class="btn ghost" id="test-prompt">Test prompt →</button>
      </div>
    </div>
    <div class="panel">
      <h3>Program knowledge (FHA · VA · DSCR · Non-QM · etc.)</h3>
      <div class="muted" style="line-height:1.6">
        Paste guideline summaries directly into the prompt above (LTVs, DSCR mins, credit floors, reserves, loan limits).
        Keep it tight — a few hundred words per program is plenty; Bolt references it verbatim.
        For full PDF-size guideline docs, ask to add <b>RAG</b> (retrieval) — that's a follow-up we can ship once volume justifies it.
      </div>
    </div>
    <div class="panel">
      <h3>Tips</h3>
      <ul class="muted" style="margin:0;padding-left:18px;line-height:1.7">
        <li>Keep the <b>submit_lead</b> instructions — removing them disables lead capture.</li>
        <li>Short sentences win. Bolt mirrors your tone.</li>
        <li>Blank the field and save to restore the built-in default.</li>
      </ul>
    </div>\`;
  document.getElementById('prompt-ta').addEventListener('input', e => {
    document.getElementById('prompt-chars').textContent = e.target.value.length + ' chars';
  });
  document.getElementById('test-prompt').onclick = () => {
    window.open('https://goratehero.com/?bolt-test=1#open', '_blank');
  };
  $('#save-prompt').onclick = async () => {
    try {
      await api('/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ system_prompt: $('#prompt-ta').value }) });
      toast('Saved');
    } catch(err){ toast('Save failed: '+err.message,'err'); }
  };
  $('#reset-prompt').onclick = () => { $('#prompt-ta').value = cfg.system_prompt; };
}

/* ─── settings ─── */
async function renderSettings(){
  const el = $('#tab-settings');
  const cfg = await api('/config');
  el.innerHTML = \`
    <div class="panel">
      <h3>Alert webhook</h3>
      <div class="muted" style="margin-bottom:8px">Optional. We POST a JSON payload here every time Bolt captures a lead. Works with Slack Incoming Webhooks, Discord, Zapier, Make.com.</div>
      <input type="url" id="alert-url" style="width:100%" placeholder="https://hooks.slack.com/..." value="\${escapeHtml(cfg.alert_webhook_url)}" />
      <div class="row" style="margin-top:10px">
        <button class="btn" id="save-alert">Save</button>
      </div>
    </div>
    <div class="panel">
      <h3>Lead delivery</h3>
      <div class="muted">Leads from Bolt are POSTed to the same <b>web3forms</b> endpoint as your site CTAs (access key ending <code>1adf8</code>). No separate inbox — they land next to your funnel submissions.</div>
    </div>
    <div class="panel">
      <h3>Retention</h3>
      <div class="muted">Conversations are kept <b>indefinitely</b>. Contact Rate Hero dev to change.</div>
    </div>\`;
  $('#save-alert').onclick = async () => {
    try {
      await api('/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ alert_webhook_url: $('#alert-url').value }) });
      toast('Saved');
    } catch(err){ toast('Save failed: '+err.message,'err'); }
  };
}

loadTab('conversations');
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}
