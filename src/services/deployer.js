import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { config } from '../config.js';
import { appDb } from '../db.js';
import { generateSlug, sanitizeSubdomain, extractBaseSlug, resolveUniqueSlug } from '../utils/slug.js';
import { dockerService } from './docker.js';

export const deployerService = {
  /**
   * Parse TTL string into ISO Date or null
   */
  calculateExpiresAt(ttlStr = config.defaultTtl) {
    if (!ttlStr || ttlStr === 'permanent' || ttlStr === 'never' || ttlStr === 'null') {
      return null;
    }

    const match = ttlStr.toString().toLowerCase().trim().match(/^(\d+)\s*([mhd])$/);
    let ms = 24 * 60 * 60 * 1000; // default 24h

    if (match) {
      const amount = parseInt(match[1], 10);
      const unit = match[2];
      if (unit === 'm') ms = amount * 60 * 1000;
      else if (unit === 'h') ms = amount * 60 * 60 * 1000;
      else if (unit === 'd') ms = amount * 24 * 60 * 60 * 1000;
    }

    return new Date(Date.now() + ms).toISOString();
  },

  /**
   * Auto-detect if app is static or docker
   */
  detectType(contentDir) {
    if (fs.existsSync(path.join(contentDir, 'Dockerfile'))) return 'docker';
    if (fs.existsSync(path.join(contentDir, 'package.json'))) return 'docker';
    if (fs.existsSync(path.join(contentDir, 'server.js')) || fs.existsSync(path.join(contentDir, 'app.js'))) return 'docker';
    return 'static';
  },

  /**
   * Format public URL for an app
   */
  formatUrl(subdomain) {
    return config.rootDomain === 'localhost'
      ? `http://${subdomain}.localhost:${config.port}`
      : `https://${subdomain}.${config.rootDomain}`;
  },

  /**
   * Deploy or Update an Application
   */
  async deploy({ filePath, originalFilename = '', rawHtml, customSubdomain, ttl, requestedType, title, internalPort, password, spa }) {
    // 1. Check if a custom subdomain was given and if it already exists -> In-Place UPDATE / REDEPLOY
    let existingApp = null;
    let finalSubdomain = null;

    if (customSubdomain && typeof customSubdomain === 'string' && customSubdomain.trim()) {
      const sanitized = sanitizeSubdomain(customSubdomain.trim());
      if (!sanitized) {
        throw new Error('Ungültiger Subdomain-Name. Erlaubt sind min. 3 Kleinbuchstaben, Ziffern und Bindestriche.');
      }
      existingApp = appDb.getAppBySubdomain(sanitized);
      finalSubdomain = sanitized;
    }

    if (existingApp) {
      return this.updateExistingApp(existingApp, {
        filePath,
        originalFilename,
        rawHtml,
        ttl,
        requestedType,
        title,
        internalPort,
        password,
        spa
      });
    }

    // 2. Fresh deployment: derive from filename or fallback to random slug
    if (!finalSubdomain) {
      const candidateSlug = extractBaseSlug(originalFilename);
      if (candidateSlug) {
        finalSubdomain = resolveUniqueSlug(candidateSlug, (slug) => !!appDb.getAppBySubdomain(slug));
      } else {
        for (let i = 0; i < 10; i++) {
          const slug = generateSlug();
          if (!appDb.getAppBySubdomain(slug)) {
            finalSubdomain = slug;
            break;
          }
        }
        if (!finalSubdomain) {
          finalSubdomain = 'app-' + crypto.randomBytes(4).toString('hex');
        }
      }
    }

    const appId = 'app_' + crypto.randomBytes(6).toString('hex');
    const appDir = path.join(config.appsDir, appId);
    const contentDir = path.join(appDir, 'content');

    fs.mkdirSync(contentDir, { recursive: true });

    let isHtmlDirect = false;

    // Unpack or write content
    if (rawHtml && typeof rawHtml === 'string') {
      fs.writeFileSync(path.join(contentDir, 'index.html'), rawHtml, 'utf-8');
      isHtmlDirect = true;
    } else if (filePath && (originalFilename.toLowerCase().endsWith('.html') || originalFilename.toLowerCase().endsWith('.htm'))) {
      fs.copyFileSync(filePath, path.join(contentDir, 'index.html'));
      isHtmlDirect = true;
    } else if (filePath) {
      try {
        const zip = new AdmZip(filePath);
        zip.extractAllTo(contentDir, true);
      } catch (err) {
        fs.rmSync(appDir, { recursive: true, force: true });
        throw new Error(`Fehler beim Entpacken der ZIP-Datei: ${err.message}`);
      }
    } else {
      fs.rmSync(appDir, { recursive: true, force: true });
      throw new Error('Keine Datei oder HTML-Inhalt zum Bereitstellen übergeben.');
    }

    // Check for deploy.json manifest
    let manifest = {};
    const manifestPath = path.join(contentDir, 'deploy.json');
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        console.warn(`[Deployer] Ungültiges deploy.json in ${appId}:`, err.message);
      }
    }

    // Calculate uploaded size
    let sizeBytes = 0;
    if (filePath && fs.existsSync(filePath)) {
      sizeBytes = fs.statSync(filePath).size;
    } else if (rawHtml) {
      sizeBytes = Buffer.byteLength(rawHtml, 'utf-8');
    }

    let appType = isHtmlDirect ? 'static' : (requestedType || manifest.type);
    if (!appType || appType === 'auto') {
      appType = this.detectType(contentDir);
    }
    if (appType === 'node' || appType === 'nodejs' || appType === 'container') {
      appType = 'docker';
    }

    const resolvedTtl = ttl || manifest.ttl || config.defaultTtl;
    const expiresAt = this.calculateExpiresAt(resolvedTtl);
    const resolvedPort = internalPort || manifest.port || 3000;
    const startCmd = manifest.start || null;
    const buildCmd = manifest.build || null;
    const envVars = manifest.env || null;
    const resolvedSpa = (spa !== undefined ? (spa === true || spa === 'true' || spa === 1) : manifest.spa) ?? false;
    const resolvedPassword = (password !== undefined && password !== '') ? password : (manifest.password || null);

    const appRecord = {
      id: appId,
      subdomain: finalSubdomain,
      type: appType,
      status: 'building',
      title: title || manifest.name || finalSubdomain,
      container_id: null,
      internal_port: resolvedPort,
      internal_host: '127.0.0.1',
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      ttl: resolvedTtl,
      version: 1,
      password: resolvedPassword,
      status_message: null,
      spa: resolvedSpa,
      start_cmd: startCmd,
      build_cmd: buildCmd,
      env_vars: envVars,
      meta: { version: 1 }
    };

    appDb.createApp(appRecord);
    appDb.recordDeployment(appId, 1, sizeBytes);

    if (appType === 'docker') {
      try {
        console.log(`[Deployer] Erstelle Docker-Container für ${finalSubdomain}...`);
        const containerInfo = await dockerService.buildAndRun(appId, contentDir, appRecord.internal_port, {
          start: startCmd,
          build: buildCmd,
          env: envVars
        });
        appDb.updateApp(appId, {
          status: 'running',
          status_message: null,
          container_id: containerInfo.containerId,
          internal_host: containerInfo.internalHost,
          internal_port: containerInfo.internalPort
        });
      } catch (dockerErr) {
        console.error(`[Deployer] Docker Build fehlgeschlagen für ${appId}:`, dockerErr.message);
        appDb.updateApp(appId, {
          status: 'error',
          status_message: dockerErr.message,
          meta: { error: dockerErr.message }
        });
        throw dockerErr;
      }
    } else {
      appDb.updateApp(appId, { status: 'running', status_message: null });
    }

    return {
      success: true,
      action: 'created',
      id: appId,
      subdomain: finalSubdomain,
      url: this.formatUrl(finalSubdomain),
      type: appType,
      version: 1,
      status: 'running',
      expiresAt,
      ttl: resolvedTtl
    };
  },

  /**
   * Update an existing deployment with new code (keeps versions for rollback)
   */
  async updateExistingApp(app, { filePath, originalFilename = '', rawHtml, ttl, requestedType, title, internalPort, password, spa }) {
    const appId = app.id;
    const appDir = path.join(config.appsDir, appId);
    const contentDir = path.join(appDir, 'content');
    const versionsDir = path.join(appDir, 'versions');
    const currentVersion = app.version || 1;
    const nextVersion = currentVersion + 1;

    // 1. Back up current content to versions/v{N}
    fs.mkdirSync(versionsDir, { recursive: true });
    const backupVersionDir = path.join(versionsDir, `v${currentVersion}`);
    if (fs.existsSync(contentDir)) {
      try {
        fs.cpSync(contentDir, backupVersionDir, { recursive: true });
        console.log(`[Deployer] Version v${currentVersion} gesichert für Rollback.`);
      } catch (cpErr) {
        console.warn(`[Deployer] Backup-Warnung:`, cpErr.message);
      }
    }

    // 2. Replace content
    fs.rmSync(contentDir, { recursive: true, force: true });
    fs.mkdirSync(contentDir, { recursive: true });

    let isHtmlDirect = false;
    if (rawHtml && typeof rawHtml === 'string') {
      fs.writeFileSync(path.join(contentDir, 'index.html'), rawHtml, 'utf-8');
      isHtmlDirect = true;
    } else if (filePath && (originalFilename.toLowerCase().endsWith('.html') || originalFilename.toLowerCase().endsWith('.htm'))) {
      fs.copyFileSync(filePath, path.join(contentDir, 'index.html'));
      isHtmlDirect = true;
    } else if (filePath) {
      const zip = new AdmZip(filePath);
      zip.extractAllTo(contentDir, true);
    }

    // Check for deploy.json manifest
    let manifest = {};
    const manifestPath = path.join(contentDir, 'deploy.json');
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        console.warn(`[Deployer] Ungültiges deploy.json in Update für ${appId}:`, err.message);
      }
    }

    // Calculate uploaded size
    let sizeBytes = 0;
    if (filePath && fs.existsSync(filePath)) {
      sizeBytes = fs.statSync(filePath).size;
    } else if (rawHtml) {
      sizeBytes = Buffer.byteLength(rawHtml, 'utf-8');
    }

    appDb.recordDeployment(appId, nextVersion, sizeBytes);

    // 3. Determine Type
    let appType = isHtmlDirect ? 'static' : (requestedType || manifest.type || app.type);
    if (!requestedType || requestedType === 'auto') {
      appType = isHtmlDirect ? 'static' : this.detectType(contentDir);
    }
    if (appType === 'node' || appType === 'nodejs' || appType === 'container') {
      appType = 'docker';
    }

    const updates = {
      type: appType,
      version: nextVersion,
      status: 'building'
    };

    if (title || manifest.name) updates.title = title || manifest.name;
    if (internalPort || manifest.port) updates.internal_port = internalPort || manifest.port;
    if (ttl || manifest.ttl) {
      const resolvedTtl = ttl || manifest.ttl;
      updates.ttl = resolvedTtl;
      updates.expires_at = this.calculateExpiresAt(resolvedTtl);
    }
    if (manifest.start !== undefined) updates.start_cmd = manifest.start;
    if (manifest.build !== undefined) updates.build_cmd = manifest.build;
    if (manifest.env !== undefined) updates.env_vars = manifest.env;
    if (spa !== undefined) updates.spa = (spa === true || spa === 'true' || spa === 1);
    else if (manifest.spa !== undefined) updates.spa = manifest.spa;

    if (password !== undefined && password !== '') updates.password = password;
    else if (manifest.password !== undefined) updates.password = manifest.password;

    // 4. Handle Docker restart/rebuild
    if (app.type === 'docker' && app.container_id) {
      await dockerService.stopAndRemove(app.container_id);
      updates.container_id = null;
    }

    if (appType === 'docker') {
      try {
        const port = updates.internal_port || app.internal_port || 3000;
        const startCmd = updates.start_cmd || app.start_cmd;
        const buildCmd = updates.build_cmd || app.build_cmd;
        const envVars = updates.env_vars || (app.env_vars ? JSON.parse(app.env_vars) : null);

        const containerInfo = await dockerService.buildAndRun(appId, contentDir, port, {
          start: startCmd,
          build: buildCmd,
          env: envVars
        });
        updates.status = 'running';
        updates.status_message = null;
        updates.container_id = containerInfo.containerId;
        updates.internal_host = containerInfo.internalHost;
        updates.internal_port = containerInfo.internalPort;
      } catch (err) {
        updates.status = 'error';
        updates.status_message = err.message;
        appDb.updateApp(appId, updates);
        throw err;
      }
    } else {
      updates.status = 'running';
      updates.status_message = null;
    }

    const updated = appDb.updateApp(appId, updates);

    return {
      success: true,
      action: 'updated',
      id: appId,
      subdomain: app.subdomain,
      url: this.formatUrl(app.subdomain),
      version: nextVersion,
      type: appType,
      status: 'running',
      expiresAt: updated.expires_at,
      ttl: updated.ttl
    };
  },

  /**
   * Rebuild an existing application from its current content
   */
  async rebuild(identifier) {
    const app = appDb.getAppByIdOrSubdomain(identifier);
    if (!app) throw new Error(`App '${identifier}' nicht gefunden.`);

    const appDir = path.join(config.appsDir, app.id);
    const contentDir = path.join(appDir, 'content');

    if (app.type === 'docker') {
      if (app.container_id) {
        await dockerService.stopAndRemove(app.container_id);
      }
      const startCmd = app.start_cmd;
      const buildCmd = app.build_cmd;
      const envVars = app.env_vars ? JSON.parse(app.env_vars) : null;

      try {
        const containerInfo = await dockerService.buildAndRun(app.id, contentDir, app.internal_port || 3000, {
          start: startCmd,
          build: buildCmd,
          env: envVars
        });
        appDb.updateApp(app.id, {
          status: 'running',
          status_message: null,
          container_id: containerInfo.containerId,
          internal_host: containerInfo.internalHost,
          internal_port: containerInfo.internalPort
        });
      } catch (err) {
        appDb.updateApp(app.id, { status: 'error', status_message: err.message });
        throw err;
      }
    } else {
      appDb.updateApp(app.id, { status: 'running', status_message: null });
    }

    return {
      success: true,
      message: `App '${app.subdomain}' erfolgreich neu gebaut.`,
      url: this.formatUrl(app.subdomain)
    };
  },

  /**
   * Rollback an application to its previous version
   */
  async rollback(identifier, targetVersion) {
    const app = appDb.getAppByIdOrSubdomain(identifier);
    if (!app) throw new Error(`App '${identifier}' nicht gefunden.`);

    const appDir = path.join(config.appsDir, app.id);
    const contentDir = path.join(appDir, 'content');
    const versionsDir = path.join(appDir, 'versions');

    if (!fs.existsSync(versionsDir)) {
      throw new Error('Keine vorherigen Versionen für diese App hinterlegt.');
    }

    let versionToRestore = targetVersion;
    if (!versionToRestore) {
      // Find highest available backup version
      const entries = fs.readdirSync(versionsDir)
        .filter(n => n.startsWith('v'))
        .map(n => parseInt(n.slice(1), 10))
        .filter(n => !isNaN(n) && n < (app.version || 1))
        .sort((a, b) => b - a);

      if (entries.length === 0) {
        throw new Error('Keine frühere Version für ein Rollback vorhanden.');
      }
      versionToRestore = entries[0];
    }

    const restorePath = path.join(versionsDir, `v${versionToRestore}`);
    if (!fs.existsSync(restorePath)) {
      throw new Error(`Version v${versionToRestore} existiert nicht.`);
    }

    // Replace current content with restored version
    fs.rmSync(contentDir, { recursive: true, force: true });
    fs.cpSync(restorePath, contentDir, { recursive: true });

    // Restart/Rebuild if Docker
    if (app.type === 'docker') {
      if (app.container_id) {
        await dockerService.stopAndRemove(app.container_id);
      }
      const startCmd = app.start_cmd;
      const buildCmd = app.build_cmd;
      const envVars = app.env_vars ? JSON.parse(app.env_vars) : null;

      try {
        const containerInfo = await dockerService.buildAndRun(app.id, contentDir, app.internal_port || 3000, {
          start: startCmd,
          build: buildCmd,
          env: envVars
        });
        appDb.updateApp(app.id, {
          version: versionToRestore,
          status: 'running',
          status_message: null,
          container_id: containerInfo.containerId,
          internal_host: containerInfo.internalHost,
          internal_port: containerInfo.internalPort
        });
      } catch (err) {
        appDb.updateApp(app.id, {
          version: versionToRestore,
          status: 'error',
          status_message: err.message
        });
        throw err;
      }
    } else {
      appDb.updateApp(app.id, {
        version: versionToRestore,
        status: 'running',
        status_message: null
      });
    }

    return {
      success: true,
      message: `Erfolgreich auf Version v${versionToRestore} zurückgesetzt.`,
      version: versionToRestore,
      restoredVersion: versionToRestore,
      url: this.formatUrl(app.subdomain)
    };
  },

  deployZip(opts) {
    return this.deploy({ filePath: opts.zipPath, ...opts });
  }
};
