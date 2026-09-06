import httpProxy from 'http-proxy';

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
  proxyHttp(req, res, app) {
    const targetHost = app.internal_host || '127.0.0.1';
    const targetPort = app.internal_port || 3000;
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
  proxyWs(req, socket, head, app) {
    const targetHost = app.internal_host || '127.0.0.1';
    const targetPort = app.internal_port || 3000;
    const target = `http://${targetHost}:${targetPort}`;

    proxy.ws(req, socket, head, {
      target,
      changeOrigin: false
    });
  }
};
