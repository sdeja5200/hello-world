import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    // Don't crash at import time in dev; surface clearly when the value is used.
    console.warn(`[config] Missing required env var: ${name}`);
  }
  return v ?? '';
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  appBaseUrl: process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,

  ghl: {
    clientId: required('GHL_CLIENT_ID'),
    clientSecret: required('GHL_CLIENT_SECRET'),
    ssoKey: required('GHL_SSO_KEY'),
    redirectUri: process.env.GHL_REDIRECT_URI ?? '',
    apiBase: process.env.GHL_API_BASE ?? 'https://services.leadconnectorhq.com',
    apiVersion: process.env.GHL_API_VERSION ?? '2021-07-28',
  },

  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
  },
} as const;
