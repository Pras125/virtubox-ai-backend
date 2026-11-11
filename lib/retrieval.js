const fs = require('fs');

const STOPWORDS = new Set(('the a an and or of to in on for is are was were be this that with as it by at from your you can how what i do does ' +
  'my me we our us they them their there here which who will would should could about into than then so if not no yes please tell give ' +
  'explain need want show also any all some more most very just like get ' +
  // generic sales-conversation words that otherwise match random pages
  'client clients customer customers pitch say said new second seconds minute short simple words answer respond write draft email ask question questions meeting').split(' '));

function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

// tiny plural stemmer: coupons→coupon, kiosks→kiosk, categories→category
function stem(t) {
  if (t.length <= 4) return t;
  if (t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1);
  return t;
}

// Dependency-free BM25 with a title boost and a small preference for sales collateral.
class BM25Index {
  constructor(chunks) {
    this.k1 = 1.4;
    this.b = 0.7;
    const df = new Map();
    let total = 0;
    this.docs = (chunks || []).map((c) => {
      const terms = tokenize(`${c.title} ${c.title} ${c.text}`);
      total += terms.length;
      const tf = new Map();
      for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
      for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
      return { ...c, title: String(c.title || '').replace(/\s*\|\s*VirtuBox Docs\s*$/i, '').trim(), tf, length: terms.length };
    });
    this.N = this.docs.length;
    this.avgLen = total / (this.N || 1);
    this.idf = new Map();
    for (const [t, n] of df) this.idf.set(t, Math.log(1 + (this.N - n + 0.5) / (n + 0.5)));
  }

  search(query, topK = 6) {
    const q = [...new Set(tokenize(query))];
    if (!q.length || !this.N) return [];
    const scored = [];
    for (const d of this.docs) {
      let s = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        s += this.idf.get(t) * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.length) / this.avgLen)));
      }
      if (s > 0) {
        if (d.source === 'drive' || d.source === 'local') s *= 1.25; // sales collateral first
        scored.push({ d, s });
      }
    }
    scored.sort((a, b) => b.s - a.s);
    // at most 2 chunks per URL so answers draw on several sources
    const perUrl = new Map();
    const out = [];
    for (const { d } of scored) {
      const n = perUrl.get(d.url) || 0;
      if (n >= 2) continue;
      perUrl.set(d.url, n + 1);
      out.push(d);
      if (out.length >= topK) break;
    }
    return out;
  }

  stats() {
    const bySource = {};
    const urls = new Set();
    for (const d of this.docs) { bySource[d.source || 'site'] = (bySource[d.source || 'site'] || 0) + 1; urls.add(d.url); }
    return { chunks: this.N, documents: urls.size, bySource };
  }

  /** List of sales-collateral documents (Drive + local) for the "Library" panel. */
  library() {
    const seen = new Map();
    for (const d of this.docs) if ((d.source === 'drive' || d.source === 'local') && !seen.has(d.url)) seen.set(d.url, { title: d.title, url: d.url, source: d.source });
    return [...seen.values()];
  }
}

function loadIndex(p) {
  try {
    if (!fs.existsSync(p)) { console.warn(`[index] none at ${p} — run "npm run ingest"`); return new BM25Index([]); }
    return new BM25Index(JSON.parse(fs.readFileSync(p, 'utf8')));
  } catch (e) {
    console.error('[index] failed to load:', e.message);
    return new BM25Index([]);
  }
}

module.exports = { BM25Index, loadIndex, tokenize };
