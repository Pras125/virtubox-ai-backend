// Draws a shareable sales banner or infographic (1080×1350 post, or 1080×1920 story for WhatsApp status) on a canvas,
// in the style of the VirtuBox one-pagers: white page, teal headings, coral and yellow accents, product photo.
// Input: { title, tagline, features: [{ title, text }], specs: [{ label, value }], ideal, cta, image: { id, crop } }
(function () {
  const W = 1080, PAD = 64;
  const SIZES = { post: 1350, story: 1920 }; // post = 4:5 for chats and feeds, story = 9:16 for WhatsApp status / stories
  const SAFE = { top: 70, bottom: 150 };     // story: WhatsApp covers the top and bottom strip with its own buttons
  const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const TEAL = '#1e7da0', CYAN = '#00a3b5', CORAL = '#ec5f43', YELLOW = '#f4b81f';
  const CONTACT = { email: 'hello@virtubox.io', phone: '+91 9810473340', site: 'www.virtubox.io' };

  const THEMES = {
    event: { name: 'Event blue', event: true },
    light: { name: 'Light', bg: ['#ffffff', '#f3f9fb'], title: [TEAL, CYAN], text: '#1b1f24', muted: '#5c6670', card: '#ffffff', line: '#e1e5ea', brand: TEAL, bar: [TEAL, CYAN], foot: '#ececec', footText: '#1b1f24' },
    dark: { name: 'Dark', bg: ['#0c3a47', '#082730'], title: ['#ffffff', '#8fe6f0'], text: '#ffffff', muted: '#b9d3d9', card: 'rgba(255,255,255,.09)', line: 'rgba(255,255,255,.2)', brand: '#ffffff', bar: [CORAL, '#f58a4b'], foot: '#061d24', footText: '#ffffff' },
    warm: { name: 'Warm', bg: ['#fffaf0', '#fff1d6'], title: [CORAL, '#f08a3c'], text: '#2a1c12', muted: '#6b5a4b', card: '#ffffff', line: '#f0dfc0', brand: TEAL, bar: [CORAL, '#f08a3c'], foot: '#2a1c12', footText: '#ffffff' },
  };

  function wrap(ctx, text, maxW) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = []; let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width <= maxW || !line) line = t; else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  }
  function clip(ctx, text, maxW) {
    let t = String(text || '');
    if (ctx.measureText(t).width <= maxW) return t;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function grad(ctx, x0, x1, [a, b]) { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  function dots(ctx, x, y, r) {
    ctx.fillStyle = CORAL; ctx.beginPath(); ctx.arc(x + r, y - r, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = YELLOW; ctx.beginPath(); ctx.arc(x + r * 3.4, y - r, r, 0, Math.PI * 2); ctx.fill();
  }

  function label(ctx, text, x, y, px, T) {
    ctx.font = `800 ${px(22)}px ${FONT}`; ctx.fillStyle = CORAL; ctx.fillText(text.toUpperCase().split('').join('\u200a'), x, y);
    const w = ctx.measureText(text.toUpperCase().split('').join('\u200a')).width;
    ctx.fillStyle = T.line; ctx.fillRect(x + w + 16, y - px(8), W - PAD - x - w - 16, 2);
  }

  // Product photo: a cropped region of the one-pager when we know where the photo is, otherwise the whole page as a tilted card.
  function drawPhoto(ctx, img, crop, x, y, w, h) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.16)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#ffffff'; rr(ctx, x, y, w, h, 22); ctx.fill();
    ctx.restore();
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const c = crop || { x: 0, y: 0, w: 1, h: 1 };
    const sx = c.x * iw, sy = c.y * ih, sw = c.w * iw, sh = c.h * ih;
    const m = crop ? 18 : 30;
    const s = Math.min((w - m * 2) / sw, (h - m * 2) / sh);
    const dw = sw * s, dh = sh * s;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (!crop) { ctx.rotate(-0.035); ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  // Lays the banner out at type scale k. Returns the y where the content ends, so the caller can pick the largest k that fits.
  function draw(ctx, d, k, T, img) {
    const story = d.format === 'story', H = SIZES[d.format], o = story ? SAFE.top : 0;
    const px = (n) => Math.round(n * k);
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, T.bg[0]); bg.addColorStop(1, T.bg[1]);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // soft brand shapes in the corner
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = CYAN; ctx.beginPath(); ctx.arc(W + 40, -30, 260, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = YELLOW; ctx.beginPath(); ctx.arc(W - 150, -90, 170, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // brand row
    ctx.font = `800 42px ${FONT}`; ctx.fillStyle = T.brand;
    ctx.fillText('VirtuBox', PAD, 92 + o);
    dots(ctx, PAD + ctx.measureText('VirtuBox').width + 8, 92 + o, 6);
    ctx.font = `500 22px ${FONT}`; ctx.fillStyle = T.muted; ctx.textAlign = 'right';
    ctx.fillText('Interactive kiosk & signage solutions', W - PAD, 88 + o); ctx.textAlign = 'left';
    ctx.fillStyle = CORAL; ctx.fillRect(PAD, 118 + o, W - PAD * 2, 2);
    let y = 118 + o + px(22);

    // title
    ctx.font = `800 ${px(86)}px ${FONT}`;
    const tl = wrap(ctx, d.title, W - PAD * 2 - 60).slice(0, 2);
    ctx.fillStyle = grad(ctx, PAD, PAD + Math.max(...tl.map((l) => ctx.measureText(l).width), 200), T.title);
    for (const l of tl) { y += px(90); ctx.fillText(l, PAD, y); }
    dots(ctx, PAD + ctx.measureText(tl[tl.length - 1] || '').width + px(10), y, px(9));
    y += px(18);

    // tagline
    if (d.tagline) {
      ctx.fillStyle = T.text; ctx.font = `600 ${px(34)}px ${FONT}`;
      for (const l of wrap(ctx, d.tagline, W - PAD * 2).slice(0, 3)) { y += px(46); ctx.fillText(l, PAD, y); }
    }
    y += px(34);

    // photo (left) + feature cards (right)
    // post: photo left, cards right. story: wide photo on top, cards full width below.
    let pw = img ? 320 : 0, gap = img ? 32 : 0;
    if (story && img) {
      const ph = px(470);
      drawPhoto(ctx, img, d.crop, PAD, y, W - PAD * 2, ph);
      y += ph + px(28); pw = 0; gap = 0; img = null;
    }
    const fx = PAD + pw + gap, fw = W - PAD - fx;
    const top = y;
    if (story) { y += px(26); label(ctx, 'Why it works', PAD, y, px, T); y += px(26); }
    const stepY = [];
    for (const [fi, f] of d.features.entries()) {
      if (story) {
        const r = px(30), tx = PAD + r * 2 + 26, tw = W - PAD - tx - 20;
        ctx.font = `400 ${px(26)}px ${FONT}`;
        const lines = f.text ? wrap(ctx, f.text, tw).slice(0, 3) : [];
        const ch = Math.max(r * 2 + px(8), px(14) + (f.title ? px(36) : 0) + lines.length * px(34) + px(18));
        ctx.fillStyle = T.card; rr(ctx, PAD + r, y, W - PAD * 2 - r, ch, 16); ctx.fill();
        ctx.strokeStyle = T.line; ctx.lineWidth = 2; ctx.stroke();
        stepY.push([y + ch / 2, ch]);
        let ty = y + px(14);
        if (f.title) { ctx.fillStyle = T.text; ctx.font = `800 ${px(30)}px ${FONT}`; ty += px(30); ctx.fillText(clip(ctx, f.title, tw), tx, ty); ty += px(6); }
        ctx.fillStyle = T.muted === '#5c6670' ? '#3c4650' : T.text; ctx.font = `400 ${px(26)}px ${FONT}`;
        lines.forEach((l) => { ty += px(34); ctx.fillText(l, tx, ty); });
        y += ch + px(20);
        continue;
      }
      const tw = fw - 30 - 54;
      ctx.font = `400 ${px(25)}px ${FONT}`;
      const lines = f.text ? wrap(ctx, f.text, tw).slice(0, story ? 3 : 2) : [];
      const ch = px(26) + (f.title ? px(34) : 0) + lines.length * px(32) + px(10);
      ctx.fillStyle = T.card; rr(ctx, fx, y, fw, ch, 14); ctx.fill();
      ctx.strokeStyle = T.line; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); rr(ctx, fx, y, fw, ch, 14); ctx.clip(); ctx.fillStyle = CORAL; ctx.fillRect(fx + fw - 30, y, 30, ch); ctx.restore();
      let ty = y + px(18);
      if (f.title) { ctx.fillStyle = T.text; ctx.font = `700 ${px(28)}px ${FONT}`; ty += px(26); ctx.fillText(clip(ctx, f.title, tw), fx + 24, ty); ty += px(8); }
      ctx.fillStyle = T.text; ctx.font = `400 ${px(25)}px ${FONT}`;
      lines.forEach((l) => { ty += px(32); ctx.fillText(l, fx + 24, ty); });
      y += ch + px(14);
    }
    if (story) {
      y -= px(20);
      // connector line and numbered badges drawn over the cards' left edge
      const r = px(30), cx = PAD + r;
      if (stepY.length > 1) { ctx.strokeStyle = CORAL; ctx.lineWidth = 4; ctx.setLineDash([2, 10]); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, stepY[0][0]); ctx.lineTo(cx, stepY[stepY.length - 1][0]); ctx.stroke(); ctx.setLineDash([]); }
      const cols = [CORAL, TEAL, YELLOW, CYAN];
      stepY.forEach(([cy], i) => {
        ctx.fillStyle = cols[i % 4]; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 5; ctx.strokeStyle = T.bg[1]; ctx.stroke();
        ctx.fillStyle = i % 4 === 2 ? '#1b1f24' : '#ffffff'; ctx.font = `800 ${px(30)}px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), cx, cy + px(10)); ctx.textAlign = 'left';
      });
    }
    y -= px(14);
    if (img) {
      const ph = Math.max(y - top, px(430));
      drawPhoto(ctx, img, d.crop, PAD, top, pw, ph);
      y = top + ph;
    }
    y += px(26);

    // specs: three-column cards with coral / yellow / teal labels
    if (d.specs.length) {
      if (story) { y += px(34); label(ctx, 'Specifications', PAD, y, px, T); y += px(24); }
      const g = 16, cw = (W - PAD * 2 - g * 2) / 3, ch = px(92);
      const cols = [CORAL, '#e0a200', CYAN];
      d.specs.forEach((s, i) => {
        const x = PAD + (i % 3) * (cw + g), cy = y + Math.floor(i / 3) * (ch + g);
        ctx.fillStyle = T.card; rr(ctx, x, cy, cw, ch, 14); ctx.fill();
        ctx.strokeStyle = T.line; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = cols[i % 3]; ctx.font = `700 ${px(24)}px ${FONT}`;
        ctx.fillText(clip(ctx, s.label, cw - 36), x + 18, cy + px(38));
        ctx.fillStyle = T.text; ctx.font = `500 ${px(23)}px ${FONT}`;
        ctx.fillText(clip(ctx, s.value, cw - 36), x + 18, cy + px(72));
      });
      y += Math.ceil(d.specs.length / 3) * (ch + g) + px(10);
    }

    // "Ideal for …" band
    if (d.ideal) {
      ctx.font = `700 ${px(27)}px ${FONT}`;
      const lines = wrap(ctx, d.ideal, W - PAD * 2 - 60).slice(0, 2);
      const bh = px(34) + lines.length * px(38);
      ctx.fillStyle = YELLOW; rr(ctx, PAD, y, W - PAD * 2, bh, 16); ctx.fill();
      ctx.fillStyle = '#1b1f24'; ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, W / 2, y + px(44) + i * px(38)));
      ctx.textAlign = 'left';
      y += bh;
    }
    return y;
  }

  const BAR = 104, FOOT = 66;
  function footer(ctx, d, T) {
    const H = SIZES[d.format], safe = d.format === 'story' ? SAFE.bottom : 0;
    const by = H - FOOT - BAR - safe;
    ctx.fillStyle = grad(ctx, 0, W, T.bar); ctx.fillRect(0, by, W, BAR);
    ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
    ctx.font = `700 32px ${FONT}`; ctx.textAlign = 'right';
    ctx.fillText(CONTACT.phone, W - PAD, by + BAR / 2 + 2);
    const pw = ctx.measureText(CONTACT.phone).width;
    ctx.textAlign = 'left'; ctx.font = `800 40px ${FONT}`;
    ctx.fillText(clip(ctx, d.cta, W - PAD * 2 - pw - 40), PAD, by + BAR / 2 + 2);

    const fy = H - FOOT - safe;
    ctx.fillStyle = T.foot; ctx.fillRect(0, fy, W, FOOT + safe);
    ctx.font = `800 24px ${FONT}`; ctx.fillStyle = T.footText === '#ffffff' ? '#8fe6f0' : TEAL;
    ctx.fillText('VirtuBox', PAD, fy + FOOT / 2 + 1);
    const vw = ctx.measureText('VirtuBox ').width;
    ctx.fillStyle = T.footText; ctx.font = `700 24px ${FONT}`;
    ctx.fillText('Infotech Pvt. Ltd.', PAD + vw, fy + FOOT / 2 + 1);
    ctx.font = `500 22px ${FONT}`; ctx.textAlign = 'right';
    ctx.fillText(`${CONTACT.email}   ·   ${CONTACT.site}`, W - PAD, fy + FOOT / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }


  // ───────── "Event blue" poster: fixed layout in the style of the blue event banners ─────────
  // Only one-pagers whose photo area is known (lib/bannerCrops.json) are shown as photos; others get the kiosk stand-in, or the rep's own photo.
  const NAVY = '#0A2A8C', DEEP = '#0A1F6B', ROYAL = '#1243C6', SUN = '#FFD21F';
  const ICON_RULES = [
    [/announce|broadcast|campaign|launch/, 'megaphone'], [/schedul|timeline|calendar|agenda/, 'calendar'],
    [/offer|promo|discount|brand|coupon|deal/, 'tag'], [/video|\bads?\b|play|stream|live|feed|film/, 'play'],
    [/image|photo|gallery|highlight|selfie|picture/, 'image'], [/visib|boost|star|premium|best/, 'star'],
    [/qr|scan|code/, 'qr'], [/upload|document|file|form/, 'upload'], [/print/, 'printer'],
    [/cost|price|afford|saving|revenue|roi|budget/, 'tag'], [/pay|upi|cash|secure|safe|privacy|trust/, 'shield'], [/report|analytic|data|insight|track|chart|stat/, 'chart'],
    [/support|help|assist|care|service/, 'headset'], [/setup|install|easy|quick|fast|instant|speed|power/, 'bolt'],
    [/rent|flexib|plan|scal|expand|custom/, 'expand'], [/wifi|offline|online|cloud|remote|connect/, 'wifi'],
    [/user|visitor|customer|people|queue|lead|crowd/, 'users'], [/store|retail|shop|mall|cafe|restaurant|food|market/, 'store'],
    [/gov|court|office|cent(er|re)|location|venue|campus|universit|librar|school|hospital|museum|airport|station/, 'pin'],
    [/kiosk|touch|screen|display|signage|standee/, 'kiosk'], [/info|share|content|inform|event/, 'info'],
  ];
  const ICON_CYCLE = ['check', 'star', 'info', 'bolt'];
  const pickIcon = (text, i) => { const t = String(text || '').toLowerCase(); for (const [re, n] of ICON_RULES) if (re.test(t)) return n; return ICON_CYCLE[i % ICON_CYCLE.length]; };

  const iconCache = {};
  function iconParts(name) {
    if (iconCache[name]) return iconCache[name];
    const src = (window.VB_ICONS || {})[name] || (window.VB_ICONS || {}).check || '';
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${src}</svg>`, 'image/svg+xml');
    return (iconCache[name] = [...doc.documentElement.children].map((e) => {
      const a = (n) => parseFloat(e.getAttribute(n) || 0);
      if (e.tagName === 'path') return new Path2D(e.getAttribute('d'));
      const q = new Path2D();
      if (e.tagName === 'circle') q.arc(a('cx'), a('cy'), a('r'), 0, Math.PI * 2);
      else if (e.tagName === 'rect') { const x = a('x'), y = a('y'), w = a('width'), h = a('height'), r = a('rx'); q.roundRect ? q.roundRect(x, y, w, h, r) : q.rect(x, y, w, h); }
      return q;
    }));
  }
  function icon(ctx, name, x, y, size, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const q of iconParts(name)) ctx.stroke(q);
    ctx.restore();
  }
  // largest font size (at most `start`) at which the text fits maxW
  function fit(ctx, text, maxW, start, weight, italic, min = 18) {
    let sz = start; const f = (z) => `${italic ? 'italic ' : ''}${weight} ${z}px ${FONT}`;
    ctx.font = f(sz);
    while (sz > min && ctx.measureText(text).width > maxW) { sz -= 2; ctx.font = f(sz); }
    return sz;
  }
  function logoMark(ctx, x, y, size) {
    const sc = size / 100;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    const paths = [['#F4B81F', 'M8 38l34-14 12 40-34 14z'], ['#EC5F43', 'M30 20l40-8 8 44-40 8z'], ['#1B5FC7', 'M48 34l38-6 6 42-38 8z']];
    for (const [c, d] of paths) { ctx.fillStyle = c; ctx.fill(new Path2D(d)); }
    ctx.fillStyle = '#1B5FC7'; ctx.fillRect(62, 4, 9, 9); ctx.fillStyle = CYAN; ctx.fillRect(74, 12, 7, 7); ctx.fillStyle = CORAL; ctx.fillRect(52, 12, 6, 6);
    ctx.restore();
  }
  function cover(ctx, img, crop, x, y, w, h, r) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const c = crop || { x: 0, y: 0, w: 1, h: 1 };
    const sx = c.x * iw, sy = c.y * ih, sw = c.w * iw, sh = c.h * ih;
    const s = Math.max(w / sw, h / sh), dw = sw * s, dh = sh * s;
    ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }
  function kioskArt(ctx, x, y, w, h) { // stand-in when no product photo is known
    const kw = Math.min(w * 0.5, h * 0.52), kx = x + (w - kw) / 2;
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dbe8ff');
    ctx.fillStyle = g; rr(ctx, x, y, w, h, 20); ctx.fill();
    ctx.fillStyle = '#0d1b3d'; rr(ctx, kx, y + h * 0.08, kw, h * 0.62, 18); ctx.fill();
    const sg = ctx.createLinearGradient(0, y, 0, y + h); sg.addColorStop(0, '#53a6ff'); sg.addColorStop(1, '#1b5fc7');
    ctx.fillStyle = sg; rr(ctx, kx + 10, y + h * 0.08 + 10, kw - 20, h * 0.62 - 20, 10); ctx.fill();
    ctx.fillStyle = '#e9eef8'; rr(ctx, kx + kw * 0.15, y + h * 0.7, kw * 0.7, h * 0.22, 12); ctx.fill();
  }

  function drawEvent(ctx, d, k, photos) {
    const story = d.format === 'story', H = SIZES[d.format], p = d.poster, px = (n) => Math.round(n * k);
    const safeB = story ? SAFE.bottom : 0, barH = 96;
    const fy = H - safeB - barH, limit = fy - 22;
    const innerW = W - PAD * 2;
    // background: royal-blue gradient, glow and soft bokeh
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, ROYAL); bg.addColorStop(1, DEEP);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.2, 80, 20, W * 0.2, 80, 700); glow.addColorStop(0, 'rgba(255,255,255,.5)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    [[880, 300, 150], [160, 760, 110], [940, 1050, 130], [120, 1500, 120], [700, 1700, 90], [520, 220, 70]].forEach(([bx, by, br]) => {
      const by2 = by * H / 1920; const g = ctx.createRadialGradient(bx, by2, 0, bx, by2, br);
      g.addColorStop(0, 'rgba(160,200,255,.28)'); g.addColorStop(1, 'rgba(160,200,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by2, br, 0, Math.PI * 2); ctx.fill();
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let y = story ? SAFE.top + 70 : 38;

    // logo plate
    const lh = px(78);
    ctx.font = `800 ${px(44)}px ${FONT}`;
    const wv = ctx.measureText('Virtu').width, wb = ctx.measureText('Box').width, pw = px(16) + lh * 0.9 + px(10) + wv + wb + px(24);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5; ctx.fillStyle = '#ffffff'; rr(ctx, PAD, y, pw, lh, lh / 2); ctx.fill(); ctx.restore();
    logoMark(ctx, PAD + px(16), y + lh * 0.07, lh * 0.86);
    ctx.font = `800 ${px(44)}px ${FONT}`;
    ctx.fillStyle = '#1B5FC7'; ctx.fillText('Virtu', PAD + px(16) + lh * 0.9 + px(10), y + lh * 0.67);
    ctx.fillStyle = '#F4A81F'; ctx.fillText('Box', PAD + px(16) + lh * 0.9 + px(10) + wv, y + lh * 0.67);
    y += lh + px(30);

    // headline + emphasis + swoosh
    const l1 = p.headline || d.title, l2 = p.emphasis || '';
    let sz = fit(ctx, l1, innerW, px(80), 800, true);
    ctx.fillStyle = '#ffffff'; y += sz * 0.9; ctx.fillText(l1, PAD, y);
    if (l2) {
      sz = fit(ctx, l2, innerW, px(112), 800, true); ctx.fillStyle = SUN; y += sz * 1.02; ctx.fillText(l2, PAD, y);
      const ew = Math.min(ctx.measureText(l2).width, innerW);
      ctx.strokeStyle = SUN; ctx.lineWidth = px(7); ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(PAD + ew * 0.05, y + px(22)); ctx.quadraticCurveTo(PAD + ew * 0.5, y + px(4), PAD + ew * 0.95, y + px(16)); ctx.stroke();
    }
    y += px(70);

    // motto
    if (p.motto.length) {
      ctx.font = `italic 600 ${px(40)}px ${FONT}`; ctx.fillStyle = '#ffffff';
      let x = PAD;
      p.motto.forEach((m, i) => {
        if (i) { ctx.fillStyle = SUN; ctx.beginPath(); ctx.arc(x + px(22), y - px(13), px(7), 0, Math.PI * 2); ctx.fill(); x += px(44); ctx.fillStyle = '#ffffff'; }
        ctx.fillText(m, x, y); x += ctx.measureText(m).width;
      });
      y += px(44);
    } else y += px(10);

    // pitch on a slanted yellow brush: draws at (x, y) in a column of width w and returns its height
    const drawPitch = (x, w, y0) => {
      if (!p.pitch.length) return 0;
      const a = p.pitch[0], b = p.pitch[1] || '';
      const s1 = fit(ctx, a, w - px(56), px(34), 700, true), s2 = b ? fit(ctx, b, w - px(56), px(50), 800, true) : 0;
      const bh = px(26) + s1 * 1.1 + (b ? s2 * 1.15 : 0) + px(14);
      ctx.fillStyle = SUN; ctx.beginPath(); ctx.moveTo(x, y0 + px(10)); ctx.lineTo(x + w, y0); ctx.lineTo(x + w - px(10), y0 + bh); ctx.lineTo(x + px(8), y0 + bh + px(10)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#10205a'; let ty = y0 + px(18) + s1; ctx.font = `italic 700 ${s1}px ${FONT}`; ctx.fillText(a, x + px(24), ty);
      if (b) { ty += s2 * 1.15; ctx.font = `italic 800 ${s2}px ${FONT}`; ctx.fillText(b, x + px(24), ty); }
      return bh + px(10);
    };
    // highlight pills: `cols` per row, returns height
    const drawPills = (x, w, cols, y0) => {
      if (!p.highlights.length) return 0;
      const gap = 22, cw = (w - gap * (cols - 1)) / cols, hh = px(76);
      p.highlights.forEach((t, i) => {
        const xx = x + (i % cols) * (cw + gap), yy = y0 + Math.floor(i / cols) * (hh + px(18));
        const g = ctx.createLinearGradient(xx, 0, xx + cw, 0); g.addColorStop(0, NAVY); g.addColorStop(1, '#0f3bb0');
        ctx.fillStyle = g; rr(ctx, xx, yy, cw, hh, hh / 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2; ctx.stroke();
        const r = hh * 0.36; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(xx + hh / 2, yy + hh / 2, r, 0, Math.PI * 2); ctx.fill();
        icon(ctx, pickIcon(t, i), xx + hh / 2 - r * 0.62, yy + hh / 2 - r * 0.62, r * 1.24, NAVY);
        const tx = xx + hh + px(6), tw = cw - hh - px(26);
        ctx.fillStyle = '#ffffff'; ctx.font = `600 ${px(26)}px ${FONT}`;
        const lines = wrap(ctx, t, tw).slice(0, 2);
        if (lines.length === 1) { const z = fit(ctx, t, tw, px(26), 600, false, 18); ctx.fillText(t, tx, yy + hh / 2 + z * 0.35); }
        else lines.forEach((l, li) => ctx.fillText(l, tx, yy + hh / 2 + (li ? px(24) : -px(4))));
      });
      return Math.ceil(p.highlights.length / cols) * (hh + px(18)) + px(2);
    };
    const frame = (x, y0, w, h) => { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; ctx.fillStyle = '#ffffff'; rr(ctx, x, y0, w, h, 24); ctx.fill(); ctx.restore(); };
    const sparks = (x, y0) => { ctx.strokeStyle = SUN; ctx.lineWidth = 5; ctx.lineCap = 'round'; [[-14, 6, -30, 0], [-6, -4, -16, -18], [6, -10, 8, -28]].forEach(([a, b, c, e]) => { ctx.beginPath(); ctx.moveTo(x + 14 + a + 20, y0 + 14 + b + 6); ctx.lineTo(x + 14 + c + 10, y0 + 14 + e + 6); ctx.stroke(); }); };

    // product photos in white frames
    const list = photos.slice(0, 2);
    if (list.length === 1 || !list.length) {
      // one photo (or the stand-in): photo on the left, pitch and pills stacked in a right column, as in the event banners
      const pwid = Math.round(innerW * 0.44), cx0 = PAD + pwid + 28, cwid = W - PAD - cx0;
      let ry = y; const h1 = drawPitch(cx0, cwid, ry); ry += h1 + px(26);
      const h2 = drawPills(cx0, cwid, 1, ry); ry += h2;
      const ph = Math.max(ry - y - px(10), px(story ? 420 : 320));
      frame(PAD, y, pwid, ph);
      if (list.length) cover(ctx, list[0].img, list[0].crop, PAD + 10, y + 10, pwid - 20, ph - 20, 16); else kioskArt(ctx, PAD + 10, y + 10, pwid - 20, ph - 20);
      sparks(PAD, y);
      y += ph + px(36);
    } else {
      const ph = px(story ? 400 : 300), fw = (innerW - 30) / 2;
      list.forEach((it, i) => { const x = PAD + i * (fw + 30); frame(x, y, fw, ph); cover(ctx, it.img, it.crop, x + 10, y + 10, fw - 20, ph - 20, 16); });
      sparks(PAD, y);
      y += ph + px(36);
      y += drawPitch(PAD, innerW, y) + px(28);
      y += drawPills(PAD, innerW, 2, y) + px(18);
    }

    // "Ideal for" panel
    const items = p.idealFor.length ? p.idealFor : (d.ideal ? [d.ideal.replace(/^ideal for\s*/i, '')] : []);
    if (items.length) {
      const n = items.length, ih = px(54), ph2 = px(40) + ih + px(14) + px(60) + px(14), cw = innerW / n;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6; ctx.fillStyle = '#ffffff'; rr(ctx, PAD, y + px(26), innerW, ph2, 24); ctx.fill(); ctx.restore();
      ctx.font = `italic 800 ${px(32)}px ${FONT}`; const lw = ctx.measureText('Ideal for').width + px(70);
      ctx.fillStyle = NAVY; rr(ctx, W / 2 - lw / 2, y, lw, px(54), px(27)); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText('Ideal for', W / 2, y + px(38));
      items.forEach((t, i) => {
        const cx = PAD + cw * i + cw / 2;
        if (i) { ctx.fillStyle = '#d6def3'; ctx.fillRect(PAD + cw * i, y + px(26) + px(34), 2, ph2 - px(48)); }
        icon(ctx, pickIcon(t, i), cx - ih / 2, y + px(26) + px(30), ih, NAVY);
        ctx.fillStyle = NAVY; ctx.font = `700 ${px(22)}px ${FONT}`;
        wrap(ctx, t, cw - 16).slice(0, 3).forEach((l, li) => ctx.fillText(l, cx, y + px(26) + px(30) + ih + px(30) + li * px(26)));
      });
      ctx.textAlign = 'left';
      y += px(26) + ph2 + px(30);
    }

    // closing line, benefits and the button
    if (p.closing) {
      const z = fit(ctx, p.closing, innerW, px(40), 800, true); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
      const words = p.closing.split(' '), cut = Math.ceil(words.length / 2), a = words.slice(0, cut).join(' ') + ' ', b = words.slice(cut).join(' ');
      const wa = ctx.measureText(a).width, wb2 = ctx.measureText(b).width, sx = W / 2 - (wa + wb2) / 2;
      ctx.textAlign = 'left'; ctx.fillText(a, sx, y + z); ctx.fillStyle = SUN; ctx.fillText(b, sx + wa, y + z); y += z + px(26);
    }
    const btnW = px(270), colW = (innerW - btnW - 24) / Math.max(p.benefits.length, 1), rowH = px(104);
    p.benefits.forEach((t, i) => {
      const cx = PAD + colW * i + colW / 2, r = px(30);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, y + r, r, 0, Math.PI * 2); ctx.stroke();
      icon(ctx, pickIcon(t, i + 2), cx - r * 0.6, y + r - r * 0.6, r * 1.2, '#ffffff');
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = `600 ${px(22)}px ${FONT}`;
      wrap(ctx, t, colW - 10).slice(0, 2).forEach((l, li) => ctx.fillText(l, cx, y + r * 2 + px(28) + li * px(25)));
    });
    ctx.textAlign = 'left';
    const bx = W - PAD - btnW, bh = px(76), by = y + (rowH - bh) / 2 - px(6);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; ctx.fillStyle = SUN; rr(ctx, bx, by, btnW, bh, bh / 2); ctx.fill(); ctx.restore();
    const cz = fit(ctx, d.cta, btnW - px(70), px(34), 800, true); ctx.fillStyle = '#10205a'; ctx.font = `italic 800 ${cz}px ${FONT}`; ctx.fillText(d.cta, bx + px(24), by + bh / 2 + cz * 0.35);
    icon(ctx, 'arrow', bx + btnW - px(50), by + bh / 2 - px(14), px(28), '#10205a');
    y += rowH;

    // footer: dark bar with contacts (the area under it is WhatsApp's own bar in a story)
    ctx.fillStyle = DEEP; ctx.fillRect(0, fy, W, H - fy);
    ctx.fillStyle = SUN; ctx.fillRect(0, fy, W, 4);
    const contacts = [{ icon: 'phone', text: CONTACT.phone }, { icon: 'mail', text: CONTACT.email }]; // always the company contacts
    const cw2 = innerW / contacts.length;
    contacts.forEach((c, i) => {
      const x = PAD + cw2 * i;
      icon(ctx, c.icon, x, fy + barH / 2 - 17, 34, SUN);
      const z = fit(ctx, c.text, cw2 - 56, 32, 700, false, 20); ctx.fillStyle = '#ffffff'; ctx.fillText(c.text, x + 48, fy + barH / 2 + z * 0.35);
    });
    ctx.font = `500 22px ${FONT}`; ctx.fillStyle = '#9fb8ff'; ctx.textAlign = 'center';
    ctx.fillText(`VirtuBox Infotech Pvt. Ltd.  ·  ${CONTACT.site}`, W / 2, fy + barH - 10); ctx.textAlign = 'left';
    return y;
  }

  function normPoster(p, str) {
    p = p || {};
    const list = (v, n, len) => (Array.isArray(v) ? v : []).map((x) => str(x, len)).filter(Boolean).slice(0, n);
    return {
      headline: str(p.headline, 40), emphasis: str(p.emphasis, 36), motto: list(p.motto, 3, 16), pitch: list(p.pitch, 2, 48),
      highlights: list(p.highlights, 4, 30), idealFor: list(p.idealFor, 5, 26), benefits: list(p.benefits, 3, 24), closing: str(p.closing, 70),
      contacts: (Array.isArray(p.contacts) ? p.contacts : []).map((c) => ({ name: str(c && c.name, 30), phone: str(c && c.phone, 20) })).filter((c) => c.phone).slice(0, 2),
    };
  }

  function normalize(b) {
    b = b || {};
    const str = (v, n) => String(v == null ? '' : v).replace(/[‐‑]/g, '-').replace(/\s+/g, ' ').trim().slice(0, n);
    const feat = (f) => {
      if (f && typeof f === 'object') return { title: str(f.title, 34), text: str(f.text, 90) };
      const s = str(f, 120), i = s.indexOf(':');
      return i > 0 && i < 34 ? { title: s.slice(0, i).trim(), text: s.slice(i + 1).trim() } : { title: '', text: s };
    };
    const c = b.image && b.image.crop;
    const ok = c && [c.x, c.y, c.w, c.h].every((n) => typeof n === 'number' && n >= 0 && n <= 1) && c.w > 0 && c.h > 0;
    return {
      title: str(b.title, 60) || 'VirtuBox',
      tagline: str(b.tagline, 150),
      features: (Array.isArray(b.features) ? b.features : []).map(feat).filter((f) => f.title || f.text).slice(0, 6),
      specs: (Array.isArray(b.specs) ? b.specs : []).map((s) => ({ label: str(s && s.label, 28), value: str(s && s.value, 40) })).filter((s) => s.label && s.value).slice(0, 9),
      ideal: str(b.ideal, 150),
      cta: str(b.cta, 44) || 'Book a free demo',
      crop: ok ? c : null,
      format: b.format === 'story' ? 'story' : 'post',
      poster: normPoster(b.poster, str),
      photos: (Array.isArray(b.photos) ? b.photos : []).map((x) => (typeof x === 'string' ? { id: x } : x)).filter((x) => x && typeof x.id === 'string').slice(0, 2),
    };
  }

  function loadImage(src) {
    return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  }

  /**
   * Renders the banner and resolves with the canvas.
   * opts.theme: 'light' | 'dark' | 'warm'. opts.photo: an <img> the rep uploaded (replaces the one-pager photo).
   * opts.canvas: redraw into an existing canvas.
   */
  async function renderBanner(data, opts = {}) {
    const d = normalize(data);
    const T = THEMES[opts.theme] || THEMES.light;
    try { await Promise.all(['400 25px Inter', '500 22px Inter', '600 34px Inter', '700 28px Inter', '800 86px Inter'].map((f) => document.fonts.load(f))); } catch { /* fall back to system font */ }
    if (T.event) {
      let items = [];
      if (opts.photo) items = [{ img: opts.photo, crop: null }];
      else if (d.photos.length) items = (await Promise.all(d.photos.map(async (x) => ({ img: await loadImage(`/api/thumb/${encodeURIComponent(x.id)}`), crop: x.crop && [x.crop.x, x.crop.y, x.crop.w, x.crop.h].every((n) => typeof n === 'number') ? x.crop : null })))).filter((x) => x.img && x.crop);
      else if (data && data.image && data.image.id) { const im = await loadImage(`/api/thumb/${encodeURIComponent(data.image.id)}`); if (im && d.crop) items = [{ img: im, crop: d.crop }]; }
      const H2 = SIZES[d.format], cv = opts.canvas || document.createElement('canvas'); cv.width = W; cv.height = H2;
      const cx = cv.getContext('2d');
      try { await Promise.all(['italic 800 80px Inter', '600 26px Inter', '700 22px Inter'].map((f) => document.fonts.load(f))); } catch { /* system font */ }
      const lim = H2 - (d.format === 'story' ? SAFE.bottom : 0) - 96 - 22;
      let k2 = 0.5;
      for (let t = 1.2; t > 0.5; t -= 0.02) { if (drawEvent(cx, d, t, items) <= lim) { k2 = t; break; } }
      drawEvent(cx, d, k2, items);
      return cv;
    }
    let img = opts.photo || null;
    if (img) d.crop = { x: 0, y: 0, w: 1, h: 1 };
    else if (data && data.image && data.image.id) img = await loadImage(`/api/thumb/${encodeURIComponent(data.image.id)}`);
    const H = SIZES[d.format];
    const canvas = opts.canvas || document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const limit = H - BAR - FOOT - (d.format === 'story' ? SAFE.bottom : 0) - 26;
    let k = 0.5;
    for (let t = d.format === 'story' ? 1.9 : 1.2; t > 0.5; t -= 0.02) { if (draw(ctx, d, t, T, img) <= limit) { k = t; break; } }
    draw(ctx, d, k, T, img);
    footer(ctx, d, T);
    return canvas;
  }

  window.renderBanner = renderBanner;
  window.loadBannerImage = loadImage;
  window.BANNER_THEMES = Object.keys(THEMES).map((id) => ({ id, name: THEMES[id].name }));
})();
