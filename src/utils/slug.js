const adjectives = [
  'swift', 'brave', 'clever', 'quiet', 'sunny', 'cosmic', 'neon', 'hyper',
  'turbo', 'cool', 'wild', 'epic', 'pixel', 'magic', 'prime', 'stellar',
  'amber', 'cyber', 'polar', 'shadow', 'silver', 'golden', 'rapid', 'vivid',
  'spark', 'frost', 'nova', 'breezy', 'mystic', 'bright', 'bold', 'astro'
];

const nouns = [
  'fox', 'falcon', 'badger', 'tiger', 'dragon', 'panda', 'otter', 'robot',
  'comet', 'galaxy', 'rocket', 'quest', 'realm', 'pixel', 'oasis', 'vortex',
  'beacon', 'orbit', 'pulse', 'spark', 'hawk', 'lynx', 'wolf', 'atlas',
  'phoenix', 'nebula', 'horizon', 'nexus', 'circuit', 'forge', 'drift', 'matrix'
];

const reservedSubdomains = new Set([
  'admin', 'api', 'app', 'apps', 'dashboard', 'login', 'logout', 'root',
  'www', 'mail', 'smtp', 'imap', 'ftp', 'ssh', 'dns', 'ns', 'ns1', 'ns2',
  'static', 'cdn', 'assets', 'ws', 'wss', 'proxy', 'preview', 'deploy', 'snaphost'
]);

/**
 * Generate a random, human-friendly slug like "swift-falcon-42"
 */
export function generateSlug() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10 - 99
  return `${adj}-${noun}-${num}`;
}

/**
 * Check if a subdomain is reserved by the system
 */
export function isReservedSubdomain(subdomain) {
  if (!subdomain) return true;
  return reservedSubdomains.has(subdomain.toLowerCase());
}

/**
 * Sanitize and validate custom subdomain
 */
export function sanitizeSubdomain(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  // Convert to lowercase, replace spaces, underscores, and dots with dashes
  let slug = input.toLowerCase().trim()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length < 3) return null;
  if (slug.length > 48) slug = slug.substring(0, 48).replace(/-+$/, '');
  if (isReservedSubdomain(slug)) return null;

  return slug;
}

/**
 * Strip common archive and document extensions from a filename
 * and return a sanitized base candidate, or null if invalid/reserved.
 */
export function extractBaseSlug(filename) {
  if (!filename || typeof filename !== 'string') return null;

  // Extract base filename without directory path (handles / and \)
  const rawName = filename.split(/[/\\]/).pop().trim();
  if (!rawName) return null;

  // Strip archive and document extensions
  const stripped = rawName
    .replace(/\.(tar\.(gz|bz2|xz)|zip|tgz|tar|html|htm)$/i, '')
    .trim();

  return sanitizeSubdomain(stripped);
}

/**
 * Resolve a unique slug given a candidate base slug and an existence check function.
 * - If candidateSlug is free, returns candidateSlug.
 * - If candidateSlug is taken, tries candidateSlug-2, candidateSlug-3, ... candidateSlug-99.
 * - If all are taken or candidateSlug is null, falls back gracefully.
 */
export function resolveUniqueSlug(candidateSlug, existsCheckFn) {
  if (!candidateSlug || typeof existsCheckFn !== 'function') {
    return generateSlug();
  }

  if (!existsCheckFn(candidateSlug)) {
    return candidateSlug;
  }

  for (let i = 2; i <= 99; i++) {
    const nextCandidate = `${candidateSlug}-${i}`;
    if (!existsCheckFn(nextCandidate)) {
      return nextCandidate;
    }
  }

  const randomSuffix = Math.floor(Math.random() * 900) + 100;
  const fallback = `${candidateSlug}-${randomSuffix}`;
  if (!existsCheckFn(fallback)) {
    return fallback;
  }

  return generateSlug();
}

