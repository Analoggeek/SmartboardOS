/* whiteboard.js — the centrepiece: pressure-aware canvas, palm rejection,
   pages with live thumbnails, stickers, camera, PNG + multi-page PDF export. */

import { el, $, toast, uid, clamp, debounce, download, loadImage, reducedMotion, isMobile } from '../utils.js';
import { icon } from '../icons.js';
import { db, ls } from '../db.js';
import { PalmGuard, pressureOf, tiltOf, smoothPoint, widthAt } from '../pen.js';
import { emojis, emojiGroups, groupEmojis } from '../emoji-data.js';
import { openCamera } from '../camera.js';

const COLORS = ['#1a2233', '#e5484d', '#2563eb', '#0f9d6b', '#ea8c00', '#8b5cf6'];
const BACKGROUNDS = [
  { id: 'plain', label: 'Plain' },
  { id: 'grid', label: 'Grid' },
  { id: 'dots', label: 'Dots' },
  { id: 'rules', label: 'Rules' },
  { id: 'ruled', label: 'Ruled paper' },
  { id: 'staves', label: 'Music staves' },
];
const TOOLS = [
  { id: 'select', label: 'Select (S)', icon: 'select' },
  { id: 'pen', label: 'Pen (P)', icon: 'pen' },
  { id: 'highlighter', label: 'Highlighter (H)', icon: 'highlighter' },
  { id: 'eraser', label: 'Eraser (E)', icon: 'eraser' },
  { id: 'laser', label: 'Laser (Z)', icon: 'laser' },
  { id: 'line', label: 'Line (L)', icon: 'line' },
  { id: 'arrow', label: 'Arrow (A)', icon: 'arrow' },
  { id: 'rect', label: 'Rectangle (R)', icon: 'rect' },
  { id: 'ellipse', label: 'Ellipse (O)', icon: 'ellipse' },
  { id: 'text', label: 'Text (T)', icon: 'text' },
  { id: 'pan', label: 'Pan (V)', icon: 'pan' },
];

