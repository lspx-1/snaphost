/**
 * SnapHost MCP-Server (Model Context Protocol)
 *
 * Ein Tool-Satz, zwei Transporte:
 *  - stdio: `snaphost mcp` (lokal; kann Ordner direkt vom Rechner deployen)
 *  - HTTP:  POST /mcp auf dem SnapHost-Server (Streamable HTTP, zustandslos)
 *
 * Alle Tools sind dünne Wrapper um die bestehende REST-API (/api/...),
 * damit es keine zweite Implementierung der Deploy-Logik gibt.
 * Diese Datei darf nur Node-Builtins importieren (wird auch von der CLI genutzt).
 */

import path from 'path';
import readline from 'readline';

const SERVER_INFO = { name: 'snaphost', title: 'SnapHost', version: '1.0.0' };
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `SnapHost stellt Webseiten und Node.js-Apps unter https://<slug>.<domain> bereit.
- deploy gibt die Live-URL zurück. Mit dem slug einer bestehenden App wird diese aktualisiert (alte Version bleibt für rollback_app erhalten).
- Node.js-Apps (Typ docker): package.json mit "start"-Script; Server lauscht auf process.env.PORT an 0.0.0.0. Persistente Daten nach process.env.DATA_DIR.
- Statische Seiten: relative Pfade verwenden (./app.js statt /app.js).
- Nach einem Deploy einer Docker-App bei Problemen get_logs prüfen.
- Apps werden per Subdomain/Slug (z. B. "mein-spiel") oder App-ID angesprochen.`;

// -------------------------------------------------------------
// REST-Client für die SnapHost-API
// -------------------------------------------------------------
export function createApiClient(baseUrl, headers = {}) {
  const base = baseUrl.replace(/\/+$/, '');

  return async function api(method, apiPath, { json, form, query, raw } = {}) {
    const url = new URL(`${base}/api${apiPath}`);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const init = { method, headers: { Accept: 'application/json', ...headers } };
    if (json !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(json);
    } else if (form) {
      init.body = form;
    }

    const res = await fetch(url, init);
    if (raw && res.ok) return Buffer.from(await res.arrayBuffer());

    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error('Nicht autorisiert: API-Key fehlt oder ist ungültig (snaphost login ausführen oder SNAPHOST_TOKEN setzen).');
    }
    if (!res.ok || data.ok === false || data.success === false) {
      throw new Error(data.error || data.message || `HTTP ${res.status}`);
    }
    return data;
  };
}

// -------------------------------------------------------------
// Hilfsfunktionen
// -------------------------------------------------------------
const id = (app) => `/apps/${encodeURIComponent(app)}`;

// Nur die Felder, die ein Agent braucht – und niemals das Klartext-Passwort.
function summarizeApp(a) {
  if (!a) return a;
  return {
    id: a.id,
    subdomain: a.subdomain,
    title: a.title,
    type: a.type,
    status: a.status,
    liveStatus: a.liveStatus,
    statusMessage: a.status_message || undefined,
    version: a.version,
    url: a.url,
    ttl: a.ttl,
    expiresAt: a.expires_at || null,
    passwordProtected: !!a.password,
    spa: !!a.spa,
    createdAt: a.created_at,
    lastHitAt: a.last_hit_at || undefined
  };
}

async function zipFiles(files) {
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip();
  for (const f of files) {
    const rel = path.posix.normalize(String(f.path || '').replace(/\\/g, '/')).replace(/^\/+/, '');
    if (!rel || rel === '.' || rel.startsWith('..')) {
      throw new Error(`Ungültiger Dateipfad: "${f.path}"`);
    }
    zip.addFile(rel, Buffer.from(String(f.content ?? ''), f.encoding === 'base64' ? 'base64' : 'utf8'));
  }
  return zip.toBuffer();
}

const appParam = {
  type: 'string',
  description: 'Subdomain/Slug (z. B. "mein-spiel") oder App-ID (app_...)'
};

