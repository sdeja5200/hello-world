# Voxlink Invoice Pro

**Automated AI invoice parsing and line-item data extraction for your CRM.**

A GoHighLevel Marketplace app. Upload an invoice (PDF or image) inside a GoHighLevel
sub-account, have Claude extract the vendor, number, date, total, and line items,
review the result, and save it as an **Invoice** custom-object record — all
multi-tenant and OAuth-based, built to be submitted to the GHL Marketplace.

This is the production rebuild of an n8n prototype; the n8n workflow remains the
functional spec for the extraction + mapping logic.

## Architecture

```
GHL Custom Page (Vue 3 iframe)
  │  postMessage SSO → /api/sso/decrypt → { activeLocation, companyId, … }
  │  upload PDF/image
  ▼
Express + TypeScript backend
  ├─ /oauth/callback   exchange code → persist tokens (Prisma)
  ├─ /webhooks         INSTALL / UNINSTALL lifecycle
  ├─ /api/extract      file → Claude (native doc input + tool-use schema, zod-validated)
  └─ /api/invoices     ensure "Invoice" custom object → create record (GHL v2)
  ▼
Postgres (Prisma)   one row per install, short-lived tokens auto-refreshed
```

Every outbound GHL/Anthropic call goes through `withRetry` (exponential backoff) —
a direct fix for the transient quota error that killed the original prototype.

## Local development

```bash
cp .env.example .env        # fill in the values below
npm install
npm run prisma:generate
npm run prisma:migrate      # creates the Installation table
npm run dev                 # backend on :3000

cd ui && npm install && npm run dev   # UI on :5173, proxies /api → :3000
```

Run tests / typecheck:

```bash
npm test
npm run typecheck
```

## GoHighLevel app setup (developer portal)

1. **Create app** → *My Apps → Create App* (type **Public** for the marketplace).
2. **Redirect URL**: `{APP_BASE_URL}/oauth/callback` → put the same value in `GHL_REDIRECT_URI`.
3. **Scopes** (request only what's used — scope changes trigger re-review):
   - `contacts.readonly`, `contacts.write`
   - `objects/schema.readonly`, `objects/schema.write`
   - `objects/record.readonly`, `objects/record.write`
   - `locations.readonly`
   > Verify exact scope strings in the portal; they occasionally change.
4. **Custom Page**: add a page pointing at `{APP_BASE_URL}`; copy the **SSO Key** into `GHL_SSO_KEY`.
5. **Webhook**: point lifecycle events at `{APP_BASE_URL}/webhooks`.
6. Copy **Client ID / Client Secret** into `.env`.

## Deploy

Any Node host works; Render/Railway are easiest (managed Postgres + HTTPS):

1. Provision Postgres, set `DATABASE_URL`.
2. Build: `npm run ui:build && npm run build` — start: `npm start`.
3. Set all `.env` values; `APP_BASE_URL` must be the public HTTPS URL.
4. Run `prisma migrate deploy` on release.

## Path to marketplace approval

- Test as a **Private** app first (installable on up to 5 agencies).
- For wider release: record a **demo video** + a **scopes-justification video**, add a
  privacy policy, then request the **Security Review** / submit Public.

## Status / roadmap

- [x] Backend scaffold: OAuth, token store + refresh, webhooks, extract, invoice write
- [x] Vue Custom Page: SSO, upload, review, save
- [ ] Verify GHL Custom Objects API shape + scope strings against a live test sub-account
- [ ] Promote line items from serialized JSON to a child "Invoice Line Item" object
- [ ] Optional: link a vendor Contact; add a Workflow Action surface
- [ ] Marketplace submission assets
