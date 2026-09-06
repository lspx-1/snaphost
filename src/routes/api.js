import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { appDb } from '../db.js';
import { deployerService } from '../services/deployer.js';
import { dockerService } from '../services/docker.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitizeSubdomain } from '../utils/slug.js';

export const apiRouter = express.Router();

// Ensure temp upload dir exists
const tempUploadDir = path.join(config.dataDir, 'temp');
fs.mkdirSync(tempUploadDir, { recursive: true });

// Configure Multer for ZIP file uploads
const upload = multer({
  dest: tempUploadDir,
  limits: { fileSize: config.maxUploadSizeBytes }
});

// Helper: Format App URL
function formatAppUrl(subdomain) {
  if (config.rootDomain === 'localhost') {
    return `http://${subdomain}.localhost:${config.port}`;
  }
  return `https://${subdomain}.${config.rootDomain}`;
}

// -------------------------------------------------------------
// 1. Deploy App (ZIP file upload)
// Accessible by Admin OR API Key (AI Assistant)
// -------------------------------------------------------------
apiRouter.post('/deploy', requireAuth, upload.single('file'), async (req, res) => {
  const hasFile = !!req.file;
  const rawHtml = req.body.html;

  if (!hasFile && !rawHtml) {
    return res.status(400).json({
      ok: false,
      success: false,
      error: 'Keine Datei übermittelt. Bitte ein ZIP-Archiv, eine einzelne .html-Datei oder ein "html"-Feld senden.'
    });
  }

  const uploadedPath = req.file?.path;
  const originalFilename = req.file?.originalname || '';

  try {
    const result = await deployerService.deploy({
      filePath: uploadedPath,
      originalFilename,
      rawHtml,
      customSubdomain: req.body.slug || req.body.name || req.body.subdomain,
      ttl: req.body.ttl,
      requestedType: req.body.type,
      title: req.body.title || req.body.name || originalFilename,
      internalPort: req.body.port ? parseInt(req.body.port, 10) : undefined,
      password: req.body.password,
      spa: req.body.spa
    });

    const appOrSite = result.app || result;
    res.status(201).json({
      ok: true,
      success: true,
      message: 'Deployment erfolgreich erstellt!',
      ...result,
      site: appOrSite,
      app: appOrSite
    });
  } catch (err) {
    console.error('[API Deploy Error]', err.message);
    res.status(400).json({
      ok: false,
      success: false,
      error: err.message
    });
  } finally {
    // Clean up temporary uploaded file
    if (uploadedPath && fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }
  }
});

// -------------------------------------------------------------
// 2. List Apps / Sites
// -------------------------------------------------------------
apiRouter.get(['/apps', '/sites'], requireAuth, async (req, res) => {
  try {
    const apps = appDb.listApps();
    const formatted = await Promise.all(apps.map(async (app) => {
      let liveStatus = app.status;
      if (app.type === 'docker' && app.container_id && app.status === 'running') {
        liveStatus = await dockerService.getStatus(app.container_id);
      }
      return {
        ...app,
        url: formatAppUrl(app.subdomain),
        liveStatus,
        meta: JSON.parse(app.meta || '{}')
      };
    }));

    res.json({ ok: true, success: true, apps: formatted, sites: formatted });
  } catch (err) {
    res.status(500).json({ ok: false, success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 3. Get Single App / Site (by ID or Subdomain)
// -------------------------------------------------------------
apiRouter.get(['/apps/:identifier', '/sites/:identifier'], requireAuth, async (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) {
    return res.status(404).json({ ok: false, success: false, error: 'App/Site nicht gefunden' });
  }

  let liveStatus = app.status;
  if (app.type === 'docker' && app.container_id) {
    liveStatus = await dockerService.getStatus(app.container_id);
  }

  const appObj = {
    ...app,
    url: formatAppUrl(app.subdomain),
    liveStatus,
    meta: JSON.parse(app.meta || '{}')
  };

  res.json({
    ok: true,
    success: true,
    app: appObj,
    site: appObj
  });
});

// -------------------------------------------------------------
// 4. Update App / Site Settings (Subdomain rename, TTL, title, password, etc.)
// -------------------------------------------------------------
apiRouter.patch(['/apps/:identifier', '/sites/:identifier'], requireAuth, (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) {
    return res.status(404).json({ ok: false, success: false, error: 'App/Site nicht gefunden' });
  }

  const updates = {};
  const requestedSlug = req.body.slug || req.body.subdomain;

  // Rename Subdomain / Slug
  if (requestedSlug && requestedSlug !== app.subdomain) {
    const sanitized = sanitizeSubdomain(requestedSlug);
    if (!sanitized) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'Ungültiger Subdomain-Name. Min. 3 Kleinbuchstaben/Zahlen/Bindestriche.'
      });
    }
    const existing = appDb.getAppBySubdomain(sanitized);
    if (existing && existing.id !== app.id) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: `Subdomain '${sanitized}' ist bereits durch eine andere App belegt.`
      });
    }
    updates.subdomain = sanitized;
  }

  // Change TTL / Expiration
  if (req.body.ttl !== undefined) {
    updates.ttl = req.body.ttl;
    updates.expires_at = deployerService.calculateExpiresAt(req.body.ttl);
  }

  if (req.body.title !== undefined || req.body.name !== undefined) {
    updates.title = req.body.title || req.body.name;
  }

  if (req.body.password !== undefined) {
    updates.password = req.body.password === '' ? null : req.body.password;
  }

  if (req.body.spa !== undefined) {
    updates.spa = req.body.spa === true || req.body.spa === 'true' || req.body.spa === 1;
  }

  if (req.body.port !== undefined && req.body.port !== '') {
    updates.internal_port = parseInt(req.body.port, 10);
  }

  if (req.body.start !== undefined) updates.start_cmd = req.body.start;
  if (req.body.build !== undefined) updates.build_cmd = req.body.build;
  if (req.body.env !== undefined) updates.env_vars = req.body.env;

  const updated = appDb.updateApp(app.id, updates);
  const updatedObj = {
    ...updated,
    url: formatAppUrl(updated.subdomain)
  };

  res.json({
    ok: true,
    success: true,
    message: 'App/Site erfolgreich aktualisiert',
    app: updatedObj,
    site: updatedObj
  });
});

