# VirtuBox Sales Copilot

A ChatGPT-style assistant for the VirtuBox sales team. A rep can ask it things in a client meeting, like "which solution fits a museum?", "what did we build for CGST?" or "the client says it's too expensive", and get a short answer they can read out, with sources. It runs 24/7 on the VirtuBox server.

**Where answers come from** (rebuilt automatically every 24 h):

| Source | How it's read |
|---|---|
| docs.virtubox.io | crawled, main content only |
| www.virtubox.io + /resources | crawled |
| Google Drive "One Pagers" folder | PDFs → text, **PNG/JPG one-pagers → read by Groq vision model**, Google Docs/Slides/Sheets → exported |
| `knowledge/` folder on the server | md, txt, csv, pdf, images. Use it for pricing guidance, battle cards, FAQs |

**Features:** no login — anyone with the link can use it, and each browser keeps its own chat history; streaming answers, chat sidebar with search/pin/rename, ⚡ Meeting mode (short answers) / 📄 Detailed mode, quick-start prompts, source chips linking back to the doc or one-pager, copy / WhatsApp share / read aloud, voice input (Hindi/English), Sales library panel, mobile layout for phones in meetings. Groq keys stay on the server and rotate automatically, with an optional OpenRouter fallback.

---

## Deploy on Vercel

1. On vercel.com choose **Add New → Project** and import this GitHub repo. Leave the build settings as they are (`vercel.json` sets them).
2. Under **Environment Variables** add (this is the only required one):

   | Key | Value |
   |---|---|
   | `GROQ_API_KEYS` | one or more Groq keys, comma-separated |

3. Deploy.
4. For chat history that lasts: in the project's **Storage** tab add **Upstash for Redis** (free tier) and connect it to the project, then redeploy. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Without it the app works, but chat history is temporary and can disappear at any time.

**How Vercel differs from the server install**

- The knowledge index (`data/knowledge-index.json`) is read-only there. To refresh it, run `npm run ingest` on your computer, then commit and push the file; Vercel redeploys. The 24-hour auto-refresh does not run on Vercel.
- An answer must finish within 60 seconds (`maxDuration` in `vercel.json`).
- The request rate limit is per server instance, so it is approximate.

## Run locally

```bash
npm install
cp .env.example .env    # then fill in GROQ_API_KEYS
npm start               # http://localhost:3000
```

---

## Deploy on the VirtuBox server (Ubuntu/Debian)

```bash
# 1. copy the folder to the server, e.g. /opt/virtubox-sales-copilot
cd /opt/virtubox-sales-copilot

# 2. first run creates .env and stops
sudo bash deploy/setup.sh

# 3. fill in .env (see below), then run again
nano .env
sudo bash deploy/setup.sh                       # → http://SERVER_IP:3000
# or with a domain + free HTTPS (point DNS at the server first):
sudo bash deploy/setup.sh copilot.virtubox.io   # → https://copilot.virtubox.io
```

`setup.sh` installs Node 20 and PM2, installs dependencies, builds the knowledge index, starts the app under PM2 and registers it to start on boot. PM2 restarts it if it crashes.

### .env — what to fill in

| Key | What |
|---|---|
| `GROQ_API_KEYS` | one or more Groq keys, comma-separated (console.groq.com/keys) |
| `GOOGLE_API_KEY` | optional. Without it the public Drive folder page is read directly |
| `DRIVE_EXCLUDE_FOLDERS` | optional. Drive sub-folders to leave out, e.g. `Solutions (Pricing)` |
| `DRIVE_FOLDER_ID` | already set to the One Pagers folder |

### One-pagers from Drive

The Drive folder only has to be shared as **Anyone with the link → Viewer**; no API key is needed. `npm run ingest:drive` lists every file in it (sub-folders included). PDFs and Google Docs are read as text. Image one-pagers are read by the Groq vision model when `GROQ_API_KEYS` and a working `GROQ_VISION_MODEL` are set; otherwise they are indexed by file name only, so the copilot can still find and link them but cannot quote them. Answers that use a one-pager show a preview card that opens the file in Drive.

### Getting a Google API key (optional)
1. Open https://console.cloud.google.com and create or select a project.
2. Go to **APIs & Services → Library**, search "Google Drive API" and click **Enable**.
3. Go to **APIs & Services → Credentials → Create credentials → API key**. Optionally restrict it to the Drive API.
4. In Drive, share the One Pagers folder as **Anyone with the link → Viewer**.
5. Paste the key into `.env` → `GOOGLE_API_KEY=...`, then run `npm run ingest:drive`.

Files are cached by modified time, so the vision model only re-reads a one-pager when it changes. Images must be under 3.5 MB.

---

## Day-to-day

```bash
pm2 status                         # is it running?
pm2 logs virtubox-sales-copilot    # live logs
pm2 restart virtubox-sales-copilot # after editing .env
npm run ingest                     # rebuild everything now
npm run ingest:drive               # only re-read Drive (new one-pager added)
npm run ingest:local               # only re-read knowledge/
```

The running server reloads the index automatically after an ingest; you don't need to restart it.

**Access:** there is no login. Anyone who has the link can use the copilot, so share the link only with the sales team. Chat history is kept per browser (an anonymous cookie), so a rep sees a different history on their phone and their laptop.

**Health check for uptime monitors:** `GET /api/health` returns chunk counts and uptime.

## Project layout

```
server.js                 Express app: chat (SSE streaming), history, auto-refresh
lib/llm.js                Groq client: key rotation, backoff, OpenRouter fallback, vision
lib/retrieval.js          BM25 search with title boost, sales files ranked first
lib/auth.js               anonymous per-browser id cookie (no login)
lib/chatStore.js          per-user chat history: data/chats/*.json, or Redis on Vercel
api/index.js · vercel.json  Vercel entry point and config
lib/ingest/               sites.js (crawler) · drive.js · local.js · index.js
public/index.html         the whole UI (no build step); vendor/ has marked + DOMPurify
deploy/                   setup.sh · nginx.conf · systemd service (alternative to PM2)
knowledge/                drop extra sales files here
```

## Notes
- The sales prompt (in `server.js`, `SYSTEM` + `BASELINE`) tells the model **never to invent prices, timelines or client names**. If something isn't in the material, it tells the rep to confirm with the product team. Add pricing guidance to `knowledge/` if you want it answered.
- `www.virtubox.io/resources` loads its list with JavaScript, so the crawler may only see part of it. Put important resource PDFs in Drive or `knowledge/`.
- Keep PM2 at 1 instance: chat history is stored in local files.
- Back up `data/chats/` if the history matters.
