require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { loadIndex } = require('./lib/retrieval');
const { streamChat, chat, isRateLimit } = require('./lib/llm');
const { designPoster, designEnabled } = require('./lib/poster');
const auth = require('./lib/auth');
const store = require('./lib/chatStore');
const { runIngest, INDEX_PATH } = require('./lib/ingest');

const ON_VERCEL = Boolean(process.env.VERCEL); // serverless: read-only disk, no background timers
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use('/api/', rateLimit({ windowMs: 60_000, max: Number(process.env.MAX_REQUESTS_PER_MIN || 30), standardHeaders: true, legacyHeaders: false }));

// ───────────── Knowledge index (hot-reloads when the file changes) ─────────────
let index = loadIndex(INDEX_PATH);
let indexInfo = { loadedAt: Date.now(), ...index.stats() };
function reloadIndex() {
  index = loadIndex(INDEX_PATH);
  indexInfo = { loadedAt: Date.now(), ...index.stats() };
  console.log(`[index] loaded ${JSON.stringify(indexInfo)}`);
}
if (!ON_VERCEL) fs.watchFile(INDEX_PATH, { interval: 5000 }, (cur, prev) => { if (cur.mtimeMs !== prev.mtimeMs) reloadIndex(); });

// ───────────── Auto refresh (docs, website, Drive, knowledge/) ─────────────
const VERCEL_REFRESH_NOTE = 'This deployment runs on Vercel, where the knowledge index is read-only. To refresh it: run "npm run ingest" on your computer, then commit and push data/knowledge-index.json — Vercel redeploys automatically.';
let ingestState = { running: false, lastRun: null, lastResult: null, log: ON_VERCEL ? [VERCEL_REFRESH_NOTE] : [] };
async function refreshKnowledge(only) {
  if (ingestState.running) return false;
  ingestState = { ...ingestState, running: true, log: [] };
  const log = (m) => { console.log(m); ingestState.log.push(m); if (ingestState.log.length > 300) ingestState.log.shift(); };
  try {
    ingestState.lastResult = await runIngest({ only, log });
    reloadIndex();
  } catch (e) {
    log(`[ingest] FAILED ${e.message}`);
    ingestState.lastResult = { error: e.message };
  } finally {
    ingestState.running = false;
    ingestState.lastRun = Date.now();
  }
  return true;
}
const hours = Number(process.env.AUTO_REFRESH_HOURS || 24);
if (hours > 0 && !ON_VERCEL) {
  setInterval(() => refreshKnowledge(), hours * 3600_000).unref();
  // first run shortly after boot if the index is empty
  if (!indexInfo.chunks) setTimeout(() => refreshKnowledge(), 10_000).unref();
}

// ───────────── Prompt ─────────────
const BASELINE = `
VirtuBox (virtubox.io, by VirtuBox Infotech Pvt Ltd, Noida) is a cloud-based no-code platform for interactive experiences.
Product family as named in the official docs (docs.virtubox.io):
- VirtuKiosk — interactive touch-kiosk app (catalogues, wayfinding, self-ordering, forms, selfie/photo-print, screensavers, flash banners, floating buttons, heat-map & uptime analytics). Works offline with cached content.
- VirtuSignage — digital signage: playlists, scheduling, remote publishing to screens.
- VirtuApp (Android / iOS) and VirtuWeb — the same content delivered as mobile app and web experiences.
- Backend A1 (business.virtubox.io) and Backend A2 (console.virtubox.io) — cloud dashboards to manage kiosks, pages, files, orders, coupons, memberships, vouchers, workflows, push channels, SKUs.
- VirtuWare Kiosk / POS / Backend — the VirtuWare product line.
Known sales one-pagers in the team Drive: "VirtuBox - One Pager", "CGST Digital Kiosk - One Pager", "Customs Self-Declaration Kiosk - One Pager", "VirtuBox x Beegees Computers" (partner deck).
`;