// -------------------------------------------------------------
// Tool-Definitionen
// -------------------------------------------------------------
function buildTools(local) {
  const deployProps = {
    files: {
      type: 'array',
      description: 'Projektdateien direkt übergeben. Pfade relativ zum Projekt-Root (z. B. "index.html", "src/app.js"). Binärdateien mit encoding "base64".',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          encoding: { type: 'string', enum: ['utf8', 'base64'], default: 'utf8' }
        },
        required: ['path', 'content']
      }
    },
    html: { type: 'string', description: 'Eine einzelne komplette HTML-Seite als Text (Sofort-Vorschau).' },
    slug: { type: 'string', description: 'Wunsch-Subdomain. Existiert sie bereits, wird diese App aktualisiert.' },
    ttl: { type: 'string', description: 'Laufzeit: 1h, 6h, 24h, 7d, 30d oder permanent (Standard: Server-Einstellung, meist 24h).' },
    type: { type: 'string', enum: ['auto', 'static', 'docker', 'node'], description: 'App-Typ (Standard: auto).' },
    spa: { type: 'boolean', description: 'Single-Page-App: unbekannte Pfade liefern index.html.' },
    password: { type: 'string', description: 'HTTP-Basic-Auth-Passwortschutz aktivieren.' },
    port: { type: 'integer', description: 'Interner Port der App (Docker), falls nicht 3000.' },
    title: { type: 'string', description: 'Anzeigename im Dashboard.' }
  };
  if (local) {
    deployProps.path = {
      type: 'string',
      description: 'Lokaler Pfad (am besten absolut) zu Projektordner, ZIP oder .html-Datei. Enthält der Ordner dist/, build/ oder out/ mit index.html, wird dieser automatisch genommen. node_modules, .git und .env werden nie hochgeladen.'
    };
  }

  const sources = local ? '`path`, `files` oder `html`' : '`files` oder `html`';

  const tools = [
    {
      name: 'deploy',
      title: 'Projekt bereitstellen',
      description: `Stellt ein Projekt auf SnapHost bereit und gibt die Live-URL zurück. Quelle: genau eines von ${sources}. Mit dem slug einer bestehenden App wird diese aktualisiert (In-Place-Update mit Rollback-Möglichkeit).`,
      inputSchema: { type: 'object', properties: deployProps },
      annotations: { destructiveHint: false, openWorldHint: true },
      async handler(args, { api }) {
        const given = ['path', 'files', 'html'].filter((k) => args[k] !== undefined && args[k] !== null && args[k] !== '');
        if (given.length !== 1) throw new Error(`Genau eine Quelle angeben: ${sources}.`);

        const form = new FormData();
        if (args.html) {
          form.append('html', args.html);
        } else if (args.files) {
          if (!Array.isArray(args.files) || args.files.length === 0) throw new Error('"files" ist leer.');
          // "_" ergibt keinen gültigen Slug -> Server vergibt einen Zufalls-Slug, falls kein Titel da ist
          form.append('file', new Blob([await zipFiles(args.files)]), `${args.title || '_'}.zip`);
        } else {
          if (!local) throw new Error('"path" geht nur mit dem lokalen MCP-Server (snaphost mcp). Hier bitte "files" oder "html" nutzen.');
          const { buffer, filename } = await local.pack(args.path);
          form.append('file', new Blob([buffer]), filename);
        }
        for (const k of ['slug', 'ttl', 'type', 'password', 'title']) {
          if (args[k]) form.append(k, String(args[k]));
        }
        if (args.port) form.append('port', String(args.port));
        if (args.spa) form.append('spa', 'true');

        const data = await api('POST', '/deploy', { form });
        return {
          url: data.url,
          subdomain: data.subdomain,
          type: data.type,
          version: data.version,
          expiresAt: data.expiresAt || null,
          message: data.message
        };
      }
    },
    {
      name: 'list_apps',
      title: 'Apps auflisten',
      description: 'Listet alle Bereitstellungen mit Status, Typ, Version und URL.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      async handler(_args, { api }) {
        const data = await api('GET', '/apps');
        return (data.apps || []).map(summarizeApp);
      }
    },
    {
      name: 'get_app',
      title: 'App-Details',
      description: 'Status, URL, Ablaufdatum und Versionsverlauf einer App.',
      inputSchema: { type: 'object', properties: { app: appParam }, required: ['app'] },
      annotations: { readOnlyHint: true },
      async handler({ app }, { api }) {
        const [info, hist] = await Promise.all([
          api('GET', id(app)),
          api('GET', `${id(app)}/deployments`).catch(() => ({ deployments: [] }))
        ]);
        return { ...summarizeApp(info.app), deployments: hist.deployments };
      }
    },
    {
      name: 'get_logs',
      title: 'Logs lesen',
      description: 'Build-Log, Fehlermeldung und Container-Logs einer App. Erste Anlaufstelle, wenn eine App nicht startet.',
      inputSchema: {
        type: 'object',
        properties: { app: appParam, tail: { type: 'integer', description: 'Anzahl Container-Logzeilen (Standard 200).' } },
        required: ['app']
      },
      annotations: { readOnlyHint: true },
      async handler({ app, tail }, { api }) {
        const data = await api('GET', `${id(app)}/logs`, { query: { tail } });
        return data.logs || '(Keine Logs vorhanden)';
      }
    },
    {
      name: 'update_app',
      title: 'App-Einstellungen ändern',
      description: 'Ändert Einstellungen ohne neuen Upload: Subdomain umbenennen, Laufzeit (ttl), Titel, Passwort ("" entfernt den Schutz), SPA-Modus.',
      inputSchema: {
        type: 'object',
        properties: {
          app: appParam,
          slug: { type: 'string', description: 'Neue Subdomain.' },
          ttl: { type: 'string', description: '1h, 6h, 24h, 7d, 30d oder permanent (ab jetzt gerechnet).' },
          title: { type: 'string' },
          password: { type: 'string' },
          spa: { type: 'boolean' }
        },
        required: ['app']
      },
      async handler({ app, ...changes }, { api }) {
        const data = await api('PATCH', id(app), { json: changes });
        return summarizeApp(data.app);
      }
    },
    {
      name: 'restart_app',
      title: 'App (neu) starten',
      description: 'Startet einen Container neu bzw. schaltet eine angehaltene App wieder online.',
      inputSchema: { type: 'object', properties: { app: appParam }, required: ['app'] },
      async handler({ app }, { api }) {
        return (await api('POST', `${id(app)}/restart`)).message;
      }
    },
    {
      name: 'stop_app',
      title: 'App anhalten',
      description: 'Nimmt eine App offline (Container wird gestoppt, Daten bleiben erhalten).',
      inputSchema: { type: 'object', properties: { app: appParam }, required: ['app'] },
      async handler({ app }, { api }) {
        return (await api('POST', `${id(app)}/stop`)).message;
      }
    },
    {
      name: 'rebuild_app',
      title: 'Container neu bauen',
      description: 'Baut den Docker-Container aus dem zuletzt hochgeladenen Code neu.',
      inputSchema: { type: 'object', properties: { app: appParam }, required: ['app'] },
      async handler({ app }, { api }) {
        const { ok, success, ...rest } = await api('POST', `${id(app)}/rebuild`);
        return rest;
      }
    },
    {
      name: 'rollback_app',
      title: 'Rollback',
      description: 'Setzt eine App auf die vorherige (oder eine bestimmte) Version zurück.',
      inputSchema: {
        type: 'object',
        properties: { app: appParam, version: { type: 'integer', description: 'Zielversion (Standard: vorherige).' } },
        required: ['app']
      },
      async handler({ app, version }, { api }) {
        const { ok, success, ...rest } = await api('POST', `${id(app)}/rollback`, { json: { version } });
        return rest;
      }
    },
    {
      name: 'delete_app',
      title: 'App löschen',
      description: 'Löscht eine App endgültig inklusive Dateien, Versionen und persistenter Daten. Nicht umkehrbar.',
      inputSchema: { type: 'object', properties: { app: appParam }, required: ['app'] },
      annotations: { destructiveHint: true },
      async handler({ app }, { api }) {
        return (await api('DELETE', id(app))).message;
      }
    },
    {
      name: 'get_data',
      title: 'Persistenten Speicher ansehen',
      description: 'Zeigt Dateien im persistenten /data-Volume einer App und, falls vorhanden, SQLite-Tabellen mit Spalten und Zeilenanzahl.',
      inputSchema: { type: 'object', properties: { app: appParam }, required: ['app'] },
      annotations: { readOnlyHint: true },
      async handler({ app }, { api }) {
        return (await api('GET', `${id(app)}/data`)).storage;
      }
    },
    {
      name: 'query_table',
      title: 'SQLite-Tabelle lesen',
      description: 'Liest Zeilen einer SQLite-Tabelle aus dem /data-Volume einer App (nur lesend).',
      inputSchema: {
        type: 'object',
        properties: {
          app: appParam,
          table: { type: 'string' },
          file: { type: 'string', description: 'Datenbankdatei im /data-Ordner (Standard: app.db).' },
          limit: { type: 'integer', description: '1–200, Standard 50.' },
          offset: { type: 'integer' }
        },
        required: ['app', 'table']
      },
      annotations: { readOnlyHint: true },
      async handler({ app, table, file, limit, offset }, { api }) {
        const { ok, success, ...rest } = await api('GET', `${id(app)}/data/table`, { query: { table, file, limit, offset } });
        return rest;
      }
    },
    {
      name: 'reset_data',
      title: 'Persistenten Speicher leeren',
      description: 'Löscht alle Dateien im /data-Volume einer App (Datenbank, Uploads) und startet den Container neu. Nicht umkehrbar.',
      inputSchema: { type: 'object', properties: { app: appParam }, required: ['app'] },
      annotations: { destructiveHint: true },
      async handler({ app }, { api }) {
        return (await api('DELETE', `${id(app)}/data`)).message;
      }
    }
  ];

  if (local) {
    tools.push({
      name: 'pull_source',
      title: 'Quellcode herunterladen',
      description: 'Lädt den aktuell bereitgestellten Code einer App herunter und entpackt ihn in einen lokalen Ordner.',
      inputSchema: {
        type: 'object',
        properties: {
          app: appParam,
          directory: { type: 'string', description: 'Zielordner (Standard: ./<app> im Arbeitsverzeichnis).' }
        },
        required: ['app']
      },
      async handler({ app, directory }, { api }) {
        const buffer = await api('GET', `${id(app)}/download`, { raw: true });
        const dest = path.resolve(directory || app);
        await local.extract(buffer, dest);
        return { directory: dest, bytes: buffer.length };
      }
    });
  }

  return tools;
}

