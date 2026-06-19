import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { withRetry } from '../lib/retry.js';
import { invoiceJsonSchema, invoiceSchema, type Invoice } from '../lib/invoiceSchema.js';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

/** MIME types we hand to Claude as a native `document` block. */
const PDF_MIME = 'application/pdf';
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/**
 * Extract structured invoice data from a raw file buffer.
 *
 * Unlike the n8n prototype (which text-extracted the PDF first, then asked the
 * LLM to parse text), we send the document to Claude natively. That handles
 * scanned PDFs and images out of the box — the foundation for the "many
 * document types" goal — and removes a whole failure-prone step.
 */
export async function extractInvoice(file: Buffer, mimeType: string): Promise<Invoice> {
  const source = buildSource(file, mimeType);

  const message = await withRetry(() =>
    client.messages.create({
      model: config.anthropic.model,
      max_tokens: 2048,
      tools: [
        {
          name: 'record_invoice',
          description: 'Record the structured data extracted from this invoice document.',
          input_schema: invoiceJsonSchema as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'record_invoice' },
      messages: [
        {
          role: 'user',
          content: [
            source,
            {
              type: 'text',
              text: 'Extract every field and all line items from this invoice into the record_invoice tool. Use null for any value you cannot find. Do not invent data.',
            },
          ],
        },
      ],
    }),
  );

  const toolUse = message.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return structured invoice output');
  }

  // Validate/normalize before anyone downstream trusts it.
  return invoiceSchema.parse(toolUse.input);
}

function buildSource(file: Buffer, mimeType: string): Anthropic.ContentBlockParam {
  const data = file.toString('base64');
  if (mimeType === PDF_MIME) {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  }
  if (IMAGE_MIMES.includes(mimeType)) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: mimeType as 'image/png', data },
    };
  }
  throw new Error(`Unsupported file type: ${mimeType}. Supported: PDF, PNG, JPEG, GIF, WEBP.`);
}
