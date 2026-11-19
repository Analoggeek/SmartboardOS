/* main.js — SmartBoardOS bootstrap: app registry, dock, command palette,
   desktop widgets, shortcuts, PWA wiring and the settings bus. */

import { $, $$, el, toast, debounce, clamp, formatClock, formatDate, timeAgo, reducedMotion, isMobile, confetti } from './utils.js';
import { db, ls, loadSettings, saveSettings } from './db.js';
import { icon } from './icons.js';
import { WindowManager } from './wm.js';
import { initWidgets } from './widgets.js';
import { openCamera } from './camera.js';

/* ————————————————————————————————————————————————————————————
   App registry
   ———————————————————————————————————————————————————————————— */
const APPS = {
  board: {
    name: 'Whiteboard', tagline: 'Draw, annotate, teach', icon: 'board', color: '#8b7dff',
    width: 1080, height: 700, key: 'Ctrl ⇧ W', load: () => import('./apps/whiteboard.js'),
  },
  pdf: {
    name: 'PDF Studio', tagline: 'Present & annotate PDFs', icon: 'pdf', color: '#ff8f6b',
    width: 1000, height: 680, key: 'Ctrl ⇧ P', load: () => import('./apps/pdf.js'),
  },
  class: {
    name: 'Class Tools', tagline: 'Picker, timer & scores', icon: 'class', color: '#4ade80',
    width: 920, height: 640, key: 'Ctrl ⇧ T', load: () => import('./apps/class.js'),
  },
  media: {
    name: 'Media', tagline: 'On-device image library', icon: 'media', color: '#5ad1ff',
    width: 900, height: 600, load: () => import('./apps/media.js'),
  },
  lab3d: {
    name: '3D Lab', tagline: '14 teaching models', icon: 'lab', color: '#c8a7ff',
    width: 980, height: 660, load: () => import('./apps/lab3d.js'),
  },
  notes: {
    name: 'Notes', tagline: 'Autosaving lesson notes', icon: 'notes', color: '#fbbf24',
    width: 860, height: 580, load: () => import('./apps/notes.js'),
  },
  calculator: {
    name: 'Calculator', tagline: 'Safe & keyboard friendly', icon: 'calc', color: '#7fd6a1',
    width: 420, height: 580, load: () => import('./apps/calculator.js'),
  },
  settings: {
    name: 'Settings', tagline: 'Look, pen & data', icon: 'settings', color: '#9aa1c0',
    width: 860, height: 620, load: () => import('./apps/settings.js'),
  },
};

/* ————————————————————————————————————————————————————————————
   Settings bus
   ———————————————————————————————————————————————————————————— */
export const settings = loadSettings();
const listeners = new Set();
const OS = {
  apps: APPS,
  settings,
  onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  saveSettings(patch = {}, silent = false) {
    Object.assign(settings, patch);
    saveSettings(settings);
    applySettings();
    listeners.forEach((fn) => { try { fn(settings); } catch (err) { console.warn(err); } });
    if (!silent) ls.set('settingsSavedAt', Date.now());
  },
  boardApi: null,
  registerBoard(api) {
    OS.boardApi = api;
    if (api) OS.refreshStats();
  },
  unregisterBoard(api) { if (OS.boardApi === api) OS.boardApi = null; },
  openApp,
  widgets: null,
  refreshStats,
  installPrompt: null,
};

function applySettings() {
  const html = document.documentElement;
  html.dataset.theme = settings.theme;
  html.dataset.accent = settings.accent;
  html.dataset.wallpaper = settings.wallpaper;
  html.dataset.motion = settings.motion ? 'on' : 'off';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', settings.theme === 'dark' ? '#080a12' : '#eef1fa');
  updateGreeting();
  updateClock();
}

/* ————————————————————————————————————————————————————————————
   Shell: boot, clock, greeting, theme
   ———————————————————————————————————————————————————————————— */
const shell = $('#shell');
const boot = $('#boot');
const bootbar = $('#bootbar');

