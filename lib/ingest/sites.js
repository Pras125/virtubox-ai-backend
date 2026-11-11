// Crawls docs.virtubox.io + www.virtubox.io (same-domain BFS), extracting the main content.
const cheerio = require('cheerio');
const { toChunks } = require('./util');

const SKIP = /\.(png|jpe?g|gif|svg|webp|pdf|zip|css|js|ico|mp4|mp3|woff2?|ttf|xml)$/i;
const SKIP_PATH = /\/(login|logout|register|password|search|export|revisions|permissions|delete|edit|create|copy|move|sort|user\/|tags\?|favourites|my-account)/i;
const UA = 'VirtuBoxSalesCopilot/2.0 (+internal knowledge indexer)';

function normalize(href, base) {
  try {
    const u = new URL(href, base);
    u.hash = '';
    // drop sort/view query strings that create duplicate pages
    ['sort', 'order', 'view', 'page'].forEach((k) => u.searchParams.delete(k));
    return u.toString().replace(/\/$/, '') || u.toString();
  } catch { return null; }
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok) return null;
    if (!(r.headers.get('content-type') || '').includes('text/html')) return null;
    return await r.text();
  } catch { return null; } finally { clearTimeout(t); }
}

function extract(html, url) {
  const $ = cheerio.load(html);
  const links = [];
  $('a[href]').each((_, el) => links.push($(el).attr('href')));
  $('script, style, noscript, svg, iframe, form, nav, footer, header, .tri-layout-left, .tri-layout-right, #sidebar, .breadcrumbs, .entity-meta').remove();
  const title = ($('h1').first().text() || $('title').first().text() || url).replace(/\s+/g, ' ').trim();
  // BookStack (docs.virtubox.io) puts page content in .page-content; fall back to main/body.
  const root = $('.page-content').length ? $('.page-content') : $('main').length ? $('main') : $('body');
  root.find('h1,h2,h3,h4,li,p,tr,br').each((_, el) => $(el).append('\n'));
  const text = root.text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return { title, text, links };
}

async function crawlSites({ seeds, maxPages = 400, concurrency = 4, log = console.log }) {
  const visited = new Set();
  const chunks = [];
  const queue = [];
  const hosts = new Set(seeds.map((s) => new URL(s).hostname));
  seeds.forEach((s) => queue.push(normalize(s, s)));

  async function worker() {
    while (queue.length && visited.size < maxPages) {
      const url = queue.shift();
      if (!url || visited.has(url)) continue;
      visited.add(url);
      const html = await fetchText(url);
      if (!html) continue;
      const { title, text, links } = extract(html, url);
      if (text.length > 120) {
        const c = toChunks({ url, title, text, source: url.includes('docs.') ? 'docs' : 'website' });
        chunks.push(...c);
        log(`  [site] ${c.length} chunks  ${url}`);
      }
      for (const href of links) {
        const abs = normalize(href, url);
        if (!abs || visited.has(abs) || SKIP.test(abs) || SKIP_PATH.test(abs)) continue;
        if (!hosts.has(new URL(abs).hostname)) continue;
        queue.push(abs);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  log(`[site] crawled ${visited.size} pages → ${chunks.length} chunks`);
  return chunks;
}

module.exports = { crawlSites, extract };
