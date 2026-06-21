# Marketplace Listing — Voxlink Invoice Pro

Source of truth for the GHL Marketplace submission copy and assets.

## Core copy

- **App name:** Voxlink Invoice Pro
- **Tagline:** Turn any document into a fully-populated GoHighLevel Invoice or Estimate.
- **Description:**
  > Upload an estimate, purchase order, signed proposal, prior invoice, or incoming vendor
  > invoice — Voxlink extracts the vendor/customer, line items, quantities, and totals with
  > AI, then creates a fully-populated GoHighLevel Invoice or Estimate with correct line
  > items, ready to send. Inbound vendor-bill capture is also supported as a secondary mode.

## Positioning (why this framing)

GHL's Ideas Board shows the loud, repeated, upvoted demand is **outbound**: agencies want
to auto-generate Invoices/Estimates with correct line items from documents or data
("send invoice via workflow with dynamic line items," "build an invoice from a form
submission," "custom values won't populate the line-item price field"). Inbound
vendor-invoice/receipt OCR is real but niche by comparison. The extraction engine is the
same either way — only the output target changes (real GHL Invoice/Estimate vs. a
vendor-bill log record).

## Submission checklist (GHL)

- [ ] App type: **Public** (Private first for testing — up to 5 agencies)
- [ ] Redirect URL, scopes, Custom Page, and webhook configured (see project README)
- [ ] **Demo video** — end-to-end: install → open page → upload a document → review →
  pick/create the bill-to contact → Invoice or Estimate appears in GHL's own Invoicing UI
- [ ] **Scopes-justification video / notes** — why each scope is needed:
  - `invoices.*`, `invoices/estimate.*` — create the real GHL Invoice/Estimate (the core feature)
  - `contacts.*` — search/create the contact the document is billed to
  - `objects/schema.*`, `objects/record.*` — secondary vendor-bill log (custom object)
  - `locations.readonly` — resolve the active sub-account from SSO context
- [ ] Privacy policy URL (covers uploaded documents + extracted data handling)
- [ ] App icon + screenshots (upload page, extracted review + contact picker, created
  Invoice/Estimate visible in GHL's native Invoicing UI)

## Notes / decisions

- Extraction is **Claude** with native PDF/image input — handles scanned/messy PDFs and
  multiple document types (invoice, estimate, PO, proposal) in one prompt.
- Primary output: a real **GHL Invoice or Estimate** via `/invoices/` and `/invoices/estimate`
  — visible, sendable, and payable in the sub-account's own Invoicing UI. Requires picking
  or creating a Contact to bill, since GHL's Invoice/Estimate API requires one.
- Secondary output (unchanged): an **Invoice custom object** record for users who just want
  inbound vendor-bill logging, no real invoice/estimate created.
- The user always picks Invoice vs. Estimate vs. vendor-bill-log on the review screen —
  the app does not auto-decide from the detected document type, to avoid guessing wrong.