// -------------------------------------------------------------
// 4b. Get App / Site Deployments History
// -------------------------------------------------------------
apiRouter.get(['/apps/:identifier/deployments', '/sites/:identifier/deployments'], requireAuth, (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) return res.status(404).json({ ok: false, success: false, error: 'App/Site nicht gefunden' });
  const deployments = appDb.listDeployments(app.id);
  res.json({ ok: true, success: true, deployments });
});

// -------------------------------------------------------------
// 5. In-Place Redeploy / Update Code
// -------------------------------------------------------------
apiRouter.post(['/apps/:identifier/deploy', '/sites/:identifier/deploy'], requireAuth, upload.single('file'), async (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) return res.status(404).json({ ok: false, success: false, error: 'App/Site nicht gefunden' });

  const hasFile = !!req.file;
  const rawHtml = req.body.html;

  if (!hasFile && !rawHtml) {
    return res.status(400).json({ ok: false, success: false, error: 'Keine Datei oder HTML für das Update übergeben.' });
  }

  const uploadedPath = req.file?.path;
  const originalFilename = req.file?.originalname || '';

  try {
    const result = await deployerService.updateExistingApp(app, {
      filePath: uploadedPath,
      originalFilename,
      rawHtml,
      ttl: req.body.ttl,
      requestedType: req.body.type,
      title: req.body.title || req.body.name,
      internalPort: req.body.port ? parseInt(req.body.port, 10) : undefined,
      password: req.body.password,
      spa: req.body.spa
    });

    const appOrSite = result.app || result;
    res.json({
      ok: true,
      success: true,
      message: `App '${app.subdomain}' erfolgreich aktualisiert (Version ${result.version}).`,
      ...result,
      app: appOrSite,
      site: appOrSite
    });
  } catch (err) {
    res.status(400).json({ ok: false, success: false, error: err.message });
  } finally {
    if (uploadedPath && fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }
  }
});

