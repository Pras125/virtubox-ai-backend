// Shared helpers for ingestion: chunking + text extraction from files.
const CHUNK = 1200;
const OVERLAP = 200;

/** Split text into ~1200-char chunks on sentence/line boundaries with overlap. */
function chunkText(text, size = CHUNK, overlap = OVERLAP) {
  const clean = String(text).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const out = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start + Math.floor(size * 0.6), end);
      const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. '));
      if (cut > 0) end = start + Math.floor(size * 0.6) + cut + 1;
    }
    out.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out.filter(Boolean);
}

function toChunks({ url, title, text, source }) {
  return chunkText(text).map((t, i) => ({ id: `${url}#${i}`, url, title, source, text: t }));
}

async function pdfToText(buffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}

const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

module.exports = { chunkText, toChunks, pdfToText, IMAGE_MIME };