// -------------------------------------------------------------
// JSON-RPC / MCP-Dispatcher
// -------------------------------------------------------------
function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/**
 * @param {object} ctx
 * @param {Function} ctx.api    REST-Client aus createApiClient()
 * @param {object}  [ctx.local] nur stdio: { pack(path) -> {buffer, filename}, extract(buffer, dir) }
 */
export function createMcpServer({ api, local = null }) {
  const tools = buildTools(local);
  const byName = new Map(tools.map((t) => [t.name, t]));

  async function callTool(name, args) {
    const tool = byName.get(name);
    if (!tool) throw Object.assign(new Error(`Unbekanntes Tool: ${name}`), { code: -32602 });
    const missing = (tool.inputSchema.required || []).filter((k) => args?.[k] === undefined || args?.[k] === null || args?.[k] === '');
    if (missing.length) {
      const hint = missing.map((k) => `"${k}"${tool.inputSchema.properties[k]?.description ? ` (${tool.inputSchema.properties[k].description})` : ''}`);
      return { content: [{ type: 'text', text: `Fehler: Pflichtfeld fehlt: ${hint.join(', ')}` }], isError: true };
    }
    try {
      const result = await tool.handler(args || {}, { api });
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
    }
  }

  async function dispatch(method, params) {
    switch (method) {
      case 'initialize': {
        const requested = params.protocolVersion;
        return {
          protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS
        };
      }
      case 'ping':
        return {};
      case 'tools/list':
        return {
          tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({
            name, title, description, inputSchema, annotations: { title, ...annotations }
          }))
        };
      case 'tools/call':
        return callTool(params.name, params.arguments);
      default:
        throw Object.assign(new Error(`Methode nicht unterstützt: ${method}`), { code: -32601 });
    }
  }

  // Liefert die JSON-RPC-Antwort oder null (Notifications / Client-Antworten).
  async function handle(msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
      return rpcError(msg?.id, -32600, 'Invalid Request');
    }
    if (typeof msg.method !== 'string') return null; // Antwort des Clients – ignorieren
    const isNotification = msg.id === undefined;
    try {
      const result = await dispatch(msg.method, msg.params || {});
      return isNotification ? null : { jsonrpc: '2.0', id: msg.id, result };
    } catch (err) {
      return isNotification ? null : rpcError(msg.id, err.code || -32603, err.message);
    }
  }

  return { handle };
}

