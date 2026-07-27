// Crawls the seed URLs (same domain only), strips nav/scripts/styles, chunks
// the visible text, and writes everything to data/knowledge-index.json.
//
// Run with:  npm run ingest
// Re-run any time the sites change to refresh the index, then hit
// POST /api/reload-index on a running server (or just restart it).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const SEED_URLS = (process.env.CRAWL_SEED_URLS || 'https://docs.virtubox.io/,https://www.virtubox.io/')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MAX_PAGES = Number(process.env.CRAWL_MAX_PAGES || 200);
const CHUNK_SIZE = 800;
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'knowledge-index.json');

function sameDomain(url, seed) {
  try {
    return new URL(url).hostname === new URL(seed).hostname;
  } catch {
    return false;
  }
}

function chunkText(text, size) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size;
  }
  return chunks;
}

async function crawlSeed(seed, visited, out) {
  const queue = [seed];

  while (queue.length && visited.size < MAX_PAGES) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    let html;
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'VirtuBoxIngestBot/1.0' } });
      if (!resp.ok) continue;
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) continue;
      html = await resp.text();
    } catch (e) {
      console.warn('  failed to fetch', url, '-', e.message);
      continue;
    }

    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, noscript').remove();

    const title = $('title').first().text().trim() || url;
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    if (bodyText.length > 100) {
      const chunks = chunkText(bodyText, CHUNK_SIZE);
      chunks.forEach((text, i) => {
        out.push({ id: `${url}#${i}`, url, title, text });
      });
      console.log(`  indexed (${bodyText.length} chars): ${url}`);
    }

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        const abs = new URL(href, url).toString().split('#')[0];
        if (
          sameDomain(abs, seed) &&
          !visited.has(abs) &&
          !abs.match(/\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|ico)$/i)
        ) {
          queue.push(abs);
        }
      } catch {
        /* ignore malformed links */
      }
    });
  }
}

(async () => {
  const visited = new Set();
  const out = [];

  for (const seed of SEED_URLS) {
    console.log(`\nCrawling from seed: ${seed}`);
    await crawlSeed(seed, visited, out);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nDone. Indexed ${out.length} chunks from ${visited.size} pages -> ${OUTPUT_PATH}`);
})();
