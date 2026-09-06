# 🏛️ SnapHost Architektur & Entwickler-Handbuch

> **Zweck dieser Datei:**  
> Dieses Dokument dient als zentrale Wissensbasis ("Developer & Agent Handover") für SnapHost. Wenn ein neuer KI-Agent (Antigravity, Cursor, Claude, ChatGPT, Gemini) oder Entwickler in diesem Repository gestartet wird, liefert diese Datei sofort den kompletten Überblick über Infrastruktur, Netzwerk, Architektur, Designentscheidungen ("Warum so gebaut?") und Erweiterungsmöglichkeiten.

---

## 1. System- & Infrastruktur-Übersicht

* **Plattform:** SnapHost – Private, selbstgehostete Vorschau- & Deployment-Plattform (Alternative zu Vercel / Netlify / Railway) für Proxmox VE.
* **Basis-Domain:** `lspx.org`
* **Admin Dashboard & REST-API:** `https://run.lspx.org`
* **Bereitgestellte Apps:** `https://<slug>.lspx.org` (z. B. `https://neon-tanks.lspx.org`, `https://mein-spiel.lspx.org`)
* **Host-System:** Linux (LXC-Container / VM) auf Proxmox VE („Boxbox“), Hostname `snaphost`.
* **Projektverzeichnis auf dem Server:** `/opt/snaphost`
* **Service Manager:** `systemd` (`snaphost.service`), führt `/usr/bin/node src/server.js` direkt auf dem Host aus (lauscht intern auf `127.0.0.1:3000`).
* **Reverse Proxy vor SnapHost:** **Nginx Proxy Manager (NPM)**
  * Eingerichtet mit 15-Jahre **Cloudflare Origin Certificate** für `lspx.org` und `*.lspx.org`.
  * Leitet Anfragen für `run.lspx.org` und `*.lspx.org` an `http://127.0.0.1:3000` weiter.
  * WebSockets Support aktiviert, Force SSL & HTTP/2 aktiv.
* **DNS & CDN:** **Cloudflare** mit Orange Cloud (Proxied) für:
  * `run` (A-Record -> Statische Server-IP)
  * `*` (Wildcard A-Record -> Statische Server-IP für alle dynamischen Subdomains)

```
[ Internet / Browser / KI-Client ]
               │
               ▼
   [ Cloudflare (Proxied DNS & SSL) ]
   (run.lspx.org  /  *.lspx.org)
               │
               ▼  (HTTPS Port 443 mit Origin Cert)
 [ Nginx Proxy Manager (NPM auf Proxmox) ]
               │
               ▼  (HTTP Port 3000)
    [ SnapHost (Node.js Server) ]
     ├── Host = run.lspx.org  ──────> Admin Dashboard UI, Auth & /api/deploy
     └── Host = <slug>.lspx.org ────> SQLite App-Lookup
                                         ├── Typ 'static' ──> Statischer Dateiserver (SPA Fallback)
                                         └── Typ 'docker' ──> Reverse Proxy zu 127.0.0.1:<dynPort>
```

---

## 2. Projektstruktur & Modul-Verantwortlichkeiten

```
WEB2/
├── .env.example          # Vorlage für Umgebungsvariablen (ROOT_DOMAIN, ADMIN_SUBDOMAIN, etc.)
├── ARCHITECTURE.md       # DIESE DATEI: Vollständiges Entwickler- & KI-Handbuch
├── DEPLOY.md             # Vollständige API-Spezifikation für KI-Assistenten (wird dynamisch ausgeliefert)
├── Dockerfile            # Container-Image für SnapHost selbst (optional)
├── docker-compose.yml    # Docker Compose Setup (optional)
├── package.json          # Node.js Dependencies (Express, Dockerode, AdmZip, HttpProxy, Node:sqlite)
├── snaphost.service      # Systemd Unit-Datei für den Linux-Server
├── update.sh             # 1-Klick-Updateskript für den Server (git pull, npm install, restart)
│
├── public/               # Frontend (Dashboard SPA)
│   ├── index.html        # Modernes Dashboard mit Karten- & Tabellenansicht, Modals, Tabs
│   ├── app.js            # Frontend-Logik (Uploads, Live-Logs, QR-Codes, Fullpage-Preview, Prompts)
│   ├── style.css         # Minimalistisches Dark-Mode UI im Vercel/Linear-Design
│   └── setup-guide.html  # Interaktive Schritt-für-Schritt Einrichtungsanleitung
│
├── src/                  # Backend Quellcode
│   ├── server.js         # HTTP Server, Host-Routing (resolveSubdomain), CLI-Skript-Routen
│   ├── config.js         # Zentrale Konfiguration (Ports, Pfade, Domains, TTL)
│   ├── db.js             # SQLite Datenbankanbindung (node:sqlite DatabaseSync) & Migrationen
│   │
│   ├── routes/
│   │   ├── api.js        # REST API (/api/deploy, /api/apps, /api/apps/:id/*)
│   │   └── auth.js       # Admin Authentifizierung & Session Cookies
│   │
│   ├── services/
│   │   ├── deployer.js   # Orchestrator: ZIP entpacken, Slug-Wahl, Docker/Static Verzweigung
│   │   ├── docker.js     # Dockerode Wrapper: Dockerfile-Gen, Image-Build, Port-Mapping
│   │   ├── proxy.js      # Reverse Proxy für HTTP & WebSockets zu Docker-Containern
│   │   ├── static.js     # Statischer Dateiserver mit ETag, Range-Requests & SPA Fallback
│   │   └── janitor.js    # Hintergrund-Cronjob zur automatischen Löschung abgelaufener Apps
│   │
│   ├── utils/
│   │   └── slug.js       # Subdomain-Generierung, Dateinamen-Extraktion & Kollisionsschutz
│   │
│   └── scripts/
│       ├── deploy.ps1    # PowerShell Upload-Skript für Entwickler & KI
│       └── deploy.sh     # Bash Upload-Skript für Linux/macOS
│
└── data/                 # Persistente Server-Daten (in .gitignore)
    ├── snaphost.db       # SQLite Datenbank
    └── apps/             # Bereitgestellte Anwendungen ({app_id}/content, /versions)
```

