# Deploy-Anleitung für KI-Assistenten (SnapHost)

Diese Datei beschreibt, wie ein Webprojekt auf den SnapHost-Server hochgeladen, gewartet, debuggt und verwaltet wird. Lies sie vollständig, bevor du deployst.

- **Server Basis-URL:** `https://DEINE_SNAPHOST_DOMAIN`
- **Sites laufen unter:** `https://<slug>.DEINE_SNAPHOST_DOMAIN`
- **Authentifizierung:** HTTP-Header `Authorization: Bearer DEIN_API_KEY` (oder Umgebungsvariablen `DEPLOY_TOKEN` und `DEPLOY_SERVER`). Schreibe den Token nie in Dateien des Zielprojekts.
- **Identifikatoren:** Alle Endpunkte akzeptieren als Bezeichner entweder die **Subdomain / Slug** (z. B. `mein-spiel`) oder die interne **ID** (z. B. `app_a1b2c3`). Beide Pfad-Präfixe `/api/apps/...` und `/api/sites/...` werden voll unterstützt.

---

## Ablauf in 5 Schritten

1. **Projekt bauen:** (falls nötig, z. B. `npm run build`, `vite build`) und den fertigen Ausgabeordner bestimmen (bei statischen Seiten meist `dist/`, `build/` oder `out/`; bei Node.js-Servern das Projektverzeichnis).
2. **Typ festlegen:** `static` (HTML/CSS/JS), `docker` / `node` (Node.js/WebSockets/Express) oder `auto` (SnapHost erkennt es automatisch).
3. **`deploy.json` anlegen:** (optional, aber empfohlen – siehe Referenz unten).
4. **ZIP erstellen:** Der Inhalt des Ordners muss im ZIP-Root liegen. `node_modules` und `.git` **niemals** einpacken. Bei einzelnen HTML-Seiten kann direkt die `.html`-Datei ohne Archiv hochgeladen werden.
5. **Hochladen:** Per CLI-Skript oder direkt per REST-API `POST /api/deploy`. Nach erfolgreichem Deployment die `url` aus der Antwort wörtlich dem Nutzer mitteilen.

---

## 1. Bereitstellen per SnapHost CLI (Empfohlen) oder API

### Mit der SnapHost CLI (`snaphost` oder `npx snaphost`):
> **Tipp für KI-Assistenten:** Der API-Token ist sicher lokal in `~/.snaphost/config.json` hinterlegt (`snaphost login`). Du musst den Token nicht in Umgebungsvariablen oder Befehlen übergeben!

```bash
# Projekt bereitstellen:
npx snaphost deploy                                      # Aktueller Ordner (oder auto-detect dist/)
npx snaphost deploy ./dist --slug mein-spiel             # Build-Ordner mit festem Namen
npx snaphost deploy . --slug mein-spiel --ttl permanent   # Dauerhafter Link
npx snaphost deploy . --password geheim                  # Mit Passwortschutz

# Debugging & Wartung:
npx snaphost logs mein-spiel --tail 150                  # Live-Logs lesen (essentiell bei Fehlern!)
npx snaphost status mein-spiel                           # Status, Version & Container-ID prüfen
npx snaphost restart mein-spiel                          # Container neu starten
npx snaphost rebuild mein-spiel                          # Aus vorhandenen Dateien neu bauen
npx snaphost rollback mein-spiel                         # Rollback zur vorherigen Version
npx snaphost list                                        # Alle Apps tabellarisch anzeigen
```

### Mit PowerShell / Shell Skript:
```powershell
# Windows PowerShell
Invoke-WebRequest https://DEINE_SNAPHOST_DOMAIN/deploy.ps1 -OutFile deploy.ps1
.\deploy.ps1 .\dist                                # Zufallslink, 24h Laufzeit
.\deploy.ps1 . -Slug mein-spiel -Ttl permanent     # Fester Name, dauerhaft
.\deploy.ps1 . -Slug mein-spiel -Password geheim   # Mit Passwortschutz
```

```bash
# Linux / macOS
curl -sO https://DEINE_SNAPHOST_DOMAIN/deploy.sh && chmod +x deploy.sh
./deploy.sh ./dist
./deploy.sh . --slug mein-spiel --ttl permanent --password geheim
```

### Direkt per REST-API (`POST /api/deploy`):

**A. ZIP-Archiv hochladen:**
```bash
curl -sS -X POST "https://DEINE_SNAPHOST_DOMAIN/api/deploy" \
  -H "Authorization: Bearer DEIN_API_KEY" \
  -F "file=@bundle.zip" \
  -F "slug=mein-spiel" \
  -F "ttl=7d"
```

