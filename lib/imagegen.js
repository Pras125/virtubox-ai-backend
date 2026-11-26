// AI-designed infographic: asks an image model (Gemini "nano banana", directly or through OpenRouter) to paint the whole poster.
// The copy comes from the knowledge-based banner JSON, so the facts stay the ones in the one-pagers.
// Two reference images go along: the house style example (assets/infographic-style.jpg) and the product's Drive one-pager.
const fs = require('fs');
const path = require('path');

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const MODEL = process.env.IMAGE_MODEL || (GEMINI_KEY ? 'gemini-2.5-flash-image' : 'google/gemini-2.5-flash-image');
const STYLES = { blue: path.join(__dirname, '..', 'assets', 'style-blue.jpg'), light: path.join(__dirname, '..', 'assets', 'style-light.jpg') };
const TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS || 55000);

const enabled = () => Boolean(GEMINI_KEY || OPENROUTER_KEY);
const CONTACT = { email: 'hello@virtubox.io', phone: '+91 9810473340', site: 'www.virtubox.io' };

const LOOK = {
  blue: 'STYLE: image 1 is the house style reference. Reproduce its look: a vivid royal-blue background with a softly blurred bright exhibition-hall or event-venue scene and light bokeh; a very large bold italic headline in white and golden yellow with a yellow brush swoosh underneath; the three motto words separated by yellow dots; real-looking photographs of the product in thick white rounded frames on the left, with small yellow spark lines at the corners; on the right a yellow brush-stroke highlight behind the key pitch and a stack of rounded dark-blue pill buttons, each with a white circular icon, for the highlights; a white rounded "Ideal for" panel with a navy label pill and a row of navy line icons with short captions; a dark-blue wave band with a closing line on the left, three circular outline icons with captions, and a yellow rounded button; and a dark-navy footer bar with phone icons and contact lines. Palette: royal blue #1243C6, deep navy #0A1F6B, golden yellow #FFD21F, white.',
  light: 'STYLE: image 1 is the house style reference. Reproduce its look: bright white and pale-blue background with soft light, a deep-navy rounded title pill with white and golden-yellow lettering, a bold italic tagline with a yellow brush underline, a row of round pale-blue icon circles joined by arrows, short feature columns with navy line icons, a frosted rounded info panel, a navy wave footer, and a golden-yellow pill for the closing line. Palette: navy blue #0B4F8A, golden yellow #FFC629, white, light blue.',
};

function buildPrompt(b, nProduct, look = 'blue') {
  const story = b.format === 'story';
  const p = b.poster || {};
  const lines = [
    `Design ONE finished, polished, professional marketing poster for VirtuBox, ready to post as a WhatsApp ${story ? 'status (tall 9:16)' : 'post (4:5 portrait)'}. It must look like a real designer-made social-media ad, not a document.`,
    '',
    LOOK[look] || LOOK.blue,
    'Place the VirtuBox logo top left exactly as it appears in image 1 (a small cluster of orange, blue and yellow folded shapes above the word VirtuBox), on a light area. Apart from that logo, do NOT copy any words, products, names, locations or facts from the style reference. It shows look and layout only.',
    nProduct
      ? `PHOTOS: the other ${nProduct === 1 ? 'image is a' : nProduct + ' images are'} real VirtuBox one-pager${nProduct === 1 ? '' : 's'} for this solution. Show the product${nProduct === 1 ? '' : 's'} as realistic, clean photographs in white rounded frames, faithful to what the one-pager${nProduct === 1 ? ' shows' : 's show'} (same kind of kiosk or screen, same shape).`
      : 'PHOTOS: show realistic, clean photographs of the VirtuBox kiosk or display in white rounded frames.',
    '',
    'TEXT TO PUT ON THE POSTER. Use these words exactly, spelled correctly, and add no other facts, numbers, prices, places or names:',
  ];
  const headline = [p.headline, p.emphasis].filter(Boolean);
  if (headline.length) lines.push(`Headline (big, two lines, the second line larger and yellow): ${p.headline || ''} / ${p.emphasis || ''}`);
  else lines.push(`Headline: ${b.title}`);
  if (p.motto && p.motto.length) lines.push(`Motto line: ${p.motto.join('  •  ')}`);
  else if (b.tagline) lines.push(`Tagline: ${b.tagline}`);
  if (p.pitch && p.pitch.length) lines.push(`Pitch (second line on yellow brush highlight): ${p.pitch.join(' / ')}`);
  const pills = p.highlights && p.highlights.length ? p.highlights : (b.features || []).map((f) => f.title || f.text).slice(0, 4);
  if (pills.length) lines.push(`Highlight pills (one icon each): ${pills.join(' | ')}`);
  if (p.idealFor && p.idealFor.length) lines.push(`"Ideal for" panel items (one line icon each): ${p.idealFor.join(' | ')}`);
  else if (b.ideal) lines.push(`Info panel: ${b.ideal}`);
  if (p.benefits && p.benefits.length) lines.push(`Benefits row (circular icon each): ${p.benefits.join(' | ')}`);
  if (p.closing) lines.push(`Closing line: ${p.closing}`);
  if (b.specs && b.specs.length) { lines.push('Small spec strip:'); b.specs.slice(0, 6).forEach((s) => lines.push(`- ${s.label}: ${s.value}`)); }
  lines.push(`Yellow button: ${b.cta || 'Book Now'}`);
  const contacts = (p.contacts || []).map((c) => [c.name, c.phone].filter(Boolean).join('  ')).filter(Boolean);
  lines.push(`Footer bar contact lines: ${contacts.length ? contacts.join('   |   ') : `${CONTACT.phone}   |   ${CONTACT.email}   |   ${CONTACT.site}`}`);
  lines.push('');
  lines.push(`Make every word sharp, large and easy to read${story ? ', and keep the top 8% and bottom 10% free of important text because WhatsApp covers them' : ''}. Do not add any other text, watermarks or logos. Return only the finished poster image.`);
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

/** banner: the normalised banner JSON. products: [{ mime, data: Buffer }]. Resolves { mime, data (base64) }. */
async function generateInfographic(banner, products = []) {
  if (!enabled()) throw new Error('AI image generation is not set up. Add GEMINI_API_KEY (or OPENROUTER_API_KEY) to the server settings.');
  const look = banner.look === 'light' ? 'light' : 'blue';
  const images = [];
  try { images.push({ mime: 'image/jpeg', data: fs.readFileSync(STYLES[look]) }); } catch { /* style reference missing: prompt still describes it */ }
  images.push(...products);
  const aspect = banner.format === 'story' ? '9:16' : '4:5';
  const prompt = buildPrompt(banner, products.length, look);
  return GEMINI_KEY ? viaGemini(prompt, images, aspect) : viaOpenRouter(prompt, images, aspect);
}

module.exports = { generateInfographic, imageGenEnabled: enabled, buildPrompt };
