import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { decryptSso } from '../services/sso.js';
import { extractInvoice } from '../services/anthropic.js';
import {
  createInvoiceRecord,
  createContact,
  createGhlEstimate,
  createGhlInvoice,
  getValidInstallationForLocation,
  searchContacts,
} from '../services/ghl.js';
import { invoiceSchema } from '../lib/invoiceSchema.js';

export const apiRouter = Router();

// Invoices are small; keep them in memory and cap size.
const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } });

/** Decrypt the GHL SSO payload → tenant context for the Custom Page UI. */
apiRouter.post('/sso/decrypt', (req, res) => {
  const encrypted = req.body?.encryptedData;
  if (typeof encrypted !== 'string') {
    res.status(400).json({ error: 'encryptedData (string) is required' });
    return;
  }
  try {
    res.json(decryptSso(encrypted));
  } catch (err) {
    console.error('[sso] decrypt failed', err);
    res.status(400).json({ error: 'Could not decrypt SSO payload' });
  }
});

/** Upload an invoice file → return extracted, validated data for on-screen review. */
apiRouter.post('/extract', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file is required (multipart/form-data)' });
    return;
  }
  try {
    const invoice = await extractInvoice(req.file.buffer, req.file.mimetype);
    res.json({ invoice });
  } catch (err) {
    console.error('[extract] failed', err);
    res.status(502).json({ error: (err as Error).message });
  }
});

const saveBody = z.object({
  locationId: z.string().min(1),
  invoice: invoiceSchema,
});

/** Persist a reviewed invoice as an Invoice custom-object record in GHL. */
apiRouter.post('/invoices', async (req, res) => {
  const parsed = saveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { locationId, invoice } = parsed.data;
  try {
    const inst = await getValidInstallationForLocation(locationId);
    const record = await createInvoiceRecord(inst, locationId, invoice);
    res.json({ ok: true, recordId: record.id });
  } catch (err) {
    console.error('[invoices] save failed', err);
    res.status(502).json({ error: (err as Error).message });
  }
});

/** Find existing GHL Contacts to bill — the "bill to" picker on the review screen. */
apiRouter.get('/contacts/search', async (req, res) => {
  const locationId = String(req.query.locationId ?? '');
  const query = String(req.query.query ?? '');
  if (!locationId || !query) {
    res.status(400).json({ error: 'locationId and query are required' });
    return;
  }
  try {
    const inst = await getValidInstallationForLocation(locationId);
    const contacts = await searchContacts(inst, locationId, query);
    res.json({ contacts });
  } catch (err) {
    console.error('[contacts] search failed', err);
    res.status(502).json({ error: (err as Error).message });
  }
});

const contactBody = z.object({
  locationId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
});

/** Create a new GHL Contact when no existing match is picked. */
apiRouter.post('/contacts', async (req, res) => {
  const parsed = contactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { locationId, ...data } = parsed.data;
  try {
    const inst = await getValidInstallationForLocation(locationId);
    const contact = await createContact(inst, locationId, data);
    res.json({ contact });
  } catch (err) {
    console.error('[contacts] create failed', err);
    res.status(502).json({ error: (err as Error).message });
  }
});

const ghlDocBody = z.object({
  locationId: z.string().min(1),
  invoice: invoiceSchema,
  contact: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().optional().default(''),
    phone: z.string().optional().default(''),
  }),
});

/** Create a real GHL Invoice (visible/payable in the sub-account's Invoicing UI). */
apiRouter.post('/ghl-invoices', async (req, res) => {
  const parsed = ghlDocBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { locationId, invoice, contact } = parsed.data;
  try {
    const inst = await getValidInstallationForLocation(locationId);
    const created = await createGhlInvoice(inst, locationId, contact, invoice);
    res.json({ ok: true, recordId: created.id });
  } catch (err) {
    console.error('[ghl-invoices] save failed', err);
    res.status(502).json({ error: (err as Error).message });
  }
});

/** Create a real GHL Estimate. */
apiRouter.post('/ghl-estimates', async (req, res) => {
  const parsed = ghlDocBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { locationId, invoice, contact } = parsed.data;
  try {
    const inst = await getValidInstallationForLocation(locationId);
    const created = await createGhlEstimate(inst, locationId, contact, invoice);
    res.json({ ok: true, recordId: created.id });
  } catch (err) {
    console.error('[ghl-estimates] save failed', err);
    res.status(502).json({ error: (err as Error).message });
  }
});
