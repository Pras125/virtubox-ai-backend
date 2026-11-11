// Reads every file in the shared Google Drive folder (recursively).
// With GOOGLE_API_KEY it uses the Drive API; without one it reads the public folder page directly
// (the folder must be shared as "Anyone with the link can view").
// - PDFs          → text via pdf-parse
// - PNG/JPG       → text via Groq vision model (one-pagers are images)
// - Google Docs   → exported as plain text
// - Google Slides → exported as plain text
// - Google Sheets → exported as CSV
// Results are cached by file id + modifiedTime, so unchanged files are never re-processed.
const fs = require('fs');
const path = require('path');
const { toChunks, pdfToText } = require('./util');
const cheerio = require('cheerio');
const { describeImage } = require('../llm');

const API = 'https://www.googleapis.com/drive/v3';
const CACHE_PATH = path.join(__dirname, '..', '..', 'data', 'drive-cache.json');
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024; // Groq base64 image limit is ~4MB

const EXPORTS = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};

async function api(p, key, asBuffer = false) {
  const url = `${API}${p}${p.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Drive API ${r.status}: ${body.slice(0, 200)}`);
  }
  return asBuffer ? Buffer.from(await r.arrayBuffer()) : r.json();
}

async function listFolder(folderId, key, prefix = '') {
  const out = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const j = await api(`/files?q=${q}&pageSize=200&fields=nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)${pageToken ? `&pageToken=${pageToken}` : ''}&supportsAllDrives=true&includeItemsFromAllDrives=true`, key);
    for (const f of j.files || []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') out.push(...(await listFolder(f.id, key, `${prefix}${f.name}/`)));
      else out.push({ ...f, path: prefix + f.name });
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

// ── No-API-key mode: scrape the public folder listing and download through public links ──
const UA = 'Mozilla/5.0 (VirtuBoxSalesCopilot knowledge indexer)';
async function publicGet(url, asBuffer = false) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!r.ok) throw new Error(`Drive ${r.status} for ${url.slice(0, 80)}`);
  return asBuffer ? Buffer.from(await r.arrayBuffer()) : r.text();
}

async function listPublicFolder(folderId, prefix = '') {
  const $ = cheerio.load(await publicGet(`https://drive.google.com/embeddedfolderview?id=${folderId}`));
  const entries = $('.flip-entry').toArray();
  if (!entries.length && !prefix) throw new Error('folder is empty or not shared as "Anyone with the link can view"');
  const out = [];
  for (const e of entries) {
    const id = String($(e).attr('id') || '').replace(/^entry-/, '');
    const name = $(e).find('.flip-entry-title').text().trim();
    const href = $(e).find('a').attr('href') || '';
    if (!id || !name) continue;
    if (href.includes('/folders/')) { out.push(...(await listPublicFolder(id, `${prefix}${name}/`))); continue; }
    // the list icon URL ends in the mime type, e.g. …/16/type/application/pdf
    const icon = $(e).find('.flip-entry-list-icon img').attr('src') || '';
    let mimeType = (icon.match(/\/type\/(.+)$/) || [])[1] || '';
    if (href.includes('/document/')) mimeType = 'application/vnd.google-apps.document';
    else if (href.includes('/presentation/')) mimeType = 'application/vnd.google-apps.presentation';
    else if (href.includes('/spreadsheets/')) mimeType = 'application/vnd.google-apps.spreadsheet';
    out.push({ id, name, mimeType, modifiedTime: $(e).find('.flip-entry-last-modified').text().trim(), webViewLink: `https://drive.google.com/file/d/${id}/view`, path: prefix + name, public: true });
  }
  return out;
}

async function publicDownload(id) {
  const buf = await publicGet(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, true);
  if (buf.slice(0, 15).toString().toLowerCase().includes('<!doctype html')) throw new Error('download blocked (file not public?)');
  return buf;
}

async function extractPublicFile(f) {
  const m = f.mimeType;
  if (m === 'application/vnd.google-apps.document') return publicGet(`https://docs.google.com/document/d/${f.id}/export?format=txt`);
  if (m === 'application/vnd.google-apps.presentation') return publicGet(`https://docs.google.com/presentation/d/${f.id}/export/txt`);
  if (m === 'application/vnd.google-apps.spreadsheet') return publicGet(`https://docs.google.com/spreadsheets/d/${f.id}/export?format=csv`);
  if (m === 'application/pdf') return pdfToText(await publicDownload(f.id));
  if (m.startsWith('image/')) {
    const buf = await publicDownload(f.id);
    if (buf.length > MAX_IMAGE_BYTES) throw new Error('image larger than 3.5MB — export a smaller PNG/JPG');
    return describeImage(buf, m, f.name);
  }
  if (m.startsWith('text/')) return (await publicDownload(f.id)).toString('utf8');
  return null;
}

