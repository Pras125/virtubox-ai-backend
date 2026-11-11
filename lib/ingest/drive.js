// Reads every file in the shared Google Drive folder (recursively) using a Google API key.
// - PDFs          → text via pdf-parse
// - PNG/JPG       → text via Groq vision model (one-pagers are images)
// - Google Docs   → exported as plain text
// - Google Slides → exported as plain text
// - Google Sheets → exported as CSV
// Results are cached by file id + modifiedTime, so unchanged files are never re-processed.
const fs = require('fs');
const path = require('path');
const { toChunks, pdfToText } = require('./util');
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

async function extractFile(f, key) {
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
  if (!folderId || !apiKey) {
    log('[drive] skipped — set DRIVE_FOLDER_ID and GOOGLE_API_KEY in .env');
    return { chunks: [], ok: false };
  }
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { /* first run */ }
  const files = await listFolder(folderId, apiKey);
  log(`[drive] ${files.length} files found`);
  const chunks = [];
  const nextCache = {};
  for (const f of files) {
    const cacheKey = `${f.id}:${f.modifiedTime}`;
    let text = cache[f.id] && cache[f.id].key === cacheKey ? cache[f.id].text : null;
    if (text == null) {
      try {
        text = await extractFile(f, apiKey);
        if (text == null) { log(`  [drive] skip (unsupported type ${f.mimeType}) ${f.path}`); continue; }
        log(`  [drive] read ${f.path} (${text.length} chars)`);
      } catch (e) {
        log(`  [drive] FAILED ${f.path}: ${e.message}`);
        if (cache[f.id]) text = cache[f.id].text; // keep the old version if a refresh fails
        else continue;
      }
    } else log(`  [drive] cached ${f.path}`);
    nextCache[f.id] = { key: cacheKey, text, name: f.name };
    const title = f.name.replace(/\.(png|jpe?g|pdf|webp)$/i, '');
    chunks.push(...toChunks({ url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`, title, text: `${title}\n${text}`, source: 'drive' }));
  }
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(nextCache, null, 1));
  log(`[drive] → ${chunks.length} chunks`);
  return { chunks, ok: true };
}

module.exports = { ingestDrive };
