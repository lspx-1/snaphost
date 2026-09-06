import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { config } from '../config.js';

export const staticService = {
  /**
   * Determine the root content folder of the app
   * (Checks if files are nested in dist/, build/, public/ or at root)
   */
  getContentRoot(appId) {
    const baseDir = path.join(config.appsDir, appId, 'content');
    if (!fs.existsSync(baseDir)) return null;

    // Check if index.html is directly in root
    if (fs.existsSync(path.join(baseDir, 'index.html'))) {
      return baseDir;
    }

    // Check common build subdirectories
    for (const sub of ['dist', 'build', 'out', 'public']) {
      const candidate = path.join(baseDir, sub);
      if (fs.existsSync(path.join(candidate, 'index.html'))) {
        return candidate;
      }
    }

    // Check if there is only one single subfolder in content/ (e.g. zipped folder)
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    if (entries.length === 1 && entries[0].isDirectory()) {
      const singleSub = path.join(baseDir, entries[0].name);
      if (fs.existsSync(path.join(singleSub, 'index.html'))) {
        return singleSub;
      }
    }

    return baseDir;
  },

  /**
   * Serve a file for an HTTP request
   */
  serve(req, res, app) {
    const root = this.getContentRoot(app.id);
    if (!root || !fs.existsSync(root)) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="de">
        <head><meta charset="utf-8"><title>App-Inhalt nicht gefunden</title>
        <style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}</style>
        </head>
        <body>
          <div>
            <h1>📦 Keine Dateien gefunden</h1>
            <p>Für die App <strong>${app.subdomain}</strong> wurden keine Web-Dateien gefunden.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Parse requested path and sanitize
    let reqPath = decodeURIComponent(req.path);
    if (reqPath.endsWith('/')) {
      reqPath += 'index.html';
    }

    let filePath = path.normalize(path.join(root, reqPath));

    // Security check: Prevent directory traversal
    if (!filePath.startsWith(root)) {
      return res.status(403).send('Forbidden: Path Traversal');
    }

    // If file exists and is a file
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const contentType = mime.lookup(filePath) || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
      const stream = fs.createReadStream(filePath);
      return stream.pipe(res);
    }

    // If directory was requested, try index.html inside it
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      const indexFile = path.join(filePath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return fs.createReadStream(indexFile).pipe(res);
      }
    }

    // SPA Fallback: If not found, serve index.html from root if it exists
    const rootIndex = path.join(root, 'index.html');
    if (fs.existsSync(rootIndex)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return fs.createReadStream(rootIndex).pipe(res);
    }

    // 404
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="de">
      <head><meta charset="utf-8"><title>404 - Datei nicht gefunden</title>
      <style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}</style>
      </head>
      <body>
        <div>
          <h1>404 - Nicht gefunden</h1>
          <p>Die angeforderte Datei existiert auf <strong>${app.subdomain}</strong> nicht.</p>
        </div>
      </body>
      </html>
    `);
  }
};
