import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

// Ensure data directories exist
fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.appsDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    subdomain TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT,
    container_id TEXT,
    internal_port INTEGER DEFAULT 3000,
    internal_host TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    ttl TEXT,
    meta TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_apps_subdomain ON apps(subdomain);
  CREATE INDEX IF NOT EXISTS idx_apps_status ON apps(status);
  CREATE INDEX IF NOT EXISTS idx_apps_expires_at ON apps(expires_at);

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_deployments_app ON deployments(app_id);
`);

// Safe column migrations
const migrations = [
  `ALTER TABLE apps ADD COLUMN version INTEGER DEFAULT 1`,
  `ALTER TABLE apps ADD COLUMN password TEXT`,
  `ALTER TABLE apps ADD COLUMN status_message TEXT`,
  `ALTER TABLE apps ADD COLUMN spa INTEGER DEFAULT 0`,
  `ALTER TABLE apps ADD COLUMN start_cmd TEXT`,
  `ALTER TABLE apps ADD COLUMN build_cmd TEXT`,
  `ALTER TABLE apps ADD COLUMN env_vars TEXT`,
  `ALTER TABLE apps ADD COLUMN last_hit_at TEXT`,
  `ALTER TABLE api_keys ADD COLUMN key_hash TEXT`,
  `ALTER TABLE api_keys ADD COLUMN prefix TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`
];
for (const m of migrations) {
  try { db.exec(m); } catch (_) {}
}

export const hashToken = (token) => {
  if (!token) return '';
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
};

// Migrate any legacy plaintext keys to hash + prefix
try {
  const legacyKeys = db.prepare(`SELECT id, key FROM api_keys WHERE key_hash IS NULL AND key IS NOT NULL`).all();
  for (const k of legacyKeys) {
    if (k.key) {
      const h = hashToken(k.key);
      const pfx = k.key.slice(0, 12);
      db.prepare(`UPDATE api_keys SET key_hash = ?, prefix = ? WHERE id = ?`).run(h, pfx, k.id);
    }
  }
} catch (_) {}

// Prepared statements
const stmts = {
  getAppBySubdomain: db.prepare(`SELECT * FROM apps WHERE subdomain = ?`),
  getAppById: db.prepare(`SELECT * FROM apps WHERE id = ?`),
  listApps: db.prepare(`SELECT * FROM apps ORDER BY created_at DESC`),
  insertApp: db.prepare(`
    INSERT INTO apps (id, subdomain, type, status, title, container_id, internal_port, internal_host, created_at, expires_at, ttl, meta, version, password, status_message, spa, start_cmd, build_cmd, env_vars, last_hit_at)
    VALUES (@id, @subdomain, @type, @status, @title, @container_id, @internal_port, @internal_host, @created_at, @expires_at, @ttl, @meta, @version, @password, @status_message, @spa, @start_cmd, @build_cmd, @env_vars, @last_hit_at)
  `),
  deleteApp: db.prepare(`DELETE FROM apps WHERE id = ?`),
  getExpiredApps: db.prepare(`
    SELECT * FROM apps 
    WHERE expires_at IS NOT NULL 
      AND expires_at <= ? 
      AND status != 'expired'
  `),
  listApiKeys: db.prepare(`SELECT id, name, prefix, created_at, last_used_at FROM api_keys ORDER BY created_at DESC`),
  getApiKeyByHash: db.prepare(`SELECT * FROM api_keys WHERE key_hash = ? OR key = ?`),
  insertApiKey: db.prepare(`INSERT INTO api_keys (id, name, key, key_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)`),
  updateApiKeyUsageById: db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`),
  deleteApiKey: db.prepare(`DELETE FROM api_keys WHERE id = ?`),
  getSetting: db.prepare(`SELECT value FROM settings WHERE key = ?`),
  setSetting: db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`),
  insertDeployment: db.prepare(`INSERT INTO deployments (id, app_id, version, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)`),
  listDeployments: db.prepare(`SELECT * FROM deployments WHERE app_id = ? ORDER BY version DESC`),
  deleteDeployments: db.prepare(`DELETE FROM deployments WHERE app_id = ?`),
  touchApp: db.prepare(`UPDATE apps SET last_hit_at = ? WHERE id = ?`)
};

export const appDb = {
  getAppBySubdomain(subdomain) {
    if (!subdomain) return null;
    return stmts.getAppBySubdomain.get(subdomain.toLowerCase()) || null;
  },

  getAppById(id) {
    return stmts.getAppById.get(id) || null;
  },

  getAppByIdOrSubdomain(identifier) {
    if (!identifier) return null;
    const str = identifier.toString().trim();
    return stmts.getAppById.get(str) || stmts.getAppBySubdomain.get(str.toLowerCase()) || null;
  },

  listApps() {
    return stmts.listApps.all();
  },

  createApp(data) {
    stmts.insertApp.run({
      id: data.id,
      subdomain: data.subdomain.toLowerCase(),
      type: data.type,
      status: data.status || 'running',
      title: data.title || data.subdomain,
      container_id: data.container_id || null,
      internal_port: data.internal_port || 3000,
      internal_host: data.internal_host || '127.0.0.1',
      created_at: data.created_at || new Date().toISOString(),
      expires_at: data.expires_at || null,
      ttl: data.ttl || 'permanent',
      meta: typeof data.meta === 'object' ? JSON.stringify(data.meta) : (data.meta || '{}'),
      version: data.version || 1,
      password: data.password || null,
      status_message: data.status_message || null,
      spa: data.spa ? 1 : 0,
      start_cmd: data.start_cmd || null,
      build_cmd: data.build_cmd || null,
      env_vars: typeof data.env_vars === 'object' ? JSON.stringify(data.env_vars) : (data.env_vars || null),
      last_hit_at: data.last_hit_at || null
    });
    return this.getAppById(data.id);
  },

  updateApp(id, updates) {
    const app = this.getAppById(id);
    if (!app) return null;

    const allowed = [
      'subdomain', 'status', 'title', 'container_id', 'internal_port', 'internal_host',
      'expires_at', 'ttl', 'meta', 'version', 'password', 'status_message', 'spa',
      'start_cmd', 'build_cmd', 'env_vars', 'last_hit_at', 'type'
    ];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        let val = updates[key];
        if (key === 'subdomain') val = val.toLowerCase();
        if (key === 'meta' && typeof val === 'object') val = JSON.stringify(val);
        if (key === 'env_vars' && typeof val === 'object') val = JSON.stringify(val);
        if (key === 'spa') val = val ? 1 : 0;
        values.push(val);
      }
    }

    if (fields.length === 0) return app;

    values.push(id);
    const sql = `UPDATE apps SET ${fields.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...values);

    return this.getAppById(id);
  },

  recordDeployment(appId, version, sizeBytes = 0) {
    const id = 'dep_' + crypto.randomBytes(6).toString('hex');
    const createdAt = new Date().toISOString();
    stmts.insertDeployment.run(id, appId, version, sizeBytes, createdAt);
    return { id, appId, version, sizeBytes, createdAt };
  },

  listDeployments(appId) {
    return stmts.listDeployments.all(appId);
  },

  touchApp(id) {
    try {
      const now = new Date().toISOString();
      stmts.touchApp.run(now, id);
    } catch (_) {}
  },

  deleteApp(id) {
    stmts.deleteDeployments.run(id);
    return stmts.deleteApp.run(id);
  },

  getExpiredApps() {
    const nowIso = new Date().toISOString();
    return stmts.getExpiredApps.all(nowIso);
  },

  listApiKeys() {
    return stmts.listApiKeys.all();
  },

  createApiKey(name = 'Standard KI-Schlüssel') {
    const id = 'key_' + crypto.randomBytes(6).toString('hex');
    const rawToken = 'sh_live_' + crypto.randomBytes(24).toString('hex');
    const hash = hashToken(rawToken);
    const prefix = rawToken.slice(0, 12);
    const safeKeyPlaceholder = 'sh_hash_' + hash.slice(0, 24);
    const createdAt = new Date().toISOString();
    stmts.insertApiKey.run(id, name.trim() || 'Standard KI-Schlüssel', safeKeyPlaceholder, hash, prefix, createdAt);
    return { id, name: name.trim() || 'Standard KI-Schlüssel', rawToken, prefix, createdAt };
  },

  deleteApiKey(id) {
    return stmts.deleteApiKey.run(id);
  },

  validateApiKey(token) {
    if (!token) return null;
    const clean = token.trim();
    const hash = hashToken(clean);
    const found = stmts.getApiKeyByHash.get(hash, clean);
    if (found) {
      const now = new Date().toISOString();
      stmts.updateApiKeyUsageById.run(now, found.id);
      return found;
    }
    return null;
  },

  getSetting(key) {
    if (!key) return null;
    const res = stmts.getSetting.get(key);
    return res ? res.value : null;
  },

  setSetting(key, value) {
    if (!key) return;
    stmts.setSetting.run(key, value.toString());
  },

  verifyAdminPassword(password) {
    if (!password || typeof password !== 'string') return false;
    const inputClean = password.trim();
    const customHash = this.getSetting('admin_password_hash');
    const inputHash = crypto.createHash('sha256').update(inputClean).digest('hex');
    if (customHash) {
      return customHash === inputHash;
    }
    // Default fallback to config.adminPassword
    return inputClean === config.adminPassword;
  },

  setAdminPassword(newPassword) {
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
      throw new Error('Das neue Passwort muss mindestens 4 Zeichen lang sein.');
    }
    const hash = crypto.createHash('sha256').update(newPassword.trim()).digest('hex');
    this.setSetting('admin_password_hash', hash);
    return true;
  }
};

// Ensure there is at least one default API key created on first start
const existingKeys = appDb.listApiKeys();
if (existingKeys.length === 0) {
  const defaultKey = appDb.createApiKey('Standard KI-Schlüssel (Default)');
  console.log(`[SnapHost] Initial API Key created: ${defaultKey.rawToken}`);
}
