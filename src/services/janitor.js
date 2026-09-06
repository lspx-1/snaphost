import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { appDb } from '../db.js';
import { dockerService } from './docker.js';

let intervalId = null;

async function checkAndCleanExpiredApps() {
  try {
    const expiredApps = appDb.getExpiredApps();
    if (expiredApps.length === 0) return;

    console.log(`[Janitor] Bereinige ${expiredApps.length} abgelaufene App(s)...`);

    for (const app of expiredApps) {
      console.log(`[Janitor] App abgelaufen: ${app.subdomain} (ID: ${app.id}, TTL: ${app.ttl})`);

      // 1. Stop & remove Docker container if dynamic
      if (app.type === 'docker' && app.container_id) {
        await dockerService.stopAndRemove(app.container_id);
      }

      // 2. Clean up files
      const appDir = path.join(config.appsDir, app.id);
      try {
        if (fs.existsSync(appDir)) {
          fs.rmSync(appDir, { recursive: true, force: true });
        }
      } catch (fsErr) {
        console.warn(`[Janitor] Warnung beim Löschen von ${appDir}:`, fsErr.message);
      }

      // 3. Mark as expired in DB
      appDb.updateApp(app.id, {
        status: 'expired',
        container_id: null
      });

      console.log(`[Janitor] App ${app.subdomain} erfolgreich bereinigt.`);
    }
  } catch (err) {
    console.error('[Janitor] Fehler während Bereinigungszyklus:', err);
  }
}

export const janitor = {
  start() {
    if (intervalId) return;
    console.log(`[Janitor] Hintergrund-Bereinigung aktiv (Intervall: ${config.cleanupIntervalMs / 1000}s)`);
    // Run once after 5 seconds, then periodically
    setTimeout(checkAndCleanExpiredApps, 5000);
    intervalId = setInterval(checkAndCleanExpiredApps, config.cleanupIntervalMs);
  },

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  },

  triggerNow() {
    return checkAndCleanExpiredApps();
  }
};
