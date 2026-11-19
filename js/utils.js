/* utils.js — tiny DOM, toast, sound, confetti and file helpers.
   No dependencies, no network. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Create an element: el('div', {class:'x', html:'<b>hi</b>'}, childNodes…) */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class' || k === 'className') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) node.style.setProperty(sk, sv);
        else node.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== 'list' && k !== 'form' && k !== 'type') {
      try { node[k] = v; } catch { node.setAttribute(k, v); }
    } else node.setAttribute(k, v);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || document.documentElement.dataset.motion === 'off';

export function debounce(fn, wait = 250) {
  let t;
  const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
  wrapped.flush = (...a) => { clearTimeout(t); fn(...a); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function throttle(fn, wait = 60) {
  let last = 0; let timer;
  return (...a) => {
    const now = performance.now();
    const left = wait - (now - last);
    clearTimeout(timer);
    if (left <= 0) { last = now; fn(...a); }
    else timer = setTimeout(() => { last = performance.now(); fn(...a); }, left);
  };
}

/* ————————————— toasts ————————————— */
const ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>';
export function toast(message, { type = 'ok', duration = 2600 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const node = el('div', { class: 'toast', role: 'status', html: ICON_OK + `<span>${escapeHtml(message)}</span>` });
  if (type === 'warn') node.querySelector('svg').style.color = 'var(--warn)';
  if (type === 'error') node.querySelector('svg').style.color = 'var(--bad)';
  host.append(node);
  const close = () => {
    if (!node.isConnected) return;
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 240);
  };
  const timer = setTimeout(close, duration);
  node.addEventListener('click', () => { clearTimeout(timer); close(); });
}

/* ————————————— sound (no assets) ————————————— */
let audioCtx;
export function chime(kind = 'timer') {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const notes = kind === 'correct' ? [660, 880] : kind === 'tick' ? [520] : [880, 1174, 1568];
    const t0 = audioCtx.currentTime;
    notes.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, t0 + i * 0.16);
      gain.gain.linearRampToValueAtTime(0.22, t0 + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.16 + 0.5);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + i * 0.16);
      osc.stop(t0 + i * 0.16 + 0.55);
    });
  } catch { /* audio is a bonus, never fatal */ }
}

/* ————————————— confetti ————————————— */
export function confetti({ x = window.innerWidth / 2, y = window.innerHeight / 3, count = 90 } = {}) {
  const W = window.innerWidth; const H = window.innerHeight;
  if (reducedMotion()) return;
  const canvas = el('canvas', { style: { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: 200, pointerEvents: 'none' } });
  document.body.append(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => { canvas.width = W * dpr; canvas.height = H * dpr; };
  resize();
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const colors = ['#8b7dff', '#5ad1ff', '#4ade80', '#fbbf24', '#ff6f9c'];
  const parts = Array.from({ length: count }, () => ({
    x, y,
    vx: (Math.random() - 0.5) * 12,
    vy: Math.random() * -11 - 3,
    r: 3 + Math.random() * 5,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.35,
    c: colors[(Math.random() * colors.length) | 0],
    life: 1,
  }));
  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      p.life -= 0.008;
      if (p.life <= 0 || p.y > H + 40) continue;
      alive++;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.7);
      ctx.restore();
    }
    frame++;
    if (alive && frame < 260) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
  window.addEventListener('resize', resize, { once: true });
}

/* ————————————— files & images ————————————— */
export function download(dataUrlOrBlob, filename) {
  const url = dataUrlOrBlob instanceof Blob ? URL.createObjectURL(dataUrlOrBlob) : dataUrlOrBlob;
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  if (dataUrlOrBlob instanceof Blob) setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const fileToDataURL = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error('Could not read file'));
  reader.readAsDataURL(file);
});

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be decoded'));
    img.src = src;
  });
}

export async function filesFromDrop(ev, types = ['image/']) {
  const items = Array.from(ev.dataTransfer?.files || []);
  return items.filter((f) => !types.length || types.some((t) => f.type.startsWith(t)));
}

/* ————————————— time ————————————— */
export function formatClock(date = new Date(), use24 = false) {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  if (use24) return `${String(h).padStart(2, '0')}:${m}`;
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
}
export function formatDate(date = new Date()) {
  try {
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return date.toDateString(); }
}
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(s).padStart(2, '0');
}
export function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 20) return 'just now';
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

/* ————————————— misc ————————————— */
export function onVisibleFlush(fn) {
  window.addEventListener('pagehide', fn);
  document.addEventListener('visibilitychange', () => { if (document.hidden) fn(); });
}
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
