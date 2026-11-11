// Builds data/knowledge-index.json from all sources. Used by `npm run ingest` and the server's auto-refresh.
const fs = require('fs');
const path = require('path');
const { crawlSites } = require('./sites');
const { ingestDrive } = require('./drive');
const { ingestLocal } = require('./local');

const INDEX_PATH = path.join(__dirname, '..', '..', 'data', 'knowledge-index.json');

function readExisting() {
  try { return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); } catch { return []; }
}

/**
 * @param {object} opts
 * @param {string[]} [opts.only] subset of ['sites','drive','local']; others are kept from the existing index
 */
async function runIngest({ only, log = console.log } = {}) {
  const want = new Set(only && only.length ? only : ['sites', 'drive', 'local']);
  const existing = readExisting();
  const keep = (src) => existing.filter((c) => {
    const s = c.source || 'docs';
    return src === 'sites' ? s === 'docs' || s === 'website' || s === 'site' : s === src;
  });
  const started = Date.now();

  let sites = keep('sites');
  if (want.has('sites')) {
    const seeds = (process.env.CRAWL_SEED_URLS || 'https://docs.virtubox.io/,https://www.virtubox.io/').split(',').map((s) => s.trim()).filter(Boolean);
    const fresh = await crawlSites({ seeds, maxPages: Number(process.env.CRAWL_MAX_PAGES || 400), log });
    if (fresh.length) sites = fresh; else log('[site] crawl returned nothing — keeping previous site content');
  }

  let drive = keep('drive');
  if (want.has('drive')) {
    try {
      const r = await ingestDrive({ folderId: process.env.DRIVE_FOLDER_ID, apiKey: process.env.GOOGLE_API_KEY, log });
      if (r.ok) drive = r.chunks;
    } catch (e) { log(`[drive] FAILED: ${e.message} — keeping previous Drive content`); }
  }

  let local = keep('local');
  if (want.has('local')) {
    try { local = await ingestLocal({ log }); } catch (e) { log(`[local] FAILED: ${e.message}`); }
  }

  const all = [...local, ...drive, ...sites];
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH + '.tmp', JSON.stringify(all));
  fs.renameSync(INDEX_PATH + '.tmp', INDEX_PATH);
  const summary = { chunks: all.length, sites: sites.length, drive: drive.length, local: local.length, seconds: Math.round((Date.now() - started) / 1000) };
  log(`[ingest] done ${JSON.stringify(summary)}`);
  return summary;
}

module.exports = { runIngest, INDEX_PATH };
