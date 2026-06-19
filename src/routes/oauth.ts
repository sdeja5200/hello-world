import { Router } from 'express';
import { exchangeCodeAndStore } from '../services/ghl.js';

export const oauthRouter = Router();

/**
 * OAuth redirect target. GHL sends the user here with `?code=...` after they
 * approve the install. We exchange the code for tokens, persist the
 * installation, then drop the user into the app.
 */
oauthRouter.get('/callback', async (req, res) => {
  const code = String(req.query.code ?? '');
  if (!code) {
    res.status(400).send('Missing authorization code');
    return;
  }
  try {
    const inst = await exchangeCodeAndStore(code);
    console.log(`[oauth] Installed for location=${inst.ghlLocationId} company=${inst.ghlCompanyId}`);
    res.send(
      '<html><body style="font-family:sans-serif;padding:2rem">' +
        '<h2>✅ Voxlink Invoice Pro installed</h2>' +
        '<p>You can close this tab and open the app from the GoHighLevel menu.</p>' +
        '</body></html>',
    );
  } catch (err) {
    console.error('[oauth] token exchange failed', err);
    res.status(500).send('Authorization failed. Please try installing again.');
  }
});