/** Used when an image one-pager can't be transcribed: index it by name + folder so it can still be found and opened. */
function nameOnlyText() {
  // kept deliberately short: extra words here would match unrelated questions in search
  return '[not transcribed]';
}

async function extractFile(f, key) {
  if (f.public) return extractPublicFile(f);
  if (EXPORTS[f.mimeType]) return (await api(`/files/${f.id}/export?mimeType=${encodeURIComponent(EXPORTS[f.mimeType])}`, key, true)).toString('utf8');
  if (f.mimeType === 'application/pdf') return pdfToText(await api(`/files/${f.id}?alt=media`, key, true));
  if (f.mimeType.startsWith('image/')) {
    if (Number(f.size || 0) > MAX_IMAGE_BYTES) throw new Error('image larger than 3.5MB — export a smaller PNG/JPG');
    return describeImage(await api(`/files/${f.id}?alt=media`, key, true), f.mimeType, f.name);
  }
  if (f.mimeType.startsWith('text/')) return (await api(`/files/${f.id}?alt=media`, key, true)).toString('utf8');
  return null; // videos, zips etc. are skipped
}

async function ingestDrive({ folderId, apiKey, log = console.log }) {
  if (!folderId) {
    log('[drive] skipped — set DRIVE_FOLDER_ID in .env');
    return { chunks: [], ok: false };
  }
  // folders to leave out, e.g. DRIVE_EXCLUDE_FOLDERS=Solutions (Pricing)
  const exclude = (process.env.DRIVE_EXCLUDE_FOLDERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { /* first run */ }
  if (!apiKey) log('[drive] no GOOGLE_API_KEY — reading the public folder page instead');
  const files = (apiKey ? await listFolder(folderId, apiKey) : await listPublicFolder(folderId))
    .filter((f) => !exclude.some((x) => f.path.toLowerCase().startsWith(`${x}/`)));
  log(`[drive] ${files.length} files found`);
  const chunks = [];
  const nextCache = {};
  for (const f of files) {
    const cacheKey = `${f.id}:${f.modifiedTime}`;
    const hit = cache[f.id] && cache[f.id].key === cacheKey ? cache[f.id] : null;
    let text = hit && !hit.nameOnly ? hit.text : null; // name-only entries are retried every run
    let nameOnly = false;
    if (text == null) {
      try {
        text = await extractFile(f, apiKey);
        if (text == null) { log(`  [drive] skip (unsupported type ${f.mimeType}) ${f.path}`); continue; }
        if (!text.trim()) { text = nameOnlyText(f); nameOnly = true; log(`  [drive] name only (no readable text) ${f.path}`); }
        else log(`  [drive] read ${f.path} (${text.length} chars)`);
      } catch (e) {
        if (cache[f.id] && !cache[f.id].nameOnly) { log(`  [drive] FAILED ${f.path}: ${e.message} — keeping previous text`); text = cache[f.id].text; }
        else if (String(f.mimeType).startsWith('image/')) { log(`  [drive] name only (image not transcribed: ${e.message}) ${f.path}`); text = nameOnlyText(f); nameOnly = true; }
        else { log(`  [drive] FAILED ${f.path}: ${e.message}`); continue; }
      }
    } else log(`  [drive] cached ${f.path}`);
    if (!String(text).trim()) { text = nameOnlyText(f); nameOnly = true; } // e.g. a scanned PDF with no text layer
    nextCache[f.id] = { key: cacheKey, text, name: f.name, ...(nameOnly ? { nameOnly: true } : {}) };
    const title = f.name.replace(/\.(png|jpe?g|pdf|webp)$/i, '');
    chunks.push(...toChunks({ url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`, title, text: `${title}\n${text}`, source: 'drive' }));
  }
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(nextCache, null, 1));
  log(`[drive] → ${chunks.length} chunks`);
  return { chunks, ok: true };
}

module.exports = { ingestDrive };
