import type { Installation } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db/client.js';
import { HttpError, withRetry } from '../lib/retry.js';
import type { Invoice } from '../lib/invoiceSchema.js';

// Custom object + field keys. GHL namespaces custom objects as `custom_objects.<key>`
// and fields as `custom_objects.<key>.<field>`. Verify these against the dev portal
// the first time the schema is created (see ensureInvoiceObject).
const INVOICE_OBJECT_KEY = 'custom_objects.invoice';
const FIELDS = {
  vendorName: 'vendor_name',
  invoiceNumber: 'invoice_number',
  invoiceDate: 'invoice_date',
  totalAmount: 'total_amount',
  lineItems: 'line_items',
} as const;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  userType?: string;
  companyId?: string;
  locationId?: string;
}

/** Exchange an OAuth authorization code for tokens, and persist the installation. */
export async function exchangeCodeAndStore(code: string): Promise<Installation> {
  const token = await requestToken({ grant_type: 'authorization_code', code });
  return upsertInstallation(token);
}

/** Refresh a near-expired token and persist it. */
export async function refreshInstallation(inst: Installation): Promise<Installation> {
  const token = await requestToken({
    grant_type: 'refresh_token',
    refresh_token: inst.refreshToken,
  });
  return upsertInstallation(token);
}

/** Load an installation for a location, refreshing the token if it expires soon. */
export async function getValidInstallationForLocation(locationId: string): Promise<Installation> {
  const inst = await prisma.installation.findUnique({ where: { ghlLocationId: locationId } });
  if (!inst) throw new Error(`No installation found for location ${locationId}. Has the app been installed?`);

  const skewMs = 60_000; // refresh a minute early
  if (inst.expiresAt.getTime() - skewMs <= Date.now()) {
    return refreshInstallation(inst);
  }
  return inst;
}

