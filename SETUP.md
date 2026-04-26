# Rate Hero — /rates Pricer Foundation (v3)

This delivers the **storage layer**, **API endpoints**, and **public /rates page** that the admin Pricing tab will sit on top of. Claude Code's job is to build the admin UI on top of these working APIs.

---

## What's in this drop

```
data/
  pricing-seed.json           ← canonical schema + initial values for KV
functions/
  _lib/
    pricing.js                ← shared validation + KV helpers
  api/
    pricing/
      approved.js             ← GET /api/pricing/approved      (PUBLIC)
    admin/
      pricing/
        approved.js           ← GET  /api/admin/pricing/approved
        draft.js              ← GET, POST /api/admin/pricing/draft
        publish.js            ← POST /api/admin/pricing/publish
        revert.js             ← POST /api/admin/pricing/revert
assets/
  js/
    rates-config.js           ← static fallback (mirrors seed JSON)
    rates.js                  ← public pricer logic (live fetch + fallback)
rates.html                    ← /rates page markup
wrangler.toml                 ← KV namespace binding config
SETUP.md                      ← this file
```

---

## Sean: deploy steps (one-time)

### 1. Create the KV namespace

Locally, with [Wrangler](https://developers.cloudflare.com/workers/wrangler/) installed (`npm i -g wrangler`):

```bash
wrangler login
wrangler kv namespace create PRICING_KV
wrangler kv namespace create PRICING_KV --preview
```

Each command prints an ID. Paste both into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "PRICING_KV"
id = "abc123..."          # production
preview_id = "def456..."  # preview deployments
```

### 2. Seed the KV namespace with the initial config

```bash
wrangler kv key put --binding=PRICING_KV "pricing:approved" --path=data/pricing-seed.json
```

That copies the seed JSON into KV under `pricing:approved`. The public `/rates` page will now read live values from KV. Until you publish a draft from admin, the seed values stay live.

### 3. Configure Cloudflare Access for the admin paths

In the Cloudflare dashboard:

1. **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application name: `Rate Hero Admin`.
3. Subdomain: `goratehero.com`.
4. Path: `/admin/*` (add a second app for `/api/admin/*`).
5. Identity provider: One-time PIN (free) or Google SSO (also free up to 50 users).
6. Policy: allow only your email(s) — `sean@goratehero.com` and any team admins.

After this, anyone visiting `/admin/*` or `/api/admin/*` gets prompted to authenticate. The public `/rates` page and `/api/pricing/approved` stay open.

Cloudflare Access automatically injects an `Cf-Access-Authenticated-User-Email` header on every authenticated request — the API endpoints already read this for `lastReviewedBy` and `publishedBy` stamps.

### 4. Push to the repo and deploy

The functions directory deploys automatically with the next Pages build. After deploy:

- `https://goratehero.com/api/pricing/approved` should return the seeded JSON (test in browser, no auth needed).
- `https://goratehero.com/rates` should render with live KV values (no fallback banner).
- `https://goratehero.com/api/admin/pricing/draft` should prompt for Cloudflare Access login.

---

## Daily / weekly use

Once the admin UI is built (Claude Code's job), the workflow is:

1. Visit `/admin` → **Pricing** tab. Cloudflare Access prompts for login if needed.
2. Edit profile base rates, spreads, points, fees, adjustments, fees, or compliance copy.
3. Click **Save Draft** — writes to KV under `pricing:draft`. Public page is unchanged.
4. Click **Approve & Publish** — promotes draft to approved, archives previous, public page picks up the new values within ~60s (KV edge cache).
5. If something looks wrong after publishing, click **Revert to Last Approved** — one-click rollback to the previous approved version.

---

## Architecture reference (for Claude Code)

### KV keys

| Key                          | Purpose                                              | Written by             |
|------------------------------|------------------------------------------------------|------------------------|
| `pricing:approved`           | Live config powering public `/rates`                 | publish.js, revert.js  |
| `pricing:draft`              | In-progress edits visible to admin only              | draft.js (POST)        |
| `pricing:last_approved`      | Previous approved version (one-step revert target)   | publish.js             |
| `pricing:archive:{ISO-ts}`   | Historical approved snapshots                        | publish.js, revert.js  |

### API endpoints

| Method | Path                                | Auth          | Purpose                                                |
|--------|-------------------------------------|---------------|--------------------------------------------------------|
| GET    | `/api/pricing/approved`             | Public        | Public `/rates` page reads live config                 |
| GET    | `/api/admin/pricing/draft`          | Access        | Admin loads current draft (or approved as starter)     |
| POST   | `/api/admin/pricing/draft`          | Access        | Admin saves draft. Body = full config JSON.            |
| GET    | `/api/admin/pricing/approved`       | Access        | Admin reads approved + archive index                   |
| POST   | `/api/admin/pricing/publish`        | Access        | Promotes draft → approved, archives previous           |
| POST   | `/api/admin/pricing/revert`         | Access        | Rolls back to `pricing:last_approved`                  |

All admin endpoints expect Cloudflare Access in front. The endpoints don't enforce auth themselves — Access provides it via path policy. Don't disable that.

### Schema contract

The full schema is in `data/pricing-seed.json`. Top-level shape:

```jsonc
{
  "version": "1.0",
  "lastUpdated": "ISO timestamp",      // set by API on save
  "lastReviewedBy": "email",           // set by API on save (from Access header)
  "publishedAt": "ISO timestamp",      // set by publish.js
  "publishedBy": "email",              // set by publish.js

  "profiles": [                        // 11 program × purpose combinations
    {
      "id": "dscr-purchase",
      "program": "dscr",               // dscr | bankStatement | noRatio | heloc | conventional
      "purpose": "purchase",           // purchase | rt-refi | cashout | hm-exit | any
      "displayName": "DSCR Purchase",
      "active": true,
      "baseRate": 7.250,
      "spreadLow": 0.375,              // midRate - spreadLow = lowRate
      "spreadHigh": 0.375,             // midRate + spreadHigh = highRate
      "pointsLow": 0.5,
      "pointsHigh": 2.0,
      "feeLow": 1495,
      "feeHigh": 2495,
      "minFico": 660,
      "maxLtv": 80,
      "minDscr": 1.00,                 // null for non-DSCR programs
      "defaultPrepay": "5-yr",
      "ioAllowed": true,
      "notes": "",
      "lastReviewed": "2026-04-25"
    }
  ],

  "adjustments": {
    "creditScore":  [{ match, label, rateAdj, pointsAdj, active, notes }, ...],
    "ltv":          [{ ltvMax, label, rateAdj, ...   }, ...],
    "dscr":         [{ dscrMin, label, rateAdj, ... }, ...],
    "propertyType": [{ match, label, rateAdj, ...   }, ...],
    "loanAmount":   [{ amountMax, label, rateAdj, ...}, ...],
    "state": {
      "label": "State",
      "explain": "...",
      "bands": {
        "low":  { label, rateAdj, active, states: [...] },
        "mid":  { label, rateAdj, active, states: [...] },
        "high": { label, rateAdj, active, states: [...] }
      }
    },
    "lockPeriod":   [{ match, label, rateAdj, ...   }, ...],
    "prepay":       [{ match, label, rateAdj, ...   }, ...],
    "interestOnly": [{ match, label, rateAdj, ...   }, ...]
  },

  "fees": [
    { id, name, low, high, active, notes }, ...
  ],

  "compliance": {
    "disclaimer":         "string",
    "rateRangeFootnote":  "string",
    "upfrontCostNote":    "string",
    "rateGridDisclaimer": "string",
    "advisorReviewMessage": "string"
  }
}
```

### Public-page fallback behavior

`assets/js/rates.js` does this on init:

1. `fetch('/api/pricing/approved')` → if 200 with `{profiles: [...]}`, use that as the active config.
2. If fetch fails, returns 404, or returns invalid JSON → use `window.RATE_HERO_FALLBACK_CONFIG` (loaded from `assets/js/rates-config.js`) and show the yellow banner.
3. If both fail → show "Pricing temporarily unavailable" inside the panels.

**Keep `rates-config.js` in sync with `data/pricing-seed.json`** — it's the safety net for a fresh deploy where KV hasn't been seeded yet, or any case where the API is down.

### Bolt CTA wiring

`window.openBolt(text)` is called with a one-line text summary like:

> Pricing scenario: DSCR Cash-Out Refi, CA, SFR, $500,000 value, $375,000 loan, 75% LTV, 720-739 FICO, $3,800 rent, DSCR 1.18, est rate 7.025-7.775%, points 1.00-2.50, 30-day lock, prepay: 5-yr. Borrower wants a real quote.

If the scenario is flagged for advisor review, the suffix changes to `ADVISOR REVIEW REQUIRED — {reasons}`.

If `window.openBolt` is undefined, the CTA falls back to scrolling to `#contact` or navigating to `/#contact`.

---

## Claude Code: build the admin UI

Everything below is what's left for you to build. The APIs above are working — verify them with the manual test checklist at the end of this file before starting on the UI.

### 1. Where to put the admin

If `/admin` already exists in this repo, add a **Pricing** tab alongside the existing Bolt Admin tabs. Match the existing visual style.

If `/admin` does not exist, build a new `/admin/index.html` with these tabs (Pricing is the only one functional in this work; the others are placeholders for now):

- Conversations
- Leads
- System Prompt
- Settings
- **Pricing** ← this build

Use plain HTML + JS. No React, no build step. Match the dark luxury Rate Hero brand (Navy `#080E1A`, Blue `#2563EB`/`#3B82F6`, Bebas Neue display + Plus Jakarta Sans body).

### 2. Pricing tab sections

Build these in order. Each section reads/writes the same draft via `/api/admin/pricing/draft`:

1. **Pricing Status** — show approved `lastUpdated` + `publishedAt`, draft `lastUpdated`, the three buttons (Save Draft / Approve & Publish / Revert).
2. **Profiles editor** — table with one row per profile, editable inline. Required fields: all the keys in the schema above. Show `active` toggle.
3. **Global Adjustments editor** — one collapsible card per category (creditScore, ltv, dscr, propertyType, loanAmount, state, lockPeriod, prepay, interestOnly). Each lists the brackets editable inline.
4. **Fees editor** — table of fee rows.
5. **Compliance copy editor** — four textareas for the four compliance strings.
6. **Live Preview panel** — embed the same form/output components from `/rates` but reading the **draft** config, not approved. Use `/api/admin/pricing/draft` for the source.

### 3. Save / Publish flow

- **Save Draft button**: POST the entire current admin state as JSON to `/api/admin/pricing/draft`. On 400 with errors, show them inline. On 200, show the warnings array as soft-yellow notices (don't block).
- **Approve & Publish button**: show a confirmation modal listing what's about to change vs. approved (diff is nice-to-have but not required). On confirm, POST `/api/admin/pricing/publish`. On 200, show success + refresh status.
- **Revert button**: confirmation modal explaining "This restores the previous approved version. Your draft is preserved." POST `/api/admin/pricing/revert`. On 200, show success.

### 4. Soft warnings to surface in the UI

The API enforces hard validation (shape, no negative rates, required fields). The admin UI should additionally warn (without blocking) on:

- A profile's baseRate < 4 or > 14
- A profile's maxLtv > 90
- A profile's minFico < 600
- Missing values in any active profile

The API returns these in the `warnings` array on every successful POST to `/api/admin/pricing/draft`.

### 5. UX requirements

- Save Draft button visible at all times (sticky footer or fixed top-right)
- Approve & Publish button visually distinct from Save Draft (don't make them look the same)
- Confirmation modal before publish
- Show date/time of last save vs last publish at the top of the tab
- Mobile: form fields stack to single column, tables scroll horizontally
- Tab switching doesn't lose unsaved draft state — warn on tab leave with unsaved changes

### 6. Manual test checklist (for Sean to run after deploy)

Hit each of these once after the admin UI is built:

- [ ] `/api/pricing/approved` returns JSON with `profiles[]` (no auth needed)
- [ ] `/admin` prompts Cloudflare Access login
- [ ] Pricing tab loads draft (or approved as starter on fresh KV)
- [ ] Edit a profile baseRate → Save Draft → reload tab → value persists
- [ ] Click Approve & Publish → public `/rates` shows new values within 60s
- [ ] Click Revert → previous values restored
- [ ] DSCR Purchase scenario produces non-zero rate
- [ ] DSCR Cash-Out scenario uses different baseRate from Purchase
- [ ] DSCR Hard Money Exit scenario maps correctly
- [ ] Bank Statement scenario picks the right profile
- [ ] No-Ratio Refi scenario picks `noratio-refi` profile
- [ ] Setting FICO `620-639` on DSCR Purchase triggers "Advisor review required"
- [ ] Setting LTV >80% (loan/value > 0.80) triggers advisor review
- [ ] Bolt CTA on /rates → `window.openBolt(textSummary)` is called with the right string
- [ ] Disable KV binding briefly (or seed empty) → `/rates` shows fallback banner

---

## Local dev

```bash
# Run Pages Functions locally with KV emulation
npx wrangler pages dev . --kv PRICING_KV

# Then visit http://localhost:8788/rates
```

Wrangler creates a local KV store on first run. Seed it the same way as production:

```bash
npx wrangler kv key put --binding=PRICING_KV "pricing:approved" --path=data/pricing-seed.json --local
```

---

## Notes on what I didn't build (intentionally)

- **No admin UI.** That's Claude Code's job, scoped above.
- **No arbitrary-archive restore endpoint.** Revert only goes one step back. If you need to restore from a specific archive timestamp, that's a follow-on endpoint (read `pricing:archive:{ts}`, treat as draft, save → publish).
- **No webhook to invalidate Cloudflare cache on publish.** The 60s edge cache on `/api/pricing/approved` is the simplest correct behavior. If you want sub-60s propagation, add a Cache API purge call inside `publish.js`.
- **No multi-tenant or role-based admin.** Cloudflare Access controls who can reach `/admin`. If you want different roles (read-only vs publish), that's a follow-on.
