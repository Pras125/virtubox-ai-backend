# VirtuBox AI Backend

A small Node/Express backend for the VirtuBox AI assistant that:

- **Hides your Groq API key(s)** — they live only in a `.env` file on the server, never sent to the browser (unlike the old single-file version, where anyone could view-source and steal the key).
- **Actually reduces rate-limit hits** — via a request queue (serializes calls), automatic key rotation across multiple Groq keys, exponential backoff, and an optional fallback to OpenRouter if every Groq key is exhausted.
- **Answers from the real content of `docs.virtubox.io` and `www.virtubox.io`** — a crawler script pulls the live text off both sites into a local index, and a lightweight BM25 search picks only the 5 most relevant chunks per question to inject into the prompt (instead of stuffing the whole site into every request — which is what actually blows through token-based rate limits).

## 1. Install

Requires Node.js 18+ (for built-in `fetch`).

```bash
cd virtubox-backend
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

- `GROQ_API_KEYS` — comma-separated list of your Groq keys. Add as many as you have; the more you add, the more the server can absorb before it ever needs to back off.
- `OPENROUTER_API_KEY` — optional. Only used as a last resort if all Groq keys are rate-limited at once. Free keys: https://openrouter.ai/keys
- `CRAWL_SEED_URLS` — already set to `docs.virtubox.io` and `www.virtubox.io`.
- `MAX_REQUESTS_PER_MIN` / `MAX_CONCURRENT_REQUESTS` — tune these to your Groq plan's actual limits.

## 3. Build the knowledge index (crawl the docs + website)

```bash
npm run ingest
```

This crawls both seed sites (same-domain links only, up to `CRAWL_MAX_PAGES` pages), strips nav/scripts/styles, and writes `data/knowledge-index.json`. It can take a few minutes depending on how many pages the docs site has.

Re-run this any time the docs/website content changes. If the server is already running, refresh it without a restart:

```bash
curl -X POST http://localhost:3000/api/reload-index
```

## 4. Run

```bash
npm start
```

Then open **http://localhost:3000** — the server serves the frontend (`public/index.html`) and the `/api/chat` endpoint from the same origin, so there's nothing else to configure.

## 5. Deploy

Any Node host works (Render, Railway, Fly.io, a VPS, etc.). General steps:

1. Push this folder to a git repo (or upload it directly).
2. Set the same environment variables from `.env` in your host's dashboard/secrets — **do not commit `.env`**.
3. Set the start command to `npm start` (make sure a build/install step runs `npm install` first).
4. Run `npm run ingest` once as a one-off job on the host (or run it locally and just deploy the resulting `data/knowledge-index.json` file — it's plain JSON).
5. Re-run the ingest step periodically (e.g. a weekly cron job or manual re-deploy) to keep the index in sync as the docs/site change.

## Notes / limits

- The BM25 search here is a lightweight, dependency-free retrieval method — good for a few hundred to a few thousand chunks. If the docs site grows very large and answers start feeling imprecise, the natural upgrade path is swapping `lib/retrieval.js` for an embeddings-based vector search, but that adds another external API dependency, so it's left out for now.
- The crawler respects same-domain links only and skips binary assets (images, PDFs, etc.) — it won't pull content from PDFs linked in the docs. If there's important content in PDFs, that would need a separate PDF-text-extraction step.
- `MAX_REQUESTS_PER_MIN` in `.env` protects **your own backend** from abuse; it's separate from Groq's own per-key limits.
# virtubox-ai-backend