// -------------------------------------------------------------
// 6. Rebuild App Container
// -------------------------------------------------------------
apiRouter.post(['/apps/:identifier/rebuild', '/sites/:identifier/rebuild'], requireAuth, async (req, res) => {
  try {
    const result = await deployerService.rebuild(req.params.identifier);
    res.json({ ok: true, success: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 7. Rollback to Previous Version
// -------------------------------------------------------------
apiRouter.post(['/apps/:identifier/rollback', '/sites/:identifier/rollback'], requireAuth, async (req, res) => {
  try {
    const targetVersion = req.body.version ? parseInt(req.body.version, 10) : null;
    const result = await deployerService.rollback(req.params.identifier, targetVersion);
    res.json({ ok: true, success: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 8. Restart / Start (Docker apps & Static apps)
// -------------------------------------------------------------
apiRouter.post(['/apps/:identifier/restart', '/sites/:identifier/restart'], requireAuth, async (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) return res.status(404).json({ ok: false, success: false, error: 'App nicht gefunden' });

  if (app.type === 'static') {
    appDb.updateApp(app.id, { status: 'running' });
    return res.json({ ok: true, success: true, message: 'Statische Seite wieder online gestellt.' });
  }

  try {
    if (app.container_id) {
      await dockerService.restart(app.container_id);
    } else {
      await deployerService.rebuild(app.id);
    }
    appDb.updateApp(app.id, { status: 'running', status_message: null });
    res.json({ ok: true, success: true, message: 'Container erfolgreich neu gestartet' });
  } catch (err) {
    res.status(500).json({ ok: false, success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 9. Stop / Offline Nehmen
// -------------------------------------------------------------
apiRouter.post(['/apps/:identifier/stop', '/sites/:identifier/stop'], requireAuth, async (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) return res.status(404).json({ ok: false, success: false, error: 'App nicht gefunden' });

  if (app.type === 'static') {
    appDb.updateApp(app.id, { status: 'stopped' });
    return res.json({ ok: true, success: true, message: 'Statische Seite offline genommen.' });
  }

  try {
    if (app.container_id) {
      await dockerService.stop(app.container_id);
    }
    appDb.updateApp(app.id, { status: 'stopped' });
    res.json({ ok: true, success: true, message: 'Container erfolgreich angehalten (offline)' });
  } catch (err) {
    res.status(500).json({ ok: false, success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 10. Get Logs (Build Logs + Container stdout/stderr)
// -------------------------------------------------------------
apiRouter.get(['/apps/:identifier/logs', '/sites/:identifier/logs'], requireAuth, async (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) return res.status(404).json({ ok: false, success: false, error: 'App nicht gefunden' });

  let combined = '';
  const buildLogFile = path.join(config.appsDir, app.id, 'build.log');
  if (fs.existsSync(buildLogFile)) {
    try {
      combined += '=== BUILD LOG ===\n' + fs.readFileSync(buildLogFile, 'utf-8') + '\n\n';
    } catch (_) {}
  }

  if (app.status_message && !combined.includes(app.status_message)) {
    combined += '=== STATUS / FEHLERMELDUNG ===\n' + app.status_message + '\n\n';
  }

  if (app.type === 'docker' && app.container_id) {
    const cLogs = await dockerService.getLogs(app.container_id, req.query.tail || 200);
    combined += '=== CONTAINER RUNTIME LOGS ===\n' + cLogs;
  } else if (!combined) {
    combined = 'Statische Seite aktiv. Keine Fehlermeldungen oder Server-Logs vorhanden.';
  }

  res.json({ ok: true, success: true, logs: combined.trim() });
});

// -------------------------------------------------------------
// 11. Delete App / Site
// -------------------------------------------------------------
apiRouter.delete(['/apps/:identifier', '/sites/:identifier'], requireAuth, async (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) return res.status(404).json({ ok: false, success: false, error: 'App nicht gefunden' });

  // Stop container
  if (app.type === 'docker' && app.container_id) {
    await dockerService.stopAndRemove(app.container_id);
  }

  // Delete files
  const appDir = path.join(config.appsDir, app.id);
  if (fs.existsSync(appDir)) {
    fs.rmSync(appDir, { recursive: true, force: true });
  }

  // Remove DB record
  appDb.deleteApp(app.id);

  res.json({ ok: true, success: true, message: `App '${app.subdomain}' erfolgreich gelöscht.` });
});

// -------------------------------------------------------------
// 8. API Keys Management
// -------------------------------------------------------------
apiRouter.get('/keys', requireAuth, (req, res) => {
  res.json({ success: true, keys: appDb.listApiKeys() });
});

apiRouter.post('/keys', requireAuth, (req, res) => {
  const name = req.body.name || 'AI Assistant';
  const newKey = appDb.createApiKey(name);
  res.status(201).json({ success: true, key: newKey });
});

apiRouter.delete('/keys/:id', requireAuth, (req, res) => {
  appDb.deleteApiKey(req.params.id);
  res.json({ success: true, message: 'API-Key gelöscht' });
});

// -------------------------------------------------------------
// 9. System Info & AI Prompt Helper
// -------------------------------------------------------------
apiRouter.get('/info', requireAuth, (req, res) => {
  const keys = appDb.listApiKeys();
  const sampleKey = keys.length > 0 ? keys[0].key : '$DEPLOY_TOKEN';
  const deployUrl = config.rootDomain === 'localhost'
    ? `http://localhost:${config.port}/api/deploy`
    : `https://${config.adminSubdomain ? config.adminSubdomain + '.' : ''}${config.rootDomain}/api/deploy`;

  res.json({
    success: true,
    rootDomain: config.rootDomain,
    adminSubdomain: config.adminSubdomain,
    dockerAvailable: dockerService.isAvailable,
    defaultTtl: config.defaultTtl,
    deployEndpoint: deployUrl,
    sampleApiKey: sampleKey
  });
});
