// AI-designed poster, made by Claude only: Claude looks at the two house-style examples and the product one-pagers,
// then writes the poster as an SVG. The server adds the icon set and the photos, checks the SVG, and the browser turns it into a PNG.
const fs = require('fs');
const path = require('path');
const { chat } = require('./llm');

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.CLAUDE_DESIGN_MODEL || 'claude-sonnet-5-5';
const BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const TIMEOUT_MS = Number(process.env.DESIGN_TIMEOUT_MS || 170000);
const STYLES = { blue: path.join(__dirname, '..', 'assets', 'style-blue.jpg'), light: path.join(__dirname, '..', 'assets', 'style-light.jpg') };
const CONTACT = { email: 'hello@virtubox.io', phone: '+91 9810473340', site: 'www.virtubox.io' };
const SIZE = { story: { w: 1080, h: 1920 }, post: { w: 1080, h: 1350 } };

// Engine: Claude when ANTHROPIC_API_KEY is set, otherwise Groq (text-only, lower quality). DESIGN_PROVIDER=groq|claude forces one.
const HAS_GROQ = Boolean((process.env.GROQ_API_KEYS || '').trim());
const engine = () => { const f = (process.env.DESIGN_PROVIDER || '').toLowerCase(); if (f === 'groq' && HAS_GROQ) return 'groq'; if (f === 'claude' && KEY) return 'claude'; return KEY ? 'claude' : HAS_GROQ ? 'groq' : null; };
const enabled = () => Boolean(engine());
// The optional "Creative AI" button is offered only with Claude (or when Groq is forced): free-form Groq layouts overlap too often.
const uiEnabled = () => engine() === 'claude' || (engine() === 'groq' && (process.env.DESIGN_PROVIDER || '').toLowerCase() === 'groq');

// ── icon set: 24×24 line icons Claude can place with <use href="#ic-name" ... color="#fff"/> ──
const ICONS = require('../public/icons.js');
const iconDefs = () => Object.entries(ICONS).map(([n, d]) => `<symbol id="ic-${n}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</g></symbol>`).join('');
// The VirtuBox mark: three folded panels and a few pixels, to sit left of the word "VirtuBox".
const LOGO = '<symbol id="vb-mark" viewBox="0 0 100 100"><path d="M8 38l34-14 12 40-34 14z" fill="#F4B81F"/><path d="M30 20l40-8 8 44-40 8z" fill="#EC5F43"/><path d="M48 34l38-6 6 42-38 8z" fill="#1B5FC7"/><rect x="62" y="4" width="9" height="9" fill="#1B5FC7"/><rect x="74" y="12" width="7" height="7" fill="#00A3B5"/><rect x="52" y="12" width="6" height="6" fill="#EC5F43"/></symbol>';

// ── photos: Drive one-pagers become <symbol id="photoN">, cropped to the product photo where we know where it is ──
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}
function photoSymbols(photos) {
  return photos.map((p, i) => {
    const sz = imageSize(p.data) || { w: 1000, h: 1400 };
    const c = p.crop || { x: 0, y: 0, w: 1, h: 1 };
    const vb = `${Math.round(c.x * sz.w)} ${Math.round(c.y * sz.h)} ${Math.round(c.w * sz.w)} ${Math.round(c.h * sz.h)}`;
    return `<symbol id="photo${i + 1}" viewBox="${vb}" preserveAspectRatio="xMidYMid slice"><image href="data:${p.mime};base64,${p.data.toString('base64')}" width="${sz.w}" height="${sz.h}"/></symbol>`;
  }).join('');
}

const LOOK = {
  blue: `BOLD BLUE (follow image 1): vivid royal-blue gradient background (#1243C6 to #0A1F6B) with soft blurred light circles (bokeh) and a light glow behind the top; a very large bold italic headline in white with the emphasis line larger in golden yellow (#FFD21F) and a yellow brush swoosh under it; the three motto words separated by yellow dots; the product photos in thick white rounded frames with small yellow spark lines at the corners; the pitch on a slanted yellow brush stroke with dark text; the four highlights as rounded dark-blue pills (#0A2A8C) each with a white circle holding a navy icon; a white rounded "Ideal for" panel with a navy label pill and a row of navy line icons over short captions; a wave-shaped deep-navy band with the closing line in white and yellow, three round outline icons with captions, and a yellow rounded button with dark text; a deep-navy footer bar with white phone icons and the contact lines.`,
  light: `LIGHT (follow image 1): near-white to pale-blue background with soft light; a deep-navy rounded title pill with white and golden-yellow lettering; a bold italic tagline with a yellow brush underline; icon circles in pale blue joined by arrows; short feature columns with navy line icons; a frosted white rounded info panel; a navy wave footer with white text; a golden-yellow rounded pill for the closing line. Palette: navy #0B4F8A, golden yellow #FFC629, white, light blue.`,
};