**B. Einzelne HTML-Datei (Sofort-Vorschau):**
```bash
curl -sS -X POST "https://DEINE_SNAPHOST_DOMAIN/api/deploy" \
  -H "Authorization: Bearer DEIN_API_KEY" \
  -F "file=@index.html" \
  -F "slug=mein-spiel"
```

**C. Direkter HTML-Quelltext als Text:**
```bash
curl -sS -X POST "https://DEINE_SNAPHOST_DOMAIN/api/deploy" \
  -H "Authorization: Bearer DEIN_API_KEY" \
  -F "html=<h1>Sofort-Bereitstellung</h1>" \
  -F "slug=mein-spiel"
```

**Antwortformat (JSON):**
```json
{
  "ok": true,
  "success": true,
  "url": "https://mein-spiel.DEINE_SNAPHOST_DOMAIN",
  "version": 1,
  "app": {
    "id": "app_123456",
    "subdomain": "mein-spiel",
    "type": "static",
    "status": "running",
    "expires_at": "2026-09-13T..."
  }
}
```

---

## 2. Regeln je Projekttyp

### `static` – HTML/CSS/JS Webseiten & SPAs
- `index.html` muss im Stammverzeichnis der ZIP-Datei liegen.
- Nur **relative Pfade** verwenden (z. B. `./app.js`, nicht `/app.js` mit absolutem Server-Pfad), da die Seite direkt unter der Subdomain ausgeliefert wird.
- **Single-Page-Apps (SPA):** Bei Client-seitigem Routing (React Router, Vue Router) `"spa": true` in `deploy.json` setzen (oder per API übergeben). Dadurch leitet SnapHost alle 404-Pfade auf `index.html` weiter.
- Wird automatisch gewählt, wenn weder `package.json` noch `Dockerfile` vorhanden sind.

### `node` / `docker` – Node.js Server, WebSockets & Multiplayer
- `package.json` mit `"scripts": { "start": "node server.js" }` (oder `"start"` in `deploy.json`).
- Der Server **muss** auf `process.env.PORT` (Standard: 3000) lauschen und an `0.0.0.0` binden:
  ```javascript
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0');
  ```
