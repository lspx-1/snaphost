import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { appDb } from './db.js';
import { staticService } from './services/static.js';
import { proxyService } from './services/proxy.js';
import { janitor } from './services/janitor.js';
import { dockerService } from './services/docker.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const app = express();

// Standard middlewares (headers only, do not consume body stream before proxying)
app.use(cookieParser());

// Subdomain resolver helper
function resolveSubdomain(hostHeader) {
  if (!hostHeader) return null;
  const host = hostHeader.split(':')[0].toLowerCase().trim();

  // If local testing with .localhost (e.g. app.localhost)
  if (host.endsWith('.localhost')) {
    const sub = host.slice(0, -10);
    return sub || null;
  }

  // If root domain configured
  if (config.rootDomain && config.rootDomain !== 'localhost') {
    const root = config.rootDomain;
    // Check if exactly root domain or admin subdomain
    if (host === root) return null;
    if (config.adminSubdomain && host === `${config.adminSubdomain}.${root}`) return null;

    if (host.endsWith(`.${root}`)) {
      const sub = host.slice(0, -(root.length + 1));
      return sub || null;
    }
  }

  return null;
}

// -------------------------------------------------------------
// Core Request Handler (Routing between Apps and Dashboard)
// -------------------------------------------------------------
app.use(async (req, res, next) => {
  const subdomain = resolveSubdomain(req.headers.host);

  // If request is targeted at a specific App subdomain
  if (subdomain) {
    const appRecord = appDb.getAppBySubdomain(subdomain);

    if (!appRecord) {
      return res.status(404).send(renderNotFoundPage(subdomain, 'App wurde nicht gefunden oder existiert nicht.'));
    }

    if (appRecord.status === 'expired') {
      return res.status(410).send(renderNotFoundPage(subdomain, 'Diese temporäre Vorschau ist abgelaufen.'));
    }

    if (appRecord.status === 'stopped') {
      return res.status(503).send(renderNotFoundPage(subdomain, 'Diese Anwendung ist derzeit offline / angehalten.'));
    }

    if (appRecord.status === 'error') {
      return res.status(500).send(renderNotFoundPage(subdomain, `App konnte nicht gestartet werden (Build-Fehler). ${appRecord.status_message ? '<br><small>' + appRecord.status_message + '</small>' : ''}`));
    }

    // Password Protection / Basic Auth
    if (appRecord.password) {
      const authHeader = req.headers.authorization || '';
      let isAuthed = false;
      if (authHeader.startsWith('Basic ')) {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
        const idx = decoded.indexOf(':');
        const pw = idx >= 0 ? decoded.slice(idx + 1) : decoded;
        if (pw === appRecord.password) isAuthed = true;
      }
      if (!isAuthed) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Geschützte Seite", charset="UTF-8"');
        return res.status(401).send('Passwort erforderlich');
      }
    }

    appDb.touchApp(appRecord.id);

    if (appRecord.type === 'static') {
      return staticService.serve(req, res, appRecord);
    } else if (appRecord.type === 'docker') {
      return proxyService.proxyHttp(req, res, appRecord);
    }
  }

  // Otherwise, handle as SnapHost Admin / API / Dashboard
  next();
});