/** Authenticated GHL v2 request with retry/backoff. */
export async function ghlFetch<T>(
  inst: Installation,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${config.ghl.apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${inst.accessToken}`,
        Version: config.ghl.apiVersion,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new HttpError(res.status, await res.text());
    return (res.status === 204 ? undefined : await res.json()) as T;
  });
}

/**
 * Ensure the "Invoice" custom object schema exists in the location, creating it
 * if missing. Idempotent — safe to call before every write.
 */
export async function ensureInvoiceObject(inst: Installation, locationId: string): Promise<void> {
  const existing = await ghlFetch<{ objects?: Array<{ key: string }> }>(
    inst,
    `/objects/?locationId=${encodeURIComponent(locationId)}`,
  ).catch(() => ({ objects: [] }));

  if (existing.objects?.some((o) => o.key === INVOICE_OBJECT_KEY)) return;

  await ghlFetch(inst, '/objects/', {
    method: 'POST',
    body: JSON.stringify({
      locationId,
      key: 'invoice',
      labels: { singular: 'Invoice', plural: 'Invoices' },
      primaryDisplayPropertyDetails: {
        key: FIELDS.invoiceNumber,
        name: 'Invoice Number',
        dataType: 'TEXT',
      },
      // Remaining fields are created as the schema's properties.
      fields: [
        { key: FIELDS.vendorName, name: 'Vendor Name', dataType: 'TEXT' },
        { key: FIELDS.invoiceDate, name: 'Invoice Date', dataType: 'TEXT' },
        { key: FIELDS.totalAmount, name: 'Total Amount', dataType: 'NUMERICAL' },
        { key: FIELDS.lineItems, name: 'Line Items (JSON)', dataType: 'LARGE_TEXT' },
      ],
    }),
  });
}

/** Create one Invoice record from extracted data. Returns the new record id. */
export async function createInvoiceRecord(
  inst: Installation,
  locationId: string,
  invoice: Invoice,
): Promise<{ id: string }> {
  await ensureInvoiceObject(inst, locationId);

  // MVP: line items serialized as JSON in a LARGE_TEXT field. A later phase can
  // promote these to a related "Invoice Line Item" child object.
  const properties: Record<string, unknown> = {
    [FIELDS.vendorName]: invoice.vendor_name,
    [FIELDS.invoiceNumber]: invoice.invoice_number,
    [FIELDS.invoiceDate]: invoice.invoice_date,
    [FIELDS.totalAmount]: invoice.total_amount ?? 0,
    [FIELDS.lineItems]: JSON.stringify(invoice.line_items),
  };

  const created = await ghlFetch<{ record?: { id: string }; id?: string }>(
    inst,
    `/objects/${INVOICE_OBJECT_KEY}/records`,
    { method: 'POST', body: JSON.stringify({ locationId, properties }) },
  );

  return { id: created.record?.id ?? created.id ?? 'unknown' };
}

export interface GhlContact {
  id: string;
  name: string;
  email: string;
  phone: string;
}

/**
 * Find candidate Contacts by name/email for the "bill to" picker. The v2
 * advanced-search endpoint's request shape isn't fully specified in GHL's
 * published OpenAPI spec (its schema is a generic object) — this filter
 * shape matches their documented v2 search pattern but should be confirmed
 * against a live test sub-account.
 */
export async function searchContacts(
  inst: Installation,
  locationId: string,
  query: string,
): Promise<GhlContact[]> {
  const res = await ghlFetch<{ contacts?: Array<Record<string, unknown>> }>(inst, '/contacts/search', {
    method: 'POST',
    body: JSON.stringify({ locationId, query, pageLimit: 10 }),
  });
  return (res.contacts ?? []).map(toGhlContact);
}

export async function createContact(
  inst: Installation,
  locationId: string,
  data: { name: string; email?: string; phone?: string },
): Promise<GhlContact> {
  const res = await ghlFetch<{ contact: Record<string, unknown> }>(inst, '/contacts/', {
    method: 'POST',
    body: JSON.stringify({ locationId, name: data.name, email: data.email, phone: data.phone }),
  });
  return toGhlContact(res.contact);
}

function toGhlContact(c: Record<string, unknown>): GhlContact {
  return {
    id: String(c.id ?? ''),
    name: String(c.name ?? c.contactName ?? ''),
    email: String(c.email ?? ''),
    phone: String(c.phone ?? ''),
  };
}

const DEFAULT_CURRENCY = 'USD'; // TODO: make per-location once multi-currency is needed.

/** Map our extracted line items to GHL's invoice/estimate item shape. */
function toGhlItems(invoice: Invoice) {
  return invoice.line_items.map((li) => ({
    name: li.item_description || 'Item',
    description: li.item_description || undefined,
    currency: DEFAULT_CURRENCY,
    amount: li.price ?? 0,
    qty: li.quantity ?? 1,
  }));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Create a real GHL **Invoice** (services.leadconnectorhq.com `/invoices/`),
 * not the custom-object record `createInvoiceRecord` writes. This is what
 * shows up in the sub-account's actual Invoicing/Payments UI and can be sent
 * to and paid by the contact. Requires scope `invoices.write`.
 */
export async function createGhlInvoice(
  inst: Installation,
  locationId: string,
  contact: GhlContact,
  invoice: Invoice,
): Promise<{ id: string }> {
  const title = invoice.counterparty_name || invoice.vendor_name || 'Invoice';
  const created = await ghlFetch<{ _id?: string; id?: string }>(inst, '/invoices/', {
    method: 'POST',
    body: JSON.stringify({
      altId: locationId,
      altType: 'location',
      name: `Invoice for ${title}`,
      businessDetails: {},
      currency: DEFAULT_CURRENCY,
      items: toGhlItems(invoice),
      discount: { type: 'percentage', value: 0 },
      contactDetails: { id: contact.id, name: contact.name, email: contact.email, phoneNo: contact.phone },
      invoiceNumber: invoice.invoice_number || undefined,
      issueDate: invoice.invoice_date || todayIso(),
      sentTo: { email: [contact.email] },
      liveMode: true,
    }),
  });
  return { id: created._id ?? created.id ?? 'unknown' };
}

/**
 * Create a real GHL **Estimate** (`/invoices/estimate`). Requires scope
 * `invoices/estimate.write` (separate from `invoices.write`). `frequencySettings`
 * is required by GHL's schema even for a one-off estimate — `{ enabled: false }`
 * is the non-recurring case.
 */
export async function createGhlEstimate(
  inst: Installation,
  locationId: string,
  contact: GhlContact,
  invoice: Invoice,
): Promise<{ id: string }> {
  const title = invoice.counterparty_name || invoice.vendor_name || 'Estimate';
  const created = await ghlFetch<{ _id?: string; id?: string }>(inst, '/invoices/estimate', {
    method: 'POST',
    body: JSON.stringify({
      altId: locationId,
      altType: 'location',
      name: `Estimate for ${title}`,
      businessDetails: {},
      currency: DEFAULT_CURRENCY,
      items: toGhlItems(invoice),
      discount: { type: 'percentage', value: 0 },
      contactDetails: { id: contact.id, name: contact.name, email: contact.email, phoneNo: contact.phone },
      issueDate: invoice.invoice_date || todayIso(),
      liveMode: true,
      frequencySettings: { enabled: false, schedule: {} },
    }),
  });
  return { id: created._id ?? created.id ?? 'unknown' };
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: config.ghl.clientId,
    client_secret: config.ghl.clientSecret,
    ...params,
  });
  if (params.grant_type === 'authorization_code' && config.ghl.redirectUri) {
    body.set('redirect_uri', config.ghl.redirectUri);
  }

  return withRetry(async () => {
    const res = await fetch(`${config.ghl.apiBase}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
    if (!res.ok) throw new HttpError(res.status, await res.text());
    return (await res.json()) as TokenResponse;
  });
}

async function upsertInstallation(token: TokenResponse): Promise<Installation> {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  const data = {
    userType: token.userType ?? 'Location',
    ghlCompanyId: token.companyId ?? null,
    ghlLocationId: token.locationId ?? null,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
    scope: token.scope ?? null,
  };

  // Location installs are keyed by locationId; agency installs may lack one.
  if (token.locationId) {
    return prisma.installation.upsert({
      where: { ghlLocationId: token.locationId },
      create: data,
      update: data,
    });
  }
  return prisma.installation.create({ data });
}
