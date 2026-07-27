require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { loadIndex } = require('./lib/retrieval');
const { callChatModel } = require('./lib/groqClient');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Protects YOUR backend from being hammered (separate from the Groq-side
// rate-limit handling in lib/groqClient.js).
app.use(
  '/api/',
  rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.MAX_REQUESTS_PER_MIN || 20),
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const KNOWLEDGE_INDEX_PATH = path.join(__dirname, 'data', 'knowledge-index.json');
let knowledgeIndex = loadIndex(KNOWLEDGE_INDEX_PATH);

// Fixed, hand-written steps as a reliable baseline. The RAG-retrieved chunks
// below (from the live crawl of docs.virtubox.io / virtubox.io) fill in
// anything more specific or that changes over time.
const STATIC_KNOWLEDGE_BASE = `
# VirtuBox Platform Knowledge Base
VirtuBox is a cloud-based No-Code platform providing Interactive Kiosk (VirtuKiosk) and Digital Signage solutions. It allows centralized management of screens, catalogs, and 3D assets across unlimited devices.

## 1. Creating and Managing Categories (Catalog)
1. Log in to the VirtuBox Account Dashboard (https://account.virtubox.io/home).
2. On the left sidebar menu, navigate to **Catalog** -> **Categories**.
3. Click the **+ Add New** button at the top right.
4. Enter the **Category Name**.
5. Upload an **Icon or Image** for the kiosk interface.
6. Set Status to **Active** and click **Save**.

## 2. Creating Products / Items
1. In the left sidebar, navigate to **Catalog** -> **Products**.
2. Click **+ Add New**.
3. Enter the **Title**, **Description**, and **Price**.
4. Assign the product to a **Category**.
5. Upload **Images, Videos, or 3D Models**.
6. Click **Save**.

## 3. Uploading 3D Models
1. Navigate to **Media** or **3D Models** in the left sidebar.
2. Click **Upload** and select your 3D files (supported: GLB, GLTF, OBJ).
3. Link the 3D model to a specific product so users can rotate and zoom it on the kiosk.

## 4. Digital Signage & Playlists
1. Go to **Screens / Signage** in the left sidebar.
2. Select your target screen(s) and click **Playlists** or **Schedule**.
3. Add images, videos, or split-screen HTML widgets.
4. Set scheduling (dates and times) and click **Publish**. Updates are pushed remotely via the cloud.

## 5. Kiosk Branding & Settings
1. Go to **Settings** -> **Theme / Branding**.
2. Upload your **Company Logo**, set **Brand Colors**, and define the UI layout.
3. Kiosks support offline mode, so they will cache these settings and work without internet.

## 6. Business Profile
1. Go to **Settings** -> **Business Profile**.
2. Update your Contact Info, Address, and Social Links. These appear in the Kiosk's enquiry forms.

## 7. Analytics
1. Click on **Analytics** or **Reports** in the left sidebar.
2. View real-time data on Most Viewed Products, Kiosk Touches, and Screen Uptime.
`;

const SYSTEM_PROMPT_HEADER = `You are VirtuBox AI, the official and exclusive expert assistant for the VirtuBox platform (virtubox.io) and its documentation (https://docs.virtubox.io/).

CRITICAL DIRECTIVES:
1. STRICT SCOPE: Only answer questions related to VirtuBox, https://account.virtubox.io/home, https://docs.virtubox.io/, and https://www.virtubox.io/. Politely refuse anything else.
2. Use the STATIC KNOWLEDGE below as a reliable baseline. Prefer the RETRIEVED DOC EXCERPTS for anything specific or detailed, since those come directly from a live crawl of the actual site content.
3. If neither the static knowledge nor the retrieved excerpts answer the question, say so honestly instead of guessing, and point the user to https://docs.virtubox.io/search.
4. Always format responses in Markdown (headings, bold UI element names, bulleted steps).
5. When you use a retrieved excerpt, cite its source URL at the end of your answer.`;

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const topChunks = knowledgeIndex.search(message, 5);
    const retrievedText = topChunks.length
      ? topChunks.map((c) => `### ${c.title}\nSource: ${c.url}\n${c.text}`).join('\n\n')
      : '(No matching indexed content for this query. Run the ingestion script if the index is empty.)';

    const systemPrompt = `${SYSTEM_PROMPT_HEADER}

<static_knowledge>
${STATIC_KNOWLEDGE_BASE}
</static_knowledge>

<retrieved_doc_excerpts>
${retrievedText}
</retrieved_doc_excerpts>`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    const { data, provider } = await callChatModel(messages);
    const reply = data.choices[0].message.content;

    res.json({
      reply,
      provider,
      sources: topChunks.map((c) => ({ title: c.title, url: c.url })),
    });
  } catch (err) {
    console.error(err);
    const status = isRateLimitErr(err) ? 429 : 500;
    res.status(status).json({
      error: isRateLimitErr(err)
        ? 'All configured providers are currently rate-limited. Please try again shortly.'
        : err.message || 'Something went wrong.',
    });
  }
});

function isRateLimitErr(err) {
  const m = (err && err.message || '').toLowerCase();
  return m.includes('rate limit') || m.includes('429') || m.includes('quota');
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, indexedChunks: knowledgeIndex.docs.length });
});

// Hot-reload the index after re-running the ingestion script, without
// restarting the whole server.
app.post('/api/reload-index', (req, res) => {
  knowledgeIndex = loadIndex(KNOWLEDGE_INDEX_PATH);
  res.json({ ok: true, indexedChunks: knowledgeIndex.docs.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VirtuBox AI backend running on http://localhost:${PORT}`);
  console.log(`Indexed chunks: ${knowledgeIndex.docs.length}`);
});