- **WebSockets:** Über **denselben** HTTP-Server/Port betreiben (z. B. `new WebSocketServer({ server })`).
  Im Browser-Client:
  ```javascript
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}`);
  ```
- Läuft isoliert in einem schnellen `node:22-alpine` Docker-Container.
- Abhängigkeiten werden automatisch via `npm install` installiert.
- Für Projekte mit Build-Schritt (TypeScript, Vite) `"build": "npm run build"` in `deploy.json` definieren.

---

## 3. `deploy.json` Spezifikation (im ZIP-Root, alle Felder optional)

```json
{
  "name": "Mein Multiplayer-Spiel",
  "type": "node",
  "start": "node server.js",
  "build": "npm run build",
  "port": 3000,
  "slug": "mein-spiel",
  "ttl": "7d",
  "spa": false,
  "password": null,
  "env": { "MAX_PLAYERS": "8", "NODE_ENV": "production" }
}
```

| Feld | Typ | Beschreibung |
| :--- | :--- | :--- |
| `name` | String | Anzeigename im Dashboard |
| `type` | String | `static` / `docker` / `node` – `auto` erkennt es selbst |
| `start` | String | Startbefehl für Node.js (Standard: `npm start` oder `node server.js`) |
| `build` | String | Optionaler Build-Befehl vor dem Start (z. B. `npm run build`) |
| `port` | Number | Interner Port der Anwendung (Standard: `3000`) |
| `slug` | String | Wunsch-Subdomain (`mein-spiel.DEINE_SNAPHOST_DOMAIN`). Leer = automatisch aus Dateiname abgeleitet (z. B. `mein-spiel.zip` -> `mein-spiel`) |
| `ttl` | String | Gültigkeitsdauer: `1h`, `6h`, `24h`, `7d`, `30d`, `permanent` |
| `spa` | Boolean | `true` aktiviert SPA Fallback (alle 404-Routen zu `index.html`) |
| `password` | String | Passwortschutz via HTTP Basic Auth (`null` oder leer = öffentlich) |
| `env` | Object | Umgebungsvariablen für den Container |

Formularfelder beim Upload (`-F "ttl=3d"`, `-F "password=secret"`) überschreiben die Werte aus `deploy.json`.

---

## 4. Wichtige Verhaltensregeln

- **Automatischer Slug aus Dateiname:** Wird kein `slug` angegeben, leitet SnapHost die Subdomain automatisch aus dem Dateinamen ab (z. B. `mein-spiel.zip` -> `mein-spiel`). Ist die Subdomain bereits belegt, wird automatisch ein Zähler angehängt (`mein-spiel-2`, `mein-spiel-3`), um versehentliches Überschreiben zu verhindern.
- **Expliziter Slug = In-Place Update:** Wird ein `slug` explizit übergeben und existiert die App bereits, wird sie sofort aktualisiert. SnapHost legt dabei automatisch eine Sicherung der vorherigen Version (`v1`, `v2` …) an, sodass jederzeit ein verlustfreies Rollback möglich ist.
- **Fehlerbehandlung:** Antwortet die API mit `ok: false`, enthält `error` die genaue Fehlerursache inklusive Auszug aus dem Build-Log.
- **Slug-Syntax:** Nur Kleinbuchstaben (`a-z`), Ziffern (`0-9`) und Bindestriche (`-`), min. 3 Zeichen.

---

## 5. Vollständige API-Referenz

Alle Endpunkte erfordern den Header `Authorization: Bearer DEIN_API_KEY`.  
Als `{id}` kann sowohl die Subdomain (Slug) als auch die interne ID übergeben werden.

| Methode | Pfad | Beschreibung |
| :--- | :--- | :--- |
| `POST` | `/api/deploy` | Neues Projekt bereitstellen oder bestehendes in-place aktualisieren |
| `POST` | `/api/apps/{id}/deploy` | Neue Version gezielt für eine bestehende App hochladen |
| `GET` | `/api/apps` | Liste aller aktiven Anwendungen und deren Live-Status |
| `GET` | `/api/apps/{id}` | Detailinformationen, Metadaten und Status einer App |
| `PATCH` | `/api/apps/{id}` | Einstellungen anpassen (Slug, Titel, TTL, Passwort, Port, Commands, Env) |
| `GET` | `/api/apps/{id}/logs` | Vollständige Logs (Build-Logs + Container stdout/stderr). Parameter `?tail=150` |
| `POST` | `/api/apps/{id}/restart` | Container neu starten / statische Seite reaktivieren |
| `POST` | `/api/apps/{id}/rebuild` | Docker-Container aus vorhandenen Dateien komplett neu bauen |
| `POST` | `/api/apps/{id}/rollback` | Sofortiges Rollback zur vorherigen Version (optional: `{"version": 1}`) |
| `POST` | `/api/apps/{id}/stop` | Anwendung offline nehmen (gibt HTTP 503 aus, behält alle Daten) |
| `GET` | `/api/apps/{id}/deployments` | Versions-Historie mit Dateigrößen und Timestamps abrufen |
| `DELETE` | `/api/apps/{id}` | Projekt, Archivdateien und Docker-Container endgültig löschen |

*(Hinweis: Alle Routen sind synonym auch unter `/api/sites/...` erreichbar).*

---

## 6. Häufige Befehle & Beispiele

### Live-Logs zum Debuggen lesen:
```bash
curl -sS -X GET "https://DEINE_SNAPHOST_DOMAIN/api/apps/mein-spiel/logs?tail=150" \
  -H "Authorization: Bearer DEIN_API_KEY"
```

### Container neu starten:
```bash
curl -sS -X POST "https://DEINE_SNAPHOST_DOMAIN/api/apps/mein-spiel/restart" \
  -H "Authorization: Bearer DEIN_API_KEY"
```

### Container neu bauen (Rebuild):
```bash
curl -sS -X POST "https://DEINE_SNAPHOST_DOMAIN/api/apps/mein-spiel/rebuild" \
  -H "Authorization: Bearer DEIN_API_KEY"
```

### Rollback auf vorherige Version:
```bash
curl -sS -X POST "https://DEINE_SNAPHOST_DOMAIN/api/apps/mein-spiel/rollback" \
  -H "Authorization: Bearer DEIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"version": 1}'
```

### Kennwortschutz setzen oder entfernen:
```bash
# Passwort setzen:
curl -sS -X PATCH "https://DEINE_SNAPHOST_DOMAIN/api/apps/mein-spiel" \
  -H "Authorization: Bearer DEIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password": "geheimes-passwort"}'

# Passwort entfernen (wieder öffentlich):
curl -sS -X PATCH "https://DEINE_SNAPHOST_DOMAIN/api/apps/mein-spiel" \
  -H "Authorization: Bearer DEIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password": ""}'
```

### Offline nehmen & Online stellen:
```bash
# Offline schalten (gibt 503 aus):
curl -sS -X POST "https://DEINE_SNAPHOST_DOMAIN/api/apps/mein-spiel/stop" \
  -H "Authorization: Bearer DEIN_API_KEY"

# Wieder online stellen:
curl -sS -X POST "https://DEINE_SNAPHOST_DOMAIN/api/apps/mein-spiel/restart" \
  -H "Authorization: Bearer DEIN_API_KEY"
```

### Löschen:
```bash
curl -sS -X DELETE "https://DEINE_SNAPHOST_DOMAIN/api/apps/mein-spiel" \
  -H "Authorization: Bearer DEIN_API_KEY"
```
