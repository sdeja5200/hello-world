# First Deploy — Smoke Test & Environment Variables

Run this the first time you bring BillWright up on Railway/Render.

## Environment variables

Set these on the host **before** the first boot (except the two URL vars, which you
fill in once the platform gives you a live URL — then redeploy).

### 🔐 Secrets — must set (no defaults)

| Variable | Where it comes from |
| --- | --- |
| `GHL_CLIENT_ID` | GHL dev portal → your app → Client ID |
| `GHL_CLIENT_SECRET` | GHL dev portal → your app → Client Secret |
| `GHL_SSO_KEY` | GHL dev portal → your app → Custom Page → SSO Key |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

### 🌐 URLs — set after first deploy, then redeploy

| Variable | Value |
| --- | --- |
| `APP_BASE_URL` | The live HTTPS URL the platform assigns (e.g. `https://billwright.onrender.com`) |
| `GHL_REDIRECT_URI` | `{APP_BASE_URL}/oauth/callback` — must exactly match the redirect URL registered in the GHL app |

### 🗄️ Database — auto-provided

| Variable | How |
| --- | --- |
| `DATABASE_URL` | **Render:** auto-wired by `render.yaml`. **Railway:** add a Postgres plugin and reference its `DATABASE_URL`. |

### ⚙️ Optional — already have safe defaults (override only if needed)

| Variable | Default |
| --- | --- |
| `PORT` | Set automatically by the platform; app reads it |
| `GHL_API_BASE` | `https://services.leadconnectorhq.com` |
| `GHL_API_VERSION` | `2021-07-28` |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |

> Copy/paste block for the host's env editor (fill in the blanks):
> ```
> GHL_CLIENT_ID=
> GHL_CLIENT_SECRET=
> GHL_SSO_KEY=
> ANTHROPIC_API_KEY=
> APP_BASE_URL=
> GHL_REDIRECT_URI=
> ```

---

## Smoke test (in order)

### 1. Container booted & migrated
- **Do:** Open `https://<your-url>/healthz`
- **Pass:** `{"ok":true}`
- **Also check deploy logs for:**
  - `Invoice app listening on :…`
  - A Prisma line showing the `0001_init` migration applied (table created)
- **If it fails:** missing `DATABASE_URL`, or Postgres not reachable → check the DB is provisioned and linked.

### 2. OAuth install
- **Do:** In the GHL dev portal, install the app on a **test sub-account**.
- **Pass:** You land on the **"✅ BillWright installed"** page, and logs show
  `[oauth] Installed for location=… company=…`.
- **If it fails:** `redirect_uri` mismatch (it must equal the registered redirect URL exactly),
  or wrong Client ID/Secret.

### 3. Token persisted
- **Do:** Confirm a row exists in the `Installation` table (host DB console, or rely on step 6 working).
- **Pass:** One row with your test `ghlLocationId`, a future `expiresAt`, and a non-empty `scope`.

### 4. Custom Page loads + SSO
- **Do:** In the test sub-account, open the app from the GHL menu.
- **Pass:** The page renders the **"Connected to location …"** status (not "Could not establish a session").
- **If it fails:** wrong/empty `GHL_SSO_KEY`, or the Custom Page URL isn't pointing at `APP_BASE_URL`.

### 5. Extract an invoice
- **Do:** Upload a real invoice **PDF**, then repeat with an **image** (PNG/JPG).
- **Pass:** Vendor / number / date / total + line items populate the review table.
- **If it fails:** check logs for `[extract] failed` → usually a bad/missing `ANTHROPIC_API_KEY`.

### 6. Save → Invoice record in GHL  ⭐ the big one
- **Do:** Click **Save to GoHighLevel** (auto-save off).
- **Pass:** "✅ Saved (record …)" appears, **and** an **Invoice** custom-object record shows up in
  the sub-account with the line items in the JSON field.
- **If it fails:** check logs for `[invoices] save failed`. This is the most likely spot to hit the
  two flagged unknowns — the **Custom Objects API path/shape** or a **missing scope**. Note the exact
  HTTP status/body in the error and send it to me; it's a quick fix in `src/services/ghl.ts`.

### 7. Hands-free auto-save
- **Do:** Tick **Auto-save after extraction**, upload another invoice.
- **Pass:** It extracts and saves in one step (no manual click), ending on "✅ Saved".

### 8. Uninstall hygiene
- **Do:** Uninstall the app from the test sub-account.
- **Pass:** Logs show `[webhook] Uninstalled location=…`, and the `Installation` row is gone.

### ✅ Done when
Steps 1–8 all pass on one test sub-account. After that, the only remaining work before
submission is recording the demo + scopes videos and the marketplace listing assets.
