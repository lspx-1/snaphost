# SnapHost Assistant Guidelines

For comprehensive system architecture, network topology, design decisions, and file breakdowns, see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Quick Reference
- **Domain:** `lspx.org`
- **Dashboard & API Server:** `https://run.lspx.org`
- **Apps Wildcard:** `https://<slug>.lspx.org`
- **Server Location:** `/opt/snaphost` on Proxmox LXC (`root@snaphost`)
- **Service:** `systemd` unit `snaphost.service` running Node.js on port 3000
- **Reverse Proxy:** Nginx Proxy Manager (NPM) with 15-year Cloudflare Origin Certificate
- **Updates:** Automatic. Every push/merge to `main` runs `.github/workflows/deploy.yml`, which calls `POST /api/system/update` with a GitHub OIDC token (no shared secret; repo + branch checked in `src/services/updater.js`). The server pulls, installs deps if `package.json` changed, and exits so systemd restarts it. Never leave uncommitted changes in `/opt/snaphost` – they block `git pull --ff-only`.

## Key Rules for AI & Developers
1. **Subdomains:** Dashboard is `run.lspx.org`. Never send API requests to `lspx.org` directly; always use `https://run.lspx.org/api/...`.
2. **App Types:** The backend normalizes `node`, `nodejs`, and `container` to `docker`.
3. **Docker Networking:** SnapHost runs on host Node.js. Docker containers are bound to ephemeral ports on `127.0.0.1` (`HostIp: '127.0.0.1', HostPort: ''`). Never route directly to container names from the host proxy without dynamic port inspection.
4. **Subdomain Derivation:** If no slug is specified, SnapHost auto-derives from uploaded filename (e.g. `mein-spiel.zip` -> `mein-spiel`). If taken, appends `-2`, `-3`. Custom slug input triggers in-place updates.
5. **Database:** SQLite via Node.js native `node:sqlite` (`DatabaseSync`), located at `data/snaphost.db`.
6. **CLI & AI Prompts:** Official CLI tool is `bin/snaphost.js` (`npx snaphost`). The WebUI KI-Prompt modal (`#modal-ai-guide`) features a segmented switcher defaulting to CLI / Command (`DEPLOY-CLI.md`) with zero-token-leak security, while offering traditional REST-API (`DEPLOY.md`) as an alternative.
7. **MCP:** `src/mcp.js` holds one tool set with two transports: stdio via `snaphost mcp` (CLI, can deploy local `path`) and stateless Streamable HTTP at `POST /mcp` (behind `requireAuth`, tools call the REST API over loopback with the caller's credentials). New API features should get a matching MCP tool there. Setup docs: `DEPLOY-CLI.md` §7.
