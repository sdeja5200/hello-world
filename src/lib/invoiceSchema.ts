import { z } from 'zod';

/**
 * Canonical invoice shape. This is a direct port of the JSON Schema from the
 * original n8n "Structured Output Parser" node, hardened with zod so we can
 * validate Claude's output before it ever touches GHL.
 *
 * `document_type` and `counterparty_name` were added to generalize beyond
 * inbound vendor invoices (see `document_type` below): an estimate or
 * purchase order has the same line-item shape but the "other party" is a
 * customer being billed, not a vendor billing us. `vendor_name` is kept
 * (mirroring `counterparty_name`) so the existing GHL custom-object schema,
 * already live in test sub-accounts, doesn't need a field rename.
 */
export const documentTypeSchema = z
  .enum(['invoice', 'estimate', 'purchase_order', 'proposal', 'unknown'])
  .default('unknown');

export const lineItemSchema = z.object({
  item_description: z.string().default(''),
  quantity: z.number().nullable().default(null),
  price: z.number().nullable().default(null),
});

export const invoiceSchema = z.object({
  document_type: documentTypeSchema,
  vendor_name: z.string().default(''),
  counterparty_name: z.string().default(''),
  invoice_number: z.string().default(''),
  invoice_date: z.string().default(''), // ISO date string when present
  total_amount: z.number().nullable().default(null),
  line_items: z.array(lineItemSchema).default([]),
});

export type LineItem = z.infer<typeof lineItemSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type DocumentType = z.infer<typeof documentTypeSchema>;

/** JSON Schema handed to Claude as a tool, so it returns structured output. */
export const invoiceJsonSchema = {
  type: 'object',
  properties: {
    document_type: {
      type: 'string',
      enum: ['invoice', 'estimate', 'purchase_order', 'proposal', 'unknown'],
      description:
        'What kind of document this is. "invoice" = a bill being demanded for payment (could be a vendor billing us, or one we are issuing). "estimate" = a quoted price for proposed work, not yet a demand for payment. "purchase_order" = a buyer\'s order authorizing a purchase. "proposal" = a sales proposal/quote document. "unknown" if unclear.',
    },
    vendor_name: {
      type: 'string',
      description: 'Name of the vendor/supplier/issuer of this document (same value as counterparty_name)',
    },
    counterparty_name: {
      type: 'string',
      description: 'Name of the other party on the document — whoever issued it if we are the recipient, or whoever it is addressed to if we are the issuer',
    },
    invoice_number: { type: 'string', description: 'Invoice/estimate/PO number or identifier, whatever the document calls it' },
    invoice_date: { type: 'string', description: 'Document date in YYYY-MM-DD format if present' },
    total_amount: { type: ['number', 'null'], description: 'Grand total as a number, no currency symbol' },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item_description: { type: 'string' },
          quantity: { type: ['number', 'null'] },
          price: { type: ['number', 'null'] },
        },
        required: ['item_description'],
      },
    },
  },
  required: ['document_type', 'vendor_name', 'invoice_number', 'total_amount', 'line_items'],
} as const;