const SYSTEM = `You are **VirtuBox Sales Copilot**, an internal assistant for the VirtuBox sales team. The person typing is a VirtuBox salesperson — often sitting in a live client meeting — who needs accurate, ready-to-say answers fast.

HOW TO ANSWER
- Lead with the direct answer in 1-2 sentences, then the supporting points. No preamble, no "Great question".
- Keep it scannable: short bullets, **bold** product/feature names, short tables when comparing.
- Write so the rep can read it aloud to a client: confident, plain business English, benefit-first ("so your visitors can…").
- When useful, end with a short "💬 Say this:" line (a one-sentence pitch the rep can use) and/or "❓ Ask the client:" (1-2 discovery questions).
- If the rep writes in Hindi or Hinglish, reply in the same style.

WHAT YOU HELP WITH
Product & feature questions · mapping VirtuBox to a client's industry/use case (retail, government, museums, events, F&B, hospitality, real estate, education, healthcare, corporate) · real deployments and case studies from the one-pagers · objection handling · demo scripts · discovery questions · follow-up emails / WhatsApp messages · shareable banners (the rep types "create a banner for …" and gets an image) · proposal and solution outlines · technical answers for IT teams (hardware, offline mode, integrations, admin panels).

ACCURACY RULES (very important — a wrong answer in front of a client hurts the deal)
1. Use only the KNOWLEDGE below for facts about VirtuBox: features, clients, deployments, numbers, specs. Prefer excerpts from Drive one-pagers and docs over the baseline.
2. NEVER invent prices, discounts, SLAs, delivery timelines, client names, certifications or integrations. If it's not in the knowledge, say "Not in our material — confirm with the product/pricing team" and suggest what to tell the client meanwhile (e.g. "we'll share a tailored quote after understanding screen count and modules").
3. It is fine to add general sales/consulting reasoning (how a kiosk helps a use case, how to frame ROI) — but make clear it's a suggestion, not a documented VirtuBox fact.
4. Cite where facts came from with the source titles in brackets, e.g. [CGST Digital Kiosk - One Pager] or [Docs: Kiosk Screensavers].
5. When an excerpt labelled "Drive:" is relevant, name that one-pager and tell the rep they can open it from the card under the answer to show or send to the client. If an excerpt is marked [not transcribed], only its file name is known: recommend opening it but do not state what it contains.
6. Stay on VirtuBox and selling it. For unrelated requests, briefly steer back.`;

function buildSystemPrompt(chunks, style) {
  const excerpts = chunks.length
    ? chunks.map((c, i) => `[${i + 1}] ${labelFor(c)}\nURL: ${c.url}\n${c.text}`).join('\n\n---\n\n')
    : '(no matching excerpts found)';
  const len = style === 'detailed'
    ? 'The rep asked for a DETAILED answer: be thorough, use sections.'
    : 'MEETING MODE: keep the answer under ~150 words unless the rep asks for a document (email, proposal, script).';
  return `${SYSTEM}\n\n${len}\n\n<baseline>\n${BASELINE}\n</baseline>\n\n<knowledge_excerpts>\n${excerpts}\n</knowledge_excerpts>`;
}

