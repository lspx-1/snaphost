#!/usr/bin/env node

/**
 * SnapHost CLI
 * Official command-line interface for deploying, managing, and debugging
 * applications on your private SnapHost cloud.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import readline from 'readline';

const CONFIG_DIR = path.join(os.homedir(), '.snaphost');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_SERVER = 'https://run.lspx.org';

// -------------------------------------------------------------
// Config Store (Persists token securely on developer's machine)
// -------------------------------------------------------------
function getSavedConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (_) {}
  return {};
}

function saveConfig(cfg) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Fehler beim Speichern der Konfiguration: ${err.message}`);
  }
}

function resolveCredentials(flags = {}) {
  const saved = getSavedConfig();
  const server = flags.server || process.env.SNAPHOST_SERVER || process.env.DEPLOY_SERVER || saved.server || DEFAULT_SERVER;
  const token = flags.token || process.env.SNAPHOST_TOKEN || process.env.DEPLOY_TOKEN || saved.token || '';
  return {
    server: server.replace(/\/+$/, ''),
    token: token.trim()
  };
}

// Mask token for secure display
function maskToken(tok) {
  if (!tok) return '(nicht konfiguriert)';
  if (tok.length <= 16) return '****';
  return `${tok.slice(0, 10)}...${tok.slice(-6)}`;
}

// -------------------------------------------------------------
// Helper: Pack files into ZIP buffer (excludes node_modules etc.)
// -------------------------------------------------------------
async function createZipBuffer(targetPath) {
  // If already a zip file, return as buffer directly
  if (fs.statSync(targetPath).isFile()) {
    return fs.readFileSync(targetPath);
  }

  const ignoreList = new Set([
    'node_modules', '.git', '.env', '.DS_Store', 'Thumbs.db',
    '.next', '.nuxt', '.cache', 'dist.zip', 'bundle.zip', 'deploy.zip'
  ]);

  try {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip();

    function addDirRecursive(currentDir, zipPrefix = '') {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (ignoreList.has(entry.name)) continue;
        const fullPath = path.join(currentDir, entry.name);
        const entryZipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          addDirRecursive(fullPath, entryZipPath);
        } else if (entry.isFile()) {
          zip.addLocalFile(fullPath, zipPrefix);
        }
      }
    }

    addDirRecursive(targetPath);
    return zip.toBuffer();
  } catch (_) {
    // OS-level fallback
    const tempZip = path.join(os.tmpdir(), `snaphost-${Date.now()}.zip`);
    if (process.platform === 'win32') {
      execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${targetPath}\\*' -DestinationPath '${tempZip}' -Force"`);
    } else {
      execSync(`cd "${targetPath}" && zip -r "${tempZip}" . -x "node_modules/*" ".git/*" ".env"`);
    }
    const buf = fs.readFileSync(tempZip);
    try { fs.unlinkSync(tempZip); } catch (_) {}
    return buf;
  }
}

// -------------------------------------------------------------
// CLI Commands
// -------------------------------------------------------------
async function cmdLogin(args, flags) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (query) => new Promise(res => rl.question(query, res));

  const saved = getSavedConfig();
  const server = flags.server || (await question(`SnapHost Server [${saved.server || DEFAULT_SERVER}]: `)) || saved.server || DEFAULT_SERVER;
  const token = flags.token || (await question('API-Token (z. B. sh_live_...): '));
  rl.close();

  if (!token.trim()) {
    console.error('❌ Fehler: Kein API-Token angegeben.');
    process.exit(1);
  }

  saveConfig({
    server: server.trim().replace(/\/+$/, ''),
    token: token.trim(),
    savedAt: new Date().toISOString()
  });

  console.log('\n✓ Zugangsdaten erfolgreich in ~/.snaphost/config.json gespeichert!');
  console.log(`• Server: ${server}`);
  console.log(`• Token:  ${maskToken(token)}`);
  console.log('\nDu (und deine KI-Assistenten) können SnapHost jetzt ohne Eingabe des Tokens nutzen.');
}

async function cmdLogout() {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
  console.log('✓ Lokale SnapHost Zugangsdaten erfolgreich gelöscht.');
}

async function cmdWhoami(args, flags) {
  const { server, token } = resolveCredentials(flags);
  console.log('⚡ SnapHost CLI Status:');
  console.log(`• Server: ${server}`);
  console.log(`• Token:  ${maskToken(token)}`);

  if (!token) {
    console.log('\n⚠️  Kein Token gefunden. Bitte führe "snaphost login" aus.');
    return;
  }

  try {
    const res = await fetch(`${server}/api/apps`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.ok || data.success) {
      console.log(`✓ Verbindung erfolgreich! (${data.apps?.length || 0} aktive Apps auf dem Server)`);
    } else {
      console.log(`❌ Authentifizierung fehlgeschlagen: ${data.error || 'Ungültiger Token'}`);
    }
  } catch (err) {
    console.log(`❌ Verbindungsfehler zu ${server}: ${err.message}`);
  }
}

async function cmdDeploy(args, flags) {
  const { server, token } = resolveCredentials(flags);
  if (!token) {
    console.error('❌ Kein API-Token hinterlegt. Führe zuerst "snaphost login" aus oder setze SNAPHOST_TOKEN.');
    process.exit(1);
  }

  // Target path
  let target = args[0] || '.';
  if (!fs.existsSync(target)) {
    console.error(`❌ Pfad "${target}" existiert nicht.`);
    process.exit(1);
  }

  // Auto-detect build output folder if running in root of Vite/React/Next project
  if (fs.statSync(target).isDirectory()) {
    if (fs.existsSync(path.join(target, 'dist', 'index.html'))) {
      console.log('💡 Build-Ordner "dist/" automatisch erkannt.');
      target = path.join(target, 'dist');
    } else if (fs.existsSync(path.join(target, 'build', 'index.html'))) {
      console.log('💡 Build-Ordner "build/" automatisch erkannt.');
      target = path.join(target, 'build');
    } else if (fs.existsSync(path.join(target, 'out', 'index.html'))) {
      console.log('💡 Export-Ordner "out/" automatisch erkannt.');
      target = path.join(target, 'out');
    }
  }

  console.log(`⚡ Packe Projekt aus: ${path.resolve(target)}...`);
  const isHtml = fs.statSync(target).isFile() && target.toLowerCase().endsWith('.html');
  const buffer = isHtml ? fs.readFileSync(target) : await createZipBuffer(target);
  const sizeMb = (buffer.length / 1024 / 1024).toFixed(2);
  console.log(`📦 Archiv-Größe: ${sizeMb} MB. Lade hoch zu ${server}/api/deploy...`);

  const formData = new FormData();
  const filename = isHtml ? path.basename(target) : `${path.basename(path.resolve(target)) || 'bundle'}.zip`;
  formData.append('file', new Blob([buffer]), filename);

  if (flags.slug) formData.append('slug', flags.slug);
  if (flags.ttl) formData.append('ttl', flags.ttl);
  if (flags.type) formData.append('type', flags.type);
  if (flags.spa) formData.append('spa', 'true');
  if (flags.password) formData.append('password', flags.password);
  if (flags.port) formData.append('port', flags.port);

  try {
    const res = await fetch(`${server}/api/deploy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();
    if (!data.success && !data.ok) {
      console.error(`\n❌ Deployment fehlgeschlagen: ${data.error || 'Unbekannter Serverfehler'}`);
      process.exit(1);
    }

    console.log('\n======================================================');
    console.log('🚀 DEPLOYMENT ERFOLGREICH BEREITGESTELLT!');
    console.log('======================================================');
    console.log(`🌐 URL:          ${data.url}`);
    console.log(`🏷️  Subdomain:    ${data.subdomain}`);
    console.log(`⚙️  Typ:          ${data.type}`);
    console.log(`🔢 Version:      v${data.version}`);
    console.log(`⏱️  Gültig bis:   ${data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'Dauerhaft (Permanent)'}`);
    console.log('======================================================\n');
    console.log(`Live-Logs ansehen:   snaphost logs ${data.subdomain}`);
    console.log(`Im Browser öffnen:   snaphost open ${data.subdomain}\n`);
  } catch (err) {
    console.error(`\n❌ Netzwerkfehler beim Upload: ${err.message}`);
    process.exit(1);
  }
}

async function cmdLogs(args, flags) {
  const { server, token } = resolveCredentials(flags);
  const identifier = args[0];
  if (!identifier) {
    console.error('❌ Bitte Subdomain oder App-ID angeben: snaphost logs <slug>');
    process.exit(1);
  }

  const tail = flags.tail || 100;
  try {
    const res = await fetch(`${server}/api/apps/${identifier}/logs?tail=${tail}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log(`\n📋 Logs für '${identifier}' (letzte ${tail} Zeilen):\n`);
    console.log(data.logs || data.error || '(Keine Logs vorhanden)');
  } catch (err) {
    console.error(`❌ Fehler beim Abrufen der Logs: ${err.message}`);
  }
}

async function cmdStatus(args, flags) {
  const { server, token } = resolveCredentials(flags);
  const identifier = args[0];
  if (!identifier) {
    console.error('❌ Bitte Subdomain oder App-ID angeben: snaphost status <slug>');
    process.exit(1);
  }

  try {
    const res = await fetch(`${server}/api/apps/${identifier}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success && !data.ok) {
      console.error(`❌ ${data.error || 'App nicht gefunden'}`);
      return;
    }
    const app = data.app || data;
    console.log('\n📊 App-Status:');
    console.log('───────────────────────────────────────');
    console.log(`• Subdomain:    ${app.subdomain}`);
    console.log(`• Titel:        ${app.title || app.subdomain}`);
    console.log(`• Status:       ${app.status} (Live: ${app.liveStatus || app.status})`);
    console.log(`• Typ:          ${app.type}`);
    console.log(`• Version:      v${app.version || 1}`);
    console.log(`• URL:          ${app.url}`);
    console.log(`• Erstellt am:  ${new Date(app.created_at).toLocaleString()}`);
    console.log(`• Läuft ab:     ${app.expires_at ? new Date(app.expires_at).toLocaleString() : 'Dauerhaft'}`);
    console.log(`• Passwort:     ${app.password ? 'Aktiv (geschützt)' : 'Öffentlich'}`);
    console.log('───────────────────────────────────────\n');
  } catch (err) {
    console.error(`❌ Fehler beim Abrufen des Status: ${err.message}`);
  }
}

async function cmdList(args, flags) {
  const { server, token } = resolveCredentials(flags);
  try {
    const res = await fetch(`${server}/api/apps`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    const apps = data.apps || [];
    if (apps.length === 0) {
      console.log('📭 Keine aktiven Bereitstellungen vorhanden.');
      return;
    }

    console.log(`\n📋 Aktive Bereitstellungen auf ${server} (${apps.length}):\n`);
    const rows = apps.map(a => ({
      Slug: a.subdomain,
      Typ: a.type,
      Status: a.status,
      Ver: `v${a.version || 1}`,
      URL: a.url
    }));
    console.table(rows);
    console.log('');
  } catch (err) {
    console.error(`❌ Fehler beim Laden der Liste: ${err.message}`);
  }
}

async function cmdRestart(args, flags) {
  const { server, token } = resolveCredentials(flags);
  const identifier = args[0];
  if (!identifier) {
    console.error('❌ Bitte Subdomain oder App-ID angeben: snaphost restart <slug>');
    process.exit(1);
  }

  try {
    const res = await fetch(`${server}/api/apps/${identifier}/restart`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success || data.ok) {
      console.log(`✓ App '${identifier}' erfolgreich neu gestartet!`);
    } else {
      console.error(`❌ ${data.error || 'Fehler beim Neustart'}`);
    }
  } catch (err) {
    console.error(`❌ Fehler: ${err.message}`);
  }
}

async function cmdRebuild(args, flags) {
  const { server, token } = resolveCredentials(flags);
  const identifier = args[0];
  if (!identifier) {
    console.error('❌ Bitte Subdomain oder App-ID angeben: snaphost rebuild <slug>');
    process.exit(1);
  }

  console.log(`⚡ Starte Rebuild für '${identifier}'...`);
  try {
    const res = await fetch(`${server}/api/apps/${identifier}/rebuild`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success || data.ok) {
      console.log(`✓ Rebuild für '${identifier}' erfolgreich abgeschlossen!`);
      console.log(`🌐 URL: ${data.url}`);
    } else {
      console.error(`❌ Rebuild fehlgeschlagen: ${data.error}`);
    }
  } catch (err) {
    console.error(`❌ Fehler: ${err.message}`);
  }
}

async function cmdRollback(args, flags) {
  const { server, token } = resolveCredentials(flags);
  const identifier = args[0];
  if (!identifier) {
    console.error('❌ Bitte Subdomain oder App-ID angeben: snaphost rollback <slug>');
    process.exit(1);
  }

  try {
    const res = await fetch(`${server}/api/apps/${identifier}/rollback`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ version: flags.version ? parseInt(flags.version, 10) : undefined })
    });
    const data = await res.json();
    if (data.success || data.ok) {
      console.log(`✓ Rollback erfolgreich auf Version v${data.version}!`);
    } else {
      console.error(`❌ Rollback fehlgeschlagen: ${data.error}`);
    }
  } catch (err) {
    console.error(`❌ Fehler: ${err.message}`);
  }
}

async function cmdDelete(args, flags) {
  const { server, token } = resolveCredentials(flags);
  const identifier = args[0];
  if (!identifier) {
    console.error('❌ Bitte Subdomain oder App-ID angeben: snaphost delete <slug>');
    process.exit(1);
  }

  try {
    const res = await fetch(`${server}/api/apps/${identifier}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success || data.ok) {
      console.log(`✓ App '${identifier}' endgültig gelöscht.`);
    } else {
      console.error(`❌ ${data.error || 'Fehler beim Löschen'}`);
    }
  } catch (err) {
    console.error(`❌ Fehler: ${err.message}`);
  }
}

async function cmdOpen(args, flags) {
  const { server, token } = resolveCredentials(flags);
  const identifier = args[0];
  if (!identifier) {
    console.error('❌ Bitte Subdomain angeben: snaphost open <slug>');
    process.exit(1);
  }

  try {
    const res = await fetch(`${server}/api/apps/${identifier}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    const url = data.app?.url || data.url || `https://${identifier}.lspx.org`;
    console.log(`Öffne im Browser: ${url}`);
    const startCmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
    execSync(`${startCmd} ${url}`);
  } catch (_) {
    execSync(`${process.platform === 'win32' ? 'start' : 'open'} https://${identifier}.lspx.org`);
  }
}

function showHelp() {
  console.log(`
⚡ SnapHost CLI - Das offizielle Terminal-Werkzeug

NUTZUNG:
  snaphost <befehl> [argumente] [flags]
  npx snaphost <befehl> [argumente] [flags]

BEFEHLE:
  deploy [pfad]      Projekt hochladen (Dateien, Ordner, dist/, ZIP oder .html)
  logs <slug>        Live-Container & Build-Logs ausgeben (z. B. snaphost logs mein-spiel)
  status <slug>      Status, Version, URL und Details einer App prüfen
  list (oder ls)     Alle aktiven Bereitstellungen tabellarisch auflisten
  restart <slug>     Container neu starten / statische Seite reaktivieren
  rebuild <slug>     Container neu bauen aus vorhandenen Dateien
  rollback <slug>    Sofortiges Rollback zur vorherigen Version
  delete <slug>      Bereitstellung endgültig löschen
  open <slug>        App-URL direkt im Standardbrowser öffnen
  login              API-Token & Server einmalig sicher lokal abspeichern
  logout             Gespeicherte Zugangsdaten löschen
  whoami             Aktuellen Login- und Serverstatus anzeigen

FLAGS:
  --slug <name>      Wunsch-Subdomain festlegen (Standard: abgeleitet aus Ordner/Datei)
  --ttl <dauer>      Gültigkeitsdauer: 1h, 6h, 24h, 7d, 30d, permanent (Standard: 24h)
  --type <typ>       static, docker, node, auto (Standard: auto)
  --spa              Aktiviert Single-Page-App 404 Fallback
  --password <pw>    HTTP Basic Auth Passwortschutz aktivieren
  --server <url>     Server-URL überschreiben (Standard: https://run.lspx.org)
  --token <token>    API-Token überschreiben (Standard: aus ~/.snaphost/config.json)

BEISPIELE:
  npx snaphost deploy                                    # Aktuellen Ordner deployen
  npx snaphost deploy ./dist --slug mein-spiel           # Build-Ordner mit festem Namen
  npx snaphost deploy . --ttl permanent                  # Dauerhafter Link
  npx snaphost logs mein-spiel --tail 150                # Logs zum Debuggen lesen
  npx snaphost restart mein-spiel                        # App neu starten
`);
}

// -------------------------------------------------------------
// Argument & Flag Parser
// -------------------------------------------------------------
async function main() {
  const rawArgs = process.argv.slice(2);
  const command = rawArgs[0];
  const positional = [];
  const flags = {};

  for (let i = 1; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = rawArgs[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  switch (command) {
    case 'login':
      await cmdLogin(positional, flags);
      break;
    case 'logout':
      await cmdLogout();
      break;
    case 'whoami':
      await cmdWhoami(positional, flags);
      break;
    case 'deploy':
      await cmdDeploy(positional, flags);
      break;
    case 'logs':
      await cmdLogs(positional, flags);
      break;
    case 'status':
    case 'info':
      await cmdStatus(positional, flags);
      break;
    case 'list':
    case 'ls':
      await cmdList(positional, flags);
      break;
    case 'restart':
      await cmdRestart(positional, flags);
      break;
    case 'rebuild':
      await cmdRebuild(positional, flags);
      break;
    case 'rollback':
      await cmdRollback(positional, flags);
      break;
    case 'delete':
    case 'rm':
      await cmdDelete(positional, flags);
      break;
    case 'open':
      await cmdOpen(positional, flags);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      break;
    default:
      console.error(`Unbekannter Befehl: "${command}". Führe "snaphost --help" für Hilfe aus.`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`Unerwarteter Fehler: ${err.message}`);
  process.exit(1);
});
