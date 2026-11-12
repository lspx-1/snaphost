import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { verifyGithubOidc, pullAndInstall, restartSoon, getVersion } from '../services/updater.js';

export const systemRouter = express.Router();

const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

async function requireGithubDeploy(req, res, next) {
  try {
    req.deploy = await verifyGithubOidc(bearer(req));
    next();
  } catch (err) {
    res.status(401).json({ ok: false, error: `Auto-Update abgelehnt: ${err.message}` });
  }
}

// Laufende Version – für die GitHub Action (OIDC) oder eingeloggte Nutzer / API-Keys
systemRouter.get('/version', async (req, res, next) => {
  try {
    await verifyGithubOidc(bearer(req));
    next();
  } catch {
    requireAuth(req, res, next);
  }
}, (req, res) => {
  res.json({ ok: true, ...getVersion() });
});

// Auto-Deploy: wird von .github/workflows/deploy.yml nach jedem Push auf main aufgerufen
systemRouter.post('/update', requireGithubDeploy, async (req, res) => {
  console.log(`[Updater] Update angefordert von ${req.deploy.repository}@${String(req.deploy.sha).slice(0, 7)} (${req.deploy.actor})`);
  try {
    const result = await pullAndInstall(req.body?.sha || req.deploy.sha);
    res.json({ ok: true, ...result });
    if (result.restarting) restartSoon();
  } catch (err) {
    console.error('[Updater] Update fehlgeschlagen:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});
