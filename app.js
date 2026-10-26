/* Creative Resize – adapt one design to every social format. Vanilla JS, renders on <canvas>. */
(function () {
  'use strict';
  const C = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const STATE_KEY = 'cr_state_v1', BUNDLES_KEY = 'cr_bundles_v1';
  const PREVIEW_MAX = 360, FOCUS_MAX = 720;
  const FREE_BATCH = 4, FREE_CUSTOM = 1, FREE_BUNDLES = 1, MAX_SOURCES = 30;

  // ---------- formats (2026 sizes) ----------
  const FORMATS = [
    { id: 'ig-post', platform: 'Instagram', name: 'Post', w: 1080, h: 1080 },
    { id: 'ig-portrait', platform: 'Instagram', name: 'Portrait', w: 1080, h: 1350 },
    { id: 'ig-story', platform: 'Instagram', name: 'Story / Reels', w: 1080, h: 1920 },
    { id: 'tt-video', platform: 'TikTok', name: 'Video', w: 1080, h: 1920 },
    { id: 'yt-thumb', platform: 'YouTube', name: 'Thumbnail', w: 1280, h: 720 },
    { id: 'yt-shorts', platform: 'YouTube', name: 'Shorts', w: 1080, h: 1920 },
    { id: 'fb-post', platform: 'Facebook', name: 'Post', w: 1200, h: 630 },
    { id: 'fb-cover', platform: 'Facebook', name: 'Cover', w: 820, h: 312 },
    { id: 'li-post', platform: 'LinkedIn', name: 'Post', w: 1200, h: 627 },
    { id: 'li-cover', platform: 'LinkedIn', name: 'Cover', w: 1584, h: 396 },
    { id: 'x-post', platform: 'X', name: 'Post', w: 1600, h: 900 },
    { id: 'x-header', platform: 'X', name: 'Header', w: 1500, h: 500 },
    { id: 'pin', platform: 'Pinterest', name: 'Pin', w: 1000, h: 1500 },
    { id: 'wa-status', platform: 'WhatsApp', name: 'Status', w: 1080, h: 1920 }
  ];
  const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'LinkedIn', 'X', 'Pinterest', 'WhatsApp'];
  const PRESETS = {
    instagram: ['ig-post', 'ig-portrait', 'ig-story'],
    video: ['ig-story', 'tt-video', 'yt-shorts', 'yt-thumb'],
    covers: ['fb-cover', 'li-cover', 'x-header'],
    everything: FORMATS.map(f => f.id)
  };
  const FILLS = ['cover', 'blur', 'solid', 'stretch'];
  const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  function fmtById(id) {
    const f = FORMATS.find(x => x.id === id); if (f) return f;
    const c = (S && S.custom || []).find(x => x.id === id);
    return c ? { id: c.id, platform: 'Custom', name: c.w + ' × ' + c.h, w: c.w, h: c.h, custom: true } : null;
  }
  function allFormats() { return FORMATS.concat(S.custom.map(c => fmtById(c.id))); }
  function selected() { return S.sel.map(fmtById).filter(Boolean); }

  // ---------- state ----------
  const DEF = {
    sel: ['ig-post', 'ig-portrait', 'ig-story', 'yt-thumb', 'fb-post'],
    custom: [],
    fill: 'cover', fx: 0.5, fy: 0.5, blur: 30, solidColor: '#1c1c1e', solidAuto: true,
    pad: 0, radius: 0, safe: false,
    captionOn: false, caption: '', capPos: 'bottom', capSize: 56, capColor: '#ffffff',
    type: 'image/png', quality: 90, scale: 1,
    ov: {}
  };
  const cloneDef = () => JSON.parse(JSON.stringify(DEF));
  const S = Studio.restore(STATE_KEY, cloneDef());
  (function sanitize() {
    Object.keys(DEF).forEach(k => {
      const d = DEF[k], v = S[k];
      if (Array.isArray(d)) { if (!Array.isArray(v)) S[k] = d.slice(); }
      else if (d && typeof d === 'object') { if (!v || typeof v !== 'object' || Array.isArray(v)) S[k] = {}; }
      else if (typeof v !== typeof d) S[k] = d;
    });
    S.custom = S.custom.filter(c => c && typeof c.id === 'string' && Number.isFinite(c.w) && Number.isFinite(c.h))
      .map(c => ({ id: c.id, w: clamp(Math.round(c.w), 16, 8192), h: clamp(Math.round(c.h), 16, 8192) }));
    S.sel = S.sel.filter((id, i, a) => typeof id === 'string' && fmtById(id) && a.indexOf(id) === i);
    if (!FILLS.includes(S.fill)) S.fill = 'cover';
    if (!TYPES.includes(S.type)) S.type = 'image/png';
    if (S.scale !== 2) S.scale = 1;
    if (S.capPos !== 'top') S.capPos = 'bottom';
    S.fx = clamp(S.fx, 0, 1); S.fy = clamp(S.fy, 0, 1);
    S.blur = clamp(Math.round(S.blur), 0, 80); S.pad = clamp(Math.round(S.pad), 0, 120); S.radius = clamp(Math.round(S.radius), 0, 120);
    S.capSize = clamp(Math.round(S.capSize), 16, 160); S.quality = clamp(Math.round(S.quality), 40, 100);
    Object.keys(S.ov).forEach(id => { const o = S.ov[id]; if (!fmtById(id) || !o || typeof o !== 'object') delete S.ov[id]; });
  })();
  const save = Studio.debounce(() => Studio.persist(STATE_KEY, S), 200);

  // ---------- sources ----------
  let sampleItem = null, items = [], current = 0;
  function src() { return items.length ? items[current] : sampleItem; }
  function makeItem(img, name) { return { img, name, w: img.width, h: img.height, dom: dominant(img), blurCache: null }; }

  function makeSample() {
    const w = 1500, h = 1000, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#312e81'); g.addColorStop(0.55, '#9333ea'); g.addColorStop(1, '#f97316');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // shapes
    x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.arc(1170, 330, 330, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 6; x.beginPath(); x.arc(1170, 330, 400, 0, Math.PI * 2); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.18)'; Studio.roundRect(x, 1040, 700, 320, 180, 36); x.fill();
    x.fillStyle = '#fde68a'; x.beginPath(); x.arc(1300, 790, 54, 0, Math.PI * 2); x.fill();
    // text
    x.fillStyle = '#fff'; x.textBaseline = 'alphabetic';
    x.font = `800 72px ${FONT}`; x.fillText('SUMMER', 110, 280);
    x.font = `800 230px ${FONT}`; x.fillText('SALE', 96, 500);
    x.font = `500 56px ${FONT}`; x.fillStyle = 'rgba(255,255,255,.88)'; x.fillText('Up to 50% off everything', 110, 600);
    x.fillStyle = '#fff'; Studio.roundRect(x, 110, 660, 300, 72, 36); x.fill();
    x.fillStyle = '#4c1d95'; x.font = `700 32px ${FONT}`; x.fillText('July 1 – 14', 164, 707);
    x.fillStyle = 'rgba(255,255,255,.7)'; x.font = `600 30px ${FONT}`; x.fillText('yourbrand.com', 110, 920);
    return c;
  }
  function dominant(img) {
    try {
      const n = 32, c = document.createElement('canvas'); c.width = n; c.height = n; const x = c.getContext('2d');
      x.drawImage(img, 0, 0, n, n);
      const d = x.getImageData(0, 0, n, n).data, bins = new Map();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue;
        const key = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
        const b = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; bins.set(key, b);
      }
      let best = null; bins.forEach(b => { if (!best || b.n > best.n) best = b; });
      if (!best) return '#1c1c1e';
      const hx = v => ('0' + Math.round(v / best.n).toString(16)).slice(-2);
      return '#' + hx(best.r) + hx(best.g) + hx(best.b);
    } catch (e) { return '#1c1c1e'; }
  }
  // Small blurred copy of the source, cached per blur radius (used by the "Fit + blurred background" mode)
  function blurredSource(item) {
    if (item.blurCache && item.blurCache.radius === S.blur) return item.blurCache.canvas;
    const f = Studio.fit(item.w, item.h, 512, 512);
    const c = document.createElement('canvas'); c.width = Math.max(1, f.w); c.height = Math.max(1, f.h);
    const x = c.getContext('2d');
    const bpx = S.blur * Math.max(c.width, c.height) / 1080;
    const over = 1 + (bpx * 2.5) / Math.min(c.width, c.height);
    const dw = c.width * over, dh = c.height * over, dx = (c.width - dw) / 2, dy = (c.height - dh) / 2;
    if (bpx > 0.5 && 'filter' in x) {
      x.filter = `blur(${bpx.toFixed(1)}px)`; x.drawImage(item.img, dx, dy, dw, dh); x.filter = 'none';
    } else if (bpx > 0.5) {
      const k = Math.max(1, bpx / 2), t = document.createElement('canvas');
      t.width = Math.max(1, Math.round(c.width / k)); t.height = Math.max(1, Math.round(c.height / k));
      const tx = t.getContext('2d'); tx.drawImage(item.img, dx / k, dy / k, dw / k, dh / k);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(t, 0, 0, c.width, c.height);
    } else x.drawImage(item.img, dx, dy, dw, dh);
    item.blurCache = { radius: S.blur, canvas: c };
    return c;
  }

  // ---------- geometry ----------
  function settingsFor(id) {
    const o = S.ov[id] || {};
    return {
      fill: FILLS.includes(o.fill) ? o.fill : S.fill,
      zoom: clamp(Number(o.zoom) || 1, 1, 3),
      fx: typeof o.fx === 'number' ? clamp(o.fx, 0, 1) : S.fx,
      fy: typeof o.fy === 'number' ? clamp(o.fy, 0, 1) : S.fy,
      ox: Number(o.ox) || 0, oy: Number(o.oy) || 0
    };
  }
  function hasOverride(id) { const o = S.ov[id]; return !!o && Object.keys(o).length > 0; }
  function padFor(f) { return Math.min(S.pad, Math.floor(Math.min(f.w, f.h) / 2) - 8); }
  function coverRect(sw, sh, dw, dh, st) {
    const r = Math.max(dw / sw, dh / sh) * st.zoom;
    const cw = dw / r, ch = dh / r;
    return { sx: clamp(st.fx * sw - cw / 2, 0, Math.max(0, sw - cw)), sy: clamp(st.fy * sh - ch / 2, 0, Math.max(0, sh - ch)), sw: cw, sh: ch, r };
  }

  // ---------- drawing (design coordinates W×H; caller scales ctx) ----------
  function drawFormat(ctx, W, H, fmt, item, opts) {
    opts = opts || {};
    const st = settingsFor(fmt.id), pad = Math.max(0, padFor(fmt));
    const iw = W - 2 * pad, ih = H - 2 * pad;
    const bg = S.solidAuto ? item.dom : S.solidColor;
    const fitMode = st.fill === 'blur' || st.fill === 'solid';
    // background
    if (st.fill === 'blur') {
      const b = blurredSource(item), cv = Studio.cover(b.width, b.height, W, H);
      ctx.drawImage(b, cv.sx, cv.sy, cv.sw, cv.sh, 0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, W, H);
    } else if (st.fill === 'solid' || pad > 0) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
    // image
    ctx.save();
    const innerR = (!fitMode && pad > 0) ? S.radius : 0;
    if (innerR > 0) { Studio.roundRect(ctx, pad, pad, iw, ih, innerR); ctx.clip(); } else { ctx.beginPath(); ctx.rect(pad, pad, iw, ih); ctx.clip(); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (st.fill === 'cover') {
      const cv = coverRect(item.w, item.h, iw, ih, st);
      ctx.drawImage(item.img, cv.sx, cv.sy, cv.sw, cv.sh, pad, pad, iw, ih);
    } else if (st.fill === 'stretch') {
      ctx.drawImage(item.img, pad, pad, iw, ih);
    } else {
      const r = Math.min(iw / item.w, ih / item.h) * st.zoom;
      const dw = item.w * r, dh = item.h * r;
      const x = pad + (iw - dw) / 2 + st.ox, y = pad + (ih - dh) / 2 + st.oy;
      if (st.fill === 'blur') { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = Math.round(Math.min(W, H) * 0.04); ctx.shadowOffsetY = Math.round(Math.min(W, H) * 0.01); ctx.fillStyle = '#000'; Studio.roundRect(ctx, x, y, dw, dh, S.radius); ctx.fill(); ctx.restore(); }
      ctx.save(); Studio.roundRect(ctx, x, y, dw, dh, S.radius); ctx.clip();
      ctx.drawImage(item.img, x, y, dw, dh); ctx.restore();
    }
    ctx.restore();
    drawCaption(ctx, W, H);
    if (opts.safe && H / W >= 1.6) drawSafeZones(ctx, W, H);
  }
  function drawCaption(ctx, W, H) {
    const text = S.captionOn ? S.caption.trim() : ''; if (!text) return;
    const k = Math.min(W, H) / 1080, fs = Math.max(10, Math.round(S.capSize * k));
    const margin = Math.max(S.pad, Math.round(W * 0.06)), tall = H / W >= 1.6;
    const topSafe = tall ? Math.round(H * 0.13) : margin, botSafe = tall ? Math.round(H * 0.177) : margin;
    ctx.save();
    ctx.font = `800 ${fs}px ${FONT}`;
    const lines = Studio.wrapText(ctx, text, W - 2 * margin).slice(0, 6), lh = Math.round(fs * 1.15), th = lines.length * lh;
    const top = S.capPos === 'top';
    const y0 = top ? topSafe : H - botSafe - th;
    const g = top ? ctx.createLinearGradient(0, 0, 0, y0 + th + fs * 1.2) : ctx.createLinearGradient(0, H, 0, y0 - fs * 1.2);
    g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    if (top) ctx.fillRect(0, 0, W, y0 + th + fs * 1.2); else ctx.fillRect(0, y0 - fs * 1.2, W, H - (y0 - fs * 1.2));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = S.capColor;
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = Math.round(fs * 0.25); ctx.shadowOffsetY = Math.round(fs * 0.05);
    let y = y0; lines.forEach(l => { ctx.fillText(l, W / 2, y, W - 2 * margin); y += lh; });
    ctx.restore();
  }
  function drawSafeZones(ctx, W, H) {
    const top = Math.round(H * 250 / 1920), bot = Math.round(H * 340 / 1920), fs = Math.round(W * 0.03);
    ctx.save();
    ctx.fillStyle = 'rgba(255,69,58,.22)'; ctx.fillRect(0, 0, W, top); ctx.fillRect(0, H - bot, W, bot);
    ctx.strokeStyle = 'rgba(255,69,58,.8)'; ctx.setLineDash([W * 0.02, W * 0.012]); ctx.lineWidth = Math.max(2, W * 0.004);
    ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(W, top); ctx.moveTo(0, H - bot); ctx.lineTo(W, H - bot); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.font = `700 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Top safe zone · 250 px', W / 2, top / 2); ctx.fillText('Bottom safe zone · 340 px', W / 2, H - bot / 2);
    ctx.restore();
  }
  function renderPreview(cv, fmt, max, opts) {
    const s = Math.min(max / fmt.w, max / fmt.h), pw = Math.max(1, Math.round(fmt.w * s)), ph = Math.max(1, Math.round(fmt.h * s));
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, pw, ph);
    ctx.save(); ctx.scale(s, s); drawFormat(ctx, fmt.w, fmt.h, fmt, src(), opts); ctx.restore();
  }

  // ---------- previews grid ----------
  const grid = $('grid'), nodes = new Map();
  function labelFor(f) { return f.custom ? 'Custom' : f.platform + ' ' + f.name; }
  function syncGrid() {
    const sel = selected(), keep = new Set(sel.map(f => f.id));
    nodes.forEach((n, id) => { if (!keep.has(id)) { n.remove(); nodes.delete(id); } });
    sel.forEach(f => {
      let n = nodes.get(f.id);
      if (!n) {
        n = document.createElement('div'); n.className = 'pv'; n.dataset.id = f.id; n.setAttribute('role', 'button'); n.tabIndex = 0;
        n.innerHTML = '<div class="cv"><canvas></canvas></div><div class="lab"><b></b><span></span></div>';
        n.addEventListener('click', () => openFocus(f.id));
        n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openFocus(f.id); } });
        nodes.set(f.id, n);
      }
      n.querySelector('b').textContent = labelFor(f); n.querySelector('span').textContent = f.w + '×' + f.h;
      n.setAttribute('aria-label', 'Open ' + labelFor(f) + ' ' + f.w + ' by ' + f.h + ' preview');
      n.classList.toggle('edited', hasOverride(f.id));
      grid.appendChild(n);
    });
    $('gridEmpty').classList.toggle('hidden', sel.length > 0);
    syncCount();
  }
  function syncEdited() { nodes.forEach((n, id) => n.classList.toggle('edited', hasOverride(id))); }
  function renderAll() {
    nodes.forEach((n, id) => { const f = fmtById(id); if (f) renderPreview(n.querySelector('canvas'), f, PREVIEW_MAX, { safe: S.safe }); });
  }
  function syncCount() {
    const n = S.sel.length, it = src();
    $('countInfo').innerHTML = `<b>${n}</b> format${n === 1 ? '' : 's'} selected · source ${it.w} × ${it.h}${items.length ? '' : ' (sample)'}${items.length > 1 ? ' · ' + items.length + ' images' : ''}`;
    const dl = $('dlAll');
    dl.textContent = ''; dl.append(isPro() ? '⬇ Download ZIP (' + n * Math.max(1, items.length) + ')' : '⬇ Download all (' + n + ')');
    dl.disabled = n === 0;
  }

  // ---------- render loop ----------
  const scheduleRender = Studio.raf(() => { renderAll(); renderFocus(); renderFocal(); });
  function update() { save(); scheduleRender(); }

  // ---------- focal point ----------
  function renderFocal() {
    const it = src(), cv = $('focalCanvas'), f = Studio.fit(it.w, it.h, 300, 200);
    const w = Math.max(1, f.w), h = Math.max(1, f.h);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const x = cv.getContext('2d'); x.clearRect(0, 0, w, h); x.drawImage(it.img, 0, 0, w, h);
    const dot = $('focalDot'); dot.style.left = (S.fx * 100) + '%'; dot.style.top = (S.fy * 100) + '%';
  }
  function bindFocal() {
    const box = $('focalBox'); let down = false;
    const set = e => { const r = box.getBoundingClientRect(); S.fx = clamp((e.clientX - r.left) / r.width, 0, 1); S.fy = clamp((e.clientY - r.top) / r.height, 0, 1); update(); };
    box.addEventListener('pointerdown', e => { down = true; try { box.setPointerCapture(e.pointerId); } catch (x) {} set(e); });
    box.addEventListener('pointermove', e => { if (down) set(e); });
    ['pointerup', 'pointercancel'].forEach(ev => box.addEventListener(ev, () => { if (down) { down = false; track('focal_set', {}); } }));
    box.addEventListener('keydown', e => {
      const st = e.shiftKey ? 0.1 : 0.02; let h = true;
      if (e.key === 'ArrowLeft') S.fx = clamp(S.fx - st, 0, 1); else if (e.key === 'ArrowRight') S.fx = clamp(S.fx + st, 0, 1);
      else if (e.key === 'ArrowUp') S.fy = clamp(S.fy - st, 0, 1); else if (e.key === 'ArrowDown') S.fy = clamp(S.fy + st, 0, 1); else h = false;
      if (h) { e.preventDefault(); update(); }
    });
    $('focalReset').addEventListener('click', () => { S.fx = 0.5; S.fy = 0.5; update(); });
  }

  // ---------- focus view ----------
  let focusId = null, fSeg = null, drag = null;
  function openFocus(id) {
    const f = fmtById(id); if (!f) return;
    focusId = id;
    $('focusTitle').textContent = labelFor(f);
    $('focusSize').textContent = f.w + ' × ' + f.h + ' px';
    syncFocusCtl(); $('focusModal').classList.add('open'); renderFocus();
    track('focus_open', { format: id });
    setTimeout(() => $('fClose').focus(), 30);
  }
  function closeFocus() { if (!focusId) return; const n = nodes.get(focusId); focusId = null; $('focusModal').classList.remove('open'); if (n) n.focus(); }
  function syncFocusCtl() {
    const o = S.ov[focusId] || {}, st = settingsFor(focusId);
    fSeg.set(FILLS.includes(o.fill) ? o.fill : 'default');
    $('fZoom').value = Math.round(st.zoom * 100); $('fZoomV').textContent = Math.round(st.zoom * 100) + '%';
    $('fZoom').disabled = st.fill === 'stretch';
    $('fHint').textContent = st.fill === 'stretch' ? 'Stretch fills the whole canvas; pan and zoom do not apply.' : st.fill === 'cover' ? 'Drag the image to move the crop window. Zoom in to tighten the crop.' : 'Drag the image to move it inside the frame. Zoom to scale it.';
    $('fReset').disabled = !hasOverride(focusId);
  }
  function renderFocus() {
    if (!focusId) return;
    const f = fmtById(focusId); if (!f) { closeFocus(); return; }
    const cv = $('focusCanvas');
    renderPreview(cv, f, FOCUS_MAX, { safe: S.safe });
    const ctx = cv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); Studio.watermark(ctx, cv.width, cv.height);
  }
  function setOverride(id, patch) {
    const o = Object.assign({}, S.ov[id] || {}, patch);
    Object.keys(o).forEach(k => { if (o[k] === undefined) delete o[k]; });
    if (Object.keys(o).length) S.ov[id] = o; else delete S.ov[id];
    syncEdited(); update();
  }
  function panFormat(f, dx, dy) {
    const st = settingsFor(f.id), it = src();
    if (st.fill === 'stretch') return;
    if (st.fill === 'cover') {
      const pad = Math.max(0, padFor(f)), cv = coverRect(it.w, it.h, f.w - 2 * pad, f.h - 2 * pad, st);
      const mx = cv.sw / 2 / it.w, my = cv.sh / 2 / it.h;
      setOverride(f.id, { fx: clamp(st.fx - dx / cv.r / it.w, mx, 1 - mx), fy: clamp(st.fy - dy / cv.r / it.h, my, 1 - my) });
    } else setOverride(f.id, { ox: clamp(st.ox + dx, -f.w, f.w), oy: clamp(st.oy + dy, -f.h, f.h) });
  }
  function bindFocus() {
    const m = $('focusModal'), cv = $('focusCanvas');
    fSeg = Studio.seg($('fFill'), v => { if (!focusId) return; setOverride(focusId, { fill: v === 'default' ? undefined : v }); syncFocusCtl(); track('format_fill', { fill: v }); });
    Studio.bindRange($('fZoom'), $('fZoomV'), v => v + '%');
    $('fZoom').addEventListener('input', () => { if (!focusId) return; const z = Number($('fZoom').value) / 100; setOverride(focusId, { zoom: z === 1 ? undefined : z }); $('fReset').disabled = !hasOverride(focusId); });
    $('fReset').addEventListener('click', () => { if (!focusId) return; delete S.ov[focusId]; syncEdited(); syncFocusCtl(); update(); toast('Adjustments reset'); });
    $('fDownload').addEventListener('click', () => { if (!focusId) return; exportFormat(fmtById(focusId), src()); });
    $('fClose').addEventListener('click', closeFocus);
    m.addEventListener('click', e => { if (e.target === m) closeFocus(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFocus(); });
    cv.addEventListener('pointerdown', e => { if (!focusId) return; e.preventDefault(); drag = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} cv.classList.add('dragging'); });
    cv.addEventListener('pointermove', e => {
      if (!drag || !focusId) return;
      const f = fmtById(focusId), k = f.w / Math.max(1, cv.clientWidth);
      panFormat(f, (e.clientX - drag.x) * k, (e.clientY - drag.y) * k);
      drag = { x: e.clientX, y: e.clientY }; $('fReset').disabled = !hasOverride(focusId);
    });
    ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { if (drag) { drag = null; cv.classList.remove('dragging'); track('format_pan', {}); } }));
    cv.addEventListener('wheel', e => {
      if (!focusId) return; e.preventDefault();
      const st = settingsFor(focusId); if (st.fill === 'stretch') return;
      const z = clamp(st.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 1, 3);
      setOverride(focusId, { zoom: Math.abs(z - 1) < 0.01 ? undefined : z }); $('fZoom').value = Math.round(z * 100); $('fZoomV').textContent = Math.round(z * 100) + '%'; $('fReset').disabled = !hasOverride(focusId);
    }, { passive: false });
  }

  // ---------- export ----------
  const ext = () => S.type === 'image/jpeg' ? '.jpg' : S.type === 'image/webp' ? '.webp' : '.png';
  function fileName(f, it) {
    const base = Studio.safeName(f.custom ? 'custom' : f.platform + '-' + f.name) + '-' + f.w + 'x' + f.h;
    const srcName = items.length > 1 ? '-' + Studio.safeName((it.name || 'image').replace(/\.[a-z0-9]+$/i, '')) : '';
    return 'creative-resize-' + base + srcName;
  }
  function exportFormat(f, it, download) {
    const scale = S.scale === 2 && isPro() ? 2 : 1;
    const quality = S.type === 'image/png' ? undefined : S.quality / 100;
    return Studio.exportPNG((ctx, w, h) => drawFormat(ctx, w, h, f, it, {}), f.w, f.h, { scale, name: fileName(f, it), type: S.type, quality, download: download !== false });
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let busy = false;
  async function downloadAll() {
    if (busy) return;
    const fmts = selected(); if (!fmts.length) { toast('Select at least one format'); return; }
    const sources = isPro() && items.length > 1 ? items : [src()];
    const btn = $('dlAll');
    if (isPro()) {
      busy = true; btn.disabled = true;
      const files = [], seen = new Set();
      try {
        for (const it of sources) for (const f of fmts) {
          const blob = await exportFormat(f, it, false);
          let name = fileName(f, it) + ext(); if (seen.has(name)) name = name.replace(ext(), '-' + (files.length + 1) + ext()); seen.add(name);
          files.push({ name, blob });
        }
        await Studio.zip(files, 'creative-resize-' + Studio.safeName((src().name || 'sample').replace(/\.[a-z0-9]+$/i, '')));
        track('download_zip', { count: files.length }); toast('ZIP with ' + files.length + ' images downloaded');
      } catch (e) { toast('Could not build the ZIP (library failed to load)'); }
      busy = false; syncCount();
      return;
    }
    if (fmts.length > FREE_BATCH) { toast('Free downloads up to ' + FREE_BATCH + ' formats at once. Pro bundles everything into one ZIP.'); Studio.gate('batch'); return; }
    busy = true; btn.disabled = true;
    try {
      for (let i = 0; i < fmts.length; i++) { await exportFormat(fmts[i], src()); if (i < fmts.length - 1) await wait(450); }
      track('download_all', { count: fmts.length }); toast(fmts.length + ' file' + (fmts.length === 1 ? '' : 's') + ' downloaded');
    } catch (e) { toast('Export failed'); }
    busy = false; syncCount();
  }

  // ---------- formats UI ----------
  function buildFormatList() {
    const box = $('fmtList'); box.innerHTML = '';
    const groups = PLATFORMS.map(p => ({ name: p, list: FORMATS.filter(f => f.platform === p) }));
    if (S.custom.length) groups.push({ name: 'Custom', list: S.custom.map(c => fmtById(c.id)) });
    groups.forEach(g => {
      const gd = document.createElement('div'); gd.className = 'fmt-group';
      const h = document.createElement('div'); h.className = 'fmt-platform'; h.textContent = g.name; gd.appendChild(h);
      g.list.forEach(f => {
        const row = document.createElement('label'); row.className = 'fmt-row';
        const txt = document.createElement('span'); txt.className = 't'; txt.innerHTML = `<span>${f.custom ? 'Custom size' : f.name}</span><small>${f.w} × ${f.h}</small>`;
        const sw = document.createElement('span'); sw.className = 'switch';
        const inp = document.createElement('input'); inp.type = 'checkbox'; inp.dataset.id = f.id; inp.checked = S.sel.includes(f.id); inp.setAttribute('aria-label', labelFor(f) + ' ' + f.w + ' by ' + f.h);
        inp.addEventListener('change', () => { toggleFormat(f.id, inp.checked); });
        sw.append(inp, document.createElement('i'));
        row.append(txt, sw);
        if (f.custom) {
          const del = document.createElement('button'); del.type = 'button'; del.className = 'btn btn-ghost btn-sm x'; del.textContent = '✕'; del.setAttribute('aria-label', 'Remove custom size ' + f.w + ' by ' + f.h);
          del.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); removeCustom(f.id); });
          row.appendChild(del);
        }
        gd.appendChild(row);
      });
      box.appendChild(gd);
    });
    syncCustomHint();
  }
  function toggleFormat(id, on) {
    const i = S.sel.indexOf(id);
    if (on && i < 0) S.sel.push(id); else if (!on && i >= 0) S.sel.splice(i, 1);
    // keep order of definition
    const order = allFormats().map(f => f.id); S.sel.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    syncChecks(); syncChips(); syncGrid(); update(); track('format_toggle', { id, on });
  }
  function setSelection(ids) { S.sel = ids.filter(id => fmtById(id)); syncChecks(); syncChips(); syncGrid(); update(); }
  function syncChecks() { $('fmtList').querySelectorAll('input[type=checkbox]').forEach(i => { i.checked = S.sel.includes(i.dataset.id); }); }
  function syncChips() {
    $('bundleChips').querySelectorAll('.chip').forEach(ch => {
      const ids = PRESETS[ch.dataset.bundle] || [];
      ch.classList.toggle('active', ids.length === S.sel.length && ids.every(id => S.sel.includes(id)));
    });
  }
  function addCustom() {
    const w = Math.round(Number($('customW').value)), h = Math.round(Number($('customH').value));
    if (!(w >= 16 && w <= 8192 && h >= 16 && h <= 8192)) { toast('Enter a width and height between 16 and 8192 px'); return; }
    if (!isPro() && S.custom.length >= FREE_CUSTOM) { openPro('custom'); return; }
    if (S.custom.some(c => c.w === w && c.h === h)) { toast('That size is already in the list'); return; }
    const id = 'c' + Date.now().toString(36);
    S.custom.push({ id, w, h }); S.sel.push(id);
    buildFormatList(); syncChips(); syncGrid(); update(); track('custom_add', { w, h }); toast('Custom ' + w + ' × ' + h + ' added');
  }
  function removeCustom(id) {
    S.custom = S.custom.filter(c => c.id !== id); S.sel = S.sel.filter(x => x !== id); delete S.ov[id];
    buildFormatList(); syncChips(); syncGrid(); update();
  }
  function syncCustomHint() { $('customHint').textContent = isPro() ? S.custom.length + ' custom size' + (S.custom.length === 1 ? '' : 's') + ' · unlimited with Pro' : 'Free: ' + FREE_CUSTOM + ' custom size · Pro: unlimited'; }

  // ---------- saved bundles ----------
  function loadBundles() { try { const b = JSON.parse(localStorage.getItem(BUNDLES_KEY) || '[]'); return Array.isArray(b) ? b : []; } catch (e) { return []; } }
  function saveBundles(b) { try { localStorage.setItem(BUNDLES_KEY, JSON.stringify(b)); } catch (e) {} }
  function renderBundles() {
    const list = $('bundleList'), bs = loadBundles(); list.innerHTML = '';
    if (!bs.length) { const p = document.createElement('p'); p.className = 'bundle-empty'; p.textContent = 'No saved bundles yet. Pick your formats and save them to reuse for the next campaign.'; list.appendChild(p); }
    bs.forEach((b, i) => {
      const row = document.createElement('div'); row.className = 'bundle-item';
      const name = document.createElement('button'); name.type = 'button'; name.className = 'name'; name.textContent = b.name; name.title = 'Apply bundle';
      const meta = document.createElement('small'); meta.textContent = (b.sel || []).length + ' formats';
      name.appendChild(meta);
      name.addEventListener('click', () => applyBundle(b));
      const del = document.createElement('button'); del.type = 'button'; del.className = 'btn btn-ghost btn-sm'; del.textContent = '✕'; del.setAttribute('aria-label', 'Delete bundle ' + b.name);
      del.addEventListener('click', () => { const all = loadBundles(); all.splice(i, 1); saveBundles(all); renderBundles(); });
      row.append(name, del); list.appendChild(row);
    });
    $('bundleHint').textContent = isPro() ? bs.length + ' saved bundle' + (bs.length === 1 ? '' : 's') + ' · unlimited with Pro' : 'Free: ' + FREE_BUNDLES + ' saved bundle · Pro: unlimited';
  }
  function applyBundle(b) {
    (b.custom || []).forEach(c => {
      if (!S.custom.some(x => x.id === c.id || (x.w === c.w && x.h === c.h)) && (isPro() || S.custom.length < FREE_CUSTOM)) S.custom.push({ id: c.id, w: c.w, h: c.h });
    });
    buildFormatList();
    setSelection((b.sel || []).map(id => { const c = (b.custom || []).find(x => x.id === id); const m = c && S.custom.find(x => x.w === c.w && x.h === c.h); return m ? m.id : id; }));
    toast('Bundle "' + b.name + '" applied'); track('bundle_apply', {});
  }
  function saveBundle() {
    const bs = loadBundles();
    if (!isPro() && bs.length >= FREE_BUNDLES) { openPro('bundles'); return; }
    if (!S.sel.length) { toast('Select at least one format first'); return; }
    const name = $('bundleName').value.trim() || ('Bundle ' + (bs.length + 1));
    bs.push({ name, sel: S.sel.slice(), custom: S.custom.filter(c => S.sel.includes(c.id)) });
    saveBundles(bs); $('bundleName').value = ''; renderBundles(); toast('Bundle saved'); track('bundle_save', { count: S.sel.length });
  }

  // ---------- controls ----------
  let segs = {};
  function range(id, key, fmt) {
    const el = $(id), out = $(id + 'V'); el.value = S[key]; Studio.bindRange(el, out, fmt);
    el.addEventListener('input', () => { S[key] = Number(el.value); update(); });
  }
  function syncFillUI() {
    $('blurRow').classList.toggle('hidden', S.fill !== 'blur');
    $('solidRow').classList.toggle('hidden', !(S.fill === 'solid' || S.pad > 0));
    $('radiusRow').classList.toggle('hidden', !(S.fill === 'blur' || S.fill === 'solid' || S.pad > 0));
    $('solidColor').disabled = S.solidAuto;
    $('focalWrap').classList.toggle('dim', S.fill !== 'cover' && !Object.values(S.ov).some(o => o.fill === 'cover'));
  }
  function syncTypeUI() { $('qualityRow').classList.toggle('hidden', S.type === 'image/png'); }
  function syncAll() {
    segs.fill.set(S.fill);
    ['blur', 'pad', 'radius', 'capSize', 'quality'].forEach(k => { $(k).value = S[k]; $(k).dispatchEvent(new Event('input', { bubbles: false })); });
    $('solidColor').value = S.solidColor; $('solidAuto').checked = S.solidAuto; $('safeZones').checked = S.safe;
    $('captionOn').checked = S.captionOn; $('capText').value = S.caption; segs.capPos.set(S.capPos); $('capColor').value = S.capColor;
    $('typeSel').value = S.type; segs.scale.set(String(S.scale));
    syncFillUI(); syncTypeUI(); syncChecks(); syncChips(); syncCustomHint();
  }

  // ---------- files ----------
  let dz;
  async function onFiles(fileList) {
    const files = [...fileList].filter(f => /^image\//.test(f.type));
    if (!files.length) { toast('Please drop an image file (PNG, JPG, WebP)'); return; }
    if (files.length > 1 && !isPro()) { toast('Batch sources are a Pro feature – loading the first image'); openPro('multi'); }
    const take = isPro() ? files.slice(0, MAX_SOURCES) : files.slice(0, 1);
    const loaded = [];
    for (const f of take) {
      try { const img = await Studio.readImage(f); loaded.push(makeItem(img, f.name)); }
      catch (e) { toast('Could not read ' + f.name + (/heic|heif/i.test(f.name) ? ' (HEIC is not supported by browsers)' : '')); }
    }
    if (!loaded.length) return;
    items = loaded; current = 0;
    track('add_files', { count: loaded.length });
    syncSource(); update();
  }
  function syncSource() {
    const has = items.length > 0, it = src();
    $('stage').classList.toggle('has-image', has);
    $('srcInfo').innerHTML = has
      ? `<b>${esc(it.name)}</b> · ${it.w} × ${it.h} px${items.length > 1 ? ' · ' + items.length + ' images loaded' : ''}`
      : 'Showing the <b>built-in sample poster</b>. Drop, paste or upload your own design to replace it.';
    const list = $('srcList'); list.innerHTML = '';
    if (items.length > 1) items.forEach((x, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = i === current ? 'active' : ''; b.title = x.name; b.setAttribute('aria-label', 'Show ' + x.name);
      const c = document.createElement('canvas'); c.width = 56; c.height = 40; const cx = c.getContext('2d');
      const cv = Studio.cover(x.w, x.h, 56, 40); cx.drawImage(x.img, cv.sx, cv.sy, cv.sw, cv.sh, 0, 0, 56, 40);
      b.appendChild(c); b.addEventListener('click', () => { current = i; syncSource(); update(); }); list.appendChild(b);
    });
    syncCount(); renderFocal();
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function useSample() { items = []; current = 0; syncSource(); update(); track('sample', {}); }

  // ---------- init ----------
  function init() {
    sampleItem = makeItem(makeSample(), 'sample-poster');
    document.querySelectorAll('[data-pro-price]').forEach(el => el.textContent = C.PRO_PRICE || '$9');
    const pp = $('proPrice'); if (pp) pp.textContent = C.PRO_PRICE || '$9';

    // formats
    buildFormatList();
    $('selAll').addEventListener('click', () => { setSelection(allFormats().map(f => f.id)); track('select_all', {}); });
    $('selNone').addEventListener('click', () => setSelection([]));
    $('bundleChips').querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => { setSelection(PRESETS[ch.dataset.bundle] || []); track('preset_bundle', { id: ch.dataset.bundle }); }));
    $('addCustom').addEventListener('click', addCustom);
    ['customW', 'customH'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }));

    // fill
    segs.fill = Studio.seg($('fillSeg'), v => { S.fill = v; syncFillUI(); update(); track('fill_mode', { fill: v }); });
    range('blur', 'blur', v => v + 'px');
    $('solidColor').addEventListener('input', () => { S.solidColor = $('solidColor').value; update(); });
    $('solidAuto').addEventListener('change', () => { S.solidAuto = $('solidAuto').checked; if (!S.solidAuto && S.solidColor === DEF.solidColor) { S.solidColor = src().dom; $('solidColor').value = S.solidColor; } syncFillUI(); update(); });
    range('pad', 'pad', v => v + 'px'); $('pad').addEventListener('input', syncFillUI);
    range('radius', 'radius', v => v + 'px');
    $('safeZones').addEventListener('change', () => { S.safe = $('safeZones').checked; update(); });

    // caption
    $('captionOn').addEventListener('change', () => { S.captionOn = $('captionOn').checked; if (S.captionOn && !S.caption) { S.caption = 'New collection out now'; $('capText').value = S.caption; } update(); });
    $('capText').addEventListener('input', () => { S.caption = $('capText').value; if (!S.captionOn && S.caption) { S.captionOn = true; $('captionOn').checked = true; } update(); });
    segs.capPos = Studio.seg($('capPos'), v => { S.capPos = v; update(); });
    range('capSize', 'capSize');
    $('capColor').addEventListener('input', () => { S.capColor = $('capColor').value; update(); });

    // export options
    $('typeSel').addEventListener('change', () => { S.type = $('typeSel').value; syncTypeUI(); save(); });
    range('quality', 'quality', v => v + '%');
    segs.scale = Studio.seg($('scaleSeg'), v => {
      if (v === '2' && !Studio.gate('hires')) { segs.scale.set('1'); S.scale = 1; return; }
      S.scale = Number(v); save(); track('export_scale', { scale: S.scale });
    });
    $('dlAll').addEventListener('click', downloadAll);
    $('resetBtn').addEventListener('click', () => {
      const keep = { custom: S.custom, sel: S.sel }; Object.assign(S, cloneDef(), keep); S.ov = {};
      syncAll(); syncEdited(); update(); toast('Settings reset');
    });

    // source
    const stage = $('stage');
    dz = Studio.dropzone(stage, onFiles, { accept: 'image/*', multiple: true, clickTarget: '#drop' });
    $('uploadBtn').addEventListener('click', () => dz.open());
    $('useSample').addEventListener('click', useSample);
    bindFocal(); bindFocus();

    // bundles
    $('saveBundle').addEventListener('click', saveBundle);
    $('bundleName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveBundle(); } });
    renderBundles();

    document.addEventListener('keydown', e => {
      const mod = e.ctrlKey || e.metaKey; if (!mod) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (e.key.toLowerCase() === 's' && !/INPUT|TEXTAREA/.test(tag)) { e.preventDefault(); downloadAll(); }
    });

    const refreshPro = () => {
      const pro = isPro();
      document.querySelectorAll('.pro-badge[data-gate]').forEach(b => b.classList.toggle('hidden', pro));
      if (!pro && S.scale === 2) { S.scale = 1; segs.scale.set('1'); }
      if (!pro && items.length > 1) { items = [items[current]]; current = 0; syncSource(); }
      syncCustomHint(); renderBundles(); syncCount(); update();
    };
    document.addEventListener('pro:changed', refreshPro);

    syncAll(); syncSource(); syncGrid(); refreshPro();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sampleItem = makeItem(makeSample(), 'sample-poster'); if (!items.length) { syncSource(); } update(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
