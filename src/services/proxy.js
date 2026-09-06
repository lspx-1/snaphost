import httpProxy from 'http-proxy';
import { dockerService } from './docker.js';
import { appDb } from '../db.js';

const proxy = httpProxy.createProxyServer({
  ws: true,
  xfwd: true,
  timeout: 60000,
  proxyTimeout: 60000
});

// Handle proxy errors gracefully
proxy.on('error', (err, req, res) => {
  console.error('[Proxy Error]', err.message);
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html lang="de">
      <head><meta charset="utf-8"><title>502 Bad Gateway - SnapHost</title>
      <style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}</style>
      </head>
      <body>
        <div>
          <h1>⏳ App startet oder antwortet nicht</h1>
          <p>Der Container fährt möglicherweise gerade hoch oder ist auf einen Fehler gestoßen.</p>
          <p><small>${err.code || err.message}</small></p>
          <p><a href="javascript:location.reload()" style="color:#38bdf8;">Neu laden ↻</a></p>
        </div>
      </body>
      </html>
    `);
  }
});

export const proxyService = {
  /**
   * Forward HTTP request to container
   */
  async proxyHttp(req, res, app) {
    let targetHost = app.internal_host || '127.0.0.1';
    let targetPort = app.internal_port || 3000;

    // Dynamically resolve container host/port if unrouted container name or placeholder
    if ((targetHost.startsWith('snaphost-') || (targetHost === '127.0.0.1' && targetPort === 3000)) && app.container_id) {
      try {
        const resolved = await dockerService.getContainerEndpoint(app.container_id, targetPort);
        if (resolved) {
          targetHost = resolved.host;
          targetPort = resolved.port;
          appDb.updateApp(app.id, { internal_host: targetHost, internal_port: targetPort });
        }
      } catch (err) {
        console.warn(`[Proxy] Konnte Container-Endpoint für ${app.subdomain} nicht dynamisch auflösen:`, err.message);
      }
    }

    const target = `http://${targetHost}:${targetPort}`;

    proxy.web(req, res, {
      target,
      changeOrigin: false,
      headers: {
        'x-forwarded-host': req.headers.host || '',
        'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'http'
      }
    });
  },

  /**
   * Forward WebSocket upgrade connection to container
   */
  async proxyWs(req, socket, head, app) {
    let targetHost = app.internal_host || '127.0.0.1';
    let targetPort = app.internal_port || 3000;

    if ((targetHost.startsWith('snaphost-') || (targetHost === '127.0.0.1' && targetPort === 3000)) && app.container_id) {
      try {
        const resolved = await dockerService.getContainerEndpoint(app.container_id, targetPort);
        if (resolved) {
          targetHost = resolved.host;
          targetPort = resolved.port;
          appDb.updateApp(app.id, { internal_host: targetHost, internal_port: targetPort });
        }
      } catch (_) {}
    }

    const target = `http://${targetHost}:${targetPort}`;

    proxy.ws(req, socket, head, {
      target,
      changeOrigin: false
    });
  }
};
