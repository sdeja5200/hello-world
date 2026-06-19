import { Router } from 'express';
import { prisma } from '../db/client.js';

export const webhooksRouter = Router();

/**
 * GHL app lifecycle webhooks. We care about UNINSTALL so we purge tokens for a
 * tenant the moment they remove the app (clean multi-tenant hygiene + a
 * marketplace requirement). INSTALL is handled by the OAuth callback, but we log
 * it here too in case the install webhook arrives independently.
 */
webhooksRouter.post('/', async (req, res) => {
  // Ack fast; GHL retries on non-2xx.
  res.sendStatus(200);

  const event = req.body ?? {};
  const type = event.type ?? event.event;
  try {
    if (type === 'UNINSTALL' || type === 'APP_UNINSTALL') {
      const { locationId, companyId } = event;
      if (locationId) {
        await prisma.installation.deleteMany({ where: { ghlLocationId: locationId } });
      } else if (companyId) {
        await prisma.installation.deleteMany({ where: { ghlCompanyId: companyId } });
      }
      console.log(`[webhook] Uninstalled location=${locationId} company=${companyId}`);
    } else {
      console.log(`[webhook] Received ${type}`);
    }
  } catch (err) {
    console.error('[webhook] handler error', err);
  }
});
