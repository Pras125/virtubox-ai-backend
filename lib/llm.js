// Groq client with key rotation, backoff, OpenRouter fallback, streaming and vision.
const GROQ_KEYS = (process.env.GROQ_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
const GROQ_BASE = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

const MAX_RETRIES = Math.max(4, GROQ_KEYS.length * 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let keyIndex = 0;

class RequestQueue {
  constructor(concurrency) { this.concurrency = concurrency; this.active = 0; this.q = []; }
  run(task) {
    return new Promise((resolve, reject) => { this.q.push({ task, resolve, reject }); this._next(); });
  }
  _next() {
    if (this.active >= this.concurrency || !this.q.length) return;
    const { task, resolve, reject } = this.q.shift();
    this.active++;
    task().then(resolve, reject).finally(() => { this.active--; this._next(); });
  }
}
const queue = new RequestQueue(Number(process.env.MAX_CONCURRENT_REQUESTS || 2));

function isRateLimit(err) {
  const m = String((err && err.message) || '').toLowerCase();
  return (err && err.status === 429) || m.includes('rate limit') || m.includes('quota') || m.includes('too many requests');
}

async function post(url, key, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const err = new Error((j.error && j.error.message) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

// Reads an OpenAI-compatible SSE stream, calling onDelta(text) for each token chunk.
async function readStream(res, onDelta) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return full;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (delta) { full += delta; onDelta(delta); }
      } catch { /* partial line */ }
    }
  }
  return full;
}

// Generic call: tries Groq keys with rotation + backoff, then OpenRouter.
async function withProviders(fn) {
  if (!GROQ_KEYS.length && !OPENROUTER_KEY) throw new Error('No GROQ_API_KEYS configured in .env');
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES && GROQ_KEYS.length; attempt++) {
    const key = GROQ_KEYS[keyIndex % GROQ_KEYS.length];
    try {
      return await fn(`${GROQ_BASE}/chat/completions`, key, 'groq');
    } catch (err) {
      lastErr = err;
      if (!isRateLimit(err) && err.status !== 503 && err.status !== 500) throw err;
      keyIndex++;
      // only back off once we've cycled through every key
      if ((attempt + 1) % GROQ_KEYS.length === 0) await sleep(Math.min(8000, 1000 * 2 ** Math.floor(attempt / GROQ_KEYS.length)));
    }
  }
  if (OPENROUTER_KEY) return fn('https://openrouter.ai/api/v1/chat/completions', OPENROUTER_KEY, 'openrouter');
  throw lastErr || new Error('All providers failed');
}

/** Streaming chat. Returns { text, provider }. */
function streamChat(messages, onDelta, { temperature = 0.4, max_tokens = 1500 } = {}) {
  return queue.run(() =>
    withProviders(async (url, key, provider) => {
      const model = provider === 'groq' ? GROQ_MODEL : OPENROUTER_MODEL;
      const res = await post(url, key, { model, messages, temperature, max_tokens, stream: true });
      const text = await readStream(res, onDelta);
      return { text, provider };
    })
  );
}

/** Non-streaming chat (used for chat titles). */
function chat(messages, { temperature = 0.3, max_tokens = 60 } = {}) {
  return queue.run(() =>
    withProviders(async (url, key, provider) => {
      const model = provider === 'groq' ? GROQ_MODEL : OPENROUTER_MODEL;
      const res = await post(url, key, { model, messages, temperature, max_tokens });
      const j = await res.json();
      return j.choices[0].message.content;
    })
  );
}

/** Transcribe an image (one-pager, brochure) to text with the vision model. */
async function describeImage(buffer, mime, fileName) {
  if (!GROQ_KEYS.length) throw new Error('GROQ_API_KEYS required for image transcription');
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
  const prompt =
    `This image is a VirtuBox sales one-pager / marketing collateral named "${fileName}". ` +
    'Transcribe ALL text on it faithfully (headings, bullet points, numbers, client names, specs, contact details). ' +
    'Then add a short section "Visual summary:" describing any product photos or diagrams in 2-3 sentences. ' +
    'Output plain text only. Do not invent anything that is not visible.';
  return withProviders(async (url, key, provider) => {
    if (provider !== 'groq') throw new Error('Vision fallback not configured');
    const res = await post(url, key, {
      model: VISION_MODEL,
      temperature: 0,
      max_tokens: 2000,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }],
    });
    const j = await res.json();
    return j.choices[0].message.content;
  });
}

module.exports = { streamChat, chat, describeImage, isRateLimit };
