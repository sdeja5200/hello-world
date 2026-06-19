import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { decryptSso } from '../services/sso.js';
import { extractInvoice } from '../services/anthropic.js';
import { createInvoiceRecord, getValidInstallationForLocation } from '../services/ghl.js';
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
