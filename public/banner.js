// Draws a shareable sales banner (1080×1350 PNG, the portrait size WhatsApp shows in full) on a canvas,
// in the style of the VirtuBox one-pagers: white page, teal headings, coral and yellow accents, product photo.
// Input: { title, tagline, features: [{ title, text }], specs: [{ label, value }], ideal, cta, image: { id, crop } }
(function () {
  const W = 1080, H = 1350, PAD = 64;
  const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const TEAL = '#1e7da0', CYAN = '#00a3b5', CORAL = '#ec5f43', YELLOW = '#f4b81f';
  const CONTACT = { email: 'hello@virtubox.io', phone: '+91 9810473340', site: 'www.virtubox.io' };

  const THEMES = {
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
    ctx.fillText('VirtuBox', PAD, 92);
    dots(ctx, PAD + ctx.measureText('VirtuBox').width + 8, 92, 6);
    ctx.font = `500 22px ${FONT}`; ctx.fillStyle = T.muted; ctx.textAlign = 'right';
    ctx.fillText('Interactive kiosk & signage solutions', W - PAD, 88); ctx.textAlign = 'left';
    ctx.fillStyle = CORAL; ctx.fillRect(PAD, 118, W - PAD * 2, 2);
    let y = 118 + px(22);

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
    const pw = img ? 320 : 0, gap = img ? 32 : 0;
    const fx = PAD + pw + gap, fw = W - PAD - fx;
    const top = y;
    for (const f of d.features) {
      const tw = fw - 30 - 54;
      ctx.font = `400 ${px(25)}px ${FONT}`;
      const lines = f.text ? wrap(ctx, f.text, tw).slice(0, 2) : [];
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
    y -= px(14);
    if (img) {
      const ph = Math.max(y - top, px(430));
      drawPhoto(ctx, img, d.crop, PAD, top, pw, ph);
      y = top + ph;
    }
    y += px(26);

    // specs: three-column cards with coral / yellow / teal labels
    if (d.specs.length) {
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
    const by = H - FOOT - BAR;
    ctx.fillStyle = grad(ctx, 0, W, T.bar); ctx.fillRect(0, by, W, BAR);
    ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
    ctx.font = `700 32px ${FONT}`; ctx.textAlign = 'right';
    ctx.fillText(CONTACT.phone, W - PAD, by + BAR / 2 + 2);
    const pw = ctx.measureText(CONTACT.phone).width;
    ctx.textAlign = 'left'; ctx.font = `800 40px ${FONT}`;
    ctx.fillText(clip(ctx, d.cta, W - PAD * 2 - pw - 40), PAD, by + BAR / 2 + 2);

    const fy = H - FOOT;
    ctx.fillStyle = T.foot; ctx.fillRect(0, fy, W, FOOT);
    ctx.font = `800 24px ${FONT}`; ctx.fillStyle = T.footText === '#ffffff' ? '#8fe6f0' : TEAL;
    ctx.fillText('VirtuBox', PAD, fy + FOOT / 2 + 1);
    const vw = ctx.measureText('VirtuBox ').width;
    ctx.fillStyle = T.footText; ctx.font = `700 24px ${FONT}`;
    ctx.fillText('Infotech Pvt. Ltd.', PAD + vw, fy + FOOT / 2 + 1);
    ctx.font = `500 22px ${FONT}`; ctx.textAlign = 'right';
    ctx.fillText(`${CONTACT.email}   ·   ${CONTACT.site}`, W - PAD, fy + FOOT / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
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
    let img = opts.photo || null;
    if (img) d.crop = { x: 0, y: 0, w: 1, h: 1 };
    else if (data && data.image && data.image.id) img = await loadImage(`/api/thumb/${encodeURIComponent(data.image.id)}`);
    const canvas = opts.canvas || document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const limit = H - BAR - FOOT - 26;
    let k = 0.5;
    for (let t = 1.2; t > 0.5; t -= 0.02) { if (draw(ctx, d, t, T, img) <= limit) { k = t; break; } }
    draw(ctx, d, k, T, img);
    footer(ctx, d, T);
    return canvas;
  }

  window.renderBanner = renderBanner;
  window.loadBannerImage = loadImage;
  window.BANNER_THEMES = Object.keys(THEMES).map((id) => ({ id, name: THEMES[id].name }));
})();