function buildPrompt(b, nPhotos, look, vision = true) {
  const { w, h } = SIZE[b.format === 'story' ? 'story' : 'post'];
  const story = b.format === 'story';
  const p = b.poster || {};
  const L = [];
  const add = (...x) => L.push(...x);
  add(`Design one finished, professional social-media poster for VirtuBox as a single SVG, ${w}×${h}px (${story ? 'WhatsApp status, 9:16' : 'WhatsApp post, 4:5'}).`);
  add('', LOOK[look] || LOOK.blue);
  if (vision) add('', 'The images attached before this message are: image 1 = the style example to imitate (look and layout only; never copy its words, names, places or facts)' + (nPhotos ? `, then ${nPhotos} real VirtuBox one-pager(s) showing the product(s) this poster is about.` : '.'));
  else add('', 'No images are attached; the style is described above in words.');
  add('', 'WORDS ON THE POSTER: use exactly these words, spelled exactly, and add no other facts, numbers, prices, names or places:');
  const head = [p.headline, p.emphasis].filter(Boolean);
  add(head.length ? `Headline: line 1 "${p.headline || ''}", line 2 (bigger, yellow) "${p.emphasis || ''}"` : `Headline: "${b.title}"`);
  if (p.motto && p.motto.length) add(`Motto: ${p.motto.join(' • ')}`); else if (b.tagline) add(`Tagline: ${b.tagline}`);
  if (p.pitch && p.pitch.length) add(`Pitch: ${p.pitch.map((x) => `"${x}"`).join(' then ')}`);
  const pills = p.highlights && p.highlights.length ? p.highlights : (b.features || []).map((f) => f.title || f.text).slice(0, 4);
  if (pills.length) add(`Highlight pills: ${pills.map((x) => `"${x}"`).join(', ')}`);
  if (p.idealFor && p.idealFor.length) add(`"Ideal for" items: ${p.idealFor.map((x) => `"${x}"`).join(', ')}`); else if (b.ideal) add(`Info panel: "${b.ideal}"`);
  if (p.benefits && p.benefits.length) add(`Benefits: ${p.benefits.map((x) => `"${x}"`).join(', ')}`);
  if (p.closing) add(`Closing line: "${p.closing}"`);
  if (b.specs && b.specs.length) add(`Specs (small strip): ${b.specs.slice(0, 6).map((s) => `${s.label}: ${s.value}`).join('; ')}`);
  add(`Button: "${b.cta || 'Book Now'}"`);
  add(`Footer contact lines: ${CONTACT.phone}  |  ${CONTACT.email}  |  ${CONTACT.site}`);
  add('', 'TOOLS ALREADY DEFINED FOR YOU (do not redefine them):');
  add(`- Icons, 24×24 line icons: <use href="#ic-NAME" x=".." y=".." width="48" height="48" color="#fff"/> (the colour comes from the color attribute). NAME is one of: ${Object.keys(ICONS).join(', ')}.`);
  add('- Logo mark: <use href="#vb-mark" x y width height/>. Put the wordmark next to it as text: "Virtu" in blue #1B5FC7 and "Box" in orange-yellow #F4A81F, bold, top left, on a white rounded plate so it stays readable on any background.');
  if (nPhotos) add(`- Photos: ${Array.from({ length: nPhotos }, (_, i) => `#photo${i + 1}`).join(', ')}. Place one as <g clip-path="url(#yourRoundedClip)"><use href="#photo1" x y width height/></g> inside a thick white rounded frame (draw the frame rect first). The clip-path MUST be on the wrapping <g>, never on the <use> itself, and the clipPath rect must use the same x, y, width, height as the <use>. They fill the box you give them, so give each a sensible box shape. Use every photo you have, each once.`);
  else add('- No photos are available: draw one simple, clean illustration of a floor-standing touch screen kiosk from basic shapes (rounded rectangles, a glowing screen) instead.');
  add('', 'RULES');
  add(`- Output ONLY the SVG, starting with <svg and ending with </svg>. No markdown, no commentary. Start it as <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">.`);
  add('- Self-contained: no scripts, no external images or fonts, no foreignObject. Define your own gradients, clipPaths, filters and shapes in your own <defs>.');
  add('- Text: font-family="Arial, Helvetica, sans-serif", font-weight 700 or 800, font-style italic for headlines. Real SVG <text> only. Estimate each line width as characters × font-size × 0.56 (bold), pick a font size so it fits its box with margin, and ALSO set textLength and lengthAdjust="spacingAndGlyphs" on every <text> so it can never overflow. Break long text into several <text> lines yourself. Centre or left-align deliberately; never let text touch the edges (margin 48px) or overlap other text.');
  add('- Make it look rich and designed: layered shapes, soft shadows (feDropShadow), gradients, rounded corners, consistent spacing, strong contrast, large readable type (nothing under 26px except footer contacts at 28px or more).');
  if (story) add(`- WhatsApp covers the top 150px and bottom 200px with its own bar: keep the logo below y=150 and all text and buttons above y=${h - 200}. Background may run to the edges.`);
  add(`- Section order, top to bottom: logo; headline and motto; photo frames; pitch with highlight pills; "Ideal for" panel; closing band with benefits and the button; footer contact bar. Give every section a proper share of the ${h}px height so nothing is cramped and no large area is empty.`);
  add('- Keep the file compact (reuse <defs> and <use> for repeated shapes) and under about 9000 tokens.');
  return L.join('\n');
}

// ── Claude call (streamed so a long answer never hits a read timeout) ──
async function callClaude(content, systemText) {
  const res = await fetch(`${BASE}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, stream: true, system: systemText, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const msg = (j.error && j.error.message) || `Claude API HTTP ${res.status}`;
    const e = new Error(res.status === 401 ? 'The Claude API key was rejected. Check ANTHROPIC_API_KEY on the server.' : msg);
    e.status = res.status; throw e;
  }
  let text = '', buf = '';
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try {
        const ev = JSON.parse(line.slice(5));
        if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') text += ev.delta.text;
        if (ev.type === 'error') throw new Error((ev.error && ev.error.message) || 'Claude API error');
      } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; }
    }
  }
  return text;
}

// ── make the SVG safe and complete ──
function finishSvg(raw, b, photos) {
  const { w, h } = SIZE[b.format === 'story' ? 'story' : 'post'];
  let s = String(raw || '');
  const a = s.indexOf('<svg'), z = s.lastIndexOf('</svg>');
  if (a < 0 || z < 0) throw new Error('Claude did not return a design. Please try again.');
  s = s.slice(a, z + 6);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*("|')(?!#|data:image\/(?:png|jpeg|jpg|webp);base64,)[^"']*\1/gi, '');
  const open = s.match(/^<svg[^>]*>/)[0];
  const fixed = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  return fixed + `<defs>${iconDefs()}${LOGO}${photoSymbols(photos)}</defs>` + s.slice(open.length);
}

const SYSTEM = 'You are a senior graphic designer who writes production-quality SVG posters for social media. You follow the brief exactly, keep all text inside its box, and output only SVG.';

/** banner: normalised banner JSON. photos: [{ mime, data: Buffer, crop? }]. Resolves { svg }. */
async function designPoster(banner, photos = []) {
  if (!enabled()) throw new Error('AI poster design is not set up. Add ANTHROPIC_API_KEY (or GROQ_API_KEYS) to the server settings.');
  const look = banner.look === 'light' ? 'light' : 'blue';
  if (engine() === 'groq') {
    const text = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: buildPrompt(banner, photos.length, look, false) }], { temperature: 0.4, max_tokens: 12000 });
    return { svg: finishSvg(text, banner, photos) };
  }
  const content = [];
  const img = (mime, data) => content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: data.toString('base64') } });
  try { img('image/jpeg', fs.readFileSync(STYLES[look])); } catch { /* the prompt still describes the style */ }
  for (const p of photos) img(p.mime.startsWith('image/') ? p.mime : 'image/png', p.data);
  content.push({ type: 'text', text: buildPrompt(banner, photos.length, look) });
  const raw = await callClaude(content, SYSTEM);
  return { svg: finishSvg(raw, banner, photos) };
}

module.exports = { designPoster, designEnabled: enabled, designUiEnabled: uiEnabled, designEngine: engine, buildPrompt, finishSvg };
