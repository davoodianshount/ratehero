/**
 * rate-hero-quotes — Loan Quote Comparison worker.
 *
 * Hostnames served:
 *   quotes.goratehero.com           → admin panel + JSON API at /admin/api/*
 *   {slug}.goratehero.com           → client-facing branded quote page
 *
 * KV (binding: QUOTES):
 *   lo:{accessCode}        → { id, accessCode, name, phone, nmls, title, email, role, createdAt }
 *   quote:{slug}           → { slug, clientName, address, transactionType, loanProgram, loanTerm,
 *                              lo: { id, name, phone, title, nmls }, options: [...], createdAt }
 *   lo-quotes:{loId}       → JSON array of slugs created by that LO
 *   all-los                → JSON array of LO access codes
 *   all-quotes             → JSON array of slugs (newest first)
 *
 * Auth: clients send `Authorization: Bearer <accessCode>` on /admin/api/*.
 *   - If the code === env.ADMIN_CODE → synthesized admin user (Sean).
 *   - Else look up lo:{code}.
 */

const COMPANY_NMLS = '2822806';
const COMPANY_PHONE = '(818) 208-6801';
const APPLY_URL = 'https://ratehero.my1003app.com/1252107/register';
const CONSUMER_ACCESS_URL = 'https://www.nmlsconsumeraccess.org/';

// Access codes are case-insensitive — mobile keyboards auto-capitalize and
// Sean prefers a single canonical form in KV. We uppercase at every
// boundary (auth, KV reads/writes, route params) and strip non-alphanumerics
// so trailing whitespace or stray punctuation doesn't break lookups.
function normCode(c) {
  return String(c == null ? '' : c).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ---------- Entry ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const path = url.pathname;

    try {
      if (host === 'quotes.goratehero.com') {
        return await handleAdminHost(request, env, url);
      }

      // Wildcard subdomain handling for *.goratehero.com
      if (host.endsWith('.goratehero.com')) {
        const sub = host.slice(0, -'.goratehero.com'.length);
        // Defensive: never handle bare/www/mail/etc. when this worker is
        // (incorrectly) bound to the apex. Only the wildcard route should hit
        // this path, but we still bail out if there is no subdomain.
        if (!sub || sub === 'www') {
          return Response.redirect('https://goratehero.com/', 302);
        }
        return await handleClientSubdomain(env, sub);
      }

      // Anything else — should not happen with the configured routes.
      return Response.redirect('https://goratehero.com/', 302);
    } catch (err) {
      console.error('worker error', err);
      return new Response('Internal error', { status: 500 });
    }
  },
};

// ---------- Admin host ----------
async function handleAdminHost(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/' || path === '') {
    return Response.redirect('https://quotes.goratehero.com/admin', 302);
  }
  if (path === '/admin' || path === '/admin/') {
    return html(renderAdminShell());
  }

  if (path.startsWith('/admin/api/')) {
    return await handleApi(request, env, url);
  }

  return new Response('Not found', { status: 404 });
}

// ---------- API ----------
async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  // Login does not require an existing session
  if (path === '/admin/api/login' && method === 'POST') {
    const body = await readJson(request);
    const code = (body.code || '').trim();
    if (!code) return json({ error: 'Access code required' }, 400);
    const user = await resolveUser(env, code);
    if (!user) return json({ error: 'Invalid access code' }, 401);
    return json({ ok: true, user: publicUser(user) });
  }

  // Everything else needs auth
  const user = await authenticate(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  if (path === '/admin/api/me' && method === 'GET') {
    return json({ user: publicUser(user) });
  }

  if (path === '/admin/api/quotes' && method === 'GET') {
    return json({ quotes: await listQuotes(env, user) });
  }

  if (path === '/admin/api/quotes' && method === 'POST') {
    const body = await readJson(request);
    const result = await createQuote(env, user, body);
    if (result.error) return json({ error: result.error }, 400);
    return json(result);
  }

  const quoteMatch = path.match(/^\/admin\/api\/quotes\/([a-z0-9]+)$/);
  if (quoteMatch && method === 'GET') {
    const result = await getQuote(env, user, quoteMatch[1]);
    if (result.error) return json({ error: result.error }, result.status || 400);
    return json(result);
  }
  if (quoteMatch && method === 'PUT') {
    const body = await readJson(request);
    const result = await updateQuote(env, user, quoteMatch[1], body);
    if (result.error) return json({ error: result.error }, result.status || 400);
    return json(result);
  }
  if (quoteMatch && method === 'DELETE') {
    return json(await deleteQuote(env, user, quoteMatch[1]));
  }

  const reassignMatch = path.match(/^\/admin\/api\/quotes\/([a-z0-9]+)\/reassign$/);
  if (reassignMatch && method === 'POST') {
    if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const body = await readJson(request);
    const result = await reassignQuote(env, reassignMatch[1], body.newLoAccessCode || '');
    if (result.error) return json({ error: result.error }, result.status || 400);
    return json(result);
  }

  if (path === '/admin/api/los' && method === 'GET') {
    if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    return json({ los: await listLOs(env) });
  }
  if (path === '/admin/api/los' && method === 'POST') {
    if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const body = await readJson(request);
    const result = await createLO(env, body);
    if (result.error) return json({ error: result.error }, 400);
    return json(result);
  }
  const loMatch = path.match(/^\/admin\/api\/los\/([A-Za-z0-9]+)$/);
  if (loMatch && method === 'PUT') {
    if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const body = await readJson(request);
    const result = await updateLO(env, normCode(loMatch[1]), body);
    if (result.error) return json({ error: result.error }, 400);
    return json(result);
  }
  if (loMatch && method === 'DELETE') {
    if (user.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const target = normCode(loMatch[1]);
    if (env.ADMIN_CODE && target === normCode(env.ADMIN_CODE)) {
      return json({ error: 'Cannot remove the admin account' }, 400);
    }
    return json(await deleteLO(env, target));
  }

  return json({ error: 'Not found' }, 404);
}

// ---------- Auth helpers ----------
async function authenticate(request, env) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return await resolveUser(env, m[1].trim());
}

async function resolveUser(env, code) {
  code = normCode(code);
  if (!code) return null;
  const adminCodeNorm = normCode(env.ADMIN_CODE || '');
  const isAdmin = !!(adminCodeNorm && code === adminCodeNorm);
  const raw = await env.QUOTES.get(`lo:${code}`);
  let profile = null;
  if (raw) {
    try { profile = JSON.parse(raw); } catch {}
  }
  if (profile) {
    if (isAdmin) {
      profile.role = 'admin';
      // If the admin record is still a placeholder (no real name, or the
      // legacy "Admin" seed, or explicitly flagged for setup) AND there is
      // another LO record sitting on a real profile under a different code,
      // collapse them into lo:{ADMIN_CODE} now. This handles the case where
      // the placeholder was already seeded BEFORE the migration logic landed.
      const isPlaceholder =
        !profile.name ||
        profile.needsProfileSetup === true ||
        String(profile.name).trim().toLowerCase() === 'admin';
      if (isPlaceholder) {
        const migrated = await migrateAdminProfile(env, code, /*preferName*/ 'sean davoodian');
        if (migrated) return migrated;
      }
    }
    return profile;
  }
  if (!isAdmin) return null;
  // First admin sign-in: try to migrate an existing "Sean Davoodian" LO entry
  // (or whichever LO is currently the de-facto admin) into lo:{ADMIN_CODE}.
  // This collapses the legacy two-account state into a single profile keyed
  // by the admin secret.
  const migrated = await migrateAdminProfile(env, code);
  if (migrated) return migrated;
  // No legacy entry to migrate — seed a blank profile that the admin will
  // fill in from the Team tab. We don't pre-fill name/title to avoid any
  // bogus "Admin · Founder" data ever surfacing in the UI.
  const seed = {
    id: 'admin',
    accessCode: code,
    name: '',
    phone: '',
    nmls: '',
    title: '',
    email: '',
    role: 'admin',
    needsProfileSetup: true,
    createdAt: new Date().toISOString(),
  };
  await env.QUOTES.put(`lo:${code}`, JSON.stringify(seed));
  const codes = await readJsonKv(env, 'all-los', []);
  if (!codes.includes(code)) {
    codes.unshift(code);
    await env.QUOTES.put('all-los', JSON.stringify(codes));
  }
  return seed;
}

// Look for an existing LO record (other than the one keyed by adminCode) that
// represents the real admin profile. If one is found, move its data into
// lo:{adminCode}, reassign every quote it owned to id 'admin' (updating
// loAccessCode and the lo.snapshot stored on the quote), merge the per-LO
// quote index into lo-quotes:admin, and drop the legacy lo:{oldCode} record
// plus its entry in all-los. Returns the new admin profile, or null if no
// candidate was found.
//
// `preferName` (case-insensitive, optional) matches by exact name first; if
// no exact match exists, picks any other LO record that has a non-empty name
// — that handles the case where Sean entered his profile but the name field
// drifted from the original "Sean Davoodian" spelling.
async function migrateAdminProfile(env, adminCode, preferName = 'sean davoodian') {
  adminCode = normCode(adminCode);
  const codes = await readJsonKv(env, 'all-los', []);
  const candidates = [];
  for (const c of codes) {
    if (c === adminCode) continue;
    const r = await env.QUOTES.get(`lo:${c}`);
    if (!r) continue;
    try {
      const p = JSON.parse(r);
      if (!p.name) continue;
      candidates.push({ code: c, profile: p });
    } catch {}
  }
  if (!candidates.length) return null;
  const want = String(preferName || '').trim().toLowerCase();
  let chosen = candidates.find(c => String(c.profile.name || '').trim().toLowerCase() === want);
  if (!chosen) {
    // Fall back to the first non-empty candidate. With the dedup rule in
    // listLOs, this case only fires when there's exactly one legacy record,
    // so the heuristic is safe in practice.
    chosen = candidates[0];
  }
  const legacy = chosen.profile;
  const legacyCode = chosen.code;

  const newProfile = {
    id: 'admin',
    accessCode: adminCode,
    name: legacy.name || '',
    phone: legacy.phone || '',
    nmls: legacy.nmls || '',
    title: legacy.title || 'Founder',
    email: legacy.email || '',
    role: 'admin',
    needsProfileSetup: false,
    createdAt: legacy.createdAt || new Date().toISOString(),
    migratedFromCode: legacyCode,
    migratedAt: new Date().toISOString(),
  };
  await env.QUOTES.put(`lo:${adminCode}`, JSON.stringify(newProfile));

  // Reassign every quote owned by the legacy LO to the admin id.
  const legacyQuotes = await readJsonKv(env, `lo-quotes:${legacy.id}`, []);
  for (const slug of legacyQuotes) {
    const qRaw = await env.QUOTES.get(`quote:${slug}`);
    if (!qRaw) continue;
    try {
      const q = JSON.parse(qRaw);
      q.loAccessCode = adminCode;
      q.lo = {
        id: newProfile.id,
        name: newProfile.name,
        phone: newProfile.phone,
        title: newProfile.title,
        nmls: newProfile.nmls,
        email: newProfile.email,
        applyLink: loApplyLink(newProfile),
      };
      await env.QUOTES.put(`quote:${slug}`, JSON.stringify(q));
    } catch {}
  }
  // Merge the per-LO quote indexes.
  const adminQuotes = await readJsonKv(env, `lo-quotes:admin`, []);
  const merged = Array.from(new Set([...legacyQuotes, ...adminQuotes]));
  if (merged.length) {
    await env.QUOTES.put(`lo-quotes:admin`, JSON.stringify(merged));
  }
  if (legacy.id && legacy.id !== 'admin') {
    await env.QUOTES.delete(`lo-quotes:${legacy.id}`);
  }

  // Drop the legacy LO record and clean up the all-los index.
  await env.QUOTES.delete(`lo:${legacyCode}`);
  const cleaned = codes.filter(c => c !== legacyCode);
  if (!cleaned.includes(adminCode)) cleaned.unshift(adminCode);
  await env.QUOTES.put('all-los', JSON.stringify(cleaned));

  return newProfile;
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    nmls: u.nmls,
    title: u.title,
    email: u.email,
    applyLink: loApplyLink(u),
    role: u.role,
    accessCode: u.accessCode,
  };
}

