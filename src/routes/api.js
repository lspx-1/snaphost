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
import AdmZip from 'adm-zip';
import { DatabaseSync } from 'node:sqlite';

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
// 10b. Download App Source Bundle (ZIP)
// -------------------------------------------------------------
apiRouter.get(['/apps/:identifier/download', '/sites/:identifier/download', '/apps/:identifier/bundle'], requireAuth, async (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) return res.status(404).json({ ok: false, success: false, error: 'App nicht gefunden' });

  const contentDir = path.join(config.appsDir, app.id, 'content');
  if (!fs.existsSync(contentDir)) {
    return res.status(404).json({ ok: false, success: false, error: 'Keine Quellcodedateien für diese App gefunden.' });
  }

  try {
    const zip = new AdmZip();

    // Recursively add files from contentDir, skipping node_modules, .git, etc.
    function addDir(localPath, zipPrefix = '') {
      const entries = fs.readdirSync(localPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.DS_Store' || entry.name === '.next' || entry.name === '.cache') continue;
        const fullPath = path.join(localPath, entry.name);
        const zipEntryPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          addDir(fullPath, zipEntryPath);
        } else if (entry.isFile()) {
          zip.addLocalFile(fullPath, zipPrefix);
        }
      }
    }

    addDir(contentDir);
    const buffer = zip.toBuffer();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${app.subdomain}-v${app.version || 1}.zip"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ ok: false, success: false, error: 'Fehler beim Erstellen des ZIP-Archivs: ' + err.message });
  }
});

// -------------------------------------------------------------
// 10c. Persistent Data & Database Management (/data Volume)
// -------------------------------------------------------------
function scanDataDir(dirPath, relativePrefix = '') {
  let files = [];
  let totalBytes = 0;
  if (!fs.existsSync(dirPath)) return { files, totalBytes };

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    try {
      const stat = fs.statSync(fullPath);
      if (entry.isDirectory()) {
        const sub = scanDataDir(fullPath, relPath);
        files = files.concat(sub.files);
        totalBytes += sub.totalBytes;
      } else if (entry.isFile()) {
        const isSqlite = /\.(sqlite|sqlite3|db)$/i.test(entry.name);
        const isJson = /\.json$/i.test(entry.name);
        files.push({
          name: entry.name,
          path: relPath,
          sizeBytes: stat.size,
          mtime: stat.mtime.toISOString(),
          isSqlite,
          isJson
        });
        totalBytes += stat.size;
      }
    } catch (_) {}
  }
  return { files, totalBytes };
}

function inspectSqliteTables(sqliteFilePath) {
  let db = null;
  try {
    db = new DatabaseSync(sqliteFilePath, { readOnly: true });
    const tablesRaw = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    const tables = [];
    for (const t of tablesRaw) {
      const tableName = t.name;
      let rowCount = 0;
      let columns = [];
      try {
        const countRes = db.prepare(`SELECT count(*) as cnt FROM "${tableName}"`).get();
        rowCount = countRes ? countRes.cnt : 0;
      } catch (_) {}
      try {
        const colInfo = db.prepare(`PRAGMA table_info("${tableName}")`).all();
        columns = colInfo.map(c => ({ name: c.name, type: c.type, pk: !!c.pk }));
      } catch (_) {}
      tables.push({ name: tableName, rowCount, columns });
    }
    return tables;
  } catch (_) {
    return [];
  } finally {
    if (db) {
      try { db.close(); } catch (_) {}
    }
  }
}

// 1. Overview & SQLite Schema
apiRouter.get(['/apps/:identifier/data', '/sites/:identifier/data'], requireAuth, (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) return res.status(404).json({ ok: false, success: false, error: 'App nicht gefunden' });

  const dataDir = path.join(config.appsDir, app.id, 'data');
  const { files, totalBytes } = scanDataDir(dataDir);

  // Find first SQLite database file if any
  const sqliteFiles = files.filter(f => f.isSqlite);
  let sqliteInfo = null;

  if (sqliteFiles.length > 0) {
    const primaryDbFile = sqliteFiles[0];
    const fullDbPath = path.join(dataDir, primaryDbFile.path);
    const tables = inspectSqliteTables(fullDbPath);
    sqliteInfo = {
      hasDb: true,
      file: primaryDbFile.path,
      allDbFiles: sqliteFiles.map(f => f.path),
      tables
    };
  }

  res.json({
    ok: true,
    success: true,
    storage: {
      exists: fs.existsSync(dataDir),
      mountPath: '/data',
      altMountPath: '/app/data',
      totalSizeBytes: totalBytes,
      fileCount: files.length,
      files,
      sqlite: sqliteInfo
    }
  });
});

