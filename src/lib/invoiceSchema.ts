import { z } from 'zod';

/**
 * Canonical invoice shape. This is a direct port of the JSON Schema from the
 * original n8n "Structured Output Parser" node, hardened with zod so we can
 * validate Claude's output before it ever touches GHL.
 */
export const lineItemSchema = z.object({
  item_description: z.string().default(''),
  quantity: z.number().nullable().default(null),
  price: z.number().nullable().default(null),
});

export const invoiceSchema = z.object({
  vendor_name: z.string().default(''),
  invoice_number: z.string().default(''),
  invoice_date: z.string().default(''), // ISO date string when present
  total_amount: z.number().nullable().default(null),
  line_items: z.array(lineItemSchema).default([]),
});

export type LineItem = z.infer<typeof lineItemSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;

/** JSON Schema handed to Claude as a tool, so it returns structured output. */
export const invoiceJsonSchema = {
  type: 'object',
  properties: {
    vendor_name: { type: 'string', description: 'Name of the vendor / supplier issuing the invoice' },
    invoice_number: { type: 'string', description: 'Invoice number / identifier' },
    invoice_date: { type: 'string', description: 'Invoice date in YYYY-MM-DD format if present' },
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
  required: ['vendor_name', 'invoice_number', 'total_amount', 'line_items'],
} as const;
