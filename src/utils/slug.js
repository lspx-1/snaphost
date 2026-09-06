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

  // Convert to lowercase, replace spaces and underscores with dashes
  let slug = input.toLowerCase().trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug.length < 3) return null;
  if (slug.length > 48) slug = slug.substring(0, 48);
  if (isReservedSubdomain(slug)) return null;

  return slug;
}