async function handleBody(server, body) {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => server.handle(m)))).filter(Boolean);
    return out.length ? out : null;
  }
  return server.handle(body);
}

// -------------------------------------------------------------
// Transport 1: stdio (newline-delimited JSON-RPC)
// -------------------------------------------------------------
export function runStdio(server) {
  const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return write(rpcError(null, -32700, 'Parse error'));
    }
    const out = await handleBody(server, msg);
    if (out) write(out);
  });
}

// -------------------------------------------------------------
// Transport 2: Streamable HTTP (zustandslos, nur JSON-Antworten)
// Erwartet, dass requireAuth schon gelaufen ist. Die Tools rufen die
// eigene REST-API über Loopback mit denselben Zugangsdaten auf.
// -------------------------------------------------------------
export function createHttpHandler({ apiBaseUrl }) {
  return async (req, res) => {
    // Schutz gegen DNS-Rebinding / Cross-Site-Aufrufe aus dem Browser
    const origin = req.headers.origin;
    if (origin) {
      let originHost = null;
      try { originHost = new URL(origin).host; } catch {}
      if (originHost !== req.headers.host) {
        return res.status(403).json(rpcError(null, -32600, 'Origin nicht erlaubt'));
      }
    }

    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json(rpcError(null, -32700, 'Parse error: JSON-Body erwartet'));
    }

    const auth = {};
    for (const h of ['authorization', 'x-api-key', 'cookie']) {
      if (req.headers[h]) auth[h] = req.headers[h];
    }
    const server = createMcpServer({ api: createApiClient(apiBaseUrl, auth) });

    const out = await handleBody(server, req.body);
    if (!out) return res.status(202).end();
    res.json(out);
  };
}
