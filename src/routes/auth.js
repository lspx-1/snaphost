import express from 'express';
import { config } from '../config.js';
import { generateAdminToken } from '../middleware/auth.js';

export const authRouter = express.Router();

// Admin Login
authRouter.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== config.adminPassword) {
    return res.status(401).json({
      success: false,
      error: 'Ungültiges Administrator-Passwort'
    });
  }

  const token = generateAdminToken();

  res.cookie('snaphost_token', token, {
    httpOnly: true,
    secure: false, // will work over HTTP & HTTPS behind reverse proxy
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });

  return res.json({
    success: true,
    token,
    message: 'Erfolgreich angemeldet'
  });
});

// Admin Logout
authRouter.post('/logout', (req, res) => {
  res.clearCookie('snaphost_token');
  res.json({ success: true, message: 'Erfolgreich abgemeldet' });
});

// Check Session Status
authRouter.get('/me', (req, res) => {
  const token = req.cookies?.snaphost_token;
  if (!token) {
    return res.json({ authenticated: false });
  }
  try {
    return res.json({ authenticated: true, role: 'admin' });
  } catch (_) {
    return res.json({ authenticated: false });
  }
});
