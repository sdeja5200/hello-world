import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceSchema } from './invoiceSchema.js';

test('fills defaults for missing fields', () => {
  const result = invoiceSchema.parse({ vendor_name: 'Apex AI' });
  assert.equal(result.vendor_name, 'Apex AI');
  assert.equal(result.invoice_number, '');
  assert.equal(result.total_amount, null);
  assert.deepEqual(result.line_items, []);
});

test('parses a full invoice with line items', () => {
  const result = invoiceSchema.parse({
    vendor_name: 'Apex AI Solutions',
    invoice_number: 'INV-2026-0892',
    invoice_date: '2026-06-17',
    total_amount: 1200,
    line_items: [{ item_description: 'Voice Agent Setup', quantity: 1, price: 750 }],
  });
  assert.equal(result.total_amount, 1200);
  assert.equal(result.line_items.length, 1);
  assert.equal(result.line_items[0].price, 750);
});

test('rejects a non-numeric total', () => {
  assert.throws(() => invoiceSchema.parse({ total_amount: 'lots' }));
});
