import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const config = {
  // Server Port & Host
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  // Domain Configuration
  // e.g. "apps.deinedomain.de" or "deinedomain.de" or "localhost"
  rootDomain: (process.env.ROOT_DOMAIN || 'localhost').toLowerCase().trim(),
  adminSubdomain: (process.env.ADMIN_SUBDOMAIN || 'admin').toLowerCase().trim(),

  // Authentication
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  jwtSecret: process.env.JWT_SECRET || 'snaphost-super-secret-key-change-me-in-production',

  // Storage
  dataDir: path.resolve(process.env.DATA_DIR || path.join(rootDir, 'data')),
  appsDir: path.resolve(process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'apps') : path.join(rootDir, 'data', 'apps')),
  dbPath: path.resolve(process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'snaphost.db') : path.join(rootDir, 'data', 'snaphost.db')),

  // Docker
  dockerSocket: process.env.DOCKER_SOCKET || (process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'),
  dockerNetwork: process.env.DOCKER_NETWORK || 'snaphost-net',
  dockerMemoryLimit: parseInt(process.env.DOCKER_MEMORY_LIMIT_MB || '512', 10) * 1024 * 1024, // 512 MB default

  // Janitor / TTL
  cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS || '60000', 10), // 1 min
  defaultTtl: process.env.DEFAULT_TTL || '24h',

  // Limits
  maxUploadSizeBytes: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '250', 10) * 1024 * 1024 // 250 MB
};