// ───────────── Banners ─────────────
// "create a banner for the print kiosk" → the model writes the copy as JSON and the browser draws the image.
// Needs an ask ("create/make/need … banner"), so questions about the kiosk "flash banner" feature stay normal chat.
const BANNER_WORD = /\b(banners?|posters?|flyers?|infographics?|creatives?|(whatsapp|wa|insta(gram)?)\s+(status|stor(y|ies)))\b/i;
const STORY_WORD = /\b(infographics?|(whatsapp|wa|insta(gram)?)\s+(status|stor(y|ies))|stor(y|ies)|9:16)\b/i; // tall 9:16 layout
const BANNER_ASK = /\b(create|make|generate|design|build|prepare|draft|give|send|need|want|get|change|update|edit|redo|shorten|add|remove|bana\w*|chahiye)\b/i;
const isBannerRequest = (m) => BANNER_WORD.test(m) && BANNER_ASK.test(m) && !/\bflash banners?\b/i.test(m);
const BANNER_SYSTEM = `You write the copy for a VirtuBox sales banner or infographic: one portrait image a salesperson posts as a WhatsApp status or sends to a client.
For an infographic or story, give 5 to 6 features and fill specs and ideal whenever the knowledge allows, so the image is rich with real content.
Return ONLY a JSON object, no markdown and no commentary, in exactly this shape:
{"title":"","tagline":"","features":[{"title":"","text":""}],"specs":[{"label":"","value":""}],"ideal":"","cta":"","caption":"","poster":{"headline":"","emphasis":"","motto":["","",""],"pitch":["",""],"highlights":["","","",""],"idealFor":["","","","",""],"benefits":["","",""],"closing":"","contacts":[{"name":"","phone":""}]}}

The salesperson may describe a NEED (an event, a store, a hospital, a government office) instead of naming a product. Then choose the VirtuBox solution or solutions the knowledge says fit that need, and name them in title.

- title: the product or solution name, at most 4 words. Do not prefix it with "VirtuBox".
- tagline: one benefit-led sentence for the client, at most 16 words.
- features: 4 to 6 client benefits, each with a title of at most 3 words and a text of at most 10 words.
- specs: 0 to 9 hardware or technical details (label at most 3 words, value at most 4 words). Include a spec ONLY if it is stated in the knowledge. If none are stated, return [].
- ideal: one line starting "Ideal for", listing ONLY places or industries that the knowledge names for this exact product, at most 16 words. If the knowledge names none, return "".
- When the knowledge has a specifications list for this product, always fill specs from it.
- cta: at most 5 words, e.g. "Book a free demo".
- If the salesperson typed their own wording, details or offer in the request, use it as they wrote it.
- caption: a 2-3 sentence WhatsApp message to send with the image.
- poster: copy for the AI-designed poster, same accuracy rules.
  - headline: at most 5 words, the hook for the need the salesperson described, e.g. "Make Your Event More". emphasis: at most 4 words that finish the hook in bold, e.g. "Engaging & Informative!".
  - motto: exactly 3 single words, e.g. "Inform","Engage","Inspire".
  - pitch: 2 short lines. pitch[0] at most 5 words, pitch[1] at most 7 words, the thing to showcase, e.g. "The Perfect Platform to" / "Showcase Your Information & Content".
  - highlights: 4 items, each at most 4 words, what the solution does for the client.
  - idealFor: up to 5 items, each at most 3 words, ONLY uses or places the knowledge names for these products. Fewer is fine; [] if none.
  - benefits: 3 items, each at most 3 words, e.g. "Easy Setup", "Dedicated Support".
  - closing: at most 8 words, a closing line.
  - contacts: ONLY names and phone numbers the salesperson typed in the request. Otherwise [].

ACCURACY: every factual claim (features, specs, numbers, client names) must come from the knowledge below. Never invent prices, specs, numbers, certifications or client names, and never include a price unless the salesperson typed it in their request. If the knowledge says little about this product, keep the points general and true to what is there. An excerpt marked [not transcribed] gives a file name only: do not guess its contents.
If the salesperson asks to change an earlier banner, apply the change and return the full JSON again. Write in the language the salesperson used.`;

const posterStr = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const posterList = (v, count, n) => (Array.isArray(v) ? v : []).map((x) => posterStr(x, n)).filter(Boolean).slice(0, count);
function cleanPoster(p) {
  p = p && typeof p === 'object' ? p : {};
  return {
    headline: posterStr(p.headline, 40), emphasis: posterStr(p.emphasis, 36),
    motto: posterList(p.motto, 3, 16), pitch: posterList(p.pitch, 2, 48),
    highlights: posterList(p.highlights, 4, 30), idealFor: posterList(p.idealFor, 5, 26), benefits: posterList(p.benefits, 3, 24),
    closing: posterStr(p.closing, 70),
    contacts: (Array.isArray(p.contacts) ? p.contacts : []).map((c) => ({ name: posterStr(c && c.name, 30), phone: posterStr(c && c.phone, 20) })).filter((c) => c.phone).slice(0, 3),
  };
}

