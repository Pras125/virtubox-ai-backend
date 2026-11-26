// AI-designed poster, made by Claude only: Claude looks at the two house-style examples and the product one-pagers,
// then writes the poster as an SVG. The server adds the icon set and the photos, checks the SVG, and the browser turns it into a PNG.
const fs = require('fs');
const path = require('path');

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.CLAUDE_DESIGN_MODEL || 'claude-sonnet-5-5';
const BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const TIMEOUT_MS = Number(process.env.DESIGN_TIMEOUT_MS || 170000);
const STYLES = { blue: path.join(__dirname, '..', 'assets', 'style-blue.jpg'), light: path.join(__dirname, '..', 'assets', 'style-light.jpg') };
const CONTACT = { email: 'hello@virtubox.io', phone: '+91 9810473340', site: 'www.virtubox.io' };
const SIZE = { story: { w: 1080, h: 1920 }, post: { w: 1080, h: 1350 } };

const enabled = () => Boolean(KEY);

// ── icon set: 24×24 line icons Claude can place with <use href="#ic-name" ... color="#fff"/> ──
const ICONS = {
  play: '<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="M16 10l6-3v10l-6-3"/>',
  screen: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  kiosk: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M9 18h6M9 6h6v7H9z"/>',
  bolt: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
  headset: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="14" width="4" height="6" rx="1.5"/><rect x="18" y="14" width="4" height="6" rx="1.5"/><path d="M21 20c0 1.5-2 2-5 2"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  chart: '<path d="M3 3v18h18M7 14l4-4 4 4 5-6"/>',
  store: '<path d="M3 9l1-5h16l1 5M3 9v11h18V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
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

function buildPrompt(b, nPhotos, look) {
  const { w, h } = SIZE[b.format === 'story' ? 'story' : 'post'];
  const story = b.format === 'story';
  const p = b.poster || {};
  const L = [];
  const add = (...x) => L.push(...x);
  add(`Design one finished, professional social-media poster for VirtuBox as a single SVG, ${w}×${h}px (${story ? 'WhatsApp status, 9:16' : 'WhatsApp post, 4:5'}).`);
  add('', LOOK[look] || LOOK.blue);
  add('', 'The images attached before this message are: image 1 = the style example to imitate (look and layout only; never copy its words, names, places or facts)' + (nPhotos ? `, then ${nPhotos} real VirtuBox one-pager(s) showing the product(s) this poster is about.` : '.'));
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
  const contacts = (p.contacts || []).map((c) => [c.name, c.phone].filter(Boolean).join('  ')).filter(Boolean);
  add(`Footer contact lines: ${contacts.length ? contacts.join('  |  ') : `${CONTACT.phone}  |  ${CONTACT.email}  |  ${CONTACT.site}`}`);
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
  if (!enabled()) throw new Error('AI poster design is not set up. Add ANTHROPIC_API_KEY to the server settings.');
  const look = banner.look === 'light' ? 'light' : 'blue';
  const content = [];
  const img = (mime, data) => content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: data.toString('base64') } });
  try { img('image/jpeg', fs.readFileSync(STYLES[look])); } catch { /* the prompt still describes the style */ }
  for (const p of photos) img(p.mime.startsWith('image/') ? p.mime : 'image/png', p.data);
  content.push({ type: 'text', text: buildPrompt(banner, photos.length, look) });
  const raw = await callClaude(content, SYSTEM);
  return { svg: finishSvg(raw, banner, photos) };
}

module.exports = { designPoster, designEnabled: enabled, buildPrompt, finishSvg };
