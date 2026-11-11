// Indexes files dropped into the knowledge/ folder: .md .txt .pdf .png .jpg .jpeg .webp
// Use it for pricing sheets, battle cards, case studies, FAQs — anything not on the website.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { toChunks, pdfToText, IMAGE_MIME } = require('./util');
const { describeImage } = require('../llm');

const DIR = path.join(__dirname, '..', '..', 'knowledge');
const CACHE_PATH = path.join(__dirname, '..', '..', 'data', 'local-cache.json');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

async function ingestLocal({ log = console.log } = {}) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { /* first run */ }
  const next = {};
  const chunks = [];
  for (const file of walk(DIR)) {
    const rel = path.relative(DIR, file);
    const ext = path.extname(file).toLowerCase();
    if (path.basename(file).toLowerCase() === 'readme.md') continue;
    const buf = fs.readFileSync(file);
    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    let text = cache[rel] && cache[rel].hash === hash ? cache[rel].text : null;
    try {
      if (text == null) {
        if (ext === '.md' || ext === '.txt' || ext === '.csv') text = buf.toString('utf8');
        else if (ext === '.pdf') text = await pdfToText(buf);
        else if (IMAGE_MIME[ext]) text = await describeImage(buf, IMAGE_MIME[ext], path.basename(file));
        else continue;
        log(`  [local] read ${rel} (${text.length} chars)`);
      }
    } catch (e) { log(`  [local] FAILED ${rel}: ${e.message}`); continue; }
    next[rel] = { hash, text };
    const title = path.basename(file, ext).replace(/[-_]+/g, ' ');
    chunks.push(...toChunks({ url: `local://${rel}`, title, text: `${title}\n${text}`, source: 'local' }));
  }
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(next));
  log(`[local] → ${chunks.length} chunks`);
  return chunks;
}

module.exports = { ingestLocal, KNOWLEDGE_DIR: DIR };