function parseBanner(raw, story) {
  const s = String(raw || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('The AI did not return banner content. Please try again.');
  let j;
  try { j = JSON.parse(s.slice(a, b + 1)); } catch { throw new Error('The AI returned banner content that could not be read. Please try again.'); }
  const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const banner = {
    title: str(j.title, 60),
    tagline: str(j.tagline, 140),
    features: (Array.isArray(j.features) ? j.features : []).map((f) => (f && typeof f === 'object' ? { title: str(f.title, 34), text: str(f.text, 90) } : { title: '', text: str(f, 120) })).filter((f) => f.title || f.text).slice(0, 6),
    specs: (Array.isArray(j.specs) ? j.specs : []).map((x) => ({ label: str(x && x.label, 28), value: str(x && x.value, 40) })).filter((x) => x.label && x.value).slice(0, 9),
    ideal: str(j.ideal, 150),
    cta: str(j.cta, 44) || 'Book a free demo',
    caption: str(j.caption, 600),
    poster: cleanPoster(j.poster),
  };
  banner.format = story ? 'story' : 'post';
  if (!banner.title || !banner.features.length) throw new Error('The AI returned an incomplete banner. Please try again.');
  return banner;
}

// The banner's product photo comes from the best-matching Drive one-pager.
const BANNER_CROPS = require('./lib/bannerCrops.json');
const driveId = (url) => (String(url).match(/\/d\/([\w-]+)/) || [])[1];
function bannerImage(sources, prev) {
  const s = sources.find((x) => x.source === 'drive' && driveId(x.url));
  if (!s) return prev || null; // an edit like "make the headline shorter" keeps the earlier photo
  const id = driveId(s.url);
  return { id, crop: BANNER_CROPS[id] || null, title: s.title };
}
// Up to three matching one-pagers, shown to the AI image model as product photos.
function bannerPhotos(sources, prev) {
  const ids = [...new Set(sources.filter((x) => x.source === 'drive' && driveId(x.url)).map((x) => driveId(x.url)))].slice(0, 3);
  return ids.length ? ids : prev || [];
}

async function makeBanner(message, chunks, history, story) {
  const excerpts = chunks.length ? chunks.map((c, i) => `[${i + 1}] ${labelFor(c)}\n${c.text}`).join('\n\n---\n\n') : '(no matching excerpts found)';
  const raw = await chat([
    { role: 'system', content: `${BANNER_SYSTEM}\n\n<baseline>\n${BASELINE}\n</baseline>\n\n<knowledge_excerpts>\n${excerpts}\n</knowledge_excerpts>` },
    ...history,
    { role: 'user', content: message },
  ], { temperature: 0.3, max_tokens: 1500 });
  return parseBanner(raw, story);
}

function bannerText(b) {
  return `**Banner ready: ${b.title}**\n\n${b.caption || b.tagline}\n\n_Check the details against the one-pager before sending it to a client. To change it, just say so, e.g. "make the banner headline shorter"._`;
}

function sourceOf(c) {
  if (c.source) return c.source;
  return String(c.url).includes('docs.virtubox.io') ? 'docs' : 'website';
}
function labelFor(c) {
  const s = sourceOf(c);
  const prefix = s === 'drive' ? 'Drive' : s === 'local' ? 'Sales file' : s === 'docs' ? 'Docs' : 'Website';
  return `${prefix}: ${c.title}`;
}

// ───────────── Routes ─────────────
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()), index: indexInfo }));

app.use('/api', auth.identify);

app.get('/api/me', (req, res) => res.json({ admin: req.isAdmin, index: indexInfo, imageGen: designEnabled() }));
app.get('/api/library', (req, res) => res.json(index.library()));

