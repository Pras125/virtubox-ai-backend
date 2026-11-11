// No login: anyone with the link can use the app. Each browser gets a random anonymous id
// in a cookie, so every device keeps its own separate chat history.
const crypto = require('crypto');

const COOKIE = 'vbsc_id';
const MAX_AGE_DAYS = 365;

function parseCookies(h = '') {
  return Object.fromEntries(h.split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

function identify(req, res, next) {
  let id = parseCookies(req.headers.cookie)[COOKIE];
  if (!/^[0-9a-f-]{36}$/.test(id || '')) {
    id = crypto.randomUUID();
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_DAYS * 86400}${secure ? '; Secure' : ''}`);
  }
  req.user = `guest-${id}`;
  req.isAdmin = false; // no logins, so no admin; refresh knowledge with `npm run ingest`
  next();
}

module.exports = { identify };