// Serve Admin UI static files (with revalidation headers to prevent stale Cloudflare/browser caching)
app.use(express.static(publicDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Body parsers for SnapHost Dashboard & Management API (placed AFTER subdomain proxy)
app.use(express.json({ limit: `${config.maxUploadSizeBytes || 250 * 1024 * 1024}b` }));
app.use(express.urlencoded({ extended: true, limit: `${config.maxUploadSizeBytes || 250 * 1024 * 1024}b` }));

// Routes for Dashboard and API
app.use('/auth', authRouter);
app.use('/api', apiRouter);

// Helper to resolve admin/server URL vs apps root domain
function getServerUrls() {
  const isLocal = config.rootDomain === 'localhost';
  const adminHost = isLocal
    ? `localhost:${config.port}`
    : (config.adminSubdomain ? `${config.adminSubdomain}.${config.rootDomain}` : config.rootDomain);
  const serverUrl = isLocal ? `http://${adminHost}` : `https://${adminHost}`;
  const appsRoot = isLocal ? `localhost:${config.port}` : config.rootDomain;
  return { adminHost, serverUrl, appsRoot };
}

// Dynamic CLI Script & Prompt Download Endpoints
app.get(['/DEPLOY.md', '/deploy.md', '/AI-DEPLOY.md', '/ai-deploy.md'], (req, res) => {
  const { adminHost, serverUrl, appsRoot } = getServerUrls();
  let content = fs.readFileSync(path.join(rootDir, 'DEPLOY.md'), 'utf-8');

  // Replace apps root domain for sites, server URL for API/dashboard endpoints
  content = content.replace(/<slug>\.DEINE_SNAPHOST_DOMAIN/g, `<slug>.${appsRoot}`);
  content = content.replace(/https:\/\/DEINE_SNAPHOST_DOMAIN/g, serverUrl);
  content = content.replace(/DEINE_SNAPHOST_DOMAIN/g, adminHost);

  try {
    const keys = appDb.listApiKeys();
    const sampleKey = keys.length > 0 ? keys[0].key : '$DEPLOY_TOKEN';
    content = content.replace(/DEIN_API_KEY/g, sampleKey);
  } catch (_) {
    content = content.replace(/DEIN_API_KEY/g, '$DEPLOY_TOKEN');
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="DEPLOY.md"');
  res.send(content);
});

app.get(['/DEPLOY-CLI.md', '/deploy-cli.md', '/CLI.md'], (req, res) => {
  const { adminHost, serverUrl, appsRoot } = getServerUrls();
  const filePath = path.join(rootDir, 'DEPLOY-CLI.md');
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';

  content = content.replace(/<slug>\.DEINE_SNAPHOST_DOMAIN/g, `<slug>.${appsRoot}`);
  content = content.replace(/https:\/\/DEINE_SNAPHOST_DOMAIN/g, serverUrl);
  content = content.replace(/DEINE_SNAPHOST_DOMAIN/g, adminHost);

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="DEPLOY-CLI.md"');
  res.send(content);
});

app.get('/deploy.ps1', (req, res) => {
  const { serverUrl } = getServerUrls();
  const scriptPath = path.join(rootDir, 'src', 'scripts', 'deploy.ps1');
  const script = fs.readFileSync(scriptPath, 'utf-8').replace(/\{\{SERVER_URL\}\}/g, serverUrl);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="deploy.ps1"');
  res.send(script);
});

app.get('/deploy.sh', (req, res) => {
  const { serverUrl } = getServerUrls();
  const scriptPath = path.join(rootDir, 'src', 'scripts', 'deploy.sh');
  const script = fs.readFileSync(scriptPath, 'utf-8').replace(/\{\{SERVER_URL\}\}/g, serverUrl);
  res.setHeader('Content-Type', 'text/x-sh; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="deploy.sh"');
  res.send(script);
});

// Serve dashboard on root
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// 404 fallback for admin
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint nicht gefunden' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// -------------------------------------------------------------
// HTTP Server & WebSocket Upgrade Handler
// -------------------------------------------------------------
const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  const subdomain = resolveSubdomain(req.headers.host);
  if (!subdomain) {
    socket.destroy();
    return;
  }

  const appRecord = appDb.getAppBySubdomain(subdomain);
  if (appRecord && appRecord.type === 'docker' && appRecord.status === 'running') {
    proxyService.proxyWs(req, socket, head, appRecord);
  } else {
    socket.destroy();
  }
});

// Friendly 404 / Expired HTML template
function renderNotFoundPage(subdomain, message) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SnapHost - ${subdomain}</title>
  <style>
    body {
      margin: 0;
      background: radial-gradient(circle at top, #1e293b, #0f172a);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      text-align: center;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 2.5rem;
      border-radius: 1.5rem;
      max-width: 480px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .icon { font-size: 3.5rem; margin-bottom: 1rem; }
    h1 { margin: 0 0 0.5rem; font-size: 1.6rem; font-weight: 700; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      background: #334155;
      font-size: 0.85rem;
      color: #38bdf8;
      margin-bottom: 1rem;
      font-family: monospace;
    }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin: 0.5rem 0 1.5rem; }
    a {
      color: #38bdf8;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.9rem;
    }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🚀</div>
    <div class="badge">${subdomain}</div>
    <h1>App nicht erreichbar</h1>
    <p>${message}</p>
    <a href="/">Zum SnapHost Dashboard &rarr;</a>
  </div>
</body>
</html>`;
}

// -------------------------------------------------------------
// Start Server & Background Services
// -------------------------------------------------------------
server.listen(config.port, config.host, () => {
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│  ⚡ SnapHost Server läuft auf Port ${config.port}                     │
├─────────────────────────────────────────────────────────────┤
│  • Root Domain:       ${config.rootDomain.padEnd(36)} │
│  • Admin Subdomain:   ${config.adminSubdomain.padEnd(36)} │
│  • Lokale URL:        http://localhost:${config.port.toString().padEnd(27)} │
│  • Docker Status:     ${(dockerService.isAvailable ? 'Aktiv (Verbunden)' : 'Inaktiv (Nur Statisch)').padEnd(36)} │
└─────────────────────────────────────────────────────────────┘
  `);

  // Start TTL janitor
  janitor.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SnapHost] Fahre Server herunter...');
  janitor.stop();
  server.close(() => {
    process.exit(0);
  });
});

export { app, server };
export default app;
