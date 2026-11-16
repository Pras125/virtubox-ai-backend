// Draws a shareable sales banner (1080×1350 PNG, the portrait size WhatsApp shows in full) on a canvas.
// Input: { title, tagline, features: [string], specs: [{ label, value }], cta }
(function () {
  const W = 1080, H = 1350, PAD = 72;
  const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const ORANGE = '#ff6a2b', ORANGE2 = '#ffb36b', INK = '#0f1115', WHITE = '#ffffff', MUTED = '#b6bcc8';

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

  // Lays the banner out at a given scale; returns the y where the content ends so the caller can shrink to fit.
  function draw(ctx, d, k) {
    const px = (n) => Math.round(n * k);
    // background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1b1410'); bg.addColorStop(0.55, INK); bg.addColorStop(1, '#14161b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W - 80, 60, 0, W - 80, 60, 720);
    glow.addColorStop(0, 'rgba(255,106,43,.42)'); glow.addColorStop(1, 'rgba(255,106,43,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ORANGE; ctx.fillRect(0, 0, 14, H);

    // brand row
    let y = 78;
    const lg = ctx.createLinearGradient(PAD, y, PAD + 64, y + 64);
    lg.addColorStop(0, ORANGE); lg.addColorStop(1, ORANGE2);
    ctx.fillStyle = lg; rr(ctx, PAD, y, 64, 64, 16); ctx.fill();
    ctx.fillStyle = '#1b0d05'; ctx.font = `800 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('V', PAD + 32, y + 34);
    ctx.textAlign = 'left'; ctx.fillStyle = WHITE; ctx.font = `700 38px ${FONT}`;
    ctx.fillText('VirtuBox', PAD + 84, y + 34);
    ctx.textBaseline = 'alphabetic';
    y += 64 + px(70);

    // title
    ctx.fillStyle = WHITE; ctx.font = `800 ${px(84)}px ${FONT}`;
    for (const l of wrap(ctx, d.title, W - PAD * 2).slice(0, 3)) { y += px(88); ctx.fillText(l, PAD, y); }
    y += px(26);
    ctx.fillStyle = ORANGE; rr(ctx, PAD, y, 120, 8, 4); ctx.fill();
    y += px(30);

    // tagline
    if (d.tagline) {
      ctx.fillStyle = '#e3e6ec'; ctx.font = `500 ${px(36)}px ${FONT}`;
      for (const l of wrap(ctx, d.tagline, W - PAD * 2).slice(0, 3)) { y += px(48); ctx.fillText(l, PAD, y); }
    }
    y += px(44);

    // features
    const tx = PAD + px(62);
    for (const f of d.features) {
      ctx.font = `500 ${px(34)}px ${FONT}`;
      const lines = wrap(ctx, f, W - PAD - tx).slice(0, 2);
      const cy = y + px(30);
      ctx.fillStyle = ORANGE; ctx.beginPath(); ctx.arc(PAD + px(20), cy, px(20), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1b0d05'; ctx.lineWidth = px(5); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(PAD + px(11), cy + px(1)); ctx.lineTo(PAD + px(18), cy + px(8)); ctx.lineTo(PAD + px(30), cy - px(7)); ctx.stroke();
      ctx.fillStyle = WHITE;
      lines.forEach((l, i) => ctx.fillText(l, tx, y + px(42) + i * px(44)));
      y += lines.length * px(44) + px(22);
    }

    // specs: two-column cards
    if (d.specs.length) {
      y += px(14);
      const gap = 20, cw = (W - PAD * 2 - gap) / 2, ch = px(104);
      d.specs.forEach((s, i) => {
        const x = PAD + (i % 2) * (cw + gap), cy = y + Math.floor(i / 2) * (ch + gap);
        ctx.fillStyle = 'rgba(255,255,255,.07)'; rr(ctx, x, cy, cw, ch, 16); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = ORANGE2; ctx.font = `600 ${px(22)}px ${FONT}`;
        ctx.fillText(clip(ctx, String(s.label).toUpperCase(), cw - 44), x + 22, cy + px(40));
        ctx.fillStyle = WHITE; ctx.font = `600 ${px(30)}px ${FONT}`;
        ctx.fillText(clip(ctx, s.value, cw - 44), x + 22, cy + px(80));
      });
      y += Math.ceil(d.specs.length / 2) * (ch + gap);
    }
    return y;
  }

  function footer(ctx, d) {
    const fh = 150, fy = H - fh;
    const g = ctx.createLinearGradient(0, fy, W, H);
    g.addColorStop(0, ORANGE); g.addColorStop(1, '#ff8a50');
    ctx.fillStyle = g; ctx.fillRect(0, fy, W, fh);
    ctx.fillStyle = '#1b0d05'; ctx.textBaseline = 'middle';
    ctx.font = `700 34px ${FONT}`;
    const site = 'www.virtubox.io';
    const sw = ctx.measureText(site).width;
    ctx.textAlign = 'right'; ctx.fillText(site, W - PAD, fy + fh / 2 + 2);
    ctx.textAlign = 'left'; ctx.font = `800 40px ${FONT}`;
    ctx.fillText(clip(ctx, d.cta, W - PAD * 2 - sw - 40), PAD, fy + fh / 2 + 2);
    ctx.textBaseline = 'alphabetic';
    return fy;
  }

  function normalize(b) {
    const str = (v, n) => String(v == null ? '' : v).replace(/[\u2010\u2011]/g, '-').replace(/\s+/g, ' ').trim().slice(0, n);
    return {
      title: str(b && b.title, 60) || 'VirtuBox',
      tagline: str(b && b.tagline, 140),
      features: (Array.isArray(b && b.features) ? b.features : []).map((f) => str(f, 90)).filter(Boolean).slice(0, 6),
      specs: (Array.isArray(b && b.specs) ? b.specs : []).map((s) => ({ label: str(s && s.label, 28), value: str(s && s.value, 40) })).filter((s) => s.label && s.value).slice(0, 6),
      cta: str(b && b.cta, 44) || 'Book a free demo',
    };
  }

  /** Renders the banner and resolves with the canvas. */
  async function renderBanner(data) {
    const d = normalize(data);
    try { await Promise.all(['500 34px Inter', '600 30px Inter', '700 38px Inter', '800 84px Inter'].map((f) => document.fonts.load(f))); } catch { /* fall back to system font */ }
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const limit = H - 150 - 40; // keep clear of the footer
    // largest type size at which everything fits above the footer (short banners grow, long ones shrink)
    let k = 0.56;
    for (let t = 1.3; t > 0.56; t -= 0.02) { if (draw(ctx, d, t) <= limit) { k = t; break; } }
    draw(ctx, d, k);
    footer(ctx, d);
    return canvas;
  }

  window.renderBanner = renderBanner;
})();
