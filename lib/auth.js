// Minimal, dependency-free login: users from TEAM_USERS, HMAC-signed cookie.
const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) console.warn('[auth] SESSION_SECRET not set — logins reset on every restart.');

const USERS = new Map(
  (process.env.TEAM_USERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(':');
      return [pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1)];
    })
);
const ADMINS = new Set((process.env.ADMIN_USERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const COOKIE = 'vbsc';
const MAX_AGE_DAYS = 30;

function sign(v) { return crypto.createHmac('sha256', SECRET).update(v).digest('base64url'); }
function safeEq(a, b) {
  const A = Buffer.from(String(a)); const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, e: Date.now() + MAX_AGE_DAYS * 864e5 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function readToken(tok) {
  if (!tok || !tok.includes('.')) return null;
  const [payload, sig] = tok.split('.');
  if (!safeEq(sig, sign(payload))) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return e > Date.now() && USERS.has(u) ? u : null;
  } catch { return null; }
}
function parseCookies(h = '') {
  return Object.fromEntries(h.split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

function login(req, res) {
  const user = String((req.body && req.body.username) || '').trim().toLowerCase();
  const pass = String((req.body && req.body.password) || '');
  if (!USERS.has(user) || !safeEq(USERS.get(user), pass)) return res.status(401).json({ error: 'Wrong username or password' });
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${makeToken(user)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_DAYS * 86400}${secure ? '; Secure' : ''}`);
  res.json({ ok: true, user, admin: ADMINS.has(user) });
}
function logout(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
}
function requireAuth(req, res, next) {
  const user = readToken(parseCookies(req.headers.cookie)[COOKIE]);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  req.user = user;
  req.isAdmin = ADMINS.has(user);
  next();
}

if (!USERS.size) console.warn('[auth] TEAM_USERS is empty — nobody can log in. Set it in .env');

module.exports = { login, logout, requireAuth };