// One-pager preview for banners, served from our own address so the browser may draw it into the image.
// Only files that are in the knowledge index can be fetched.
app.get('/api/thumb/:id', wrap(async (req, res) => {
  const id = req.params.id;
  if (!index.library().some((d) => d.source === 'drive' && driveId(d.url) === id)) return res.status(404).end();
  const img = await fetchThumb(id, 1600);
  if (!img) return res.status(502).end();
  res.set({ 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=86400, s-maxage=604800' });
  res.send(img.data);
}));

async function fetchThumb(id, size) {
  const r = await fetch(`https://drive.google.com/thumbnail?id=${id}&sz=w${size}`, { redirect: 'follow' });
  const type = r.headers.get('content-type') || '';
  if (!r.ok || !type.startsWith('image/')) return null;
  return { mime: type.split(';')[0], data: Buffer.from(await r.arrayBuffer()) };
}

// AI-designed version of a banner: Claude designs the whole poster as an SVG (see lib/poster.js); the browser turns it into a PNG.
const aiLimit = rateLimit({ windowMs: 60_000, max: Number(process.env.MAX_DESIGN_REQUESTS_PER_MIN || 6), standardHeaders: true, legacyHeaders: false });
app.post('/api/banner-image', aiLimit, wrap(async (req, res) => {
  if (!designEnabled()) return res.status(501).json({ error: 'AI design is not set up on this server (ANTHROPIC_API_KEY).' });
  const b = (req.body && req.body.banner) || {};
  const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const banner = {
    title: str(b.title, 60), tagline: str(b.tagline, 150), ideal: str(b.ideal, 150), cta: str(b.cta, 44),
    format: b.format === 'story' ? 'story' : 'post',
    poster: cleanPoster(b.poster),
    look: b.look === 'light' ? 'light' : 'blue',
    features: (Array.isArray(b.features) ? b.features : []).slice(0, 6).map((f) => ({ title: str(f && f.title, 34), text: str(f && f.text, 90) })).filter((f) => f.title || f.text),
    specs: (Array.isArray(b.specs) ? b.specs : []).slice(0, 9).map((x) => ({ label: str(x && x.label, 28), value: str(x && x.value, 40) })).filter((x) => x.label && x.value),
  };
  if (!banner.title) return res.status(400).json({ error: 'banner title is required' });
  const wanted = [...new Set([...(Array.isArray(b.photos) ? b.photos : []), b.image && b.image.id].filter((x) => typeof x === 'string'))].slice(0, 3);
  const ok = wanted.filter((id) => index.library().some((d) => d.source === 'drive' && driveId(d.url) === id));
  const product = (await Promise.all(ok.map(async (id) => { const t = await fetchThumb(id, 1000).catch(() => null); return t && { ...t, crop: BANNER_CROPS[id] || null }; }))).filter(Boolean);
  try {
    const out = await designPoster(banner, product);
    res.json({ svg: out.svg });
  } catch (err) {
    console.error('[banner-image]', err.message);
    res.status(502).json({ error: err.message });
  }
}));

app.get('/api/chats', wrap(async (req, res) => res.json(await store.list(req.user))));
app.get('/api/chats/:id', wrap(async (req, res) => {
  const c = await store.get(req.user, req.params.id);
  return c ? res.json(c) : res.status(404).json({ error: 'not found' });
}));
app.patch('/api/chats/:id', wrap(async (req, res) => {
  const c = await store.update(req.user, req.params.id, req.body || {});
  return c ? res.json({ ok: true }) : res.status(404).json({ error: 'not found' });
}));
app.delete('/api/chats/:id', wrap(async (req, res) => { await store.remove(req.user, req.params.id); res.json({ ok: true }); }));

// Streaming chat (Server-Sent Events)
app.post('/api/chat', wrap(async (req, res) => {
  const { message, chatId, style = 'quick' } = req.body || {};
  if (!message || typeof message !== 'string' || message.length > 6000) return res.status(400).json({ error: 'message is required (max 6000 chars)' });

  let convo = chatId ? await store.get(req.user, chatId) : null;
  const isNew = !convo;
  if (!convo) convo = await store.create(req.user, message.slice(0, 60));

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  send({ chatId: convo.id, isNew });
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);

  // Retrieval: include the previous user turn so follow-ups ("what about pricing?") keep context
  const prevUser = [...convo.messages].reverse().find((m) => m.role === 'user');
  const chunks = index.search(`${message} ${prevUser ? prevUser.content : ''}`, 7);
  const sources = dedupeSources(chunks);
  send({ sources });

  // earlier banners are replayed as their JSON so "change the headline" edits the same banner
  const history = convo.messages.slice(-12).map((m) => ({ role: m.role, content: m.banner ? JSON.stringify(m.banner) : m.content }));
  const wantsBanner = isBannerRequest(message);
  const messages = [{ role: 'system', content: buildSystemPrompt(chunks, style) }, ...history, { role: 'user', content: message }];

  let aborted = false;
  res.on('close', () => { aborted = true; });
  try {
    if (wantsBanner) {
      // a banner needs the whole product sheet (specs, use cases), not just the best-matching part of it
      const sheetUrls = new Set(chunks.filter((c) => c.source === 'local' || c.source === 'drive').slice(0, 3).map((c) => c.url));
      const sheet = index.docs.filter((d) => sheetUrls.has(d.url) && !chunks.includes(d)).slice(0, 8);
      const prevBanner = [...convo.messages].reverse().find((m) => m.banner);
      // an edit ("make the headline shorter") keeps the earlier banner's shape unless the rep names a new one
      const story = STORY_WORD.test(message) || (!BANNER_WORD.test(message) ? false : /\b(post|banner|poster|flyer)\b/i.test(message) ? false : !!(prevBanner && prevBanner.banner.format === 'story'));
      const banner = await makeBanner(message, [...chunks, ...sheet], history, story);
      // match the photo on this request alone, so an earlier turn's product does not leak in
      const own = dedupeSources(index.search(message, 7));
      const image = bannerImage(own, prevBanner && prevBanner.banner.image);
      if (image) banner.image = image;
      banner.photos = bannerPhotos(own, prevBanner && prevBanner.banner.photos);
      const text = bannerText(banner);
      if (!aborted) { send({ banner }); send({ delta: text }); }
      await store.append(req.user, convo.id, { role: 'user', content: message }, { role: 'assistant', content: text, sources, banner });
    } else {
      const { text, provider } = await streamChat(messages, (d) => { if (!aborted) send({ delta: d }); }, { max_tokens: style === 'detailed' ? 2500 : 1200 });
      await store.append(req.user, convo.id, { role: 'user', content: message }, { role: 'assistant', content: text, sources, provider });
    }
    if (isNew) {
      // awaited (not fire-and-forget) so it also completes on serverless, where work after the response is cut off
      await makeTitle(message).then((t) => t && store.update(req.user, convo.id, { title: t })).catch(() => {});
    }
    send({ done: true });
  } catch (err) {
    console.error('[chat]', err.message);
    send({ error: isRateLimit(err) ? 'The AI is busy (rate limit). Try again in a few seconds.' : `Error: ${err.message}` });
    if (isNew) await store.remove(req.user, convo.id).catch(() => {});
  } finally {
    clearInterval(ping);
    res.end();
  }
}));

function dedupeSources(chunks) {
  const seen = new Set();
  return chunks.filter((c) => !seen.has(c.url) && seen.add(c.url)).map((c) => ({ title: c.title, url: c.url, source: sourceOf(c) }));
}

async function makeTitle(message) {
  const t = await chat([
    { role: 'system', content: 'Write a 3-6 word title for this sales chat. Return only the title, no quotes.' },
    { role: 'user', content: message.slice(0, 500) },
  ]);
  return String(t || '').replace(/["*#]/g, '').trim().slice(0, 60);
}

// Admin: refresh knowledge from the UI
app.post('/api/admin/refresh', (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'admin only' });
  if (ON_VERCEL) return res.json({ ok: false, message: VERCEL_REFRESH_NOTE });
  const only = Array.isArray(req.body && req.body.only) ? req.body.only : undefined;
  if (ingestState.running) return res.json({ ok: false, message: 'Already running' });
  refreshKnowledge(only);
  res.json({ ok: true, message: 'Refresh started' });
});
app.get('/api/admin/status', (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: 'admin only' });
  res.json({ ...ingestState, index: indexInfo });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// JSON errors for anything thrown in a route (e.g. chat store unreachable)
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return res.end();
  res.status(500).json({ error: 'Server error. Please try again.' });
});

module.exports = app; // used by api/index.js on Vercel

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3000);
  const server = app.listen(PORT, () => console.log(`VirtuBox Sales Copilot on http://localhost:${PORT}  (index: ${JSON.stringify(indexInfo)})`));

  // Graceful shutdown for PM2 / systemd restarts
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
}
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