// 2. Query SQLite Table rows (read-only)
apiRouter.get(['/apps/:identifier/data/table', '/sites/:identifier/data/table'], requireAuth, (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) return res.status(404).json({ ok: false, success: false, error: 'App nicht gefunden' });

  const dataDir = path.join(config.appsDir, app.id, 'data');
  const targetTable = (req.query.table || '').toString().trim();
  if (!targetTable) {
    return res.status(400).json({ ok: false, success: false, error: 'Parameter "table" ist erforderlich' });
  }

  const reqFile = (req.query.file || 'app.db').toString().trim();
  const safeFileName = path.basename(reqFile);
  const dbPath = path.join(dataDir, safeFileName);

  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ ok: false, success: false, error: `Datenbankdatei '${safeFileName}' nicht gefunden` });
  }

  let db = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const validTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(targetTable);
    if (!validTable) {
      return res.status(404).json({ ok: false, success: false, error: `Tabelle '${targetTable}' nicht in ${safeFileName} gefunden` });
    }

    const colInfo = db.prepare(`PRAGMA table_info("${targetTable}")`).all();
    const columns = colInfo.map(c => ({ name: c.name, type: c.type, pk: !!c.pk }));

    const countRes = db.prepare(`SELECT count(*) as cnt FROM "${targetTable}"`).get();
    const total = countRes ? countRes.cnt : 0;

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const rows = db.prepare(`SELECT * FROM "${targetTable}" LIMIT ? OFFSET ?`).all(limit, offset);

    res.json({
      ok: true,
      success: true,
      table: targetTable,
      file: safeFileName,
      columns,
      rows,
      total,
      limit,
      offset
    });
  } catch (err) {
    res.status(500).json({ ok: false, success: false, error: 'Fehler beim Lesen der Tabelle: ' + err.message });
  } finally {
    if (db) {
      try { db.close(); } catch (_) {}
    }
  }
});

// 3. Download Data Volume as ZIP
apiRouter.get(['/apps/:identifier/data/download', '/sites/:identifier/data/download'], requireAuth, (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) return res.status(404).json({ ok: false, success: false, error: 'App nicht gefunden' });

  const dataDir = path.join(config.appsDir, app.id, 'data');
  if (!fs.existsSync(dataDir)) {
    return res.status(404).json({ ok: false, success: false, error: 'Kein Datenverzeichnis für diese App gefunden' });
  }

  try {
    const zip = new AdmZip();
    const entries = fs.readdirSync(dataDir);
    if (entries.length === 0) {
      zip.addFile('README.txt', Buffer.from('SnapHost Datenverzeichnis ist leer.\n'));
    } else {
      zip.addLocalFolder(dataDir);
    }
    const buffer = zip.toBuffer();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${app.subdomain}-data.zip"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ ok: false, success: false, error: 'Fehler beim Erstellen des Daten-Archivs: ' + err.message });
  }
});

// 4. Reset / Clear Data Volume
apiRouter.delete(['/apps/:identifier/data', '/sites/:identifier/data'], requireAuth, async (req, res) => {
  const app = appDb.getAppByIdOrSubdomain(req.params.identifier);
  if (!app) return res.status(404).json({ ok: false, success: false, error: 'App nicht gefunden' });

  const dataDir = path.join(config.appsDir, app.id, 'data');
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(dataDir, { recursive: true });

  // If container running, restart it to re-initialize fresh schemas
  if (app.type === 'docker' && app.container_id && app.status === 'running') {
    try {
      await dockerService.restart(app.container_id);
    } catch (_) {}
  }

  res.json({ ok: true, success: true, message: `Persistenter Speicher für '${app.subdomain}' wurde erfolgreich zurückgesetzt.` });
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