function bootSequence() {
  if (reducedMotion()) { finishBoot(); return; }
  let progress = 0;
  const step = setInterval(() => {
    progress = Math.min(100, progress + 8 + Math.random() * 16);
    bootbar.style.width = progress + '%';
    if (progress >= 100) { clearInterval(step); setTimeout(finishBoot, 180); }
  }, 80);
  setTimeout(() => { clearInterval(step); finishBoot(); }, 2400); // hard safety net
}
function finishBoot() {
  bootbar.style.width = '100%';
  boot.classList.add('is-done');
  shell.classList.remove('is-booting');
  shell.classList.add('is-ready');
  setTimeout(() => { boot.hidden = true; }, 700);
}

function updateClock() {
  const now = new Date();
  const t = $('#clockTime');
  const d = $('#clockDate');
  if (t) t.textContent = formatClock(now, settings.use24);
  if (d) d.textContent = formatDate(now);
}

function greetingFor(hour) {
  if (hour < 5) return 'Still up, teach?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}
function updateGreeting() {
  const h = new Date().getHours();
  const name = (settings.teacherName || '').trim();
  const greeting = name ? `${greetingFor(h)}, ${name}.` : `${greetingFor(h)}, teach.`;
  const node = $('#greeting');
  if (node) node.innerHTML = `${greeting.split(',')[0]}, <em>${greeting.split(', ').slice(1).join(', ')}</em>`;
}

/* ————————————————————————————————————————————————————————————
   Window manager + apps
   ———————————————————————————————————————————————————————————— */
const wm = new WindowManager($('#windowsLayer'), {
  onChange: () => syncDock(),
  dockClearance: 100,
});
OS.wm = wm;

async function openApp(id, options = {}) {
  const app = APPS[id];
  if (!app) { toast('Unknown app: ' + id, { type: 'error' }); return null; }
  if (wm.has(id)) {
    const state = wm.get(id);
    if (state.minimized) wm.restore(id); else wm.focus(id);
    if (id === 'board' && options.tool && OS.boardApi) OS.boardApi.setTool(options.tool);
    return wm.get(id).api;
  }
  try {
    const mod = await app.load();
    const api = wm.open({
      id,
      title: app.name,
      subtitle: app.tagline,
      icon: icon(app.icon),
      width: app.width,
      height: app.height,
      mount: (ctx) => mod.mount({ ...ctx, os: OS, options }),
    });
    return api;
  } catch (err) {
    console.error('[os] failed to open', id, err);
    toast(`${app.name} could not open — ${err?.message || 'unknown error'}`, { type: 'error', duration: 4200 });
    return null;
  }
}

/* ————————————————————————————————————————————————————————————
   Dock
   ———————————————————————————————————————————————————————————— */
const dockOrder = ['board', 'pdf', 'class', 'media', 'lab3d', 'notes', 'calculator', 'settings'];
function buildDock() {
  const dock = $('#dock');
  dock.innerHTML = '';
  dockOrder.forEach((id) => {
    const app = APPS[id];
    const btn = el('button', {
      class: 'dockitem', type: 'button', title: `${app.name} — ${app.tagline}`,
      'aria-label': `Open ${app.name}`, dataset: { app: id },
      style: { '--app': app.color },
    });
    btn.innerHTML = `<span class="dockitem__ico">${icon(app.icon)}</span><small>${app.name}</small><span class="dockitem__dot"></span>`;
    btn.addEventListener('click', () => {
      const state = wm.get(id);
      if (!state) openApp(id);
      else if (state.minimized) wm.restore(id);
      else if (state.win.classList.contains('is-focused')) wm.minimize(id);
      else wm.focus(id);
    });
    dock.append(btn);
  });
}

function syncDock() {
  $$('.dockitem').forEach((btn) => {
    const id = btn.dataset.app;
    const state = wm.get(id);
    btn.classList.toggle('is-running', !!state);
    btn.setAttribute('aria-pressed', state && !state.minimized ? 'true' : 'false');
    btn.title = state
      ? `${APPS[id].name} — ${state.minimized ? 'restore' : 'running'}`
      : `${APPS[id].name} — ${APPS[id].tagline}`;
  });
}

/* ————————————————————————————————————————————————————————————
   Desktop: quick launch, toolbox, cube, stats, tilt/parallax
   ———————————————————————————————————————————————————————————— */
function buildQuickLaunch() {
  const host = $('#quickgrid');
  host.innerHTML = '';
  Object.entries(APPS).forEach(([id, app]) => {
    const btn = el('button', { class: 'app-tile', type: 'button', dataset: { app: id }, style: { '--app': app.color } });
    btn.innerHTML = `<span class="app-tile__ico">${icon(app.icon)}</span>
      <span class="app-tile__txt"><b>${app.name}</b><small>${app.tagline}</small></span>`;
    btn.addEventListener('click', () => openApp(id));
    host.append(btn);
  });
}

const TOOLBOX = [
  { tool: 'select', label: 'Select', icon: 'select' },
  { tool: 'pen', label: 'Pen', icon: 'pen' },
  { tool: 'highlighter', label: 'Highlight', icon: 'highlighter' },
  { tool: 'eraser', label: 'Eraser', icon: 'eraser' },
  { tool: 'laser', label: 'Laser', icon: 'laser' },
  { tool: 'stickers', label: 'Stickers', icon: 'stickers' },
  { tool: 'camera', label: 'Camera', icon: 'camera' },
  { tool: 'newpage', label: 'New page', icon: 'page' },
];

function buildToolbox() {
  const host = $('#toolboxGrid');
  host.innerHTML = '';
  TOOLBOX.forEach((t) => {
    const btn = el('button', { class: 'tile', type: 'button', title: t.label, 'aria-label': `Open Whiteboard with ${t.label}` });
    btn.innerHTML = `${icon(t.icon)}<span>${t.label}</span>`;
    btn.addEventListener('click', async () => {
      if (t.tool === 'camera') {
        openApp('board');
        openCamera({ onCapture: (dataUrl) => OS.boardApi?.insertImage(dataUrl, { source: 'camera' }) });
        return;
      }
      if (t.tool === 'newpage') {
        await openApp('board');
        OS.boardApi?.newPage();
        return;
      }
      openApp('board', { tool: t.tool });
    });
    host.append(btn);
  });
}

function buildCube() {
  const cube = $('#cube');
  if (!cube) return;
  const faces = [['front', 'board'], ['right', 'pdf'], ['back', 'lab'], ['left', 'class'], ['top', 'notes'], ['bottom', 'calculator']];
  cube.innerHTML = faces.map(([side, key]) => `<div class="cube__face cube__face--${side}">${icon(key)}</div>`).join('');
}

function initTilt() {
  if (reducedMotion()) return;
  const cards = $$('.card, .dock, .app-tile');
  cards.forEach((card) => {
    card.addEventListener('pointermove', (ev) => {
      if (ev.pointerType === 'touch' || window.innerWidth < 900) return;
      const r = card.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width - 0.5;
      const py = (ev.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(1100px) rotateX(${(-py * 3.2).toFixed(2)}deg) rotateY(${(px * 3.6).toFixed(2)}deg) translateY(-1px)`;
      card.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
  window.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'touch') return;
    const x = (ev.clientX / window.innerWidth - 0.5) * 2;
    const y = (ev.clientY / window.innerHeight - 0.5) * 2;
    document.body.style.setProperty('--px', x.toFixed(3));
    document.body.style.setProperty('--py', y.toFixed(3));
    const blob = $('.shell');
    if (blob) blob.style.backgroundPosition = `${50 + x * 1.2}% ${50 + y * 1.2}%, 0 0`;
  }, { passive: true });
}

/* ————————————————————————————————————————————————————————————
   Hero stats + snapshot
   ———————————————————————————————————————————————————————————— */
async function refreshStats() {
  try {
    let board = await db.get('boards', 'current');
    if (!board?.pages?.length) board = ls.get('boardMirror', null);
    const pages = board?.pages || [];
    const objects = pages.reduce((n, p) => n + (p.objects?.length || 0), 0);
    const notes = (ls.get('notes', []) || []).length;
    const media = (ls.get('mediaIndex', []) || []).length;
    const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
    set('#statPages', pages.length || 1);
    set('#statNotes', notes);
    set('#statMedia', media);
    set('#snapPages', pages.length || 1);
    set('#snapObjects', objects);
    set('#snapSaved', timeAgo(board?.savedAt || ls.get('boardSavedAt', 0)));
    const wc = $('#widgetCount');
    if (wc) wc.textContent = `${settings.widgets.length} active`;
  } catch (err) { console.warn('[stats]', err); }
}

/* ————————————————————————————————————————————————————————————
   Command palette
   ———————————————————————————————————————————————————————————— */
let paletteItems = [];
let paletteIndex = 0;

function paletteActions() {
  return [
    ...Object.entries(APPS).map(([id, app]) => ({
      kind: 'app', id, label: app.name, hint: app.tagline, icon: app.icon, run: () => openApp(id),
    })),
    {
      kind: 'action', label: 'New whiteboard page', hint: 'Board', icon: 'add',
      run: async () => { await openApp('board'); OS.boardApi?.newPage(); },
    },
    {
      kind: 'action', label: 'Clear current page', hint: 'Board', icon: 'trash',
      run: async () => { await openApp('board'); OS.boardApi?.clearPage(); },
    },
    {
      kind: 'action', label: 'Export board as PDF', hint: 'Board', icon: 'download',
      run: async () => { await openApp('board'); OS.boardApi?.exportPDF(); },
    },
    {
      kind: 'action', label: 'Export board page as PNG', hint: 'Board', icon: 'image',
      run: async () => { await openApp('board'); OS.boardApi?.exportPNG(); },
    },
    {
      kind: 'action', label: 'Photo from camera → board', hint: 'Camera', icon: 'camera',
      run: async () => {
        await openApp('board');
        openCamera({ onCapture: (dataUrl) => OS.boardApi?.insertImage(dataUrl, { source: 'camera' }) });
      },
    },
    {
      kind: 'action', label: 'Pick a random student', hint: 'Class tools', icon: 'users',
      run: async () => {
        const api = await openApp('class');
        setTimeout(() => api?.pickRandom?.(), 140);
      },
    },
    {
      kind: 'action', label: 'Start a 5 minute timer', hint: 'Timer', icon: 'timer',
      run: () => OS.widgets?.startTimer(300),
    },
    {
      kind: 'action', label: 'Quick note', hint: 'Notes', icon: 'notes',
      run: async () => { const api = await openApp('notes'); api?.newNote?.(); },
    },
    {
      kind: 'action', label: 'Toggle theme', hint: 'Appearance', icon: 'sparkles',
      run: () => { OS.saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }); toast('Theme switched'); },
    },
    {
      kind: 'action', label: 'Add sticky note widget', hint: 'Widgets', icon: 'sticky',
      run: () => OS.widgets?.add('sticky'),
    },
    {
      kind: 'action', label: 'Open pen & palm settings', hint: 'Settings', icon: 'pen',
      run: () => openApp('settings', { panel: 'pen' }),
    },
  ];
}

function fuzzyScore(query, text) {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 100 - t.indexOf(q);
  let qi = 0; let score = 0; let last = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 3 + (last === i - 1 ? 4 : 0);
      last = i; qi++;
    }
  }
  return qi === q.length ? score : 0;
}

function renderPalette(query = '') {
  const list = $('#paletteList');
  const all = paletteActions();
  paletteItems = all
    .map((item) => ({ item, score: Math.max(fuzzyScore(query, item.label), fuzzyScore(query, item.hint || '') * 0.6) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 9)
    .map((x) => x.item);
  paletteIndex = 0;
  list.innerHTML = '';
  if (!paletteItems.length) {
    list.append(el('li', { class: 'palette__empty', text: 'Nothing matches that. Try “board”, “PDF” or “timer”.' }));
    return;
  }
  paletteItems.forEach((item, i) => {
    const li = el('li', {
      class: 'palette__item', role: 'option', id: 'pi-' + i,
      'aria-selected': i === 0 ? 'true' : 'false',
      html: `${icon(item.icon || 'search')}<b>${item.label}</b><small>${item.hint || ''}</small>`,
    });
    li.addEventListener('click', () => runPaletteItem(item));
    li.addEventListener('pointerenter', () => setPaletteIndex(i));
    list.append(li);
  });
  $('#paletteInput')?.setAttribute('aria-activedescendant', 'pi-0');
}

function setPaletteIndex(i) {
  paletteIndex = clamp(i, 0, Math.max(0, paletteItems.length - 1));
  $$('#paletteList .palette__item').forEach((li, idx) => li.setAttribute('aria-selected', idx === paletteIndex ? 'true' : 'false'));
  const active = $('#paletteList .palette__item[aria-selected="true"]');
  active?.scrollIntoView({ block: 'nearest' });
  $('#paletteInput')?.setAttribute('aria-activedescendant', 'pi-' + paletteIndex);
}

function runPaletteItem(item) {
  closePalette();
  try { item.run(); } catch (err) { console.error(err); toast('That action failed', { type: 'error' }); }
}

function openPalette() {
  const pal = $('#palette');
  pal.hidden = false;
  const input = $('#paletteInput');
  input.value = '';
  renderPalette('');
  requestAnimationFrame(() => input.focus());
}
function closePalette() {
  const pal = $('#palette');
  if (!pal.hidden) {
    pal.hidden = true;
    $('#openPalette')?.focus();
  }
}

function initPalette() {
  const pal = $('#palette');
  const input = $('#paletteInput');
  $('#openPalette').addEventListener('click', openPalette);
  input.addEventListener('input', () => renderPalette(input.value));
  pal.addEventListener('click', (ev) => { if (ev.target === pal) closePalette(); });
  document.addEventListener('keydown', (ev) => {
    if (pal.hidden) return;
    if (ev.key === 'Escape') { ev.preventDefault(); closePalette(); }
    if (ev.key === 'Tab') { ev.preventDefault(); $('#paletteInput')?.focus(); }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setPaletteIndex(paletteIndex + 1); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); setPaletteIndex(paletteIndex - 1); }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const item = paletteItems[paletteIndex];
      if (item) runPaletteItem(item);
    }
  });
}

/* ————————————————————————————————————————————————————————————
   Global shortcuts
   ———————————————————————————————————————————————————————————— */
function initShortcuts() {
  document.addEventListener('keydown', (ev) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === 'k') { ev.preventDefault(); openPalette(); return; }
    if (mod && ev.shiftKey) {
      const k = ev.key.toLowerCase();
      if (k === 'w') { ev.preventDefault(); openApp('board'); return; }
      if (k === 'p') { ev.preventDefault(); openApp('pdf'); return; }
      if (k === 't') { ev.preventDefault(); openApp('class'); return; }
    }
    if (typing) return;
    if (ev.key.toLowerCase() === 'f' && !mod) { ev.preventDefault(); toggleFullscreen(); }
  });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => toast('Fullscreen was blocked by the browser', { type: 'warn' }));
  } else document.exitFullscreen?.().catch(() => {});
}

/* ————————————————————————————————————————————————————————————
   PWA
   ———————————————————————————————————————————————————————————— */
function initPWA() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('[sw] registration failed', err?.message);
      });
      navigator.serviceWorker.ready.then((reg) => {
        document.documentElement.dataset.offlineReady = '1';
        // a new VERSION is waiting → take over once, then reload cleanly
        if (reg.waiting && navigator.serviceWorker.controller) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.addEventListener?.('updatefound', () => {
          const incoming = reg.installing;
          incoming?.addEventListener('statechange', () => {
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast();
            }
          });
        });
      }).catch(() => {});
      let reloadedForUpdate = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadedForUpdate) return;
        reloadedForUpdate = true;
        toast('Updated — reloading to the new version');
        setTimeout(() => location.reload(), 600);
      });
    });
  }
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    OS.installPrompt = ev;
    document.documentElement.dataset.installable = '1';
  });
  window.addEventListener('appinstalled', () => {
    OS.installPrompt = null;
    toast('SmartBoardOS installed — open it from your home screen');
  });
  window.addEventListener('online', () => toast('Back online — everything already worked offline'));
}

function showUpdateToast() {
  toast('A new version is ready — reload when convenient', { duration: 5000 });
}

export async function installApp() {
  if (!OS.installPrompt) {
    toast('Use your browser menu → “Install app” to add SmartBoardOS', { type: 'warn', duration: 3800 });
    return false;
  }
  OS.installPrompt.prompt();
  const res = await OS.installPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
  if (res.outcome === 'accepted') { OS.installPrompt = null; return true; }
  return false;
}
OS.installApp = installApp;

/* ————————————————————————————————————————————————————————————
   Boot everything
   ———————————————————————————————————————————————————————————— */
function initShell() {
  applySettings();
  buildDock();
  buildQuickLaunch();
  buildToolbox();
  buildCube();
  initTilt();
  initPalette();
  initShortcuts();

  $('#themeBtn')?.addEventListener('click', () => {
    OS.saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }, true);
    toast(settings.theme === 'dark' ? 'Dark theme' : 'Light theme');
  });
  $('#fsBtn')?.addEventListener('click', toggleFullscreen);
  $('#settingsBtn')?.addEventListener('click', () => openApp('settings'));
  $('#brand')?.addEventListener('click', () => {
    closePalette();
    wm.windows.forEach((s) => { if (!s.minimized) wm.minimize(s.id); });
  });

  $$('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      if (action === 'open-board') openApp('board');
      if (action === 'open-pdf') openApp('pdf');
      if (action === 'open-class') openApp('class');
      if (action === 'open-lab') openApp('lab3d');
      if (action === 'export-pdf') {
        await openApp('board');
        OS.boardApi?.exportPDF();
      }
    });
  });

  setInterval(updateClock, 10000);
  updateClock();
  updateGreeting();

  OS.widgets = initWidgets({
    host: $('#widgetsList'),
    addRow: $('#widgetAddRow'),
    os: OS,
    onChange: () => { refreshStats(); syncWidgetHead(); },
  });
  syncWidgetHead();
  function syncWidgetHead() {
    const wc = $('#widgetCount');
    if (wc) wc.textContent = `${settings.widgets.length} active`;
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStats(); });
  document.addEventListener('fullscreenchange', () => {
    const btn = $('#fsBtn');
    if (btn) btn.title = document.fullscreenElement ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
  });
}

/* Cmd/Ctrl+S handled inside the board, but keep a global save hint */
document.addEventListener('keydown', (ev) => {
  const mod = ev.ctrlKey || ev.metaKey;
  if (mod && ev.key.toLowerCase() === 's' && !wm.has('board')) {
    ev.preventDefault();
    toast('Board is not open — nothing to save', { type: 'warn' });
  }
});

/* start */
initShell();
refreshStats();
bootSequence();
setInterval(refreshStats, 20000);

/* PWA shortcuts: ?app=board / pdf / class / lab3d / notes */
try {
  const wanted = new URLSearchParams(location.search).get('app');
  if (wanted && APPS[wanted]) setTimeout(() => openApp(wanted), 750);
} catch { /* ignore */ }

/* expose a tiny debug surface (handy in the console, harmless for users) */
window.SmartBoardOS = OS;
