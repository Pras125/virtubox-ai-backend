// Per-user chat history.
//   • Redis (Upstash / Vercel KV REST API) when KV_REST_API_URL + KV_REST_API_TOKEN
//     (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) are set — required for durable history on Vercel.
//   • Otherwise JSON files in data/chats/<user>.json (on Vercel: /tmp, which is wiped between cold starts).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const REDIS_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const USE_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);

const DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'vbsc-chats') : path.join(__dirname, '..', 'data', 'chats');
if (!USE_REDIS) {
  fs.mkdirSync(DIR, { recursive: true });
  if (process.env.VERCEL) console.warn('[chats] No Redis configured — chat history on Vercel is temporary. Add an Upstash Redis integration.');
}
const MAX_CHATS = 200;

const safe = (user) => user.replace(/[^a-z0-9_.-]/gi, '_');
const file = (user) => path.join(DIR, `${safe(user)}.json`);
const key = (user) => `vbsc:chats:${safe(user)}`;

async function redis(cmd) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Redis: ${j.error || `HTTP ${res.status}`}`);
  return j.result;
}

async function load(user) {
  try {
    if (USE_REDIS) return JSON.parse((await redis(['GET', key(user)])) || '[]');
    return JSON.parse(fs.readFileSync(file(user), 'utf8'));
  } catch (e) {
    if (USE_REDIS) throw e; // don't overwrite real history with [] after a network blip
    return [];
  }
}
async function save(user, chats) {
  const data = JSON.stringify(chats.slice(0, MAX_CHATS));
  if (USE_REDIS) { await redis(['SET', key(user), data]); return; }
  const tmp = file(user) + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file(user));
}

module.exports = {
  backend: USE_REDIS ? 'redis' : process.env.VERCEL ? 'tmp' : 'file',
  async list(user) {
    return (await load(user)).map(({ id, title, updatedAt, pinned }) => ({ id, title, updatedAt, pinned: !!pinned }));
  },
  async get(user, id) {
    return (await load(user)).find((c) => c.id === id) || null;
  },
  async create(user, title = 'New chat') {
    const chats = await load(user);
    const c = { id: crypto.randomUUID(), title, createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    chats.unshift(c);
    await save(user, chats);
    return c;
  },
  async append(user, id, ...msgs) {
    const chats = await load(user);
    const i = chats.findIndex((c) => c.id === id);
    if (i < 0) return null;
    const c = chats[i];
    c.messages.push(...msgs.map((m) => ({ ...m, at: Date.now() })));
    c.updatedAt = Date.now();
    chats.splice(i, 1);
    chats.unshift(c);
    await save(user, chats);
    return c;
  },
  async update(user, id, patch) {
    const chats = await load(user);
    const c = chats.find((x) => x.id === id);
    if (!c) return null;
    if (typeof patch.title === 'string') c.title = patch.title.slice(0, 80);
    if (typeof patch.pinned === 'boolean') c.pinned = patch.pinned;
    await save(user, chats);
    return c;
  },
  async remove(user, id) {
    await save(user, (await load(user)).filter((c) => c.id !== id));
  },
};
