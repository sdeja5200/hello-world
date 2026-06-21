# Voxlink Invoice Pro

**Automated AI invoice parsing and line-item data extraction for your CRM.**

A GoHighLevel Marketplace app. Upload any billing-related document — an estimate,
purchase order, proposal, prior invoice, or incoming vendor invoice — inside a
GoHighLevel sub-account, have Claude extract the vendor/counterparty, line items,
quantities, and totals, then either:
- create a real **GHL Invoice or Estimate** (visible/payable in the sub-account's
  own Invoicing UI), after picking or creating the contact to bill, or
- log it as a vendor bill in an **Invoice** custom-object record (the original,
  secondary inbound-AP-capture feature).

All multi-tenant and OAuth-based, built to be submitted to the GHL Marketplace.

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
  ├─ /api/contacts     search / create the "bill to" contact
  ├─ /api/ghl-invoices, /api/ghl-estimates   create a real GHL Invoice/Estimate
  └─ /api/invoices     secondary: ensure "Invoice" custom object → log vendor bill (GHL v2)
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
   - `contacts.readonly`, `contacts.write` — resolve/create the "bill to" contact
   - `objects/schema.readonly`, `objects/schema.write` — secondary vendor-bill log (custom object)
   - `objects/record.readonly`, `objects/record.write` — secondary vendor-bill log (custom object)
   - `invoices.readonly`, `invoices.write` — create real GHL Invoices
   - `invoices/estimate.readonly`, `invoices/estimate.write` — create real GHL Estimates (separate scope from invoices)
   - `locations.readonly`
   > Confirmed against GHL's published OpenAPI spec (`GoHighLevel/highlevel-api-docs`); verify once more in the dev portal at app-creation time since scopes occasionally change.
4. **Custom Page**: add a page pointing at `{APP_BASE_URL}`; copy the **SSO Key** into `GHL_SSO_KEY`.
5. **Webhook**: point lifecycle events at `{APP_BASE_URL}/webhooks`.
6. Copy **Client ID / Client Secret** into `.env`.

## Deploy

The app ships a multi-stage **Dockerfile** (builds the UI + backend, runs DB
migrations on boot via `prisma migrate deploy`). Both platforms below use it and
give you a live HTTPS URL + managed Postgres.

### Render (Blueprint — easiest)

1. Push this repo to GitHub, then in Render: **New → Blueprint** and select the repo.
   `render.yaml` provisions the web service (Docker) **and** a Postgres database,
   and wires `DATABASE_URL` automatically.
2. After the first deploy, fill the dashboard secrets (`sync: false` in the blueprint):
   `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `GHL_SSO_KEY`, `ANTHROPIC_API_KEY`.
3. Copy the service's live URL → set `APP_BASE_URL` and `GHL_REDIRECT_URI`
   (`{APP_BASE_URL}/oauth/callback`), then redeploy.

### Railway

1. **New Project → Deploy from GitHub repo** (Railway auto-detects the Dockerfile via
   `railway.json`). Add a **Postgres** plugin; reference its `DATABASE_URL`.
2. Set the same env vars (`APP_BASE_URL`, `GHL_REDIRECT_URI`, `GHL_CLIENT_ID/SECRET`,
   `GHL_SSO_KEY`, `ANTHROPIC_API_KEY`).
3. Generate a public domain; use it for `APP_BASE_URL`.

> The container runs `prisma migrate deploy` on startup, so the `Installation`
> table is created automatically on first boot — no manual migration step.

Then plug the live URL into the GHL developer portal (redirect URL, Custom Page,
webhook) as described above.

## Path to marketplace approval

- Test as a **Private** app first (installable on up to 5 agencies).
- For wider release: record a **demo video** + a **scopes-justification video**, add a
  privacy policy, then request the **Security Review** / submit Public.

## Status / roadmap

- [x] Backend scaffold: OAuth, token store + refresh, webhooks, extract, invoice write
- [x] Vue Custom Page: SSO, upload, review, save, hands-free auto-save toggle
- [x] Deploy config: Dockerfile, Render Blueprint, Railway config, initial migration
- [x] Multi-document-type extraction (invoice/estimate/PO/proposal classification)
- [x] Real GHL Invoice + Estimate creation (`/api/ghl-invoices`, `/api/ghl-estimates`) + contact picker
- [ ] Verify the new Invoice/Estimate/Contact payload shapes live against a test sub-account
  (request bodies are built from GHL's published OpenAPI spec, not yet a live call)
- [ ] Verify GHL Custom Objects API shape + scope strings against a live test sub-account
- [ ] Promote line items from serialized JSON to a child "Invoice Line Item" object
- [ ] Optional: GHL Workflow Action surface ("create invoice from this document")
- [ ] Marketplace submission assets
