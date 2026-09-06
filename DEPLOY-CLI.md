# SnapHost – Dokumentation & CLI-Leitfaden

SnapHost ist eine private Self-Hosted Cloud- & Deployment-Plattform (ähnlich wie Vercel, Railway oder Coolify) auf eigenem Server.
Projekte werden direkt per Terminal über die SnapHost CLI (`npx snaphost` oder global `snaphost`) bereitgestellt, überwacht und verwaltet.

- **Server Basis-URL:** `https://DEINE_SNAPHOST_DOMAIN`
- **Bereitgestellte Apps laufen unter:** `https://<slug>.DEINE_SNAPHOST_DOMAIN`

---

## 🚀 1. Projekt bereitstellen (Deploy)

Die CLI erkennt automatisch den Build-Ordner (`./dist`, `./build`, `./out`) oder nutzt das aktuelle Verzeichnis:

### Frontend / Statische Webseiten (HTML, CSS, JS, Vite, React, Vue, Svelte):
```bash
# Projekt bauen (falls nötig):
npm run build

# Automatischer Deploy (sucht dist/ oder aktuelles Verzeichnis):
npx snaphost deploy

# Gezielt den Build-Ordner mit Subdomain und dauerhafter Laufzeit bereitstellen:
npx snaphost deploy ./dist --slug mein-projekt --ttl permanent

# Optional mit HTTP Basic Auth Passwortschutz:
npx snaphost deploy ./dist --slug mein-projekt --password geheim
```

### Fullstack / Backend / Multiplayer (Node.js, Express, WebSockets, Docker):
```bash
# Im Projektverzeichnis ausführen (package.json mit "start"-Script erforderlich):
npx snaphost deploy . --slug mein-backend --ttl permanent
```

---

## 🔍 2. Logs & Debugging (Fehleranalyse)

Falls ein Container oder eine Web-App nach dem Start Fehler meldet oder nicht erreichbar ist, können die Logs direkt über die CLI ausgelesen werden:

```bash
# Live-Logs der Anwendung / des Containers abrufen (letzte 100 Zeilen):
npx snaphost logs mein-projekt --tail 100

# Status, Port, Version, interne URL und Container-ID prüfen:
npx snaphost status mein-projekt
```

---

## 🔄 3. Verwaltung & Lifecycle

```bash
# Container neu starten (z. B. nach Konfigurationsanpassungen):
npx snaphost restart mein-projekt

# Container komplett neu bauen (Rebuild aus hochgeladenem Code):
npx snaphost rebuild mein-projekt

# Sofortiges Rollback zur vorherigen stabilen Version:
npx snaphost rollback mein-projekt

# Quellcode herunterladen & entpacken (z. B. für Weiterentwicklung oder KI-Bearbeitung):
npx snaphost pull mein-projekt
# Optional in einen bestimmten Zielordner:
npx snaphost pull mein-projekt ./zielordner

# Persistente Datenbank (/data) prüfen & SQLite-Tabellen anzeigen:
npx snaphost data mein-projekt

# Datenbank & Dateien lokal herunterladen:
npx snaphost data pull mein-projekt

# Speicher leeren (Reset):
npx snaphost data reset mein-projekt

# App / Container anhalten (offline nehmen):
npx snaphost stop mein-projekt

# Angehaltene App wieder online schalten:
npx snaphost start mein-projekt

# Bereitstellung endgültig löschen:
npx snaphost delete mein-projekt

# Alle aktiven Bereitstellungen auflisten:
npx snaphost list

# Live-URL direkt im Browser öffnen:
npx snaphost open mein-projekt
```

---

## ⚙️ 4. Projektkonfiguration (`deploy.json`)

Im Projektverzeichnis kann optional eine `deploy.json` hinterlegt werden:

```json
{
  "name": "mein-projekt",
  "type": "docker",
  "port": 3000,
  "spa": true,
  "env": {
    "NODE_ENV": "production"
  }
}
```

### Technische Vorgaben für Apps & Container:
- **Port:** Node.js-Server lauschen auf `process.env.PORT` (Fallback: `3000`) und binden an `0.0.0.0`:
  `const port = process.env.PORT || 3000; server.listen(port, '0.0.0.0');`
- **Persistente Datenbank / Speicher:** Der Ordner `/data` bzw. `./data` (und Umgebungsvariable `process.env.DATA_DIR`, `process.env.DATABASE_PATH = /app/data/app.db`) ist dauerhaft persistent gemountet. Alle Daten (z. B. SQLite-Tabellen oder JSON-Dateien) bleiben bei jedem Deploy und Rebuild erhalten. Keine Passwörter oder externe Datenbanken nötig!
- **WebSockets:** Nutzen denselben HTTP-Server und Port wie die Web-App.
- **Dateipfade:** In HTML/CSS stets relative Pfade verwenden (z. B. `./app.js`, nicht `/app.js`).
- `node_modules` und `.git` werden von der CLI automatisch vom Upload ausgeschlossen.

---

## 🔐 5. Authentifizierung & CLI-Setup

Die SnapHost CLI liest Zugangsdaten automatisch aus der lokalen Konfiguration (`~/.snaphost/config.json`) oder Umgebungsvariablen.

- **Status prüfen:**
  ```bash
  npx snaphost whoami
  ```
- **Einmalig anmelden:**
  ```bash
  npx snaphost login --server https://DEINE_SNAPHOST_DOMAIN
  ```
  *(Alternativ über Umgebungsvariablen: `SNAPHOST_SERVER=https://DEINE_SNAPHOST_DOMAIN` und `SNAPHOST_TOKEN=<token>`)*

Nach erfolgreichem Deployment ist das Projekt unter `https://<slug>.DEINE_SNAPHOST_DOMAIN` erreichbar.
