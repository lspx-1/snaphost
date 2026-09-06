import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { appDb } from '../db.js';

/**
 * Generate a JWT token for logged-in admin
 */
export function generateAdminToken() {
  return jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: '30d' });
}

/**
 * Middleware: Verify Admin Session (Cookie or Bearer Token) OR API Key
 */
export function requireAuth(req, res, next) {
  // 1. Check API Key header
  const apiKey = req.headers['x-api-key'] || (req.headers.authorization && req.headers.authorization.startsWith('Bearer sh_') ? req.headers.authorization.slice(7).trim() : null);
  if (apiKey) {
    const validKey = appDb.validateApiKey(apiKey);
    if (validKey) {
      req.authType = 'api_key';
      req.apiKey = validKey;
      return next();
    }
  }

  // 2. Check JWT in Cookie or Authorization Header
  const token = req.cookies?.snaphost_token || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null);
  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      if (decoded.role === 'admin') {
        req.authType = 'session';
        req.user = decoded;
        return next();
      }
    } catch (err) {
      // Invalid token
    }
  }

  // If request is an API request, return 401 JSON
  if (req.path.startsWith('/api/') || req.baseUrl?.startsWith('/api') || req.originalUrl?.startsWith('/api') || req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Ungültiger oder fehlender Authentifizierungsschlüssel (API Key oder Login erforderlich)'
    });
  }

  // Otherwise redirect to login page
  res.redirect('/login');
}