---

## 3. Architektur-Entscheidungen: Das „Warum & Wie“

### A. Warum `run.lspx.org` für das Dashboard und `*.lspx.org` für Apps?
* **Problem:** Cloudflare Wildcard-Zertifikate (`*.lspx.org`) decken genau **eine** Subdomain-Ebene ab (z. B. `mein-spiel.lspx.org`). Würde man `*.run.lspx.org` nutzen, wäre das ein zweistufiger Wildcard-Name (`app.run.lspx.org`), der im kostenlosen Cloudflare-Tarif ungültige SSL-Fehler wirft.
* **Lösung:** 
  * `run.lspx.org` = Dashboard, API und Steuerzentrale.
  * `<slug>.lspx.org` = Jede App bekommt eine saubere, kurze Adresse ersten Grades.

### B. Wie funktioniert die Subdomain-Erkennung (`src/server.js`)?
* Eingehende Anfragen werden über den `Host:` Header analysiert (`resolveSubdomain(hostHeader)`):
  * Ist der Host `run.lspx.org` oder die Root-Domain -> Admin-Dashboard und REST-API.
  * Ist der Host `<slug>.lspx.org` -> Lookup der App in SQLite via `appDb.getAppBySubdomain(slug)`.
  * Ist die App `static` -> Auslieferung via `staticService.serve` (unterstützt SPA Fallback für Vue/React Router).
  * Ist die App `docker` -> Proxy via `proxyService.proxyHttp` und WebSockets via `proxyService.proxyWs`.

### C. Wie funktioniert die Slug-Vergabe und der Kollisionsschutz?
* **Standard (aus Dateiname):** Lädt der Nutzer `mein-spiel.zip` hoch, extrahiert `extractBaseSlug('mein-spiel.zip')` den Namen `mein-spiel`.
* **Kollisionsvermeidung:** Ist `mein-spiel` bereits in der Datenbank belegt, schlägt `resolveUniqueSlug` automatisch `mein-spiel-2`, `mein-spiel-3` vor, damit niemals eine bestehende App versehentlich überschrieben wird.
* **Expliziter Wunschname (In-Place Update):** Übergibt der Nutzer oder die KI explizit einen Namen (z. B. `-F "slug=mein-spiel"`), greift sofort dieser Name. Existiert die App bereits, wird ein **In-Place Update** durchgeführt:
  * Der alte Stand wird nach `versions/v{N}` gesichert (für 1-Klick-Rollback).
  * Der neue Stand wird entpackt und neu gestartet.

### D. Wie läuft Docker-Routing und warum dynamisches Host-Port-Binding?
* **Problem:** SnapHost läuft als `systemd`-Dienst direkt auf dem Host-Betriebssystem (`/usr/bin/node src/server.js`), **nicht** in einem Docker-Container. Das Host-Linux kann interne Docker-Containernamen wie `snaphost-app-app_xxx` per DNS nicht auflösen -> das führte früher zu `ENOTFOUND` und `502 Bad Gateway`.
* **Lösung in `src/services/docker.js` & `proxy.js`:**
  1. Beim Erstellen des Containers wird `PortBindings: { [`${port}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: '' }] }` übergeben. Docker weist dem Container einen freien Zufallsport auf `127.0.0.1` zu (z. B. `49153`).
  2. Nach `container.start()` liest SnapHost diesen Port per `container.inspect()` aus.
  3. SnapHost speichert `internal_host = '127.0.0.1'` und `internal_port = 49153` in der Datenbank.
  4. `proxy.js` leitet Anfragen direkt an `http://127.0.0.1:49153` weiter.
  5. **Auto-Recovery:** Sollte eine App noch mit dem alten Containernamen in der DB stehen, liest `proxy.js` den Live-Endpunkt zur Laufzeit per `dockerService.getContainerEndpoint` dynamisch aus Docker aus.

