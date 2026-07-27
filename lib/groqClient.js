const GROQ_KEYS = (process.env.GROQ_API_KEYS || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || null;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const MAX_RETRIES = 6;
const BASE_BACKOFF_MS = 1000;

let keyIndex = 0;

// Serializes outgoing requests so we never fire a burst that trips a
// requests-per-minute limit. Raise MAX_CONCURRENT_REQUESTS in .env if you
// have multiple keys and want more throughput.
class RequestQueue {
  constructor(concurrency = 1) {
    this.concurrency = concurrency;
    this.active = 0;
    this.queue = [];
  }
  run(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._next();
    });
  }
  _next() {
    if (this.active >= this.concurrency || this.queue.length === 0) return;
    const { task, resolve, reject } = this.queue.shift();
    this.active++;
    task()
      .then(resolve, reject)
      .finally(() => {
        this.active--;
        this._next();
      });
  }
}

const queue = new RequestQueue(Number(process.env.MAX_CONCURRENT_REQUESTS || 1));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitMessage(msg) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('rate limit') || m.includes('quota') || m.includes('429') || m.includes('too many requests');
}

async function callGroqOnce(messages, key) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: GROQ_MODEL, messages }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message = errBody.error?.message || `HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

async function callOpenRouterOnce(messages) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
    },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message = errBody.error?.message || `HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

// Public entry point: send a chat completion request. Rotates across all
// configured Groq keys with exponential backoff on rate limits, then falls
// back to OpenRouter (if configured) only once every Groq key is exhausted.
async function callChatModel(messages) {
  return queue.run(async () => {
    if (!GROQ_KEYS.length) {
      throw new Error('No GROQ_API_KEYS configured on the server (.env).');
    }

    let lastError = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const key = GROQ_KEYS[keyIndex % GROQ_KEYS.length];
      try {
        const data = await callGroqOnce(messages, key);
        return { provider: 'groq', data };
      } catch (err) {
        lastError = err;
        const rateLimited = err.status === 429 || isRateLimitMessage(err.message);
        if (!rateLimited) throw err; // real error (bad key, bad request, etc.) - don't retry blindly
        keyIndex++;
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
      }
    }

    if (OPENROUTER_KEY) {
      try {
        const data = await callOpenRouterOnce(messages);
        return { provider: 'openrouter', data };
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('All providers failed.');
  });
}

module.exports = { callChatModel };