// ---------- Quote logic ----------
async function createQuote(env, user, body) {
  const clientName = (body.clientName || '').trim();
  const address = (body.address || '').trim();
  const transactionType = (body.transactionType || '').trim();
  const loanProgram = (body.loanProgram || '').trim();
  const loanTerm = (body.loanTerm || '30-YR FIXED').trim();
  const creditScore = (body.creditScore || '').toString().trim();
  const dscrRatio = (body.dscrRatio || '').toString().trim();
  const options = Array.isArray(body.options) ? body.options : [];

  if (!clientName) return { error: 'Client name is required' };
  if (!address) return { error: 'Property address is required' };
  if (!transactionType) return { error: 'Transaction type is required' };
  if (!loanProgram) return { error: 'Loan program is required' };
  if (!options.length) return { error: 'At least one loan option is required' };
  if (options.length > 4) return { error: 'Maximum 4 options allowed' };

  const slug = await uniqueSlug(env, clientName);

  const quote = {
    slug,
    clientName,
    address,
    transactionType,
    loanProgram,
    loanTerm,
    creditScore,
    dscrRatio: loanProgram === 'DSCR' ? dscrRatio : '',
    lo: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      title: user.title,
      nmls: user.nmls,
      email: user.email,
      applyLink: loApplyLink(user),
    },
    loAccessCode: normCode(user.accessCode),
    options: options.map(normalizeOption),
    createdAt: new Date().toISOString(),
  };

  await env.QUOTES.put(`quote:${slug}`, JSON.stringify(quote));

  // Append slug to LO's quote list
  const loList = await readJsonKv(env, `lo-quotes:${user.id}`, []);
  loList.unshift(slug);
  await env.QUOTES.put(`lo-quotes:${user.id}`, JSON.stringify(loList));

  // Append to global list
  const allList = await readJsonKv(env, 'all-quotes', []);
  allList.unshift(slug);
  await env.QUOTES.put('all-quotes', JSON.stringify(allList));

  return { slug, url: `https://${slug}.goratehero.com` };
}

function normalizeOption(o) {
  return {
    name: (o.name || '').trim(),
    recommended: !!o.recommended,
    rate: numOrEmpty(o.rate),
    monthlyPayment: numOrEmpty(o.monthlyPayment),
    taxesInsurance: numOrEmpty(o.taxesInsurance),
    lenderCredit: numOrEmpty(o.lenderCredit),
    pointsPct: numOrEmpty(o.pointsPct),
    pointsDollar: numOrEmpty(o.pointsDollar),
    hasPpp: !!o.hasPpp,
    pppDetails: (o.pppDetails || '').trim(),
    loanAmount: numOrEmpty(o.loanAmount),
    purchasePrice: numOrEmpty(o.purchasePrice),
    breakdownLenderCredit: numOrEmpty(o.breakdownLenderCredit),
    lenderFees: numOrEmpty(o.lenderFees),
    thirdPartyFees: numOrEmpty(o.thirdPartyFees),
    taxesGov: numOrEmpty(o.taxesGov),
    prepaidsEscrow: numOrEmpty(o.prepaidsEscrow),
    pointsCost: numOrEmpty(o.pointsCost),
    cashFromBorrower: numOrEmpty(o.cashFromBorrower),
    // Admin-only per-option fields. Never rendered on the client page.
    wholesaleLender: String(o.wholesaleLender || '').trim(),
    lenderProgram: String(o.lenderProgram || '').trim(),
    internalNotes: String(o.internalNotes || '').trim(),
  };
}

