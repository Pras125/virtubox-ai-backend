const fs = require('fs');

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are',
  'was', 'were', 'be', 'this', 'that', 'with', 'as', 'it', 'by', 'at', 'from',
  'your', 'you', 'can', 'how', 'what', 'i', 'do', 'does', 'my', 'me', 'we'
]);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((t) => !STOPWORDS.has(t) && t.length > 1);
}

// Lightweight BM25 index. No embeddings/vector DB needed - good enough for a
// few hundred to a few thousand chunks and keeps the backend dependency-free.
class BM25Index {
  constructor(chunks) {
    this.k1 = 1.5;
    this.b = 0.75;
    this._build(chunks || []);
  }

  _build(chunks) {
    const docFreq = new Map();
    let totalLen = 0;

    this.docs = chunks.map((chunk) => {
      const terms = tokenize(chunk.text || '');
      totalLen += terms.length;
      const tf = new Map();
      for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
      for (const t of tf.keys()) docFreq.set(t, (docFreq.get(t) || 0) + 1);
      return { ...chunk, tf, length: terms.length };
    });

    this.avgLen = totalLen / (this.docs.length || 1);
    this.N = this.docs.length;
    this.idf = new Map();
    for (const [term, df] of docFreq.entries()) {
      this.idf.set(term, Math.log(1 + (this.N - df + 0.5) / (df + 0.5)));
    }
  }

  search(query, topK = 5) {
    const qTerms = tokenize(query);
    if (!qTerms.length || !this.docs.length) return [];

    const scored = this.docs.map((doc) => {
      let score = 0;
      for (const term of qTerms) {
        const idf = this.idf.get(term);
        if (!idf) continue;
        const f = doc.tf.get(term) || 0;
        if (!f) continue;
        const denom = f + this.k1 * (1 - this.b + (this.b * doc.length) / this.avgLen);
        score += idf * ((f * (this.k1 + 1)) / denom);
      }
      return { doc, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.doc);
  }
}

function loadIndex(indexPath) {
  if (!fs.existsSync(indexPath)) {
    console.warn(`No knowledge index found at ${indexPath}. Run "npm run ingest" first.`);
    return new BM25Index([]);
  }
  try {
    const raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    return new BM25Index(raw);
  } catch (e) {
    console.error('Failed to parse knowledge index:', e.message);
    return new BM25Index([]);
  }
}

module.exports = { BM25Index, loadIndex, tokenize };
