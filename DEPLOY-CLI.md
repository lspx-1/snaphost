# SnapHost CLI – Anleitung für KI-Assistenten

Du bist angewiesen, dieses Projekt mit der **SnapHost CLI** bereitzustellen, zu debuggen und zu verwalten.
Führe alle Aktionen über `npx snaphost` (oder `snaphost`, falls global installiert) in deinem Terminal aus.

---

## 🔐 1. Authentifizierung & Konfiguration
SnapHost speichert Server-URL und API-Token automatisch in `~/.snaphost/config.json`.
- **Wichtig:** Du musst **keinen** Token erfragen oder in Befehle einfügen, wenn die CLI bereits eingeloggt ist!
- Prüfe den Login-Status jederzeit mit:
  ```bash
  npx snaphost whoami
  ```
- Falls noch nicht eingeloggt:
  ```bash
  npx snaphost login --server https://DEINE_SNAPHOST_DOMAIN
  ```
  *(Oder setze Umgebungsvariablen: `SNAPHOST_SERVER=https://DEINE_SNAPHOST_DOMAIN` und `SNAPHOST_TOKEN=<token>`)*

- **Server-Basis-URL:** `https://DEINE_SNAPHOST_DOMAIN`
- **Bereitgestellte Apps laufen unter:** `https://<slug>.DEINE_SNAPHOST_DOMAIN`

---

## 🚀 2. Projekt bereitstellen (Deploy)

### Frontend / Statische Webseiten (HTML, CSS, JS, Vite, React, Vue, Svelte):
1. Falls nötig, zuerst das Projekt bauen:
   ```bash
   npm run build
   ```
2. Bereitstellen:
   ```bash
   # Automatische Erkennung (sucht ./dist, ./build, ./out oder aktuelles Verzeichnis):
   npx snaphost deploy

   # Gezielt den Build-Ordner mit Wunsch-Subdomain und dauerhafter Laufzeit:
   npx snaphost deploy ./dist --slug mein-projekt --ttl permanent

   # Optional mit Passwortschutz:
   npx snaphost deploy ./dist --slug mein-projekt --password geheim
   ```

### Fullstack / Backend / Multiplayer (Node.js, Express, WebSockets, Docker):
1. Stelle sicher, dass `package.json` ein `"start"` Script enthält (z. B. `"start": "node server.js"`).
2. Im Projektverzeichnis ausführen:
   ```bash
   npx snaphost deploy . --slug mein-backend --ttl permanent
   ```

---

## 🛠️ 3. Debugging & Fehleranalyse (HÄUFIGE FEHLER BEHEBEN)

### A. Live-Logs prüfen (Erste Pflicht bei Fehlern oder 502 Bad Gateway!):
```bash
# Zeigt die letzten 100 Zeilen der Container- & Konsolen-Logs:
npx snaphost logs mein-projekt --tail 100
```
Lies die Fehlermeldungen im Log genau durch (fehlende Module, Port-Konflikte, Syntaxfehler etc.).

### B. Status abfragen:
```bash
npx snaphost status mein-projekt
```
Gibt Status (`running`, `error`, `stopped`), Port, Container-ID, interne URL und Gültigkeit aus.

---

## 🔄 4. Verwaltung, Neustart & Rollback

```bash
# App nach Code-Änderungen oder Konfigurationsanpassungen neu starten:
npx snaphost restart mein-projekt

# Container komplett neu bauen (z. B. nach Dockerfile- oder Dependency-Änderungen):
npx snaphost rebuild mein-projekt

# Zur vorherigen funktionierenden Version zurückkehren:
npx snaphost rollback mein-projekt

# Alle aktiven Apps auflisten:
npx snaphost list

# App im Browser aufrufen:
npx snaphost open mein-projekt

# App stoppen oder löschen:
npx snaphost stop mein-projekt
npx snaphost delete mein-projekt
```

---

## 📋 5. Projektkonfiguration (`deploy.json`)
Du kannst optional eine `deploy.json` im Stammverzeichnis deines Projekts anlegen:

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

### ⚠️ Wichtige Regeln für Server & Container:
- **Port:** Node.js-Server **müssen** auf `process.env.PORT` (Fallback: `3000`) lauschen und an `0.0.0.0` binden:
  `const port = process.env.PORT || 3000; server.listen(port, '0.0.0.0');`
- **WebSockets:** Müssen denselben HTTP-Server und Port nutzen (kein zweiter Port).
- **Dateipfade:** Verwende in HTML/CSS stets **relative Pfade** (z. B. `./app.js`, nicht `/app.js`).
- `node_modules` und `.git` werden von der CLI automatisch vom Upload ausgeschlossen.

---

Nach erfolgreichem Deployment teilst du dem Nutzer die Live-URL wörtlich mit:
👉 `https://<slug>.DEINE_SNAPHOST_DOMAIN`