function numOrEmpty(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

async function uniqueSlug(env, clientName) {
  const base = slugify(clientName);
  if (!base) return await uniqueSlug(env, 'client');
  let candidate = base;
  let i = 1;
  while (await env.QUOTES.get(`quote:${candidate}`)) {
    i += 1;
    candidate = `${base}${i}`;
    if (i > 999) throw new Error('Slug collision overflow');
  }
  return candidate;
}

function slugify(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const lastInitial = parts.length > 1
    ? (parts[parts.length - 1][0] || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    : '';
  return (first + lastInitial).replace(/[^a-z0-9]/g, '');
}

async function listQuotes(env, user) {
  let slugs;
  if (user.role === 'admin') {
    slugs = await readJsonKv(env, 'all-quotes', []);
  } else {
    slugs = await readJsonKv(env, `lo-quotes:${user.id}`, []);
  }
  const out = [];
  for (const slug of slugs) {
    const raw = await env.QUOTES.get(`quote:${slug}`);
    if (!raw) continue;
    try {
      const q = JSON.parse(raw);
      out.push({
        slug: q.slug,
        clientName: q.clientName,
        address: q.address,
        transactionType: q.transactionType,
        loanProgram: q.loanProgram,
        createdAt: q.createdAt,
        optionCount: (q.options || []).length,
        loName: q.lo && q.lo.name,
        wholesaleLender: (() => {
          const opt = (q.options || []).find(o => o && String(o.wholesaleLender || '').trim());
          return opt ? String(opt.wholesaleLender).trim() : '';
        })(),
        url: `https://${q.slug}.goratehero.com`,
      });
    } catch {}
  }
  return out;
}

async function getQuote(env, user, slug) {
  const raw = await env.QUOTES.get(`quote:${slug}`);
  if (!raw) return { error: 'Quote not found', status: 404 };
  let q;
  try { q = JSON.parse(raw); } catch { return { error: 'Quote corrupted', status: 500 }; }
  if (user.role !== 'admin' && q.lo && q.lo.id !== user.id) {
    return { error: 'Forbidden', status: 403 };
  }
  return { quote: q };
}

async function updateQuote(env, user, slug, body) {
  const raw = await env.QUOTES.get(`quote:${slug}`);
  if (!raw) return { error: 'Quote not found', status: 404 };
  let existing;
  try { existing = JSON.parse(raw); }
  catch { return { error: 'Quote corrupted', status: 500 }; }
  if (user.role !== 'admin' && existing.lo && existing.lo.id !== user.id) {
    return { error: 'Forbidden', status: 403 };
  }

  const clientName = (body.clientName || '').trim();
  const address = (body.address || '').trim();
  const transactionType = (body.transactionType || '').trim();
  const loanProgram = (body.loanProgram || '').trim();
  const loanTerm = (body.loanTerm || '30-YR FIXED').trim();
  const creditScore = (body.creditScore || '').toString().trim();
  const dscrRatio = (body.dscrRatio || '').toString().trim();
  const options = Array.isArray(body.options) ? body.options : [];

  if (!clientName) return { error: 'Client name is required' };
  if (!address) return { error: 'Property address is required' };
  if (!transactionType) return { error: 'Transaction type is required' };
  if (!loanProgram) return { error: 'Loan program is required' };
  if (!options.length) return { error: 'At least one loan option is required' };
  if (options.length > 4) return { error: 'Maximum 4 options allowed' };

  // Re-snapshot the LO who originally created the quote (their KV profile may
  // have been edited since). Prefer the original creator's record so editing
  // someone else's quote as admin doesn't overwrite the LO attribution.
  const ownerCode = normCode(existing.loAccessCode);
  let ownerProfile = null;
  if (ownerCode) {
    const ownerRaw = await env.QUOTES.get(`lo:${ownerCode}`);
    if (ownerRaw) {
      try { ownerProfile = JSON.parse(ownerRaw); } catch {}
    }
  }
  const lo = ownerProfile
    ? { id: ownerProfile.id, name: ownerProfile.name, phone: ownerProfile.phone, title: ownerProfile.title, nmls: ownerProfile.nmls, email: ownerProfile.email, applyLink: loApplyLink(ownerProfile) }
    : existing.lo;

  // Drop the legacy quote-level `internal` block on save so old records
  // shed the no-longer-used field; notes now live on each option.
  const { internal: _legacyInternal, ...existingWithoutInternal } = existing;
  const updated = {
    ...existingWithoutInternal,
    clientName,
    address,
    transactionType,
    loanProgram,
    loanTerm,
    creditScore,
    dscrRatio: loanProgram === 'DSCR' ? dscrRatio : '',
    options: options.map(normalizeOption),
    lo,
    updatedAt: new Date().toISOString(),
  };
  await env.QUOTES.put(`quote:${slug}`, JSON.stringify(updated));
  return { slug, url: `https://${slug}.goratehero.com`, updated: true };
}

async function reassignQuote(env, slug, newCode) {
  const code = normCode(newCode);
  if (!code) return { error: 'New LO access code is required' };
  const qRaw = await env.QUOTES.get(`quote:${slug}`);
  if (!qRaw) return { error: 'Quote not found', status: 404 };
  let quote;
  try { quote = JSON.parse(qRaw); } catch { return { error: 'Quote corrupted', status: 500 }; }

  const newRaw = await env.QUOTES.get(`lo:${code}`);
  if (!newRaw) return { error: 'Target LO not found', status: 404 };
  let newLo;
  try { newLo = JSON.parse(newRaw); } catch { return { error: 'Target LO corrupted', status: 500 }; }

  const oldId = quote.lo && quote.lo.id;
  if (oldId === newLo.id) {
    return { ok: true, lo: { id: newLo.id, name: newLo.name }, unchanged: true };
  }

  // Remove slug from old LO's quote list
  if (oldId) {
    const oldList = await readJsonKv(env, `lo-quotes:${oldId}`, []);
    const filtered = oldList.filter(s => s !== slug);
    if (filtered.length !== oldList.length) {
      await env.QUOTES.put(`lo-quotes:${oldId}`, JSON.stringify(filtered));
    }
  }
  // Add slug to new LO's quote list (front of list)
  const newList = await readJsonKv(env, `lo-quotes:${newLo.id}`, []);
  if (!newList.includes(slug)) {
    newList.unshift(slug);
    await env.QUOTES.put(`lo-quotes:${newLo.id}`, JSON.stringify(newList));
  }

  quote.loAccessCode = code;
  quote.lo = {
    id: newLo.id,
    name: newLo.name,
    phone: newLo.phone,
    title: newLo.title,
    nmls: newLo.nmls,
    email: newLo.email,
    applyLink: loApplyLink(newLo),
  };
  quote.reassignedAt = new Date().toISOString();
  await env.QUOTES.put(`quote:${slug}`, JSON.stringify(quote));

  return { ok: true, lo: { id: newLo.id, name: newLo.name } };
}

async function deleteQuote(env, user, slug) {
  const raw = await env.QUOTES.get(`quote:${slug}`);
  if (!raw) return { ok: true };
  const q = JSON.parse(raw);
  if (user.role !== 'admin' && q.lo && q.lo.id !== user.id) {
    return { error: 'Forbidden' };
  }
  await env.QUOTES.delete(`quote:${slug}`);

  // Remove from LO list
  if (q.lo && q.lo.id) {
    const loList = await readJsonKv(env, `lo-quotes:${q.lo.id}`, []);
    await env.QUOTES.put(
      `lo-quotes:${q.lo.id}`,
      JSON.stringify(loList.filter(s => s !== slug))
    );
  }
  // Remove from global list
  const allList = await readJsonKv(env, 'all-quotes', []);
  await env.QUOTES.put('all-quotes', JSON.stringify(allList.filter(s => s !== slug)));
  return { ok: true };
}

// ---------- LO management ----------
async function listLOs(env) {
  const codes = await readJsonKv(env, 'all-los', []);
  const adminCode = env.ADMIN_CODE || '';
  // First pass: load all LO records.
  const raw = [];
  for (const code of codes) {
    const r = await env.QUOTES.get(`lo:${code}`);
    if (!r) continue;
    try { raw.push({ code, lo: JSON.parse(r) }); } catch {}
  }
  // Identify the admin record (if any) so we can suppress duplicates that
  // share its name. The admin profile always wins — we keep its entry and
  // drop any other LO whose name matches case-insensitively. This is a
  // belt-and-braces guard against legacy two-account states slipping past
  // the migration.
  const adminEntry = raw.find(e => e.code === adminCode);
  const adminName = adminEntry ? String(adminEntry.lo.name || '').trim().toLowerCase() : '';
  const out = [];
  for (const { lo } of raw) {
    if (adminName && lo.accessCode !== adminCode) {
      const n = String(lo.name || '').trim().toLowerCase();
      if (n && n === adminName) continue;
    }
    out.push({
      id: lo.id,
      accessCode: lo.accessCode,
      name: lo.name,
      phone: lo.phone,
      nmls: lo.nmls,
      title: lo.title,
      email: lo.email,
      applyLink: loApplyLink(lo),
      role: lo.role,
      createdAt: lo.createdAt,
      needsProfileSetup: !!lo.needsProfileSetup,
    });
  }
  return out;
}

// Each LO has their own 1003 application URL. If the LO record doesn't
// carry an explicit applyLink, we derive one from their NMLS so they don't
// have to paste anything for the default case. Used by createLO/updateLO
// and as a server-side fallback whenever we project an LO snapshot.
function defaultApplyLink(nmls) {
  const n = String(nmls || '').trim();
  if (!n) return '';
  return `https://ratehero.my1003app.com/${encodeURIComponent(n)}/register`;
}
function loApplyLink(lo) {
  if (!lo) return '';
  return (lo.applyLink && String(lo.applyLink).trim()) || defaultApplyLink(lo.nmls);
}

async function createLO(env, body) {
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const nmls = (body.nmls || '').trim();
  const title = (body.title || 'Loan Officer').trim();
  const email = (body.email || '').trim();
  const applyLinkRaw = (body.applyLink || '').trim();
  if (!name) return { error: 'Name is required' };
  if (!phone) return { error: 'Phone is required' };

  const accessCode = generateAccessCode();
  const id = 'lo_' + accessCode.toLowerCase();
  const lo = {
    id,
    accessCode,
    name,
    phone,
    nmls,
    title,
    email,
    applyLink: applyLinkRaw || defaultApplyLink(nmls),
    role: 'lo',
    createdAt: new Date().toISOString(),
  };
  await env.QUOTES.put(`lo:${accessCode}`, JSON.stringify(lo));
  const codes = await readJsonKv(env, 'all-los', []);
  codes.unshift(accessCode);
  await env.QUOTES.put('all-los', JSON.stringify(codes));
  return { lo };
}

async function updateLO(env, code, body) {
  const raw = await env.QUOTES.get(`lo:${code}`);
  if (!raw) return { error: 'LO not found' };
  let lo;
  try { lo = JSON.parse(raw); } catch { return { error: 'LO corrupted' }; }
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  if (!name) return { error: 'Name is required' };
  if (!phone) return { error: 'Phone is required' };
  lo.name = name;
  lo.phone = phone;
  lo.nmls = (body.nmls || '').trim();
  lo.title = (body.title || lo.title || 'Loan Officer').trim();
  lo.email = (body.email || '').trim();
  // applyLink: prefer what the admin typed; if empty, fall back to whatever
  // they had before; if that's also empty, derive from the (possibly new) NMLS.
  const submittedApply = body.applyLink !== undefined ? String(body.applyLink).trim() : undefined;
  if (submittedApply !== undefined) {
    lo.applyLink = submittedApply || lo.applyLink || defaultApplyLink(lo.nmls);
  } else if (!lo.applyLink) {
    lo.applyLink = defaultApplyLink(lo.nmls);
  }
  lo.needsProfileSetup = false;
  lo.updatedAt = new Date().toISOString();
  await env.QUOTES.put(`lo:${code}`, JSON.stringify(lo));
  return { lo };
}

async function deleteLO(env, code) {
  const raw = await env.QUOTES.get(`lo:${code}`);
  if (!raw) return { ok: true };
  await env.QUOTES.delete(`lo:${code}`);
  const codes = await readJsonKv(env, 'all-los', []);
  await env.QUOTES.put('all-los', JSON.stringify(codes.filter(c => c !== code)));
  return { ok: true };
}

function generateAccessCode() {
  // 8 chars, A-Z + 2-9 (skip 0/O/1/I for legibility)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

// ---------- Client subdomain ----------
async function handleClientSubdomain(env, sub) {
  const slug = sub.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) return Response.redirect('https://goratehero.com/', 302);
  const raw = await env.QUOTES.get(`quote:${slug}`);
  if (!raw) {
    // No matching quote — bounce to the marketing site so that subdomains
    // like www / mail / etc. continue to work via their own DNS records.
    return Response.redirect('https://goratehero.com/', 302);
  }
  let quote;
  try { quote = JSON.parse(raw); } catch {
    return Response.redirect('https://goratehero.com/', 302);
  }
  // Pull the live LO profile from KV so edits to the LO's name/phone/NMLS
  // propagate to every quote they own. Fall back to the snapshot stored on
  // the quote if their account has been removed.
  let liveLo = null;
  const ownerCode = normCode(quote.loAccessCode);
  if (ownerCode) {
    const loRaw = await env.QUOTES.get(`lo:${ownerCode}`);
    if (loRaw) {
      try {
        const p = JSON.parse(loRaw);
        liveLo = { id: p.id, name: p.name, phone: p.phone, title: p.title, nmls: p.nmls, email: p.email, applyLink: loApplyLink(p) };
      } catch {}
    }
  }
  if (liveLo && liveLo.name) quote.lo = liveLo;
  return html(renderClientPage(quote));
}

// ---------- KV helpers ----------
async function readJsonKv(env, key, fallback) {
  const raw = await env.QUOTES.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

// ---------- HTTP helpers ----------
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}
async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function telHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `tel:+1${digits}` : `tel:+${digits}`;
}

function fmtMoney(v) {
  if (v === '' || v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtRate(v) {
  if (v === '' || v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return Number(v).toFixed(3).replace(/\.?0+$/, m => m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m) + '%';
}
function fmtRateBig(v) {
  if (v === '' || v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  // Strip trailing zeros but keep at least 3 decimals' worth meaningful
  const s = n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return s + '%';
}
function fmtDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ---------- Shared CSS / SVG snippets ----------
const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;

const BOLT_SVG = `<svg viewBox="0 0 30 40" width="22" height="30" aria-hidden="true"><defs><linearGradient id="bolt-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F5B731"/><stop offset="100%" stop-color="#E8920A"/></linearGradient></defs><polygon points="19,0 6,20 13,20 3,40 26,16 17,16" fill="url(#bolt-grad)"/></svg>`;

const BRAND_BASE_CSS = `
  *,*::before,*::after{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    background:#080E1A;
    color:#fff;
    font-family:'Plus Jakarta Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    font-size:15px;
    line-height:1.5;
    -webkit-font-smoothing:antialiased;
    min-height:100vh;
    background-image:
      radial-gradient(circle at 85% 8%, rgba(37,99,235,0.12), transparent 55%),
      linear-gradient(rgba(37,99,235,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(37,99,235,0.04) 1px, transparent 1px);
    background-size: auto, 56px 56px, 56px 56px;
    background-position: 0 0, 0 0, 0 0;
  }
  a{color:#3B82F6;text-decoration:none;}
  a:hover{text-decoration:underline;}
  .display{font-family:'Bebas Neue',sans-serif;font-weight:400;letter-spacing:0.02em;}
  .wordmark{font-family:'Bebas Neue',sans-serif;letter-spacing:4px;font-size:18px;display:inline-flex;align-items:center;gap:0;}
  .wordmark .w-rate{color:#fff;}
  .wordmark .w-hero{color:#3B82F6;}
  .pill{display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(59,130,246,0.15);color:#3B82F6;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:600;border:1px solid rgba(59,130,246,0.35);}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;border:1px solid transparent;transition:transform .08s ease, background .15s ease, border-color .15s ease;font-family:inherit;}
  .btn:hover{text-decoration:none;}
  .btn:active{transform:translateY(1px);}
  .btn-primary{background:#3B82F6;color:#fff;}
  .btn-primary:hover{background:#2563EB;}
  .btn-outline{background:transparent;color:#3B82F6;border-color:#3B82F6;}
  .btn-outline:hover{background:rgba(59,130,246,0.1);}
  .btn-dark{background:#080E1A;color:#fff;border-color:#3B82F6;}
  .btn-dark:hover{background:#0e1626;}
  .btn-ghost{background:transparent;color:rgba(255,255,255,0.7);border-color:rgba(255,255,255,0.15);}
  .btn-ghost:hover{color:#fff;border-color:rgba(255,255,255,0.35);}
  .label-mini{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.35);font-weight:600;}
  .text-secondary{color:rgba(255,255,255,0.8);}
  .text-body{color:rgba(255,255,255,0.55);}
  .text-mute{color:rgba(255,255,255,0.35);}
  .text-fine{color:rgba(255,255,255,0.25);font-size:12px;}
  .card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;}
  .divider{height:1px;background:rgba(255,255,255,0.08);margin:14px 0;border:0;}
  .input,.select,.textarea,select{
    width:100%;background:#0D1526;border:1px solid rgba(255,255,255,0.1);
    color:#ffffff;border-radius:10px;padding:11px 13px;font-family:inherit;font-size:14px;outline:none;
  }
  select option{background:#0D1526;color:#ffffff;}
  .input:focus,.select:focus,.textarea:focus,select:focus{border-color:#3B82F6;background:#101a2f;}
  .field{display:flex;flex-direction:column;gap:6px;}
  .field label{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.45);font-weight:600;}
  @media (max-width: 720px){
    .display-xl{font-size:42px !important;}
  }
`;

// ---------- Admin shell ----------
function renderAdminShell() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Rate Hero — Quote Builder</title>
${FONT_LINK}
<style>${BRAND_BASE_CSS}
.app{max-width:1200px;margin:0 auto;padding:0 22px;}
.nav{position:sticky;top:0;z-index:10;background:rgba(8,14,26,0.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,0.08);}
.nav-inner{max-width:1200px;margin:0 auto;padding:14px 22px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
.brand{display:flex;align-items:center;gap:10px;}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:24px 0 18px;}
.tab{padding:9px 16px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;}
.tab.active{background:#3B82F6;border-color:#3B82F6;color:#fff;}
.tab:hover:not(.active){color:#fff;border-color:rgba(255,255,255,0.18);}
.section-title{font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:2px;margin:0 0 4px;}
.section-sub{color:rgba(255,255,255,0.55);font-size:14px;margin-bottom:18px;}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
@media (max-width:720px){.grid-2,.grid-3,.grid-4{grid-template-columns:1fr;}}
.card-pad{padding:22px;}
.opt-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;}
.opt-tab{padding:8px 14px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;}
.opt-tab.active{background:rgba(59,130,246,0.18);border-color:#3B82F6;color:#fff;}
.opt-tab.add{border-style:dashed;color:#3B82F6;}
.row-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:16px;}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);background:#0e1626;border:1px solid rgba(59,130,246,0.4);padding:12px 18px;border-radius:10px;color:#fff;font-weight:600;font-size:14px;opacity:0;pointer-events:none;transition:opacity .2s, transform .2s;z-index:50;}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
.toast.err{border-color:rgba(239,68,68,0.55);}
.quote-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;margin-bottom:10px;flex-wrap:wrap;}
.quote-row .meta{display:flex;flex-direction:column;gap:2px;min-width:200px;}
.quote-row .title{font-weight:700;font-size:15px;}
.quote-row .sub{font-size:12px;color:rgba(255,255,255,0.5);}
.quote-row .actions{display:flex;gap:8px;flex-wrap:wrap;}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
.login-card{max-width:420px;width:100%;padding:36px;}
.code-display{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;letter-spacing:3px;font-size:15px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.4);color:#fff;padding:6px 12px;border-radius:8px;display:inline-block;}
.checkbox{display:inline-flex;align-items:center;gap:8px;color:rgba(255,255,255,0.8);font-size:13px;cursor:pointer;}
.checkbox input{width:16px;height:16px;accent-color:#3B82F6;}
.opt-section-title{font-family:'Bebas Neue',sans-serif;letter-spacing:2px;font-size:16px;color:rgba(255,255,255,0.8);margin:18px 0 10px;}
.right{display:flex;gap:10px;align-items:center;}
.user-chip{display:flex;align-items:center;gap:10px;font-size:13px;color:rgba(255,255,255,0.7);}
.user-chip strong{color:#fff;font-weight:700;}
.bolt-circle{width:28px;height:28px;border-radius:50%;background:rgba(245,183,49,0.12);border:1px solid rgba(245,183,49,0.3);display:inline-flex;align-items:center;justify-content:center;}
.internal-card{border-left:4px solid #F5B731;background:rgba(245,183,49,0.04);}
.internal-card .section-title{color:#F5B731;}
.internal-tag{display:inline-block;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#F5B731;font-weight:700;margin-left:8px;vertical-align:middle;background:rgba(245,183,49,0.12);padding:3px 8px;border-radius:6px;}
.opt-internal{margin-top:18px;padding:14px;border:1px dashed rgba(245,183,49,0.35);border-radius:10px;background:rgba(245,183,49,0.04);}
.opt-internal-title{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#F5B731;font-weight:700;margin-bottom:10px;}
.textarea{width:100%;background:#0D1526;border:1px solid rgba(255,255,255,0.1);color:#ffffff;border-radius:10px;padding:11px 13px;font-family:inherit;font-size:14px;outline:none;resize:vertical;min-height:78px;}
.textarea:focus{border-color:#3B82F6;background:#101a2f;}
</style>
</head>
<body>
<div id="root"><div style="padding:60px;text-align:center;color:rgba(255,255,255,0.5)">Loading…</div></div>
<div id="toast" class="toast"></div>
<script>${ADMIN_JS}</script>
</body>
</html>`;
}

const ADMIN_JS = `
const BOLT_SVG = ${JSON.stringify(BOLT_SVG)};
const APPLY_URL = ${JSON.stringify(APPLY_URL)};

const state = {
  user: null,
  token: (localStorage.getItem('rh_token') || '').toUpperCase().replace(/[^A-Z0-9]/g,''),
  tab: 'new',
  quotes: [],
  los: [],
  form: defaultForm(),
  loForm: defaultLoForm(),
};

function defaultForm() {
  return {
    editingSlug: null,
    clientName: '',
    address: '',
    transactionType: 'Purchase',
    loanProgram: 'DSCR',
    loanTerm: '30-YR FIXED',
    creditScore: '',
    dscrRatio: '',
    activeOption: 0,
    options: [defaultOption()],
  };
}
function defaultLoForm() {
  return { editingCode: null, name: '', phone: '', nmls: '', title: '', email: '', applyLink: '' };
}
function defaultOption() {
  return {
    name: '',
    recommended: false,
    rate: '',
    monthlyPayment: '',
    taxesInsurance: '',
    lenderCredit: '',
    pointsPct: '',
    pointsDollar: '',
    hasPpp: false,
    pppDetails: '',
    loanAmount: '',
    purchasePrice: '',
    breakdownLenderCredit: '',
    lenderFees: '',
    thirdPartyFees: '',
    taxesGov: '',
    prepaidsEscrow: '',
    pointsCost: '',
    cashFromBorrower: '',
    wholesaleLender: '',
    lenderProgram: '',
    internalNotes: '',
  };
}

const TRANSACTION_TYPES = ['Purchase','Refinance','Cash-Out'];
const LOAN_PROGRAMS = ['DSCR','Bank Statement','Non-QM','HELOC','Hard Money Exit','BRRRR','Conventional','FHA','VA','P&L Only','Asset Utilization','1099'];
const LOAN_TERMS = ['30-YR FIXED','15-YR FIXED','ARM 5/1','ARM 7/1','40-YR FIXED'];

function toast(msg, isErr=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(window.__tTimer);
  window.__tTimer = setTimeout(()=>{ t.className = 'toast' + (isErr ? ' err' : ''); }, 2400);
}

async function api(path, opts={}) {
  const headers = Object.assign({'content-type':'application/json'}, opts.headers||{});
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  let body = {};
  try { body = await res.json(); } catch {}
  if (!res.ok) throw new Error(body.error || ('HTTP '+res.status));
  return body;
}

function escapeHtml(s) {
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function init() {
  if (state.token) {
    try {
      const me = await api('/admin/api/me');
      state.user = me.user;
      render();
      loadQuotes();
      if (state.user.role === 'admin') loadLOs();
      return;
    } catch {
      state.token = '';
      localStorage.removeItem('rh_token');
    }
  }
  renderLogin();
}

function renderLogin() {
  document.getElementById('root').innerHTML = \`
    <div class="login-wrap">
      <div class="card login-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
          \${BOLT_SVG}
          <span class="display" style="font-size:24px;letter-spacing:3px;">QUOTE BUILDER</span>
        </div>
        <p class="text-body" style="margin:0 0 22px;font-size:14px;">Enter your access code to continue.</p>
        <form id="loginForm">
          <input id="codeInput" class="input" placeholder="ACCESS CODE" autocapitalize="characters" autocorrect="off" autocomplete="off" spellcheck="false" style="text-align:center;letter-spacing:5px;font-weight:700;text-transform:uppercase;font-size:15px;" />
          <button class="btn btn-primary" type="submit" style="width:100%;margin-top:14px;">Sign In</button>
          <div id="loginErr" style="color:#ef5060;font-size:13px;margin-top:10px;min-height:18px;"></div>
        </form>
      </div>
    </div>\`;
  document.getElementById('loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const code = document.getElementById('codeInput').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    document.getElementById('loginErr').textContent = '';
    try {
      const r = await fetch('/admin/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || 'Invalid code');
      state.token = code;
      state.user = b.user;
      localStorage.setItem('rh_token', code);
      render();
      loadQuotes();
      if (state.user.role === 'admin') loadLOs();
    } catch (err) {
      document.getElementById('loginErr').textContent = err.message;
    }
  });
}

function logout() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('rh_token');
  renderLogin();
}

function render() {
  const u = state.user;
  const isAdmin = u && u.role === 'admin';
  document.getElementById('root').innerHTML = \`
    <header class="nav">
      <div class="nav-inner">
        <div class="brand">\${BOLT_SVG}<span class="wordmark"><span class="w-rate">RATE</span><span class="w-hero">HERO</span></span><span class="pill" style="margin-left:8px;">Quote Builder</span></div>
        <div class="right">
          <div class="user-chip"><strong>\${escapeHtml(u.name)}</strong><span>· \${u.role==='admin'?'Admin':'LO'}</span></div>
          <button class="btn btn-ghost" onclick="logout()">Sign Out</button>
        </div>
      </div>
    </header>
    <div class="app">
      <div class="tabs">
        <button class="tab \${state.tab==='new'?'active':''}" onclick="setTab('new')">New Quote</button>
        <button class="tab \${state.tab==='my'?'active':''}" onclick="setTab('my')">\${isAdmin?'All Quotes':'My Quotes'}</button>
        \${isAdmin ? '<button class="tab '+(state.tab==='team'?'active':'')+'" onclick="setTab(\\'team\\')">Team</button>' : ''}
      </div>
      <div id="tabBody"></div>
    </div>\`;
  renderTab();
}

function setTab(t) { state.tab = t; document.querySelectorAll('.tab').forEach(el=>el.classList.remove('active')); render(); }

function renderTab() {
  const body = document.getElementById('tabBody');
  if (state.tab === 'new') body.innerHTML = renderNewQuote();
  else if (state.tab === 'my') body.innerHTML = renderQuotesList();
  else if (state.tab === 'team') body.innerHTML = renderTeam();
  attachFormHandlers();
}

function renderNewQuote() {
  const f = state.form;
  return \`
    <div class="card card-pad">
      <h2 class="section-title">CLIENT INFORMATION</h2>
      <p class="section-sub">Who is this quote for and what are they looking at?</p>
      <div class="grid-2">
        <div class="field"><label>Client Name</label><input class="input" data-f="clientName" value="\${escapeHtml(f.clientName)}" placeholder="e.g. Anthony Guastella" /></div>
        <div class="field"><label>Property Address</label><input class="input" data-f="address" value="\${escapeHtml(f.address)}" placeholder="123 Main St, City, ST" /></div>
        <div class="field"><label>Transaction Type</label>\${selectHtml('transactionType', TRANSACTION_TYPES, f.transactionType)}</div>
        <div class="field"><label>Loan Program</label>\${selectHtml('loanProgram', LOAN_PROGRAMS, f.loanProgram)}</div>
        <div class="field"><label>Loan Term</label>\${selectHtml('loanTerm', LOAN_TERMS, f.loanTerm)}</div>
        <div class="field"><label>Credit Score</label><input class="input" data-f="creditScore" value="\${escapeHtml(f.creditScore)}" placeholder="720" /></div>
        <div class="field dscrRatioField" style="display:\${f.loanProgram === 'DSCR' ? 'flex' : 'none'};"><label>DSCR Ratio</label><input class="input" data-f="dscrRatio" value="\${escapeHtml(f.dscrRatio)}" placeholder="1.25" /></div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:18px;">
      <h2 class="section-title">LOAN OPTIONS</h2>
      <p class="section-sub">Add up to 4 options. Mark one as "Recommended" if applicable.</p>
      <div class="opt-tabs">
        \${f.options.map((o,i)=>'<button class="opt-tab '+(i===f.activeOption?'active':'')+'" onclick="setActiveOption('+i+')">Option '+(i+1)+'</button>').join('')}
        \${f.options.length < 4 ? '<button class="opt-tab add" onclick="addOption()">+ Add Option</button>' : ''}
      </div>
      \${renderOptionForm(f.options[f.activeOption], f.activeOption)}
    </div>

    <div class="row-actions">
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-ghost" onclick="resetForm()">\${f.editingSlug ? 'Cancel Edit' : 'Reset'}</button>
        \${f.editingSlug ? '<span class="text-mute" style="font-size:12px;">Editing <strong style="color:#fff;">'+escapeHtml(f.editingSlug)+'.goratehero.com</strong></span>' : ''}
      </div>
      <button class="btn btn-primary" onclick="generateQuote()">\${f.editingSlug ? 'Update Quote' : 'Generate Quote Link'}</button>
    </div>\`;
}

function renderOptionForm(o, idx) {
  return \`
    <div class="grid-2">
      <div class="field"><label>Option Name</label><input class="input" data-o="name" value="\${escapeHtml(o.name)}" placeholder="e.g. Middle Ground (2.303 Points)" /></div>
      <div class="field" style="justify-content:flex-end;"><label>&nbsp;</label>
        <label class="checkbox"><input type="checkbox" data-o="recommended" \${o.recommended?'checked':''}/> Recommended</label>
      </div>
    </div>
    <div class="opt-section-title">Pricing</div>
    <div class="grid-4">
      <div class="field"><label>Interest Rate %</label><input class="input" data-o="rate" type="number" step="0.001" value="\${o.rate}" placeholder="6.875" /></div>
      <div class="field"><label>Monthly Payment</label><input class="input" data-o="monthlyPayment" type="number" value="\${o.monthlyPayment}" placeholder="3200" /></div>
      <div class="field"><label>Taxes &amp; Insurance</label><input class="input" data-o="taxesInsurance" type="number" value="\${o.taxesInsurance}" placeholder="850" /></div>
      <div class="field"><label>Lender Credit</label><input class="input" data-o="lenderCredit" type="number" value="\${o.lenderCredit}" placeholder="0" /></div>
      <div class="field"><label>Points %</label><input class="input" data-o="pointsPct" type="number" step="0.001" value="\${o.pointsPct}" placeholder="2.303" /></div>
      <div class="field"><label>Points $</label><input class="input" data-o="pointsDollar" type="number" value="\${o.pointsDollar}" placeholder="9212" /></div>
      <div class="field" style="justify-content:flex-end;"><label>&nbsp;</label>
        <label class="checkbox"><input type="checkbox" data-o="hasPpp" \${o.hasPpp?'checked':''}/> Prepayment penalty</label>
      </div>
      <div class="field"><label>PPP Details</label><input class="input" data-o="pppDetails" value="\${escapeHtml(o.pppDetails)}" placeholder="5 Year: 6 Mo Interest" /></div>
    </div>
    <div class="opt-section-title breakdownSectionTitle">\${breakdownSectionTitle(state.form.transactionType)}</div>
    <div class="grid-3">
      <div class="field"><label>Loan Amount (+)</label><input class="input" data-o="loanAmount" type="number" value="\${o.loanAmount}" /></div>
      <div class="field"><label class="propValueLabel">\${propertyValueLabel(state.form.transactionType)} (-)</label><input class="input" data-o="purchasePrice" type="number" value="\${o.purchasePrice}" /></div>
      <div class="field"><label>Lender Credit (+)</label><input class="input" data-o="breakdownLenderCredit" type="number" value="\${o.breakdownLenderCredit}" /></div>
      <div class="field"><label>Lender Fees (-)</label><input class="input" data-o="lenderFees" type="number" value="\${o.lenderFees}" /></div>
      <div class="field"><label>Third Party Fees (-)</label><input class="input" data-o="thirdPartyFees" type="number" value="\${o.thirdPartyFees}" /></div>
      <div class="field"><label>Taxes &amp; Gov't (-)</label><input class="input" data-o="taxesGov" type="number" value="\${o.taxesGov}" /></div>
      <div class="field"><label>Prepaids &amp; Escrow (-)</label><input class="input" data-o="prepaidsEscrow" type="number" value="\${o.prepaidsEscrow}" /></div>
      <div class="field"><label>Points Cost (-)</label><input class="input" data-o="pointsCost" type="number" value="\${o.pointsCost}" /></div>
      <div class="field"><label class="cashTotalLabel">\${cashTotalLabel(state.form.transactionType)}</label><input class="input" data-o="cashFromBorrower" type="number" value="\${o.cashFromBorrower}" /></div>
    </div>
    <div class="opt-internal">
      <div class="opt-internal-title">INTERNAL (NOT VISIBLE TO CLIENTS)</div>
      <div class="grid-2">
        <div class="field"><label>Wholesale Lender</label><input class="input" data-o="wholesaleLender" value="\${escapeHtml(o.wholesaleLender || '')}" placeholder="e.g. UWM, Kiavi, A&amp;D Mortgage" /></div>
        <div class="field"><label>Lender Program</label><input class="input" data-o="lenderProgram" value="\${escapeHtml(o.lenderProgram || '')}" placeholder="e.g. Prime Jumbo, DSCR 30yr Fixed" /></div>
      </div>
      <div class="field" style="margin-top:10px;">
        <label>Notes</label>
        <textarea class="textarea" data-o="internalNotes" rows="2" placeholder="Internal notes about this option...">\${escapeHtml(o.internalNotes || '')}</textarea>
      </div>
    </div>
    \${state.form.options.length > 1 ? '<div style="margin-top:14px;"><button class="btn btn-ghost" onclick="removeOption('+idx+')">Remove Option '+(idx+1)+'</button></div>' : ''}
  \`;
}

function selectHtml(field, opts, current) {
  return '<select class="select" data-f="'+field+'">' + opts.map(o=>'<option '+(o===current?'selected':'')+'>'+escapeHtml(o)+'</option>').join('') + '</select>';
}

function propertyValueLabel(transactionType) {
  return (transactionType === 'Refinance' || transactionType === 'Cash-Out')
    ? 'Appraised Value'
    : 'Purchase Price';
}
function cashTotalLabel(transactionType) {
  if (transactionType === 'Cash-Out') return 'Cash to Borrower';
  if (transactionType === 'Refinance') return 'From';
  return 'Cash from Borrower';
}
function breakdownSectionTitle(transactionType) {
  return transactionType === 'Cash-Out'
    ? 'CASH TO BORROWER BREAKDOWN'
    : 'CASH FROM / TO BORROWER BREAKDOWN';
}
function refreshDynamicLabels() {
  const t = state.form.transactionType;
  const propLbl = propertyValueLabel(t) + ' (-)';
  document.querySelectorAll('.propValueLabel').forEach(el => { el.textContent = propLbl; });
  const cashLbl = cashTotalLabel(t);
  document.querySelectorAll('.cashTotalLabel').forEach(el => { el.textContent = cashLbl; });
  const sectionLbl = breakdownSectionTitle(t);
  document.querySelectorAll('.breakdownSectionTitle').forEach(el => { el.textContent = sectionLbl; });
}
function refreshDscrFieldVisibility() {
  const show = state.form.loanProgram === 'DSCR';
  document.querySelectorAll('.dscrRatioField').forEach(el => { el.style.display = show ? 'flex' : 'none'; });
}

function attachFormHandlers() {
  document.querySelectorAll('[data-f]').forEach(el=>{
    const apply = () => {
      state.form[el.dataset.f] = el.value;
      if (el.dataset.f === 'transactionType') refreshDynamicLabels();
      if (el.dataset.f === 'loanProgram') refreshDscrFieldVisibility();
    };
    el.addEventListener('input', apply);
    el.addEventListener('change', apply);
  });
  document.querySelectorAll('[data-o]').forEach(el=>{
    el.addEventListener('input', ()=>{
      const o = state.form.options[state.form.activeOption];
      const k = el.dataset.o;
      o[k] = el.type === 'checkbox' ? el.checked : el.value;
    });
    el.addEventListener('change', ()=>{
      const o = state.form.options[state.form.activeOption];
      const k = el.dataset.o;
      o[k] = el.type === 'checkbox' ? el.checked : el.value;
    });
  });
}

function setActiveOption(i) { state.form.activeOption = i; renderTab(); }
function addOption() {
  if (state.form.options.length >= 4) return;
  state.form.options.push(defaultOption());
  state.form.activeOption = state.form.options.length - 1;
  renderTab();
}
function removeOption(i) {
  state.form.options.splice(i,1);
  state.form.activeOption = Math.max(0, Math.min(state.form.activeOption, state.form.options.length-1));
  renderTab();
}
function resetForm() { state.form = defaultForm(); renderTab(); }

async function generateQuote() {
  try {
    if (state.form.editingSlug) {
      const slug = state.form.editingSlug;
      await api('/admin/api/quotes/'+slug, { method:'PUT', body: JSON.stringify(state.form) });
      toast('Quote updated!');
      resetForm();
      await loadQuotes();
      setTab('my');
    } else {
      const r = await api('/admin/api/quotes', { method:'POST', body: JSON.stringify(state.form) });
      try { await navigator.clipboard.writeText(r.url); } catch {}
      toast('Quote link copied: ' + r.url);
      resetForm();
      loadQuotes();
    }
  } catch (err) {
    toast(err.message, true);
  }
}

async function editQuote(slug) {
  try {
    const r = await api('/admin/api/quotes/'+slug);
    const q = r.quote;
    state.form = {
      editingSlug: q.slug,
      clientName: q.clientName || '',
      address: q.address || '',
      transactionType: q.transactionType || 'Purchase',
      loanProgram: q.loanProgram || 'DSCR',
      loanTerm: q.loanTerm || '30-YR FIXED',
      creditScore: q.creditScore || '',
      dscrRatio: q.dscrRatio || '',
      activeOption: 0,
      options: (q.options && q.options.length ? q.options : [defaultOption()]).map(o => Object.assign(defaultOption(), o)),
    };
    setTab('new');
  } catch (err) { toast(err.message, true); }
}

async function loadQuotes() {
  try {
    const r = await api('/admin/api/quotes');
    state.quotes = r.quotes || [];
    if (state.tab === 'my') renderTab();
  } catch (err) { console.error(err); }
}

function renderQuotesList() {
  if (!state.quotes.length) {
    return '<div class="card card-pad" style="text-align:center;color:rgba(255,255,255,0.5);">No quotes yet. Create one from the New Quote tab.</div>';
  }
  const isAdmin = state.user && state.user.role === 'admin';
  return state.quotes.map(q=>\`
    <div class="quote-row" id="qrow-\${q.slug}">
      <div class="meta">
        <span class="title">\${escapeHtml(q.clientName)}</span>
        <span class="sub">\${escapeHtml(q.transactionType)} · \${escapeHtml(q.loanProgram)}\${q.wholesaleLender ? ' · <span style="color:#F5B731;font-weight:600;">'+escapeHtml(q.wholesaleLender)+'</span>' : ''} · \${q.optionCount} option\${q.optionCount===1?'':'s'}</span>
        <span class="sub">\${escapeHtml(q.address)}</span>
        \${isAdmin ? '<span class="sub">LO: '+escapeHtml(q.loName||'—')+'</span>' : ''}
        <span class="sub">\${new Date(q.createdAt).toLocaleDateString()} · <a href="\${q.url}" target="_blank">\${escapeHtml(q.url.replace('https://',''))}</a></span>
        <div class="reassign-row" id="reassign-\${q.slug}" style="display:none;margin-top:8px;gap:8px;align-items:center;flex-wrap:wrap;">
          <label class="sub" style="margin-right:4px;">Reassign to:</label>
          <select class="reassign-select" id="reassign-sel-\${q.slug}" style="min-width:200px;max-width:260px;"></select>
          <button class="btn btn-primary" onclick="confirmReassign('\${q.slug}')">Confirm</button>
          <button class="btn btn-ghost" onclick="closeReassign('\${q.slug}')">Cancel</button>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-outline" onclick="copyLink('\${q.url}')">Copy Link</button>
        <button class="btn btn-outline" onclick="editQuote('\${q.slug}')">Edit</button>
        \${isAdmin ? '<button class="btn btn-outline" onclick="openReassign(\\''+q.slug+'\\')">Reassign</button>' : ''}
        <button class="btn btn-ghost" onclick="deleteQuote('\${q.slug}')">Delete</button>
      </div>
    </div>\`).join('');
}

function openReassign(slug) {
  if (!state.los || !state.los.length) {
    // LOs might not be loaded yet if admin landed directly on My Quotes
    loadLOs().then(() => openReassign(slug));
    return;
  }
  const row = document.getElementById('reassign-'+slug);
  const sel = document.getElementById('reassign-sel-'+slug);
  if (!row || !sel) return;
  const quote = state.quotes.find(q => q.slug === slug);
  const currentLoName = quote ? (quote.loName || '') : '';
  sel.innerHTML = state.los.map(lo =>
    '<option value="'+escapeHtml(lo.accessCode)+'"'+(lo.name === currentLoName ? ' selected' : '')+'>'+
    escapeHtml(lo.name || '(unnamed)')+(lo.accessCode === state.user.accessCode ? ' (you)' : '')+
    '</option>'
  ).join('');
  row.style.display = 'flex';
}

function closeReassign(slug) {
  const row = document.getElementById('reassign-'+slug);
  if (row) row.style.display = 'none';
}

async function confirmReassign(slug) {
  const sel = document.getElementById('reassign-sel-'+slug);
  if (!sel) return;
  const newCode = sel.value;
  if (!newCode) return;
  try {
    const r = await api('/admin/api/quotes/'+slug+'/reassign', {
      method: 'POST',
      body: JSON.stringify({ newLoAccessCode: newCode }),
    });
    const name = r.lo && r.lo.name ? r.lo.name : 'new LO';
    toast('Quote reassigned to ' + name);
    closeReassign(slug);
    loadQuotes();
  } catch (err) { toast(err.message, true); }
}

async function copyLink(url) {
  try { await navigator.clipboard.writeText(url); toast('Link copied: ' + url); }
  catch { toast(url); }
}

async function deleteQuote(slug) {
  if (!confirm('Delete this quote? The shareable link will stop working.')) return;
  try {
    await api('/admin/api/quotes/'+slug, { method:'DELETE' });
    toast('Quote deleted');
    loadQuotes();
  } catch (err) { toast(err.message, true); }
}

async function loadLOs() {
  try {
    const r = await api('/admin/api/los');
    state.los = r.los || [];
    if (state.tab === 'team') renderTab();
  } catch (err) { console.error(err); }
}

function renderTeam() {
  const f = state.loForm;
  const editing = !!f.editingCode;
  const adminCode = state.user && state.user.role === 'admin' ? state.user.accessCode : null;
  return \`
    <div class="card card-pad">
      <h2 class="section-title">\${editing ? 'EDIT LOAN OFFICER' : 'ADD LOAN OFFICER'}</h2>
      <p class="section-sub">\${editing ? 'Update this LO\\'s profile. Their access code will not change.' : 'Adds an LO and generates an access code they can use to sign in.'}</p>
      <div class="grid-3">
        <div class="field"><label>Full Name</label><input class="input" id="loName" value="\${escapeHtml(f.name)}" placeholder="Zack Kirakosyan"/></div>
        <div class="field"><label>Phone</label><input class="input" id="loPhone" value="\${escapeHtml(f.phone)}" placeholder="(818) 208-6801"/></div>
        <div class="field"><label>NMLS</label><input class="input" id="loNmls" value="\${escapeHtml(f.nmls)}" placeholder="1234567"/></div>
        <div class="field"><label>Title</label><input class="input" id="loTitle" value="\${escapeHtml(f.title)}" placeholder="Loan Officer"/></div>
        <div class="field"><label>Email</label><input class="input" id="loEmail" value="\${escapeHtml(f.email)}" placeholder="zack@goratehero.com"/></div>
      </div>
      <div class="field" style="margin-top:14px;">
        <label>Apply Link (1003 App URL)</label>
        <input class="input" id="loApplyLink" value="\${escapeHtml(f.applyLink)}" placeholder="https://ratehero.my1003app.com/NMLS/register" autocomplete="off" spellcheck="false" />
        <span class="text-mute" style="font-size:11px;margin-top:4px;">Leave blank to auto-generate from NMLS.</span>
      </div>
      <div class="row-actions">
        <div>\${editing ? '<button class="btn btn-ghost" onclick="cancelEditLO()">Cancel</button>' : ''}</div>
        <button class="btn btn-primary" onclick="saveLO()">\${editing ? 'Update LO' : 'Add LO &amp; Generate Code'}</button>
      </div>
    </div>
    <div class="card card-pad" style="margin-top:18px;">
      <h2 class="section-title">TEAM</h2>
      <p class="section-sub">All loan officers on this account. Codes are shown so you can share them.</p>
      \${state.los.length ? state.los.map(lo=>{
        const isAdminRow = adminCode && lo.accessCode === adminCode;
        return \`
        <div class="quote-row">
          <div class="meta">
            <span class="title">\${escapeHtml(lo.name)} <span class="sub">· \${escapeHtml(lo.title||'')}\${isAdminRow ? ' · <span style="color:#3B82F6;font-weight:700;">ADMIN</span>' : ''}</span></span>
            <span class="sub">\${escapeHtml(lo.phone||'')} \${lo.nmls?'· NMLS '+escapeHtml(lo.nmls):''} \${lo.email?'· '+escapeHtml(lo.email):''}</span>
            <span class="sub">Access code: <span class="code-display">\${escapeHtml(lo.accessCode)}</span></span>
            \${lo.needsProfileSetup ? '<span class="sub" style="color:#F5B731;">Profile needs setup — click Edit</span>' : ''}
          </div>
          <div class="actions">
            <button class="btn btn-outline" onclick="editLO('\${lo.accessCode}')">Edit</button>
            <button class="btn btn-ghost" onclick="copyText('\${lo.accessCode}')">Copy Code</button>
            \${isAdminRow ? '' : \`<button class="btn btn-ghost" onclick="removeLO('\${lo.accessCode}')">Remove</button>\`}
          </div>
        </div>\`;
      }).join('') : '<div class="text-body">No LOs added yet.</div>'}
    </div>\`;
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Copied: ' + t); }
  catch { toast(t); }
}

function readLoForm() {
  return {
    name: document.getElementById('loName').value.trim(),
    phone: document.getElementById('loPhone').value.trim(),
    nmls: document.getElementById('loNmls').value.trim(),
    title: document.getElementById('loTitle').value.trim() || 'Loan Officer',
    email: document.getElementById('loEmail').value.trim(),
    applyLink: document.getElementById('loApplyLink').value.trim(),
  };
}

async function saveLO() {
  const body = readLoForm();
  try {
    if (state.loForm.editingCode) {
      const code = state.loForm.editingCode;
      await api('/admin/api/los/'+code, { method:'PUT', body: JSON.stringify(body) });
      toast('LO updated!');
      // If the admin is editing their own profile, refresh the cached user record
      if (state.user && state.user.accessCode === code) {
        try { const me = await api('/admin/api/me'); state.user = me.user; } catch {}
      }
      state.loForm = defaultLoForm();
      loadLOs();
      render();
    } else {
      const r = await api('/admin/api/los', { method:'POST', body: JSON.stringify(body) });
      toast('LO added — code: ' + r.lo.accessCode);
      state.loForm = defaultLoForm();
      loadLOs();
    }
  } catch (err) { toast(err.message, true); }
}

function editLO(code) {
  const lo = state.los.find(l => l.accessCode === code);
  if (!lo) return;
  state.loForm = {
    editingCode: code,
    name: lo.name || '',
    phone: lo.phone || '',
    nmls: lo.nmls || '',
    title: lo.title || '',
    email: lo.email || '',
    applyLink: lo.applyLink || '',
  };
  renderTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEditLO() {
  state.loForm = defaultLoForm();
  renderTab();
}

async function removeLO(code) {
  if (!confirm('Remove this LO? Their access code will stop working.')) return;
  try {
    await api('/admin/api/los/'+code, { method:'DELETE' });
    toast('LO removed');
    loadLOs();
  } catch (err) { toast(err.message, true); }
}

init();
`;

// ---------- Client-facing page ----------
function renderClientPage(q) {
  const lo = q.lo || {};
  const firstName = (q.clientName || '').trim().split(/\s+/)[0] || 'there';
  const transUpper = (q.transactionType || '').toUpperCase();
  const dateStr = fmtDate(q.createdAt);
  const optsCount = (q.options || []).length;
  const loPhoneHref = telHref(lo.phone || COMPANY_PHONE);
  const heroPhoneHref = telHref(COMPANY_PHONE);
  const loFirstName = lo.name ? String(lo.name).trim().split(/\s+/)[0] : '';
  const applyHref = (lo.applyLink && String(lo.applyLink).trim()) || APPLY_URL;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Loan Comparison — ${escapeHtml(q.clientName)} | Rate Hero</title>
${FONT_LINK}
<style>${BRAND_BASE_CSS}
.page{max-width:1180px;margin:0 auto;padding:0 22px;}
.nav{position:sticky;top:0;z-index:10;background:rgba(8,14,26,0.75);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,0.08);}
.nav-inner{max-width:1180px;margin:0 auto;padding:14px 22px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
.nav-brand{display:flex;align-items:center;gap:10px;}
.nav-lo{display:flex;flex-direction:column;align-items:flex-end;line-height:1.3;gap:1px;}
.nav-lo strong{color:#fff;font-weight:600;font-size:13px;}
.nav-lo .meta-line{color:rgba(255,255,255,0.4);font-size:12px;text-decoration:none;}
.nav-lo .meta-line:hover{color:rgba(255,255,255,0.7);text-decoration:underline;}
.hero{display:grid;grid-template-columns:1.6fr 1fr;gap:40px;padding:50px 0 30px;align-items:start;}
@media (max-width: 920px){.hero{grid-template-columns:1fr;gap:22px;}}
.kicker{color:#3B82F6;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;margin-bottom:14px;}
.hero h1{font-family:'Bebas Neue',sans-serif;font-size:64px;letter-spacing:2px;line-height:1;margin:0 0 16px;}
.hero h1 .name{color:#3B82F6;}
.hero p.sub{color:rgba(255,255,255,0.65);font-size:16px;max-width:560px;margin:0 0 22px;}
.quote-date{color:rgba(255,255,255,0.5);font-size:13px;display:flex;align-items:center;gap:8px;}
.quote-date::before{content:"";width:8px;height:8px;border-radius:50%;background:#3B82F6;display:inline-block;box-shadow:0 0 12px rgba(59,130,246,0.7);}
.info-box{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:22px;}
.info-row{margin-bottom:18px;}
.info-row:last-child{margin-bottom:0;}
.info-label{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.35);font-weight:600;margin-bottom:6px;}
.info-val{color:#fff;font-size:15px;}
.controls{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;padding:18px 0 18px;border-top:1px solid rgba(255,255,255,0.08);border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:30px;}
.tabset{display:flex;gap:6px;flex-wrap:wrap;}
.tabbtn{padding:8px 14px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;}
.tabbtn.active{background:#3B82F6;border-color:#3B82F6;color:#fff;}
.sort{display:flex;align-items:center;gap:10px;color:rgba(255,255,255,0.55);font-size:13px;}
.sort select{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#fff;border-radius:8px;padding:8px 10px;font-family:inherit;font-size:13px;}
.opt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;margin-bottom:40px;}
.opt{position:relative;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:22px;display:flex;flex-direction:column;overflow:hidden;}
.opt.recommended{border-color:rgba(59,130,246,0.45);}
.opt::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg, rgba(59,130,246,0.3), rgba(59,130,246,0.05));}
.opt.recommended::before{background:linear-gradient(90deg, #3B82F6, rgba(59,130,246,0.2));}
.opt-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
.opt-num{color:rgba(255,255,255,0.4);font-size:12px;letter-spacing:1px;font-weight:600;}
.rec-badge{background:#3B82F6;color:#fff;font-size:10px;letter-spacing:2px;padding:4px 8px;border-radius:6px;font-weight:700;}
.opt-name{font-size:14px;color:rgba(255,255,255,0.85);margin:0 0 14px;font-weight:600;}
.opt-rate{font-family:'Bebas Neue',sans-serif;font-size:64px;line-height:1;letter-spacing:1px;color:#fff;margin:0;}
.opt-rate-label{font-size:10px;letter-spacing:2px;color:rgba(255,255,255,0.4);font-weight:600;margin-top:6px;}
.opt hr{border:0;height:1px;background:rgba(255,255,255,0.08);margin:18px 0 14px;}
.line{display:flex;justify-content:space-between;font-size:13px;color:rgba(255,255,255,0.65);padding:6px 0;}
.line .v{color:#fff;font-weight:600;}
.ppp{display:flex;align-items:center;gap:8px;font-size:12px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-top:14px;color:rgba(255,255,255,0.7);}
.ppp .dot{width:8px;height:8px;border-radius:50%;display:inline-block;}
.ppp.has .dot{background:#F59E0B;box-shadow:0 0 8px rgba(245,158,11,0.6);}
.ppp.none .dot{background:#22C55E;box-shadow:0 0 8px rgba(34,197,94,0.6);}
.ppp strong{color:#fff;font-weight:700;margin-right:4px;}
.breakdown-btn{margin-top:14px;background:transparent;border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);padding:9px 12px;border-radius:9px;font-family:inherit;font-size:12px;letter-spacing:1px;font-weight:600;cursor:pointer;text-transform:uppercase;}
.breakdown-btn:hover{border-color:rgba(59,130,246,0.5);color:#3B82F6;}
.breakdown{margin-top:14px;display:none;padding:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;}
.breakdown.open{display:block;}
.breakdown-title{font-size:10px;letter-spacing:2px;color:rgba(255,255,255,0.35);font-weight:600;margin-bottom:10px;text-transform:uppercase;}
.bk-line{display:flex;justify-content:space-between;font-size:12.5px;color:rgba(255,255,255,0.65);padding:5px 0;}
.bk-line .v{color:rgba(255,255,255,0.9);font-weight:600;}
.bk-total{display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);margin-top:8px;font-weight:700;color:#fff;font-size:13.5px;}
.cta-row{margin-top:auto;padding-top:18px;}
.cta-row .btn{width:100%;}
.disclaimer{color:rgba(255,255,255,0.25);font-size:12px;line-height:1.55;max-width:780px;margin:0 auto 20px;text-align:center;}
.more-q{background:linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.02));border:1px solid rgba(59,130,246,0.25);border-radius:18px;padding:32px;text-align:center;margin:30px 0 60px;}
.more-q h3{font-family:'Bebas Neue',sans-serif;font-size:34px;letter-spacing:2px;margin:0 0 8px;}
.more-q p{color:rgba(255,255,255,0.65);font-size:15px;margin:0 0 18px;}
.more-q .btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}
footer{padding:34px 0 50px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;color:rgba(255,255,255,0.45);font-size:13px;}
footer .brand-foot{display:inline-flex;align-items:center;gap:10px;margin-bottom:14px;}
footer .lo-line{color:rgba(255,255,255,0.7);margin-bottom:6px;}
footer .co{color:rgba(255,255,255,0.4);margin-bottom:8px;}
footer a{color:rgba(255,255,255,0.55);}
.modal{position:fixed;inset:0;background:rgba(8,14,26,0.82);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:24px;z-index:50;}
.modal.open{display:flex;}
.modal-card{max-width:460px;width:100%;background:#0c1322;border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:30px;text-align:center;}
.modal-bolt{width:54px;height:54px;border-radius:50%;background:rgba(245,183,49,0.12);border:1px solid rgba(245,183,49,0.3);display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px;}
.modal-title{font-family:'Bebas Neue',sans-serif;font-size:34px;letter-spacing:2px;margin:0 0 18px;}
.modal-btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;}
.modal-btns .btn{width:100%;}
.modal-foot{border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;color:rgba(255,255,255,0.7);font-size:13.5px;line-height:1.5;}
.modal-foot strong{color:#fff;font-weight:700;}
.close-x{position:absolute;top:14px;right:18px;background:none;border:0;color:rgba(255,255,255,0.5);font-size:24px;cursor:pointer;}
@media (max-width:720px){
  .hero h1{font-size:44px;}
  .opt-rate{font-size:54px;}
}
</style>
</head>
<body>
<nav class="nav">
  <div class="nav-inner">
    <div class="nav-brand">${BOLT_SVG}<span class="wordmark"><span class="w-rate">RATE</span><span class="w-hero">HERO</span></span></div>
    <div class="nav-lo">
      <strong>${escapeHtml(lo.name || 'Rate Hero')}</strong>
      <a class="meta-line" href="${loPhoneHref}">${escapeHtml(lo.phone || COMPANY_PHONE)}</a>
      ${lo.email ? `<a class="meta-line" href="mailto:${escapeHtml(lo.email)}">${escapeHtml(lo.email)}</a>` : ''}
    </div>
  </div>
</nav>

<div class="page">
  <section class="hero">
    <div>
      <div class="kicker">LOAN COMPARISON</div>
      <h1>${escapeHtml(transUpper)} — <span class="name">${escapeHtml(q.clientName)}</span></h1>
      <p class="sub">${escapeHtml(firstName)}, here are the loan options we put together. Compare the rate, monthly payment, and closing costs side by side, then pick the one you'd like to move forward with.</p>
      <div class="quote-date">Quote generated ${escapeHtml(dateStr)}</div>
    </div>
    <div class="info-box">
      <div class="info-row">
        <div class="info-label">Address</div>
        <div class="info-val">${escapeHtml(q.address)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Program</div>
        <div class="info-val"><span class="pill">${escapeHtml(q.loanProgram)}</span></div>
      </div>
      ${q.creditScore ? `<div class="info-row">
        <div class="info-label">Credit Score</div>
        <div class="info-val">${escapeHtml(q.creditScore)}</div>
      </div>` : ''}
      ${(q.loanProgram === 'DSCR' && q.dscrRatio) ? `<div class="info-row">
        <div class="info-label">DSCR Ratio</div>
        <div class="info-val">${escapeHtml(q.dscrRatio)}</div>
      </div>` : ''}
      <div class="info-row">
        <div class="info-label">Term</div>
        <div class="info-val">${escapeHtml(q.loanTerm)}</div>
      </div>
    </div>
  </section>

  <div class="controls">
    <div class="tabset">
      <button class="tabbtn active" data-filter="all">All ${optsCount} options</button>
      <button class="tabbtn" data-filter="ppp">PPP</button>
      <button class="tabbtn" data-filter="lowest">Lowest rate</button>
    </div>
    <div class="sort">
      <label for="sortSel">Sort by</label>
      <select id="sortSel">
        <option value="num">Option number</option>
        <option value="rate">Lowest rate</option>
        <option value="nopoints">No points first</option>
        <option value="payment">Lowest payment</option>
      </select>
      <span id="visibleCount" class="text-mute" style="font-size:12px;">${optsCount} shown</span>
    </div>
  </div>

  <div class="opt-grid" id="optGrid">
    ${(q.options || []).map((o,i) => renderOptionCard(o, i, q.options.length, q.loanTerm, q.transactionType)).join('')}
  </div>

  <div class="more-q">
    <h3>HAVE MORE QUESTIONS?</h3>
    <p>${escapeHtml(loFirstName || 'Your loan officer')} can walk you through every line and help you pick the right option. Call ${escapeHtml(lo.phone || COMPANY_PHONE)}.</p>
    <div class="btns">
      <a class="btn btn-dark" href="${loPhoneHref}">Call ${escapeHtml(loFirstName || 'Now')}</a>
      <a class="btn btn-primary" href="${applyHref}" target="_blank" rel="noopener">Apply Now</a>
    </div>
  </div>

  <div class="disclaimer">The figures shown are based on the information provided and current market conditions. Final terms are subject to underwriting, appraisal, and lender approval. This is not a loan commitment or interest-rate lock.</div>
</div>

<footer>
  <div class="page">
    <div class="brand-foot">${BOLT_SVG}<span class="wordmark"><span class="w-rate">RATE</span><span class="w-hero">HERO</span></span></div>
    <div class="lo-line">${escapeHtml(lo.name || '')}${lo.title ? ' · ' + escapeHtml(lo.title) : ''}${lo.nmls ? ' · NMLS ' + escapeHtml(lo.nmls) : ''}</div>
    <div class="co">Rate Hero Inc · NMLS #${COMPANY_NMLS} · Available in 30+ States · Equal Housing Lender</div>
    <div><a href="${CONSUMER_ACCESS_URL}" target="_blank" rel="noopener">NMLS Consumer Access</a></div>
  </div>
</footer>

<div class="modal" id="modal" role="dialog" aria-modal="true">
  <div class="modal-card" style="position:relative;">
    <button class="close-x" onclick="closeModal()" aria-label="Close">×</button>
    <div class="modal-bolt">${BOLT_SVG}</div>
    <h2 class="modal-title">GREAT CHOICE</h2>
    <div class="modal-btns">
      <a class="btn btn-primary" id="applyBtn" href="${applyHref}" target="_blank" rel="noopener">Apply Now</a>
      <a class="btn btn-dark" id="callBtn" href="${loPhoneHref}">Call Now</a>
    </div>
    <div class="modal-foot">
      <div id="modalPick"></div>
      <div style="margin-top:6px;color:rgba(255,255,255,0.55);">${escapeHtml(lo.name || 'Your loan officer')} will reach out shortly to discuss next steps and lock in your option.</div>
    </div>
  </div>
</div>

<script>
${CLIENT_JS}
</script>
</body>
</html>`;
}

function renderOptionCard(o, i, total, loanTerm, transactionType) {
  const recommended = !!o.recommended;
  const rate = numOrEmpty(o.rate);
  const hasPpp = !!o.hasPpp;
  const noPenalty = !hasPpp;
  const rateAttr = rate === '' ? '' : String(rate);
  const isCashOut = transactionType === 'Cash-Out';
  const isRefi = transactionType === 'Refinance';
  const propertyValueLabel = (isCashOut || isRefi) ? 'Appraised Value' : 'Purchase Price';
  const sectionTitle = isCashOut ? 'CASH TO BORROWER' : 'CASH FROM / TO BORROWER';
  const totalLabel = isCashOut ? 'Cash to Borrower' : (isRefi ? 'From' : 'Cash from borrower');
  // For a cash-out the money is going TO the borrower, so we want to display
  // the total as a positive amount regardless of how it was entered (Sean may
  // enter it as a negative reflecting cash-out direction in his spreadsheet).
  const totalRaw = o.cashFromBorrower;
  const totalValue = (() => {
    if (totalRaw === '' || totalRaw === null || totalRaw === undefined || !Number.isFinite(Number(totalRaw))) return '—';
    const n = Math.abs(Number(totalRaw));
    return (isCashOut ? '+ ' : '') + '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  })();

  const bk = [
    ['Loan amount', o.loanAmount, '+'],
    [propertyValueLabel, o.purchasePrice, '-'],
    ['Lender credit', o.breakdownLenderCredit, '+'],
    ['Lender fees', o.lenderFees, '-'],
    ['Third party fees', o.thirdPartyFees, '-'],
    ['Taxes & gov’t', o.taxesGov, '-'],
    ['Prepaids & escrow', o.prepaidsEscrow, '-'],
    ['Points cost', o.pointsCost, '-'],
  ];

  return `<div class="opt${recommended ? ' recommended' : ''}"
    data-rate="${rateAttr}"
    data-payment="${o.monthlyPayment === '' ? '' : o.monthlyPayment}"
    data-points="${o.pointsPct === '' ? '0' : o.pointsPct}"
    data-ppp="${hasPpp ? '1' : '0'}"
    data-idx="${i}"
    data-name="${escapeHtml(o.name || ('Option ' + (i+1)))}">
    <div class="opt-head">
      <span class="opt-num">${i+1} / ${total}</span>
      ${recommended ? '<span class="rec-badge">RECOMMENDED</span>' : ''}
    </div>
    <h3 class="opt-name">${escapeHtml(o.name || 'Option ' + (i+1))}</h3>
    <div class="opt-rate">${fmtRateBig(rate)}</div>
    <div class="opt-rate-label">INTEREST RATE · ${escapeHtml(loanTerm)}</div>
    <hr>
    <div class="line"><span>Monthly payment</span><span class="v">${fmtMoney(o.monthlyPayment)}</span></div>
    <div class="line"><span>Taxes &amp; insurance</span><span class="v">${fmtMoney(o.taxesInsurance)}</span></div>
    <div class="line"><span>Lender credit</span><span class="v">${fmtMoney(o.lenderCredit)}</span></div>
    <div class="line"><span>Points</span><span class="v">${o.pointsPct === '' ? '—' : escapeHtml(String(o.pointsPct)) + '% · ' + fmtMoney(o.pointsDollar)}</span></div>
    <div class="ppp ${hasPpp ? 'has' : 'none'}">
      <span class="dot"></span>
      ${hasPpp
        ? `<span><strong>Prepayment penalty</strong>${o.pppDetails ? ' ' + escapeHtml(o.pppDetails) : ''}</span>`
        : `<span><strong>No penalty</strong>No prepayment penalty</span>`}
    </div>
    <button class="breakdown-btn" onclick="toggleBreakdown(this)">See breakdown</button>
    <div class="breakdown">
      <div class="breakdown-title">${escapeHtml(sectionTitle)}</div>
      ${bk.map(([label, val, sign]) => `<div class="bk-line"><span>${escapeHtml(label)} (${sign})</span><span class="v">${fmtMoney(val)}</span></div>`).join('')}
      <div class="bk-total"><span>${escapeHtml(totalLabel)}</span><span>${totalValue}</span></div>
    </div>
    <div class="cta-row">
      <button class="btn btn-primary" onclick="pickOption(${i})">I'm Interested in This Option</button>
    </div>
  </div>`;
}

const CLIENT_JS = `
function toggleBreakdown(btn) {
  const bd = btn.parentElement.querySelector('.breakdown');
  const open = bd.classList.toggle('open');
  btn.textContent = open ? 'Hide breakdown' : 'See breakdown';
}

function pickOption(i) {
  const card = document.querySelectorAll('.opt')[i] || document.querySelector('[data-idx="'+i+'"]');
  const name = card ? card.getAttribute('data-name') : ('Option ' + (i+1));
  const rate = card ? card.getAttribute('data-rate') : '';
  const num = card ? (Number(card.getAttribute('data-idx')) + 1) : (i+1);
  document.getElementById('modalPick').innerHTML =
    'You selected <strong>Option ' + num + ' — ' + name + '</strong>' + (rate ? ' at <strong>' + rate + '%</strong>' : '') + '.';
  document.getElementById('modal').classList.add('open');
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

const grid = document.getElementById('optGrid');
const cards = Array.from(grid.querySelectorAll('.opt'));
let activeFilter = 'all';

document.querySelectorAll('.tabbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    applyView();
  });
});
document.getElementById('sortSel').addEventListener('change', applyView);

function applyView() {
  const sortBy = document.getElementById('sortSel').value;
  let visible = cards.slice();

  if (activeFilter === 'ppp') {
    visible = visible.filter(c => c.dataset.ppp === '1');
  } else if (activeFilter === 'lowest') {
    const min = Math.min(...cards.map(c => parseFloat(c.dataset.rate) || Infinity));
    visible = visible.filter(c => (parseFloat(c.dataset.rate) || Infinity) === min);
  }

  const sorted = visible.slice().sort((a,b) => {
    if (sortBy === 'rate') return (parseFloat(a.dataset.rate)||0) - (parseFloat(b.dataset.rate)||0);
    if (sortBy === 'nopoints') return (parseFloat(a.dataset.points)||0) - (parseFloat(b.dataset.points)||0);
    if (sortBy === 'payment') return (parseFloat(a.dataset.payment)||0) - (parseFloat(b.dataset.payment)||0);
    return (parseInt(a.dataset.idx)||0) - (parseInt(b.dataset.idx)||0);
  });

  cards.forEach(c => c.style.display = 'none');
  sorted.forEach(c => { c.style.display = ''; grid.appendChild(c); });

  document.getElementById('visibleCount').textContent = sorted.length + ' shown';
}
`;