export function mount({ body, win, api, os }) {
  const settings = os.settings;
  const penCfg = { ...settings.pen };
  let disposed = false;

  const board = {
    pages: [{ id: uid('pg'), bg: settings.board?.bg || 'plain', objects: [] }],
    activePage: 0,
    savedAt: 0,
  };
  const view = { scale: 1, ox: 0, oy: 0 };
  const state = { tool: 'pen', color: COLORS[0], width: 4, sticker: null };
  const imageCache = new Map();
  const laser = [];
  let selected = null;
  let live = null;
  let textEditor = null;
  let needsRender = true;
  let rafId = 0;
  let canvas, ctx, stage, dpr = 1, cssW = 0, cssH = 0;
  let drawing = null;
  let gesture = null;
  let erasing = false;
  let erasingPushed = false;
  let selectionDrag = null;
  const pointers = new Map();
  const guard = new PalmGuard(penCfg);
  const history = new Map(); // pageId -> {undo:[], redo:[]}
  const thumbs = new Map(); // pageId -> canvas

  body.classList.add('no-scroll');

  /* ———————————————————————— DOM ———————————————————————— */
  const topbar = el('div', { class: 'wb__top', role: 'toolbar', 'aria-label': 'Whiteboard tools' });
  const stageEl = el('div', { class: 'wb__stage' });
  const pagesEl = el('div', { class: 'pages', 'aria-label': 'Board pages' });
  const rootEl = el('div', { class: 'wb' }, topbar, stageEl, pagesEl);
  body.append(rootEl);

  canvas = el('canvas', { class: 'wb__canvas', 'aria-label': 'Whiteboard canvas' });
  const badges = el('div', { class: 'wb__badges' });
  const zoomBox = el('div', { class: 'wb__zoom' });
  stageEl.append(canvas, badges, zoomBox);

  const toolButtons = new Map();
  const colorButtons = new Map();
  const bgButtons = new Map();

  /* ———————————————————————— view / render ———————————————————————— */
  function page() { return board.pages[board.activePage]; }
  function historyFor(id) {
    if (!history.has(id)) history.set(id, { undo: [], redo: [] });
    return history.get(id);
  }
  const invalidate = () => { needsRender = true; };

  function resizeCanvas() {
    const rect = stageEl.getBoundingClientRect();
    cssW = Math.max(1, Math.floor(rect.width));
    cssH = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    invalidate();
  }

  function drawBackground() {
    const bg = page().bg;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssW, cssH);
    const s = view.scale;
    if (bg === 'plain') { ctx.restore(); return; }
    ctx.strokeStyle = '#dbe3f3';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#c3cde4';
    if (bg === 'grid' || bg === 'dots' || bg === 'rules') {
      const step = (bg === 'grid' ? 32 : 34) * s;
      if (step > 4) {
        if (bg === 'dots') {
          const r = Math.max(0.7, 1.1 * s);
          for (let x = view.ox % step; x < cssW; x += step) {
            for (let y = view.oy % step; y < cssH; y += step) {
              ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
          }
        } else if (bg === 'grid') {
          ctx.beginPath();
          for (let x = view.ox % step; x < cssW; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, cssH); }
          for (let y = view.oy % step; y < cssH; y += step) { ctx.moveTo(0, y); ctx.lineTo(cssW, y); }
          ctx.stroke();
        } else {
          ctx.beginPath();
          for (let y = view.oy % step; y < cssH; y += step) { ctx.moveTo(0, y); ctx.lineTo(cssW, y); }
          ctx.stroke();
        }
      }
    } else if (bg === 'ruled') {
      const step = 34 * s;
      ctx.strokeStyle = '#cfdbf0';
      ctx.beginPath();
      for (let y = view.oy % step; y < cssH; y += step) { ctx.moveTo(0, y); ctx.lineTo(cssW, y); }
      ctx.stroke();
      const marginX = 90 * s + view.ox;
      ctx.strokeStyle = '#f3a6b0';
      ctx.lineWidth = 1.5;
      if (marginX > 0 && marginX < cssW) {
        ctx.beginPath(); ctx.moveTo(marginX, 0); ctx.lineTo(marginX, cssH); ctx.stroke();
      }
    } else if (bg === 'staves') {
      const group = 78 * s;
      const lines = 12 * s;
      ctx.strokeStyle = '#c9d5ec';
      ctx.beginPath();
      if (lines > 1.5) {
        for (let g = view.oy % group; g < cssH; g += group) {
          for (let i = 0; i < 5; i++) {
            const y = g + i * lines;
            ctx.moveTo(0, y); ctx.lineTo(cssW, y);
          }
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function getImage(src) {
    if (!src) return null;
    if (imageCache.has(src)) return imageCache.get(src);
    const rec = { img: null, failed: false };
    imageCache.set(src, rec);
    loadImage(src).then((img) => { rec.img = img; invalidate(); })
      .catch(() => { { rec.failed = true; invalidate(); } });
    return rec;
  }

  function drawStroke(obj) {
    const pts = obj.points;
    if (!pts?.length) return;
    ctx.save();
    ctx.strokeStyle = obj.color;
    ctx.fillStyle = obj.color;
    ctx.globalAlpha = obj.type === 'highlighter' ? (obj.opacity ?? 0.35) : 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pressureOn = obj.type === 'pen' && penCfg.pressure;
    if (pts.length === 1) {
      const w = pressureOn ? widthAt(obj.width, pts[0].p || 0.5) : obj.width;
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, Math.max(0.6, w / 2), 0, Math.PI * 2); ctx.fill();
    } else if (!pressureOn) {
      ctx.lineWidth = obj.width;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    } else {
      // variable width segments: round caps hide the joins
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]; const b = pts[i];
        ctx.lineWidth = Math.max(0.5, widthAt(obj.width, ((a.p ?? 0.5) + (b.p ?? 0.5)) / 2));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawShape(obj) {
    ctx.save();
    ctx.strokeStyle = obj.color;
    ctx.fillStyle = obj.color;
    ctx.lineWidth = obj.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const { x1, y1, x2, y2 } = obj;
    ctx.beginPath();
    if (obj.shape === 'rect') {
      ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (obj.shape === 'ellipse') {
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    if (obj.shape === 'arrow') {
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = Math.max(10, obj.width * 3.4);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - 0.42), y2 - head * Math.sin(ang - 0.42));
      ctx.lineTo(x2 - head * Math.cos(ang + 0.42), y2 - head * Math.sin(ang + 0.42));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawText(obj) {
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.font = `600 ${obj.size}px Inter, ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    const lines = String(obj.text || '').split('\n');
    lines.forEach((line, i) => ctx.fillText(line, obj.x, obj.y + i * obj.size * 1.32));
    ctx.restore();
  }

  function drawObject(obj) {
    if (!obj) return;
    if (obj.type === 'stroke') drawStroke(obj);
    else if (obj.type === 'shape') drawShape(obj);
    else if (obj.type === 'text') drawText(obj);
    else if (obj.type === 'image') {
      const rec = getImage(obj.src);
      if (rec?.img) ctx.drawImage(rec.img, obj.x, obj.y, obj.w, obj.h);
      else {
        ctx.save();
        ctx.fillStyle = 'rgba(140,155,185,.18)';
        ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
        ctx.restore();
      }
    } else if (obj.type === 'sticker') {
      const rec = getImage(obj.src);
      if (rec?.img) ctx.drawImage(rec.img, obj.x - obj.size / 2, obj.y - obj.size / 2, obj.size, obj.size);
    }
  }

  function drawSelection() {
    const bb = bboxOf(selected);
    if (!bb) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.strokeStyle = '#6b7cff';
    ctx.lineWidth = 1.4 / view.scale;
    ctx.setLineDash([6 / view.scale, 5 / view.scale]);
    ctx.strokeRect(bb.x - 4 / view.scale, bb.y - 4 / view.scale, bb.w + 8 / view.scale, bb.h + 8 / view.scale);
    ctx.setLineDash([]);
    ctx.fillStyle = '#6b7cff';
    const hs = 9 / view.scale;
    ctx.fillRect(bb.x + bb.w - hs / 2, bb.y + bb.h - hs / 2, hs, hs);
    ctx.restore();
  }

  function drawLaser() {
    if (!laser.length) return;
    const now = performance.now();
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.strokeStyle = '#ff3b5c';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of laser) {
      const age = now - s.t;
      const alpha = clamp(1 - age / 1200, 0, 1);
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = (s.width || 5) / view.scale * 1.1;
      ctx.beginPath();
      s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function render() {
    if (!ctx || disposed) return;
    needsRender = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    drawBackground();
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    for (const obj of page().objects) {
      if (textEditor?.editId && obj.id === textEditor.editId) continue;
      drawObject(obj);
    }
    if (live) drawObject(live);
    ctx.restore();
    if (selected) drawSelection();
    drawLaser();
  }

  function loop() {
    if (disposed) return;
    if (needsRender) render();
    if (laser.length) {
      const now = performance.now();
      for (let i = laser.length - 1; i >= 0; i--) if (now - laser[i].t > 1300) laser.splice(i, 1);
      invalidate();
    }
    rafId = requestAnimationFrame(loop);
  }

  /* ———————————————————————— geometry helpers ———————————————————————— */
  function toWorld(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left - view.ox) / view.scale,
      y: (ev.clientY - r.top - view.oy) / view.scale,
    };
  }

  function bboxOf(obj) {
    if (!obj) return null;
    if (obj.type === 'stroke') {
      let x1 = Infinity; let y1 = Infinity; let x2 = -Infinity; let y2 = -Infinity;
      for (const p of obj.points || []) {
        x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
        x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
      }
      if (!Number.isFinite(x1)) return null;
      const pad = obj.width / 2;
      return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
    }
    if (obj.type === 'shape') {
      return {
        x: Math.min(obj.x1, obj.x2), y: Math.min(obj.y1, obj.y2),
        w: Math.abs(obj.x2 - obj.x1), h: Math.abs(obj.y2 - obj.y1),
      };
    }
    if (obj.type === 'text') {
      const lines = String(obj.text || '').split('\n');
      const w = Math.max(...lines.map((l) => l.length), 1) * obj.size * 0.56;
      return { x: obj.x, y: obj.y, w, h: lines.length * obj.size * 1.32 };
    }
    if (obj.type === 'image') return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    if (obj.type === 'sticker') return { x: obj.x - obj.size / 2, y: obj.y - obj.size / 2, w: obj.size, h: obj.size };
    return null;
  }

  function contentBounds(pg = page()) {
    let bb = null;
    for (const o of pg.objects) {
      const b = bboxOf(o);
      if (!b) continue;
      if (!bb) bb = { ...b };
      else {
        const x1 = Math.min(bb.x, b.x); const y1 = Math.min(bb.y, b.y);
        const x2 = Math.max(bb.x + bb.w, b.x + b.w); const y2 = Math.max(bb.y + bb.h, b.y + b.h);
        bb = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
    }
    if (!bb || bb.w < 40 || bb.h < 40) return { x: 0, y: 0, w: 1200, h: 800 };
    return bb;
  }

  function translateObject(obj, dx, dy) {
    if (obj.type === 'stroke') obj.points.forEach((p) => { p.x += dx; p.y += dy; });
    else if (obj.type === 'shape') { obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy; }
    else if (obj.type === 'text') { obj.x += dx; obj.y += dy; }
    else if (obj.type === 'image') { obj.x += dx; obj.y += dy; }
    else if (obj.type === 'sticker') { obj.x += dx; obj.y += dy; }
  }

  function scaleObject(obj, ox, oy, k) {
    const sx = (v) => ox + (v - ox) * k;
    const sy = (v) => oy + (v - oy) * k;
    if (obj.type === 'stroke') {
      obj.points = obj.points.map((p) => ({ ...p, x: sx(p.x), y: sy(p.y) }));
      obj.width = clamp(obj.width * k, 0.5, 80);
    } else if (obj.type === 'shape') {
      obj.x1 = sx(obj.x1); obj.y1 = sy(obj.y1); obj.x2 = sx(obj.x2); obj.y2 = sy(obj.y2);
      obj.width = clamp(obj.width * k, 0.5, 40);
    } else if (obj.type === 'text') {
      obj.x = sx(obj.x); obj.y = sy(obj.y); obj.size = clamp(obj.size * k, 8, 220);
    } else if (obj.type === 'image') {
      obj.x = sx(obj.x); obj.y = sy(obj.y); obj.w = Math.max(12, obj.w * k); obj.h = Math.max(12, obj.h * k);
    } else if (obj.type === 'sticker') {
      obj.x = sx(obj.x); obj.y = sy(obj.y); obj.size = clamp(obj.size * k, 16, 600);
    }
  }

  function hitTest(pt) {
    const objs = page().objects;
    const pad = 8 / view.scale;
    for (let i = objs.length - 1; i >= 0; i--) {
      const b = bboxOf(objs[i]);
      if (!b) continue;
      if (pt.x >= b.x - pad && pt.x <= b.x + b.w + pad && pt.y >= b.y - pad && pt.y <= b.y + b.h + pad) return objs[i];
    }
    return null;
  }

  function hitHandle(pt) {
    const bb = bboxOf(selected);
    if (!bb) return false;
    const r = 12 / view.scale;
    return Math.hypot(pt.x - (bb.x + bb.w), pt.y - (bb.y + bb.h)) < r;
  }

  /* ———————————————————————— persistence ———————————————————————— */
  async function saveNow() {
    if (disposed) return;
    board.savedAt = Date.now();
    const payload = { pages: board.pages, activePage: board.activePage, savedAt: board.savedAt, version: 2 };
    await db.put('boards', payload, 'current');
    const ok = ls.set('boardMirror', payload);
    ls.set('boardSavedAt', board.savedAt);
    ls.set('boardPageCount', board.pages.length);
    os.refreshStats?.();
    updateBadges();
    if (!ok) console.info('[board] localStorage mirror is full — IndexedDB copy is safe');
  }
  const scheduleSave = debounce(saveNow, 700);

  function pushUndo() {
    const h = historyFor(page().id);
    try { h.undo.push(JSON.stringify(page().objects)); } catch { /* ignore */ }
    if (h.undo.length > 60) h.undo.shift();
    h.redo.length = 0;
    updateBadges();
  }

  function undo() {
    const h = historyFor(page().id);
    if (!h.undo.length) { toast('Nothing to undo', { type: 'warn', duration: 1400 }); return; }
    h.redo.push(JSON.stringify(page().objects));
    page().objects = JSON.parse(h.undo.pop());
    selected = null;
    invalidate(); scheduleSave(); refreshThumbs();
  }

  function redo() {
    const h = historyFor(page().id);
    if (!h.redo.length) return;
    h.undo.push(JSON.stringify(page().objects));
    page().objects = JSON.parse(h.redo.pop());
    selected = null;
    invalidate(); scheduleSave(); refreshThumbs();
  }

  /* ———————————————————————— status / toolbar state ———————————————————————— */
  function updateBadges() {
    const objCount = page().objects.length;
    badges.innerHTML = '';
    badges.append(
      el('span', { class: 'badge', text: `${TOOLS.find((t) => t.id === state.tool)?.label.split(' (')[0] || state.tool}` }),
      el('span', { class: 'badge', text: `page ${board.activePage + 1} / ${board.pages.length}` }),
      el('span', { class: 'badge', text: `${objCount} object${objCount === 1 ? '' : 's'}` }),
      el('span', { class: 'badge badge--live', text: guard.palmRejectionCount ? `palm guard · ${guard.palmRejectionCount}` : 'saved locally' })
    );
    zoomBox.querySelector('span').textContent = Math.round(view.scale * 100) + '%';
    toolButtons.forEach((btn, id) => btn.classList.toggle('is-active', id === state.tool));
    colorButtons.forEach((btn, c) => btn.classList.toggle('is-active', c === state.color));
    bgButtons.forEach((btn, id) => btn.classList.toggle('is-active', id === page().bg));
    canvas.classList.toggle('is-selecting', state.tool === 'select');
    canvas.classList.toggle('is-text', state.tool === 'text');
    canvas.classList.toggle('is-moving', state.tool === 'pan');
  }

  function setTool(tool) {
    if (tool === 'stickers') { openStickerSheet(); return; }
    if (!TOOLS.some((t) => t.id === tool)) return;
    state.tool = tool;
    selected = state.tool === 'select' ? selected : null;
    drawing = null; live = null;
    settings.board.tool = tool;
    os.saveSettings({ board: settings.board }, true);
    if (tool === 'text' && !textEditor) toast('Tap the board and type — Enter finishes, Shift+Enter adds a line');
    invalidate(); updateBadges();
  }

  function setColor(c) {
    state.color = c;
    if (selected) {
      pushUndo();
      selected.color = c;
      invalidate(); scheduleSave(); refreshThumbs();
    }
    updateBadges();
  }

  function zoomBy(factor, center) {
    const next = clamp(view.scale * factor, 0.15, 6);
    const cx = center?.x ?? cssW / 2;
    const cy = center?.y ?? cssH / 2;
    const wx = (cx - view.ox) / view.scale;
    const wy = (cy - view.oy) / view.scale;
    view.scale = next;
    view.ox = cx - wx * next;
    view.oy = cy - wy * next;
    invalidate(); updateBadges();
  }
  function resetZoom() {
    view.scale = 1;
    view.ox = 0; view.oy = 0;
    invalidate(); updateBadges();
  }

  /* ———————————————————————— toolbar build ———————————————————————— */
  function buildTopbar() {
    TOOLS.forEach((t) => {
      const btn = el('button', { class: 'tbtn', type: 'button', title: t.label, 'aria-label': t.label });
      btn.innerHTML = icon(t.icon);
      btn.addEventListener('click', () => setTool(t.id));
      toolButtons.set(t.id, btn);
      topbar.append(btn);
    });
    topbar.append(el('div', { class: 'toolbar__sep' }));

    COLORS.forEach((c) => {
      const btn = el('button', {
        class: 'tbtn', type: 'button', title: `Ink ${c}`, 'aria-label': `Use ink colour ${c}`,
        style: { padding: '0 5px' },
      });
      const dot = el('span', { style: {
        display: 'block', width: '16px', height: '16px', borderRadius: '50%',
        background: c, boxShadow: '0 0 0 1.5px rgba(255,255,255,.35) inset',
      } });
      btn.append(dot);
      btn.dataset.color = c;
      btn.addEventListener('click', () => setColor(c));
      colorButtons.set(c, btn);
      topbar.append(btn);
    });

    const size = el('input', {
      type: 'range', min: '1', max: '32', value: String(state.width), style: { width: '80px' },
      title: 'Brush size — [ and ]', 'aria-label': 'Brush size',
    });
    size.addEventListener('input', () => {
      state.width = Number(size.value);
      if (live && live.type === 'stroke') live.width = state.width;
      invalidate();
    });
    topbar.append(size);

    topbar.append(el('div', { class: 'toolbar__sep' }));
    const undoBtn = el('button', { class: 'tbtn', type: 'button', title: 'Undo — Ctrl Z', 'aria-label': 'Undo' });
    undoBtn.innerHTML = icon('undo');
    undoBtn.addEventListener('click', undo);
    const redoBtn = el('button', { class: 'tbtn', type: 'button', title: 'Redo — Ctrl Shift Z', 'aria-label': 'Redo' });
    redoBtn.innerHTML = icon('redo');
    redoBtn.addEventListener('click', redo);
    topbar.append(undoBtn, redoBtn);

    topbar.append(el('div', { class: 'toolbar__sep' }));
    const prev = el('button', { class: 'tbtn', type: 'button', title: 'Previous page', 'aria-label': 'Previous page' });
    prev.innerHTML = icon('chevronLeft');
    prev.addEventListener('click', () => gotoPage(board.activePage - 1));
    const next = el('button', { class: 'tbtn', type: 'button', title: 'Next page', 'aria-label': 'Next page' });
    next.innerHTML = icon('chevronRight');
    next.addEventListener('click', () => gotoPage(board.activePage + 1));
    const addPage = el('button', { class: 'tbtn', type: 'button', title: 'Add page', 'aria-label': 'Add page' });
    addPage.innerHTML = icon('add');
    addPage.addEventListener('click', () => newPage());
    topbar.append(prev, next, addPage);

    topbar.append(el('div', { class: 'toolbar__spacer' }));

    const mk = (iconName, title, fn, label = title) => {
      const b = el('button', { class: 'tbtn', type: 'button', title, 'aria-label': label });
      b.innerHTML = icon(iconName);
      b.addEventListener('click', fn);
      topbar.append(b);
      return b;
    };
    mk('image', 'Insert image', pickImages, 'Insert image');
    mk('camera', 'Photo from camera', takePhoto, 'Photo from camera');
    mk('stickers', 'Emoji stickers', openStickerSheet, 'Emoji stickers');
    mk('download', 'Export page as PNG', exportPNG, 'Export page as PNG');
    mk('pdf', 'Export all pages as PDF', exportPDF, 'Export all pages as PDF');
    mk('trash', 'Clear this page', clearPage, 'Clear page');
    fsButton = mk('expand', 'Fullscreen board (Shift+F)', toggleBoardFullscreen, 'Fullscreen board');
    fsButton.setAttribute('aria-pressed', 'false');
  }

  function buildFloatingToolbox() {
    const bar = el('div', { class: 'wbf wbf--bottom', role: 'toolbar', 'aria-label': 'Floating board toolbox' });
    const handle = el('div', { class: 'wbf__handle', title: 'Drag to move toolbox', 'aria-label': 'Move toolbox' });
    handle.innerHTML = icon('grip');
    const items = el('div', { class: 'wbf__items' });
    const quick = [
      { tool: 'select', icon: 'select', label: 'Select' },
      { tool: 'pen', icon: 'pen', label: 'Pen' },
      { tool: 'highlighter', icon: 'highlighter', label: 'Highlighter' },
      { tool: 'eraser', icon: 'eraser', label: 'Eraser' },
      { tool: 'laser', icon: 'laser', label: 'Laser' },
      { tool: 'stickers', icon: 'stickers', label: 'Stickers', special: 'stickers' },
      { tool: 'camera', icon: 'camera', label: 'Camera', special: 'camera' },
    ];
    quick.forEach((t) => {
      const b = el('button', { class: 'tbtn', type: 'button', title: t.label, 'aria-label': t.label });
      b.innerHTML = icon(t.icon);
      b.addEventListener('click', () => {
        if (t.special === 'camera') takePhoto();
        else if (t.special === 'stickers') openStickerSheet();
        else setTool(t.tool);
      });
      items.append(b);
    });
    items.append(el('div', { class: 'toolbar__sep' }));
    const undoBtn = el('button', { class: 'tbtn', type: 'button', title: 'Undo', 'aria-label': 'Undo' });
    undoBtn.innerHTML = icon('undo');
    undoBtn.addEventListener('click', undo);
    const prevBtn = el('button', { class: 'tbtn', type: 'button', title: 'Previous page', 'aria-label': 'Previous page' });
    prevBtn.innerHTML = icon('chevronLeft');
    prevBtn.addEventListener('click', () => gotoPage(board.activePage - 1));
    const pageBadge = el('span', { class: 'badge', text: '1/1' });
    const nextBtn = el('button', { class: 'tbtn', type: 'button', title: 'Next page', 'aria-label': 'Next page' });
    nextBtn.innerHTML = icon('chevronRight');
    nextBtn.addEventListener('click', () => gotoPage(board.activePage + 1));
    const newBtn = el('button', { class: 'tbtn', type: 'button', title: 'New page', 'aria-label': 'New page' });
    newBtn.innerHTML = icon('page');
    newBtn.addEventListener('click', () => newPage());
    items.append(undoBtn, prevBtn, pageBadge, nextBtn, newBtn);

    const hideBtn = el('button', { class: 'wbf__hide', type: 'button', title: 'Hide toolbox', 'aria-label': 'Hide toolbox' });
    hideBtn.innerHTML = icon('close');
    const showBtn = el('button', { class: 'wbf__show', type: 'button', title: 'Show toolbox', 'aria-label': 'Show toolbox', hidden: true });
    showBtn.innerHTML = icon('pen');

    bar.append(handle, items, hideBtn);
    stageEl.append(bar, showBtn);

    const updatePageBadge = () => { pageBadge.textContent = `${board.activePage + 1}/${board.pages.length}`; };
    bar._sync = updatePageBadge;
    updatePageBadge();

    hideBtn.addEventListener('click', () => { bar.hidden = true; showBtn.hidden = false; });
    showBtn.addEventListener('click', () => { bar.hidden = false; showBtn.hidden = true; });

    // drag by handle, position persisted as a stage ratio
    const savedPos = ls.get('wbfPos', null);
    const applyPos = () => {
      if (!savedPos || typeof savedPos.rx !== 'number') {
        bar.classList.add('wbf--bottom');
        bar.style.left = ''; bar.style.top = '';
        if (isMobile()) bar.style.bottom = '52px';
        return;
      }
      bar.classList.remove('wbf--bottom');
      const stageRect = stageEl.getBoundingClientRect();
      const rect = bar.getBoundingClientRect();
      const left = clamp(savedPos.rx * stageRect.width, 4, Math.max(4, stageRect.width - rect.width - 4));
      const top = clamp(savedPos.ry * stageRect.height, 4, Math.max(4, stageRect.height - rect.height - 4));
      bar.style.left = left + 'px';
      bar.style.top = top + 'px';
      bar.style.bottom = 'auto';
    };
    requestAnimationFrame(applyPos);

    let drag = null;
    handle.addEventListener('pointerdown', (ev) => {
      const r = bar.getBoundingClientRect();
      const sr = stageEl.getBoundingClientRect();
      drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, sr };
      bar.classList.add('is-dragging');
      bar.classList.remove('wbf--bottom');
      bar.style.bottom = 'auto';
      bar.style.left = (r.left - sr.left) + 'px';
      bar.style.top = (r.top - sr.top) + 'px';
      handle.setPointerCapture?.(ev.pointerId);
      ev.preventDefault();
    });
    handle.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const rect = bar.getBoundingClientRect();
      const x = clamp(ev.clientX - drag.dx - drag.sr.left, 4, drag.sr.width - rect.width - 4);
      const y = clamp(ev.clientY - drag.dy - drag.sr.top, 4, drag.sr.height - rect.height - 4);
      bar.style.left = x + 'px';
      bar.style.top = y + 'px';
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      bar.classList.remove('is-dragging');
      const sr = stageEl.getBoundingClientRect();
      const r = bar.getBoundingClientRect();
      ls.set('wbfPos', { rx: (r.left - sr.left) / sr.width, ry: (r.top - sr.top) / sr.height });
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('lostpointercapture', endDrag);

    return bar;
  }

  /* ———————————————————————— pages ———————————————————————— */
  function renderThumb(pg, canvasEl) {
    const ctx2 = canvasEl.getContext('2d');
    if (!ctx2) return;
    const W = canvasEl.width; const H = canvasEl.height;
    ctx2.setTransform(1, 0, 0, 1, 0, 0);
    ctx2.clearRect(0, 0, W, H);
    ctx2.fillStyle = '#fff';
    ctx2.fillRect(0, 0, W, H);
    const bb = contentBounds(pg);
    const pad = 40;
    const scale = Math.min(W / (bb.w + pad * 2), H / (bb.h + pad * 2));
    ctx2.save();
    ctx2.translate(W / 2 - (bb.x + bb.w / 2) * scale, H / 2 - (bb.y + bb.h / 2) * scale);
    ctx2.scale(scale, scale);
    const prevCtx = ctx; const prevCanvas = canvas;
    ctx = ctx2; canvas = canvasEl;
    try {
      if (pg.bg !== 'plain') {
        const step = 32 / 3;
        ctx2.strokeStyle = '#e2e8f6';
        ctx2.lineWidth = 1 / scale;
        ctx2.beginPath();
        for (let x = bb.x; x < bb.x + bb.w; x += step) { ctx2.moveTo(x, bb.y); ctx2.lineTo(x, bb.y + bb.h); }
        for (let y = bb.y; y < bb.y + bb.h; y += step) { ctx2.moveTo(bb.x, y); ctx2.lineTo(bb.x + bb.w, y); }
        ctx2.stroke();
      }
      pg.objects.forEach((o) => drawObject(o));
    } finally { ctx = prevCtx; canvas = prevCanvas; }
    ctx2.restore();
  }

  function renderPages() {
    pagesEl.innerHTML = '';
    board.pages.forEach((pg, i) => {
      const card = el('div', {
        class: 'pagecard' + (i === board.activePage ? ' is-active' : ''),
        role: 'button', tabindex: '0', 'aria-label': `Page ${i + 1}`,
        title: `Page ${i + 1}`,
      });
      const thumb = el('canvas', { width: 168, height: 100 });
      card.append(thumb);
      const label = el('span', {},
        el('span', { text: `${i + 1} · ${pg.objects.length} obj` })
      );
      const del = el('button', { class: 'pagecard__del', type: 'button', title: 'Delete page', 'aria-label': `Delete page ${i + 1}` });
      del.innerHTML = icon('close');
      del.addEventListener('click', (ev) => { ev.stopPropagation(); deletePage(i); });
      label.append(del);
      card.append(label);
      card.addEventListener('click', () => gotoPage(i));
      card.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); gotoPage(i); } });
      pagesEl.append(card);
      thumbs.set(pg.id, thumb);
      renderThumb(pg, thumb);
    });
    const add = el('button', { class: 'pages__add', type: 'button', title: 'Add page', 'aria-label': 'Add page' });
    add.innerHTML = `${icon('add')}<span>New</span>`;
    add.addEventListener('click', () => newPage());
    pagesEl.append(add);
    const dup = el('button', { class: 'pages__add', type: 'button', title: 'Duplicate page', 'aria-label': 'Duplicate current page' });
    dup.innerHTML = `${icon('copy')}<span>Copy</span>`;
    dup.addEventListener('click', () => duplicatePage(board.activePage));
    pagesEl.append(dup);
    if (activeCard()) activeCard().scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const activeCard = () => pagesEl.querySelectorAll('.pagecard')[board.activePage];

  const refreshThumbs = debounce(() => {
    const pg = page();
    const thumb = thumbs.get(pg.id);
    if (thumb) renderThumb(pg, thumb);
  }, 350);

  function gotoPage(i) {
    if (i < 0 || i >= board.pages.length || i === board.activePage) return;
    board.activePage = i;
    selected = null; live = null; drawing = null;
    renderPages();
    invalidate(); updateBadges(); scheduleSave();
  }

  function newPage() {
    const bg = page().bg;
    board.pages.push({ id: uid('pg'), bg, objects: [] });
    board.activePage = board.pages.length - 1;
    renderPages(); invalidate(); updateBadges(); scheduleSave();
    toast(`Page ${board.activePage + 1} added`);
  }

  function duplicatePage(i) {
    const src = board.pages[i];
    if (!src) return;
    const copy = { id: uid('pg'), bg: src.bg, objects: JSON.parse(JSON.stringify(src.objects)) };
    board.pages.splice(i + 1, 0, copy);
    board.activePage = i + 1;
    renderPages(); invalidate(); updateBadges(); scheduleSave();
    toast('Page duplicated');
  }

  function deletePage(i) {
    if (board.pages.length === 1) { toast('The board needs at least one page', { type: 'warn' }); return; }
    board.pages.splice(i, 1);
    board.activePage = clamp(board.activePage, 0, board.pages.length - 1);
    renderPages(); invalidate(); updateBadges(); scheduleSave();
    toast('Page deleted');
  }

  function clearPage() {
    if (!page().objects.length) { toast('This page is already empty', { type: 'warn' }); return; }
    pushUndo();
    page().objects = [];
    selected = null;
    invalidate(); scheduleSave(); refreshThumbs(); updateBadges();
    toast('Page cleared');
  }

  function setBackground(bgId) {
    page().bg = bgId;
    settings.board.bg = bgId;
    os.saveSettings({ board: settings.board }, true);
    invalidate(); renderPages(); scheduleSave();
  }

  /* ———————————————————————— pointer input ———————————————————————— */
  function pointerDown(ev) {
    if (textEditor) commitText();
    canvas.setPointerCapture?.(ev.pointerId);
    const pt = toWorld(ev);
    const cfg = guard.cfg;

    // two-finger / multi-touch gesture
    if (ev.pointerType === 'touch') {
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        if (drawing && drawing.pointerType === 'touch') { drawing = null; live = null; }
        gesture = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2,
          scale: view.scale, ox: view.ox, oy: view.oy,
        };
        invalidate();
        return;
      }
      if (pointers.size > 2) return;
    }

    if (gesture) return;

    if (ev.pointerType === 'pen') guard.noteDown(ev);

    // palm rejection
    if (!guard.allows(ev)) {
      updateBadges();
      return;
    }

    // tool actions
    if (state.tool === 'pan' || ev.button === 1) {
      drawing = { kind: 'pan', px: ev.clientX, py: ev.clientY, ox: view.ox, oy: view.oy, pointerType: ev.pointerType };
      canvas.classList.add('is-grabbing');
      return;
    }

    if (state.tool === 'select') {
      if (selected && hitHandle(pt)) {
        const bb = bboxOf(selected);
        selectionDrag = { kind: 'scale', bb, snapshot: JSON.stringify(selected), start: pt, pushed: false };
        return;
      }
      const hit = hitTest(pt);
      selected = hit || null;
      if (hit) selectionDrag = { kind: 'move', start: pt, snapshot: JSON.stringify(hit), pushed: false };
      invalidate(); updateBadges();
      return;
    }

    if (state.tool === 'eraser') {
      erasing = true;
      erasingPushed = false;
      eraseAt(pt);
      refreshThumbs();
      return;
    }

    if (state.tool === 'laser') {
      laser.push({ points: [pt], t: performance.now(), width: 5 });
      drawing = { kind: 'laser', stroke: laser[laser.length - 1], pointerType: ev.pointerType };
      invalidate();
      return;
    }

    if (state.tool === 'text') {
      ev.preventDefault();
      beginText(pt);
      return;
    }

    if (state.sticker) {
      pushUndo();
      const size = clamp(84 / view.scale, 26, 240);
      page().objects.push({ id: uid('o'), type: 'sticker', src: state.sticker, size, x: pt.x, y: pt.y });
      state.sticker = null;
      invalidate(); scheduleSave(); refreshThumbs(); updateBadges();
      return;
    }

    const pressure = pressureOf(ev, cfg);
    if (['pen', 'highlighter'].includes(state.tool)) {
      pushUndo();
      const obj = {
        id: uid('o'), type: state.tool, color: state.color,
        width: state.tool === 'highlighter' ? Math.max(10, state.width * 4) : state.width,
        opacity: state.tool === 'highlighter' ? 0.32 : 1,
        tilt: cfg.tilt ? tiltOf(ev) : 0,
        points: [{ x: pt.x, y: pt.y, p: pressure }],
      };
      if (state.tool === 'highlighter' && cfg.tilt) obj.width *= 1 + Math.min(0.8, tiltOf(ev));
      drawing = { kind: 'stroke', obj, pointerType: ev.pointerType, last: obj.points[0] };
      live = obj;
      invalidate();
      return;
    }

    if (['line', 'arrow', 'rect', 'ellipse'].includes(state.tool)) {
      pushUndo();
      const obj = { id: uid('o'), type: 'shape', shape: state.tool, color: state.color, width: state.width, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
      drawing = { kind: 'shape', obj, pointerType: ev.pointerType };
      live = obj;
      invalidate();
    }
  }

  function pointerMove(ev) {
    if (gesture) {
      if (ev.pointerType === 'touch' && pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const pts = [...pointers.values()];
      if (pts.length < 2) return;
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const stageRect = stageEl.getBoundingClientRect();
      const k = clamp(dist / (gesture.dist || 1), 0.2, 8);
      const nextScale = clamp(gesture.scale * k, 0.15, 6);
      const realK = nextScale / gesture.scale;
      const wx = (gesture.cx - stageRect.left - gesture.ox) / gesture.scale;
      const wy = (gesture.cy - stageRect.top - gesture.oy) / gesture.scale;
      view.scale = nextScale;
      view.ox = (cx - stageRect.left) - wx * nextScale;
      view.oy = (cy - stageRect.top) - wy * nextScale;
      invalidate(); updateBadges();
      return;
    }
    if (erasing) {
      eraseAt(toWorld(ev));
      return;
    }

    if (selectionDrag && selected) {
      if (!selectionDrag.pushed) { pushUndo(); selectionDrag.pushed = true; }
      const pt = toWorld(ev);
      const obj = selected;
      if (selectionDrag.kind === 'move') {
        const dx = pt.x - selectionDrag.start.x;
        const dy = pt.y - selectionDrag.start.y;
        const fresh = JSON.parse(selectionDrag.snapshot);
        translateObject(fresh, dx, dy);
        Object.keys(obj).forEach((key) => delete obj[key]);
        Object.assign(obj, fresh);
      } else if (selectionDrag.kind === 'scale') {
        const bb = selectionDrag.bb;
        const base = JSON.parse(selectionDrag.snapshot);
        const k = clamp((pt.x - bb.x) / Math.max(6, bb.w), 0.08, 12);
        Object.keys(obj).forEach((key) => delete obj[key]);
        Object.assign(obj, base);
        scaleObject(obj, bb.x, bb.y, k);
      }
      invalidate();
      return;
    }

    if (!drawing) return;

    if (drawing.kind === 'pan') {
      view.ox = drawing.ox + (ev.clientX - drawing.px);
      view.oy = drawing.oy + (ev.clientY - drawing.py);
      invalidate();
      return;
    }

    const events = ev.getCoalescedEvents?.() || [ev];
    for (const e of events) {
      const pt = toWorld(e);
      if (drawing.kind === 'stroke') {
        const p = pressureOf(e, guard.cfg);
        const raw = { x: pt.x, y: pt.y, p };
        const smooth = smoothPoint(drawing.last, raw, (guard.cfg.smoothing || 0) / 100);
        if (Math.hypot(smooth.x - drawing.last.x, smooth.y - drawing.last.y) >= 0.35) {
          drawing.obj.points.push(smooth);
          drawing.last = smooth;
        }
      } else if (drawing.kind === 'shape') {
        drawing.obj.x2 = pt.x;
        drawing.obj.y2 = pt.y;
        if (ev.shiftKey) {
          const dx = pt.x - drawing.obj.x1; const dy = pt.y - drawing.obj.y1;
          const m = Math.max(Math.abs(dx), Math.abs(dy));
          drawing.obj.x2 = drawing.obj.x1 + Math.sign(dx || 1) * m;
          drawing.obj.y2 = drawing.obj.y1 + Math.sign(dy || 1) * m;
        }
      } else if (drawing.kind === 'laser') {
        drawing.stroke.points.push(pt);
        drawing.stroke.t = performance.now();
      }
    }
    if (drawing.kind === 'stroke' && drawing.obj.points.length % 12 === 0) refreshThumbs();
    invalidate();
  }

  function pointerUp(ev) {
    const wasGesture = !!gesture && ev.pointerType === 'touch';
    if (ev.pointerType === 'touch') pointers.delete(ev.pointerId);
    if (wasGesture) {
      if (pointers.size < 2) { gesture = null; }
      try { canvas.releasePointerCapture?.(ev.pointerId); } catch { /* ignore */ }
      return;
    }
    if (ev.pointerType === 'pen') guard.noteUp(ev);
    try { canvas.releasePointerCapture?.(ev.pointerId); } catch { /* ignore */ }

    canvas.classList.remove('is-grabbing');

    if (selectionDrag) {
      selectionDrag = null;
      selected = page().objects.find((o) => o.id === selected?.id) || selected;
      scheduleSave(); refreshThumbs(); updateBadges();
      return;
    }
    if (erasing) { erasing = false; scheduleSave(); refreshThumbs(); updateBadges(); return; }
    if (!drawing) return;

    if (drawing.kind === 'stroke' || drawing.kind === 'shape') {
      const obj = drawing.obj;
      const discarded = drawing.kind === 'shape'
        && Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1) < 4;
      if (discarded) {
        // nothing was drawn, so drop the undo entry we reserved
        const h = historyFor(page().id);
        if (h.undo.length) h.undo.pop();
      } else {
        page().objects.push(obj);
      }
      live = null;
      drawing = null;
      invalidate(); scheduleSave(); refreshThumbs(); updateBadges();
      return;
    }

    if (drawing.kind === 'laser') {
      drawing = null;
      invalidate();
      return;
    }
    drawing = null;
  }

  function cancelGesture() {
    gesture = null;
    drawing = null;
    live = null;
    pointers.clear();
    invalidate();
  }

  function eraseAt(pt) {
    const objs = page().objects;
    const radius = Math.max(14 / view.scale, state.width * 1.6);
    let removed = 0;
    for (let i = objs.length - 1; i >= 0; i--) {
      const bb = bboxOf(objs[i]);
      if (!bb) continue;
      const near = pt.x > bb.x - radius && pt.x < bb.x + bb.w + radius
        && pt.y > bb.y - radius && pt.y < bb.y + bb.h + radius;
      if (!near) continue;
      if (!erasingPushed) { pushUndo(); erasingPushed = true; }
      if (selected === objs[i]) selected = null;
      objs.splice(i, 1);
      removed++;
    }
    if (!removed) return;
    invalidate(); scheduleSave(); updateBadges();
  }

  /* ———————————————————————— text tool ———————————————————————— */
  function beginText(worldPt, opts = {}) {
    if (textEditor) commitText();
    const size = clamp(opts.size || 26, 8, 220);
    const ta = el('textarea', {
      class: 'wb__textinput', rows: 1, spellcheck: 'false',
      'aria-label': 'Text on board', placeholder: 'Type here…',
    });
    ta.value = opts.text || '';
    const origin = { x: opts.x ?? worldPt.x, y: opts.y ?? worldPt.y };
    const left = origin.x * view.scale + view.ox;
    const top = origin.y * view.scale + view.oy;
    Object.assign(ta.style, {
      left: Math.max(2, left) + 'px', top: Math.max(2, top) + 'px',
      fontSize: Math.max(13, size * view.scale) + 'px',
      color: state.color || '#1a2233', lineHeight: '1.32',
      minWidth: Math.max(120, Math.min(cssW - left - 16, 320)) + 'px',
    });
    stageEl.append(ta);

    const ed = { ta, worldPt: origin, size, editId: opts.id || null, ready: false, cancel: false };
    textEditor = ed;
    const autoGrow = () => {
      ta.style.height = 'auto';
      ta.style.height = Math.max(ta.scrollHeight, size * view.scale + 12) + 'px';
      ta.style.width = 'auto';
      ta.style.width = Math.max(120, Math.min(cssW - parseFloat(ta.style.left) - 16, ta.scrollWidth + 24)) + 'px';
    };
    autoGrow();

    // Focus after the pointer sequence finishes, otherwise the canvas can steal it back.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (textEditor !== ed) return;
      ed.ready = true;
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(ta.value.length, ta.value.length);
      autoGrow();
    }));

    ta.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    ta.addEventListener('click', (ev) => ev.stopPropagation());
    ta.addEventListener('input', autoGrow);
    ta.addEventListener('blur', () => { if (ed.ready) commitText(); });
    ta.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); ed.cancel = true; ta.blur(); }
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitText(); }
    });
  }

  function commitText() {
    const ed = textEditor;
    if (!ed) return;
    textEditor = null;
    const value = ed.ta.value.replace(/\s+$/, '');
    const cancel = ed.cancel;
    ed.ta.remove();
    invalidate();

    if (cancel) return;
    if (ed.editId) {
      const obj = page().objects.find((o) => o.id === ed.editId);
      if (!obj) return;
      pushUndo();
      if (value.trim()) {
        obj.text = value;
        obj.color = state.color;
        obj.size = ed.size;
        obj.x = ed.worldPt.x;
        obj.y = ed.worldPt.y;
      } else {
        page().objects = page().objects.filter((o) => o.id !== ed.editId);
      }
      scheduleSave(); refreshThumbs(); updateBadges();
      return;
    }
    if (!value.trim()) return;
    pushUndo();
    page().objects.push({
      id: uid('o'), type: 'text', x: ed.worldPt.x, y: ed.worldPt.y,
      text: value, color: state.color || '#1a2233', size: ed.size,
    });
    scheduleSave(); refreshThumbs(); updateBadges();
  }

  /* ———————————————————————— fullscreen ———————————————————————— */
  let cssFullscreen = false;
  let fsButton = null;

  function syncFullscreenButton() {
    if (!fsButton) return;
    const on = !!(document.fullscreenElement || cssFullscreen);
    fsButton.classList.toggle('is-active', on);
    fsButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    fsButton.title = on ? 'Exit fullscreen board (Shift+F)' : 'Fullscreen board (Shift+F)';
  }

  function setCssFullscreen(on) {
    cssFullscreen = on;
    document.body.classList.toggle('wb-fs', on);
    if (on && api && !api.isMaximized?.()) api.toggleMaximize?.();
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      resizeCanvas();
      invalidate();
    });
    setTimeout(() => { resizeCanvas(); invalidate(); }, 260);
    syncFullscreenButton();
  }

  function toggleBoardFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
      return;
    }
    if (cssFullscreen) { setCssFullscreen(false); return; }
    const request = win.requestFullscreen || win.webkitRequestFullscreen;
    if (request) {
      try {
        const result = request.call(win);
        if (result?.catch) result.catch(() => setCssFullscreen(true));
      } catch { setCssFullscreen(true); }
    } else {
      setCssFullscreen(true);
    }
    syncFullscreenButton();
  }

  function onFullscreenChange() {
    setTimeout(() => { resizeCanvas(); invalidate(); syncFullscreenButton(); }, 80);
  }

  /* ———————————————————————— images / stickers / camera ———————————————————————— */
  /* ———————————————————————— images / stickers / camera ———————————————————————— */
  function insertImage(src, { source = 'image' } = {}) {
    loadImage(src).then((img) => {
      pushUndo();
      const maxW = (cssW * 0.7) / view.scale;
      const maxH = (cssH * 0.7) / view.scale;
      const ratio = img.width / img.height || 1.5;
      let w = maxW; let h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      const cx = (cssW / 2 - view.ox) / view.scale;
      const cy = (cssH / 2 - view.oy) / view.scale;
      const obj = {
        id: uid('o'), type: 'image', src, x: cx - w / 2, y: cy - h / 2, w, h,
        background: source === 'pdf',
      };
      if (source === 'pdf') page().objects.unshift(obj);
      else page().objects.push(obj);
      invalidate(); scheduleSave(); refreshThumbs(); updateBadges();
      toast(source === 'camera' ? 'Photo added to the board' : 'Image added to the board');
    }).catch(() => toast('That image could not be decoded', { type: 'error' }));
  }

  function pickImages() {
    const input = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    document.body.append(input);
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])].slice(0, 12);
      input.remove();
      if (!files.length) return;
      const reader = (f) => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result); r.onerror = rej;
        r.readAsDataURL(f);
      });
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        try { insertImage(await reader(f)); } catch { toast(`Could not read ${f.name}`, { type: 'error' }); }
      }
    });
    input.click();
  }

  function takePhoto() {
    openCamera({ onCapture: (dataUrl) => insertImage(dataUrl, { source: 'camera' }) });
  }

  function openStickerSheet() {
    const closeBtn = el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close stickers', title: 'Close' });
    closeBtn.innerHTML = icon('close');
    const grid = el('div', { class: 'emoji-grid' });
    const tabs = el('div', { class: 'tabs' });
    let group = 'faces';

    const drawGrid = () => {
      grid.innerHTML = '';
      groupEmojis(group).forEach((e) => {
        const b = el('button', { class: 'emoji-btn', type: 'button', title: e.name, 'aria-label': `Place ${e.name} sticker` });
        b.append(el('img', { src: e.src, alt: '', loading: 'lazy' }));
        b.addEventListener('click', () => {
          state.sticker = e.src;
          sheet.remove();
          updateBadges();
          toast('Sticker ready — tap the board to place it');
        });
        grid.append(b);
      });
      tabs.querySelectorAll('button').forEach((t) => t.classList.toggle('is-active', t.dataset.group === group));
    };

    emojiGroups.forEach((g) => {
      const t = el('button', { type: 'button', text: g.label, dataset: { group: g.id } });
      t.addEventListener('click', () => { group = g.id; drawGrid(); });
      tabs.append(t);
    });

    const box = el('div', { class: 'sheet__box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Emoji stickers' },
      el('div', { class: 'sheet__head' }, el('b', { text: 'Emoji stickers' }), closeBtn),
      el('p', { class: 'hint', text: 'Tap a sticker, then tap the board where it should go. Stickers are bundled vector art and appear in PNG/PDF exports.' }),
      tabs,
      grid
    );
    const sheet = el('div', { class: 'sheet' }, box);
    stageEl.append(sheet);
    drawGrid();
    closeBtn.addEventListener('click', () => sheet.remove());
    sheet.addEventListener('click', (ev) => { if (ev.target === sheet) sheet.remove(); });
  }

  /* ———————————————————————— export ———————————————————————— */
  function renderPageBitmap(pg, maxW = 1600, maxH = 1000) {
    const bb = contentBounds(pg);
    const pad = 48;
    const wWorld = bb.w + pad * 2;
    const hWorld = bb.h + pad * 2;
    const scale = Math.min(maxW / wWorld, maxH / hWorld);
    const c = document.createElement('canvas');
    c.width = Math.max(320, Math.round(wWorld * scale));
    c.height = Math.max(240, Math.round(hWorld * scale));
    const c2 = c.getContext('2d');
    c2.fillStyle = '#ffffff';
    c2.fillRect(0, 0, c.width, c.height);
    const oldCtx = ctx; const oldCanvas = canvas;
    ctx = c2; canvas = c;
    c2.save();
    c2.translate(-(bb.x - pad) * scale, -(bb.y - pad) * scale);
    c2.scale(scale, scale);
    try {
      // background pattern in page space
      if (pg.bg !== 'plain') {
        c2.strokeStyle = '#dbe3f3';
        c2.lineWidth = 1 / scale;
        if (pg.bg === 'grid' || pg.bg === 'rules' || pg.bg === 'ruled') {
          c2.beginPath();
          const step = pg.bg === 'grid' ? 32 : 34;
          for (let x = bb.x - pad; x < bb.x + bb.w + pad; x += step) { c2.moveTo(x, bb.y - pad); c2.lineTo(x, bb.y + bb.h + pad); }
          for (let y = bb.y - pad; y < bb.y + bb.h + pad; y += step) { c2.moveTo(bb.x - pad, y); c2.lineTo(bb.x + bb.w + pad, y); }
          c2.stroke();
        }
      }
      pg.objects.forEach((o) => drawObject(o));
    } finally { ctx = oldCtx; canvas = oldCanvas; }
    c2.restore();
    return c;
  }

  function exportPNG() {
    if (!page().objects.length) { toast('Draw something first', { type: 'warn' }); return; }
    try {
      const bmp = renderPageBitmap(page(), 2000, 1400);
      const url = bmp.toDataURL('image/png');
      download(url, `smartboard-page-${board.activePage + 1}.png`);
      toast('PNG exported');
    } catch (err) { console.warn(err); toast('PNG export failed', { type: 'error' }); }
  }

  function exportPDF() {
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) { toast('PDF library is still loading — try again in a second', { type: 'warn' }); return; }
    if (!board.pages.some((p) => p.objects.length)) { toast('Draw something first', { type: 'warn' }); return; }
    try {
      let doc = null;
      board.pages.forEach((pg, idx) => {
        const bmp = renderPageBitmap(pg, 1800, 1200);
        const landscape = bmp.width >= bmp.height;
        if (!doc) {
          doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
        } else {
          doc.addPage('a4', landscape ? 'landscape' : 'portrait');
        }
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();
        const img = bmp.getContext('2d').canvas;
        const ratio = Math.min(pw / img.width, ph / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        doc.addImage(bmp.toDataURL('image/jpeg', 0.92), 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
      });
      doc.save(`smartboard-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast(`PDF exported — ${board.pages.length} page${board.pages.length > 1 ? 's' : ''}`);
    } catch (err) { console.warn(err); toast('PDF export failed', { type: 'error' }); }
  }

  /* ———————————————————————— zoom controls ———————————————————————— */
  function buildZoom() {
    const out = el('button', { type: 'button', title: 'Zoom out', 'aria-label': 'Zoom out' });
    out.innerHTML = icon('zoomOut');
    out.addEventListener('click', () => zoomBy(1 / 1.2));
    const label = el('span', { text: '100%' });
    const inp = el('button', { type: 'button', title: 'Reset zoom', 'aria-label': 'Reset zoom' });
    inp.innerHTML = icon('fullscreen');
    inp.addEventListener('click', resetZoom);
    const zin = el('button', { type: 'button', title: 'Zoom in', 'aria-label': 'Zoom in' });
    zin.innerHTML = icon('zoomIn');
    zin.addEventListener('click', () => zoomBy(1.2));
    zoomBox.append(out, label, zin, inp);
  }

  /* ———————————————————————— keyboard ———————————————————————— */
  const KEYMAP = {
    s: 'select', p: 'pen', h: 'highlighter', e: 'eraser', l: 'line',
    a: 'arrow', r: 'rect', o: 'ellipse', t: 'text', z: 'laser', v: 'pan',
  };

  function onKeyDown(ev) {
    if (disposed) return;
    const stateHasFocus = win.contains(document.activeElement) || win.classList.contains('is-focused');
    if (!stateHasFocus) return;
    if (textEditor) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;
    if (typing) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key.toLowerCase();

    if (mod && k === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) redo(); else undo();
      return;
    }
    if (mod && k === 'y') { ev.preventDefault(); redo(); return; }
    if (mod && k === 's') {
      ev.preventDefault();
      saveNow().then(() => toast('Board saved on this device'));
      return;
    }
    if (mod && k === 'd') {
      ev.preventDefault();
      if (selected) {
        pushUndo();
        const copy = JSON.parse(JSON.stringify(selected));
        copy.id = uid('o');
        translateObject(copy, 24, 24);
        page().objects.push(copy);
        selected = copy;
        invalidate(); scheduleSave(); refreshThumbs(); updateBadges();
        toast('Object duplicated');
      }
      return;
    }
    if (ev.shiftKey && k === 'f') {
      ev.preventDefault(); ev.stopPropagation();
      toggleBoardFullscreen();
      return;
    }
    if (mod) return;
    if (ev.key === '[' || ev.key === ']') {
      ev.preventDefault();
      state.width = clamp(state.width + (ev.key === ']' ? 1 : -1), 1, 32);
      topbar.querySelector('input[type="range"]').value = String(state.width);
      if (live) live.width = state.width;
      invalidate();
      return;
    }
    if (ev.key === 'Escape') {
      if (cssFullscreen) { setCssFullscreen(false); return; }
      if (state.sticker) { state.sticker = null; toast('Sticker cancelled'); }
      else if (selected) { selected = null; invalidate(); updateBadges(); }
      else if (drawing) { cancelGesture(); }
      return;
    }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected) {
      ev.preventDefault();
      pushUndo();
      page().objects = page().objects.filter((o) => o.id !== selected.id);
      selected = null;
      invalidate(); scheduleSave(); refreshThumbs(); updateBadges();
      return;
    }
    if (KEYMAP[k] && !ev.altKey) {
      ev.preventDefault();
      setTool(KEYMAP[k]);
    }
  }

  function onWheel(ev) {
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomBy(ev.deltaY > 0 ? 1 / 1.08 : 1.08, { x: ev.clientX - rect.left, y: ev.clientY - rect.top });
    } else {
      // plain wheel pans the infinite board; shift+wheel zooms for trackpad-less users
      if (ev.shiftKey) {
        ev.preventDefault();
        const rect = canvas.getBoundingClientRect();
        zoomBy(ev.deltaY > 0 ? 1 / 1.08 : 1.08, { x: ev.clientX - rect.left, y: ev.clientY - rect.top });
      } else {
        ev.preventDefault();
        view.ox -= ev.deltaX;
        view.oy -= ev.deltaY;
        invalidate();
      }
    }
  }

  /* ———————————————————————— drop images ———————————————————————— */
  function onDrop(ev) {
    ev.preventDefault();
    stageEl.classList.remove('is-drop');
    const files = [...(ev.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    files.forEach((f) => {
      const r = new FileReader();
      r.onload = () => insertImage(r.result);
      r.onerror = () => toast(`Could not read ${f.name}`, { type: 'error' });
      r.readAsDataURL(f);
    });
  }

  /* ———————————————————————— restore + wiring ———————————————————————— */
  async function restore() {
    try {
      let saved = await db.get('boards', 'current');
      if (!saved?.pages?.length) saved = ls.get('boardMirror', null);
      if (saved?.pages?.length) {
        board.pages = saved.pages.map((p) => ({
          id: p.id || uid('pg'),
          bg: p.bg || 'plain',
          objects: Array.isArray(p.objects) ? p.objects : [],
        }));
        board.activePage = clamp(saved.activePage || 0, 0, board.pages.length - 1);
        board.savedAt = saved.savedAt || 0;
      }
    } catch (err) { console.warn('[board] restore failed', err); }
    if (!board.pages.length) board.pages = [{ id: uid('pg'), bg: 'plain', objects: [] }];
    renderPages(); invalidate(); updateBadges();
  }

  buildTopbar();
  buildZoom();
  buildFloatingToolbox();
  ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('lostpointercapture', pointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('dblclick', (ev) => {
    if (state.tool !== 'select') return;
    const obj = hitTest(toWorld(ev));
    if (obj?.type === 'text') {
      selected = null;
      invalidate();
      beginText({ x: obj.x, y: obj.y }, { id: obj.id, text: obj.text, size: obj.size });
    }
  });
  canvas.addEventListener('dragover', (ev) => { ev.preventDefault(); stageEl.classList.add('is-drop'); });
  canvas.addEventListener('dragleave', () => stageEl.classList.remove('is-drop'));
  canvas.addEventListener('drop', onDrop);
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  window.addEventListener('pagehide', () => { saveNow(); });

  const ro = new ResizeObserver(() => { resizeCanvas(); });
  ro.observe(stageEl);

  resizeCanvas();
  restore().then(() => { resizeCanvas(); invalidate(); });
  rafId = requestAnimationFrame(loop);

  // apply options (e.g. opening the board with a tool preselected)
  api.onResize(() => { resizeCanvas(); });
  const toolbarSync = setInterval(() => {
    if (disposed) return clearInterval(toolbarSync);
    const tb = win.querySelector('.wbf');
    tb?._sync?.();
  }, 900);

  const boardApi = {
    setTool,
    newPage,
    duplicatePage,
    deletePage,
    clearPage,
    exportPDF,
    exportPNG,
    editPage: (i) => gotoPage(i),
    insertImage,
    setBackground,
    openStickers: openStickerSheet,
    takePhoto,
    undo,
    redo,
    saveNow,
    toggleFullscreen: toggleBoardFullscreen,
    zoomBy,
    resetZoom,
    get state() { return { pages: board.pages, activePage: board.activePage, view: { ...view }, tool: state.tool }; },
  };
  os.registerBoard(boardApi);
  if (os.options?.tool) setTimeout(() => setTool(os.options.tool), 30);

  // background quick picker in the toolbar (appended after build)
  const bgWrap = el('div', { class: 'wb__bgs', title: 'Page background', role: 'group', 'aria-label': 'Page background' });
  BACKGROUNDS.forEach((b) => {
    const btn = el('button', {
      class: 'tbtn', type: 'button', title: `Background: ${b.label}`, 'aria-label': `Background ${b.label}`,
      text: b.label.split(' ')[0],
      style: { fontSize: '10.5px', padding: '0 6px', minWidth: 'auto' },
    });
    btn.addEventListener('click', () => setBackground(b.id));
    bgButtons.set(b.id, btn);
    bgWrap.append(btn);
  });
  topbar.append(el('div', { class: 'toolbar__sep' }), bgWrap);
  updateBadges();

  return function destroy() {
    disposed = true;
    cancelAnimationFrame(rafId);
    clearInterval(toolbarSync);
    window.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    window.removeEventListener('pagehide', saveNow);
    document.body.classList.remove('wb-fs');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    ro.disconnect();
    saveNow();
    os.unregisterBoard(boardApi);
    body.classList.remove('no-scroll');
    rootEl.remove();
    imageCache.clear();
    laser.length = 0;
  };
}
