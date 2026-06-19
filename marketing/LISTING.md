# Marketplace Listing — Voxlink Invoice Pro

Source of truth for the GHL Marketplace submission copy and assets.

## Core copy

- **App name:** Voxlink Invoice Pro
- **Tagline:** Automated AI invoice parsing and line-item data extraction for your CRM.
- **Description:**
  > Seamlessly extract vendor names, invoice numbers, dollar totals, and individual
  > line items from messy supplier PDFs and map them directly into custom fields
  > hands-free.

## Submission checklist (GHL)

- [ ] App type: **Public** (Private first for testing — up to 5 agencies)
- [ ] Redirect URL, scopes, Custom Page, and webhook configured (see project README)
- [ ] **Demo video** — end-to-end: install → open page → upload PDF → review → saved Invoice record
- [ ] **Scopes-justification video / notes** — why each scope is needed:
  - `objects/schema.*`, `objects/record.*` — create the Invoice object + write extracted records
  - `contacts.*` — (optional) link the vendor as a contact
  - `locations.readonly` — resolve the active sub-account from SSO context
- [ ] Privacy policy URL (covers uploaded documents + extracted data handling)
- [ ] App icon + screenshots (upload page, extracted review, saved record in GHL)

## Notes / decisions

- Extraction is **Claude** with native PDF/image input — handles scanned/messy PDFs,
  which backs the "messy supplier PDFs" claim and the future "many document types" goal.
- Data lands in an **Invoice custom object** (vendor / number / date / total + line items).
  The listing says "custom fields" in plain-English marketing terms; technically these are
  the Invoice object's fields.
- Current flow includes a **review step** before save. If we want to honor "hands-free"
  literally, add an optional auto-save toggle (skip review when confidence is high) in a
  later phase — keep the review default for trust during the demo/approval.