### E. Normalisierung von App-Typen (`node` -> `docker`)
* In `deploy.json` schreiben viele KIs `"type": "node"`.
* In `src/services/deployer.js` werden `"node"`, `"nodejs"` und `"container"` automatisch zu `"docker"` normalisiert, wodurch zuverlässig der Docker-Build und Containerstart angestoßen wird.

---

## 4. Häufige Arbeitsbefehle für Entwicklung & Wartung

### Lokal arbeiten (Windows):
```powershell
# Abhängigkeiten installieren
npm install

# Test-Suite ausführen (prüft DB, Slugs, Rollbacks, Berechtigungen)
node scratch/test_full_suite.js
node scratch/test_slug_derivation.js
node scratch/test_deploy_routes.js

# Änderungen committen & pushen
git add .
git commit -m "Dein Commit"
git push origin main
```

### Auf dem Proxmox-Server (`root@snaphost`):
```bash
# 1-Klick Update ausführen:
cd /opt/snaphost && ./update.sh

# Oder manuell:
cd /opt/snaphost
git pull
systemctl restart snaphost

# Status & Live-Logs prüfen:
systemctl status snaphost
journalctl -u snaphost -f
```

---

## 5. 💡 Konkrete Verbesserungsideen für zukünftige Versionen

Hier sind die wertvollsten nächsten Ausbaustufen, um SnapHost auf das Niveau von Vercel / Railway zu heben:

### 1. 💤 Auto-Sleep & Scale-to-Zero (Ressourcensparend)
* **Idee:** Wenn eine Docker-App 15 Minuten lang keinen Aufruf erhalten hat (`last_hit_at`), stoppt SnapHost den Container (`docker.stop()`).
* **Wake-Up:** Sobald ein neuer HTTP-Request an `proxy.js` eingeht, startet SnapHost den Container innerhalb von ca. 500ms neu (`docker.start()`) und liefert die Anfrage aus.
* **Vorteil:** Auf deinem Proxmox-Server können hunderte Node.js-Apps existieren, ohne dass sie RAM verbrauchen, wenn niemand sie nutzt!

### 2. 🪝 GitHub Webhook Auto-Deploy (Git-to-Deploy)
* **Idee:** Neuer Endpunkt `POST /api/webhooks/github/:slug`.
* **Funktion:** In GitHub stellt man einen Webhook bei `push` ein. SnapHost clont oder pullt das Repository, baut es (`npm run build`) und deployt die neue Version automatisch.

### 3. 📊 Live-Ressourcenanzeige im Dashboard (CPU & RAM)
* **Idee:** Im Dashboard-Modal oder auf den App-Karten eine kleine Anzeige für RAM-Verbrauch (z. B. `42 MB / 512 MB`) und CPU-Auslastung.
* **Umsetzung:** Dockerode bietet `container.stats({ stream: false })`. Ein kleiner API-Endpunkt `/api/apps/:id/stats` liefert die Daten ans Frontend.

### 4. ⚙️ Web-Editor für Umgebungsvariablen (`.env`)
* **Idee:** Im App-Detailmenü des Dashboards können Entwickler Key-Value-Paare für Container-Umgebungsvariablen bearbeiten und per Klick auf „Speichern & Neustarten“ sofort anwenden, ohne die ZIP neu hochzuladen.

### 5. 📦 Eigene Domain-Verknüpfung (Custom Domains)
* **Idee:** Nutzer können einer App eine eigene Domain zuweisen (z. B. `meine-coole-seite.de`).
* **Umsetzung:** Ein CNAME auf `run.lspx.org` leiten; SnapHost matched die Domain in der SQLite-Datenbank und NPM leitet den Host weiter.

### 6. 🗄️ Integrierte One-Click Datenbanken (SQLite / Redis Sidecar)
* **Idee:** In `deploy.json` kann `"services": ["redis"]` angegeben werden. SnapHost startet einen kleinen Redis-Container und übergibt die Verbindungsvariable `REDIS_URL` an den App-Container.

### 7. 💻 Offizielles SnapHost CLI-Tool (`npx snaphost`)
* **Idee:** Ein winziges npm-Paket `snaphost-cli`.
* **Funktion:** Im Projektordner tippt man einfach `npx snaphost deploy`, das Tool packt den Ordner, liest den Token aus `~/.snaphost` und lädt es hoch.
