# ⚡ SnapHost

**SnapHost** ist deine private, selbstgehostete Vorschau- und Deployment-Plattform für deinen Proxmox-Server („Boxbox“).

* ⚡ **Statische Webseiten:** In Millisekunden bereitgestellt (HTML, CSS, JS, Vite / React Builds).
* 🐳 **Interaktive Apps & Multiplayer-Spiele:** Startet isolierte Docker-Container (Node.js, WebSockets, Python).
* ⏱️ **Ablaufdatum (TTL):** Automatische Bereinigung nach 1h, 24h, 7d oder dauerhafte Links.
* ✏️ **Dynamische Subdomains:** Zufällige Slugs (`swift-fox-42`) oder im Admin-Panel umbenennbar (`mein-spiel`).
* 🤖 **KI-Schnittstelle:** Mit nur einem cURL-Befehl lädt jede KI (Claude, Cursor, Antigravity, ChatGPT) fertige Projekte direkt hoch.
* 🎛️ **Admin-Dashboard:** Übersicht mit Login, Drag & Drop Upload, Live-Logs, API-Keys und Link-Management.

---

## 🏗️ 1. Einrichtung in Nginx Proxy Manager (NPM)

Da du bereits eine statische IP, Cloudflare und NPM mit deinem **Cloudflare Ursprungszertifikat (Origin Certificate)** nutzt, ist die Anbindung in 2 Minuten erledigt:

### A. Cloudflare DNS
1. Gehe in dein Cloudflare Dashboard -> **DNS**.
2. Erstelle einen **A-Record**:
   * **Name:** `*.apps` *(oder einfach `*` für die Hauptebene deiner Domain)*
   * **IPv4-Adresse:** Deine statische IP-Adresse.
   * **Proxy-Status:** Proxied (Orange Wolke).

### B. Nginx Proxy Manager (NPM)
1. Öffne deine NPM Web-Oberfläche.
2. Gehe auf **Proxy Hosts** -> **Add Proxy Host**:
   * **Domain Names:** `*.apps.deinedomain.de` und `apps.deinedomain.de`
   * **Scheme:** `http`
   * **Forward Hostname / IP:** Die lokale IP-Adresse deines Proxmox-Servers/Containers (z. B. `192.168.178.50`).
   * **Forward Port:** `3000`
   * **Cache Assets:** Aus
   * **Block Common Exploits:** An
   * **Websockets Support:** **AN** *(wichtig für Multiplayer-Spiele!)*
3. Gehe auf den Reiter **SSL**:
   * **SSL Certificate:** Wähle dein hinterlegtes **Cloudflare Origin Certificate** aus.
   * **Force SSL:** An
   * **HTTP/2 Support:** An
   * **HSTS Enabled:** An
4. Klicke auf **Save**.

---

## 🚀 2. SnapHost starten (auf Proxmox / Docker)

### Per Docker Compose (Empfohlen)

1. Kopiere diesen Projektordner auf deinen Proxmox-Server (z. B. in `/opt/snaphost` oder in einen Docker-LXC).
2. Erstelle deine Konfigurationsdatei:
   ```bash
   cp .env.example .env
   ```
3. Passe deine `.env` an:
   ```env
   ROOT_DOMAIN=apps.deinedomain.de
   ADMIN_PASSWORD=dein-sicheres-passwort
   ADMIN_SUBDOMAIN=admin
   DEFAULT_TTL=24h
   ```
4. Starte SnapHost mit einem Befehl:
   ```bash
   docker compose up -d --build
   ```

Fertig! Dein SnapHost Dashboard ist nun unter `https://apps.deinedomain.de` (oder `https://admin.apps.deinedomain.de`) erreichbar!

---

## 🤖 3. Die KI-Schnittstelle nutzen

In diesem Verzeichnis liegt die Datei **`DEPLOY.md`**.

Wenn du mit einer KI (wie Claude, ChatGPT, Cursor oder Antigravity) ein Spiel oder eine Webseite programmierst, gibst du der KI einfach den Inhalt der `DEPLOY.md` (oder lädst die Datei hoch) und sagst:

> *„Lies die `DEPLOY.md` und lade das aktuelle Projekt auf meinen Server hoch.“*

Die KI packt das Projekt in ein ZIP, sendet den `curl`-Befehl an deinen Server und gibt dir direkt den fertigen Link zurück (z. B. `https://funny-badger-88.apps.deinedomain.de`)!

---

## 💻 4. Lokaler Testlauf (Entwicklung auf deinem PC)

Du kannst SnapHost auch direkt lokal auf diesem Windows-PC testen:

```bash
npm start
```

* Öffne im Browser: `http://localhost:3000`
* Melde dich an mit Passwort: `admin123` (oder dem in `.env` definierten Passwort).
* Du kannst sofort eine ZIP-Datei hochladen und ausprobieren!
