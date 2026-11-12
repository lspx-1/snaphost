/**
 * Self-Update für den Produktionsserver (Auto-Deploy über GitHub Actions).
 *
 * Ablauf: Push/Merge auf main -> .github/workflows/deploy.yml -> POST /api/system/update
 * mit einem GitHub-OIDC-Token -> git pull --ff-only, ggf. npm install -> Prozess beendet
 * sich, systemd (Restart=always) startet ihn mit dem neuen Code.
 *
 * Kein geteiltes Secret: GitHub signiert das OIDC-Token, wir prüfen Signatur,
 * Audience, Repository und Branch.
 */

import crypto from 'crypto';
import path from 'path';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const run = promisify(execFile);
const runShell = promisify(exec);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
export const OIDC_AUDIENCE = 'snaphost-deploy';
const BRANCH = process.env.UPDATE_BRANCH || 'main';

async function git(...args) {
  const { stdout } = await run('git', args, { cwd: rootDir });
  return stdout.trim();
}

// Commit, mit dem dieser Prozess gestartet wurde (nicht der aktuelle Stand auf der Platte)
const runningSha = await git('rev-parse', 'HEAD').catch(() => null);
const startedAt = new Date().toISOString();

// Erlaubtes Repo: UPDATE_REPO oder aus der eigenen origin-URL (github.com/owner/repo)
let allowedRepo = process.env.UPDATE_REPO || null;
if (!allowedRepo) {
  const url = await git('remote', 'get-url', 'origin').catch(() => '');
  allowedRepo = url.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i)?.[1] || null;
}

export function getVersion() {
  return { sha: runningSha, branch: BRANCH, startedAt, repo: allowedRepo };
}

// -------------------------------------------------------------
// GitHub-OIDC-Token prüfen
// -------------------------------------------------------------
let jwks = { keys: new Map(), fetchedAt: 0 };

async function getSigningKey(kid) {
  // Bei unbekannter Key-ID neu laden (GitHub rotiert Schlüssel), höchstens 1x pro Minute
  if (!jwks.keys.has(kid) && Date.now() - jwks.fetchedAt > 60_000) {
    const res = await fetch(`${OIDC_ISSUER}/.well-known/jwks`);
    if (!res.ok) throw new Error(`GitHub-JWKS nicht abrufbar (HTTP ${res.status})`);
    const { keys } = await res.json();
    jwks = {
      keys: new Map(keys.map((k) => [k.kid, crypto.createPublicKey({ key: k, format: 'jwk' })])),
      fetchedAt: Date.now()
    };
  }
  return jwks.keys.get(kid);
}

export async function verifyGithubOidc(token) {
  if (!allowedRepo) {
    throw new Error('Auto-Update nicht konfiguriert: origin ist kein GitHub-Repo (UPDATE_REPO setzen).');
  }
  const decoded = token ? jwt.decode(token, { complete: true }) : null;
  if (!decoded?.header?.kid) throw new Error('Kein GitHub-OIDC-Token');

  const key = await getSigningKey(decoded.header.kid);
  if (!key) throw new Error('Unbekannter Signaturschlüssel');

  const claims = jwt.verify(token, key, {
    algorithms: ['RS256'],
    issuer: OIDC_ISSUER,
    audience: OIDC_AUDIENCE
  });
  if (String(claims.repository).toLowerCase() !== allowedRepo.toLowerCase()) {
    throw new Error(`Repository ${claims.repository} ist nicht berechtigt`);
  }
  if (claims.ref !== `refs/heads/${BRANCH}`) {
    throw new Error(`Nur Deploys von ${BRANCH} sind erlaubt (nicht ${claims.ref})`);
  }
  return claims;
}

// -------------------------------------------------------------
// Update ausführen
// -------------------------------------------------------------
let busy = false;

export async function pullAndInstall(requestedSha) {
  if (busy) throw new Error('Es läuft bereits ein Update');
  busy = true;
  const log = [];
  try {
    const before = await git('rev-parse', 'HEAD');
    log.push(await git('pull', '--ff-only', 'origin', BRANCH));
    const after = await git('rev-parse', 'HEAD');

    if (before !== after) {
      const changed = await git('diff', '--name-only', before, after, '--', 'package.json', 'package-lock.json');
      if (changed) {
        const { stdout } = await runShell('npm install --omit=dev --no-audit --no-fund', { cwd: rootDir, timeout: 5 * 60_000 });
        log.push(stdout.trim());
      }
    }

    let containsRequested = true;
    if (requestedSha && /^[0-9a-f]{7,40}$/i.test(requestedSha)) {
      containsRequested = await git('merge-base', '--is-ancestor', requestedSha, 'HEAD').then(() => true, () => false);
    }

    // Neustart nur, wenn wir unter systemd laufen – sonst käme der Prozess nicht zurück
    const underSystemd = !!process.env.INVOCATION_ID;
    const restarting = after !== runningSha && underSystemd;

    return {
      before,
      after,
      running: runningSha,
      containsRequested,
      restarting,
      note: after !== runningSha && !underSystemd ? 'Kein systemd erkannt: Server bitte manuell neu starten.' : undefined,
      log: log.filter(Boolean).join('\n')
    };
  } catch (err) {
    throw new Error(`${err.cmd || 'Update'} fehlgeschlagen:\n${(err.stderr || '').trim() || err.message}`);
  } finally {
    busy = false;
  }
}

export function restartSoon() {
  console.log('[Updater] Neuer Code installiert – Neustart über systemd...');
  setTimeout(() => process.exit(0), 1000);
}
