import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { oauthRouter } from './routes/oauth.js';
import { webhooksRouter } from './routes/webhooks.js';
import { apiRouter } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.use('/oauth', oauthRouter);
app.use('/webhooks', webhooksRouter);
app.use('/api', apiRouter);

// Serve the built Vue Custom Page (after `npm run ui:build`).
const uiDist = path.resolve(__dirname, '../ui/dist');
app.use(express.static(uiDist));
app.get('*', (_req, res) => res.sendFile(path.join(uiDist, 'index.html')));

app.listen(config.port, () => {
  console.log(`Invoice app listening on :${config.port} (base ${config.appBaseUrl})`);
});
