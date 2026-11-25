// AI-designed infographic: asks an image model (Gemini "nano banana", directly or through OpenRouter) to paint the whole poster.
// The copy comes from the knowledge-based banner JSON, so the facts stay the ones in the one-pagers.
// Two reference images go along: the house style example (assets/infographic-style.jpg) and the product's Drive one-pager.
const fs = require('fs');
const path = require('path');

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = process.env.IMAGE_MODEL || (GEMINI_KEY ? 'gemini-2.5-flash-image' : 'google/gemini-2.5-flash-image');
const STYLE_PATH = path.join(__dirname, '..', 'assets', 'infographic-style.jpg');
const TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS || 55000);

const enabled = () => Boolean(GEMINI_KEY || OPENROUTER_KEY);
const CONTACT = { email: 'hello@virtubox.io', phone: '+91 9810473340', site: 'www.virtubox.io' };

function buildPrompt(b, hasProduct) {
  const story = b.format === 'story';
  const lines = [
    `Design ONE finished, polished marketing infographic poster for VirtuBox, ready to post as a WhatsApp ${story ? 'status (tall 9:16)' : 'post (4:5 portrait)'}.`,
    '',
    'STYLE: image 1 is the house style reference. Copy its look and layout language: bright white and pale-blue background with soft light, a deep-navy rounded title pill with white and golden-yellow lettering, a bold italic tagline with a yellow brush underline, a row of round pale-blue icon circles joined by arrows, a row of short feature columns with navy line icons, a frosted rounded info panel, a navy wave footer reading "Powered by VirtuBox", and a golden-yellow pill for the closing line. Palette: navy blue #0B4F8A, golden yellow #FFC629, white, light blue. The VirtuBox logo is "Virtu" in blue and "Box" in orange-yellow with a registered mark; place it top left.',
    'Do NOT copy any words, product, locations, courts or facts from image 1. It shows layout and style only.',
    hasProduct
      ? 'PRODUCT: image 2 is the real VirtuBox one-pager for this product. Show the product as a clean, realistic 3D render in a bright modern interior, as the hero on one side, faithful to the product in image 2.'
      : 'PRODUCT: show a clean, realistic 3D render of the VirtuBox product as the hero on one side, in a bright modern interior.',
    '',
    'TEXT TO PUT ON THE POSTER (use these words exactly, spelled correctly, and add no other facts, numbers, prices, places or names):',
    `Title: ${b.title}`,
  ];
  if (b.tagline) lines.push(`Tagline: ${b.tagline}`);
  if (b.features && b.features.length) {
    lines.push('Key points (give each a simple icon; show them as numbered steps or icon columns):');
    b.features.forEach((f) => lines.push(`- ${[f.title, f.text].filter(Boolean).join(': ')}`));
  }
  if (b.specs && b.specs.length) {
    lines.push('Specifications (small neat panel):');
    b.specs.forEach((s) => lines.push(`- ${s.label}: ${s.value}`));
  }
  if (b.ideal) lines.push(`Info panel: ${b.ideal}`);
  lines.push(`Closing pill: ${b.cta || 'Book a free demo'}`);
  lines.push(`Footer contact line: ${CONTACT.phone}  |  ${CONTACT.email}  |  ${CONTACT.site}`);
  lines.push('');
  lines.push(`Keep all text sharp, large and readable${story ? ', and keep the top 8% and bottom 10% free of important text because WhatsApp covers them' : ''}. Do not add watermarks. Return only the image.`);
  return lines.join('\n');
}

const b64 = (buf) => buf.toString('base64');

async function viaGemini(prompt, images, aspect) {
  const parts = [{ text: prompt }, ...images.map((i) => ({ inline_data: { mime_type: i.mime, data: b64(i.data) } }))];
  const res = await fetch(`${process.env.IMAGE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'}/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j.error && j.error.message) || `Image service HTTP ${res.status}`);
  const part = ((j.candidates || [])[0]?.content?.parts || []).find((p) => (p.inlineData || p.inline_data));
  const d = part && (part.inlineData || part.inline_data);
  if (!d) throw new Error('The image model did not return a picture. Please try again.');
  return { mime: d.mimeType || d.mime_type || 'image/png', data: d.data };
}

async function viaOpenRouter(prompt, images, aspect) {
  const content = [{ type: 'text', text: prompt }, ...images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${b64(i.data)}` } }))];
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_KEY}` },
    body: JSON.stringify({ model: MODEL, modalities: ['image', 'text'], image_config: { aspect_ratio: aspect }, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j.error && j.error.message) || `Image service HTTP ${res.status}`);
  const url = ((j.choices || [])[0]?.message?.images || [])[0]?.image_url?.url || '';
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('The image model did not return a picture. Please try again.');
  return { mime: m[1], data: m[2] };
}

/** banner: the normalised banner JSON. product: { mime, data: Buffer } | null. Resolves { mime, data (base64) }. */
async function generateInfographic(banner, product) {
  if (!enabled()) throw new Error('AI image generation is not set up. Add GEMINI_API_KEY (or OPENROUTER_API_KEY) to the server settings.');
  const images = [];
  try { images.push({ mime: 'image/jpeg', data: fs.readFileSync(STYLE_PATH) }); } catch { /* style reference missing: prompt still describes it */ }
  if (product) images.push(product);
  const aspect = banner.format === 'story' ? '9:16' : '4:5';
  const prompt = buildPrompt(banner, Boolean(product));
  return GEMINI_KEY ? viaGemini(prompt, images, aspect) : viaOpenRouter(prompt, images, aspect);
}

module.exports = { generateInfographic, imageGenEnabled: enabled, buildPrompt };
