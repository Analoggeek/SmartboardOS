/* settings.js — appearance, classroom, pen & tablet, app, data and about. */

import { el, toast, download, debounce, formatDuration } from '../utils.js';
import { icon } from '../icons.js';
import { db, ls } from '../db.js';
import { openCamera } from '../camera.js';

const VERSION = '1.3.0';
const ACCENTS = ['violet', 'blue', 'teal', 'amber', 'rose'];
const WALLPAPERS = ['aurora', 'mesh', 'night', 'paper'];
const PANELS = [
  { id: 'appearance', label: 'Appearance', icon: 'sparkles' },
  { id: 'classroom', label: 'Classroom', icon: 'class' },
  { id: 'pen', label: 'Pen & tablet', icon: 'pen' },
  { id: 'app', label: 'App', icon: 'install' },
  { id: 'data', label: 'Data', icon: 'save' },
  { id: 'about', label: 'About', icon: 'board' },
];

export function mount({ body, api, os, options }) {
  const settings = os.settings;
  let current = options?.panel && PANELS.some((p) => p.id === options.panel) ? options.panel : 'appearance';

  const nav = el('div', { class: 'setnav', role: 'tablist', 'aria-label': 'Settings sections' });
  const page = el('div', { class: 'setpage' });
  body.append(el('div', { class: 'settings' }, nav, page));

  PANELS.forEach((p) => {
    const b = el('button', { class: 'listitem', type: 'button', role: 'tab', dataset: { panel: p.id } },
      el('span', { html: icon(p.icon), style: { display: 'inline-flex', width: '16px', height: '16px' } }),
      el('span', { text: p.label }));
    b.addEventListener('click', () => { current = p.id; render(); });
    nav.append(b);
  });

  const save = (patch) => {
    os.saveSettings(patch);
    render();
  };

  function toggleRow(label, hint, checked, onChange) {
    const t = el('button', { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': checked ? 'true' : 'false', 'aria-label': label });
    t.addEventListener('click', () => {
      const next = t.getAttribute('aria-checked') !== 'true';
      t.setAttribute('aria-checked', next ? 'true' : 'false');
      onChange(next);
    });
    return el('div', { class: 'setrow' },
      el('div', {}, el('div', { text: label }), hint ? el('small', { text: hint }) : null), t);
  }

  function rangeRow(label, hint, { min, max, step, value, format = (v) => String(v), onInput }) {
    const out = el('span', { class: 'badge', text: format(value) });
    const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label, style: { width: '160px' } });
    input.addEventListener('input', () => {
      out.textContent = format(Number(input.value));
      onInput(Number(input.value));
    });
    return el('div', { class: 'setrow' },
      el('div', {}, el('div', { text: label }), hint ? el('small', { text: hint }) : null),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, input, out));
  }

  function segmented(label, options, value, onChange) {
    const wrap = el('div', { class: 'switches' });
    options.forEach((o) => {
      const b = el('button', {
        class: 'btn btn--sm' + (o.value === value ? ' btn--primary' : ''), type: 'button', text: o.label,
      });
      b.addEventListener('click', () => onChange(o.value));
      wrap.append(b);
    });
    return el('div', { class: 'setrow' }, el('div', { text: label }), wrap);
  }

  /* ————— panels ————— */
  function appearancePage() {
    const wrap = el('div', { class: 'setgroup' },
      el('h4', { text: 'Appearance' }),
      segmented('Theme', [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], settings.theme, (v) => save({ theme: v }))
    );

    const accents = el('div', { class: 'switches' });
    const accentColors = { violet: '#8b7dff', blue: '#4b93ff', teal: '#2fd6b6', amber: '#ffb545', rose: '#ff6f9c' };
    ACCENTS.forEach((a) => {
      const b = el('button', {
        class: 'swatch' + (settings.accent === a ? ' is-active' : ''), type: 'button',
        style: { background: accentColors[a] }, title: a, 'aria-label': `Accent ${a}`,
      });
      b.addEventListener('click', () => save({ accent: a }));
      accents.append(b);
    });
    wrap.append(el('div', { class: 'setrow' }, el('div', { text: 'Accent colour' }), accents));

    const walls = el('div', { class: 'wallpick' });
    WALLPAPERS.forEach((w) => {
      const b = el('button', {
        class: settings.wallpaper === w ? 'is-active' : '', type: 'button',
        title: w, 'aria-label': `Wallpaper ${w}`,
      }, el('i', { class: `wall--${w}` }));
      b.addEventListener('click', () => save({ wallpaper: w }));
      walls.append(b);
    });
    wrap.append(el('div', {}, el('div', { class: 'setrow', style: { marginBottom: '8px' } }, el('div', { text: 'Wallpaper' })), walls));
    wrap.append(toggleRow('Animations', 'Turn off for older laptops or test days.', settings.motion, (v) => save({ motion: v })));
    wrap.append(segmented('Performance', [
      { value: 'auto', label: 'Auto' }, { value: 'high', label: 'Best looks' }, { value: 'low', label: 'Smoothest' },
    ], settings.fx || 'auto', (v) => save({ fx: v })));
    return wrap;
  }

  function classroomPage() {
    const wrap = el('div', { class: 'setgroup' }, el('h4', { text: 'Classroom' }));
    const name = el('input', { class: 'field', value: settings.teacherName || '', placeholder: 'e.g. Ms. Sharma', 'aria-label': 'Teacher name', style: { width: '200px' } });
    const persistName = debounce(() => os.saveSettings({ teacherName: name.value.trim() }, true), 260);
    name.addEventListener('input', persistName);
    name.addEventListener('blur', () => { persistName.flush(); os.saveSettings({ teacherName: name.value.trim() }, true); });
    wrap.append(el('div', { class: 'setrow' },
      el('div', {}, el('div', { text: 'Teacher name' }), el('small', { text: 'Used in the desktop greeting.' })), name));
    wrap.append(toggleRow('24-hour clock', 'Show 14:30 instead of 2:30 PM.', settings.use24, (v) => save({ use24: v })));

    const names = (ls.get('classNames', []) || []).length;
    wrap.append(el('div', { class: 'setrow' },
      el('div', {}, el('div', { text: 'Student list' }), el('small', { text: 'Edit names inside Class Tools → Random student.' })),
      el('span', { class: 'badge', text: `${names} students` })));
    return wrap;
  }

  function penPage() {
    const wrap = el('div', { class: 'setgroup' }, el('h4', { text: 'Pen & tablet' }));
    wrap.append(el('p', { class: 'hint', text: 'Pressure and tilt come from standard pointer events, so Wacom, Huion, XP-Pen, Apple Pencil, S Pen and touch-laptop pens all work. Palm rejection is software-side and can rescue hardware that has none.' }));

    wrap.append(segmented('Palm guard', [
      { value: 'auto', label: 'Auto' }, { value: 'strong', label: 'Strong' }, { value: 'off', label: 'Off' },
    ], settings.pen.palm, (v) => { settings.pen.palm = v; os.saveSettings({ pen: settings.pen }, true); render(); }));

    wrap.append(toggleRow('Pressure-aware strokes', 'Lines thicken when the pen presses harder.', settings.pen.pressure,
      (v) => { settings.pen.pressure = v; os.saveSettings({ pen: settings.pen }, true); }));
    wrap.append(toggleRow('Tilt', 'Tilt widens the highlighter.', settings.pen.tilt,
      (v) => { settings.pen.tilt = v; os.saveSettings({ pen: settings.pen }, true); }));
    wrap.append(toggleRow('Draw with a finger', 'Turn off to only accept a stylus.', settings.pen.finger,
      (v) => { settings.pen.finger = v; os.saveSettings({ pen: settings.pen }, true); }));

    wrap.append(rangeRow('Palm delay after pen lift', 'Touch is ignored for this long after the stylus leaves the glass.', {
      min: 0, max: 2000, step: 50, value: settings.pen.palmDelay,
      format: (v) => `${v} ms`,
      onInput: (v) => { settings.pen.palmDelay = v; os.saveSettings({ pen: settings.pen }, true); },
    }));
    wrap.append(rangeRow('Stroke smoothing', 'Higher is smoother but lags a little.', {
      min: 0, max: 80, step: 5, value: settings.pen.smoothing,
      format: (v) => `${v}%`,
      onInput: (v) => { settings.pen.smoothing = v; os.saveSettings({ pen: settings.pen }, true); },
    }));

    const testBtn = el('button', { class: 'btn btn--sm', type: 'button', text: 'Camera test → whiteboard' });
    testBtn.addEventListener('click', () => {
      openCamera({
        title: 'Camera test',
        onCapture: async (dataUrl) => {
          await os.openApp('board');
          setTimeout(() => {
            os.boardApi?.insertImage(dataUrl, { source: 'camera' });
            toast('Camera works — photo placed on the board');
          }, 120);
        },
      });
    });
    wrap.append(el('div', { class: 'setrow' },
      el('div', {}, el('div', { text: 'Camera' }), el('small', { text: 'Check permissions and see the framing before class.' })), testBtn));
    return wrap;
  }

  function appPage() {
    const wrap = el('div', { class: 'setgroup' }, el('h4', { text: 'App' }));
    const offline = el('span', { class: 'badge badge--live', text: document.documentElement.dataset.offlineReady ? 'offline ready' : 'caching…' });
    const installBtn = el('button', { class: 'btn btn--sm btn--primary', type: 'button', text: 'Install SmartBoardOS' });
    installBtn.addEventListener('click', () => os.installApp?.());
    wrap.append(el('div', { class: 'setrow' },
      el('div', {}, el('div', { text: 'Offline status' }), el('small', { text: 'Service worker caches the whole OS after first visit.' })), offline));
    wrap.append(el('div', { class: 'setrow' },
      el('div', {}, el('div', { text: 'Install as an app' }), el('small', { text: 'Adds a home-screen icon and full-window mode.' })), installBtn));
    wrap.append(el('div', { class: 'setrow' },
      el('div', {}, el('div', { text: 'Version' }), el('small', { text: 'SmartBoardOS offline-first build' })), el('span', { class: 'badge', text: VERSION })));
    return wrap;
  }

  function dataPage() {
    const wrap = el('div', { class: 'setgroup' }, el('h4', { text: 'Data' }));
    wrap.append(el('p', { class: 'hint', text: 'Everything lives on this device: board pages and images in IndexedDB, settings and notes in localStorage. Export a JSON backup before wiping a device.' }));

    const backupBtn = el('button', { class: 'btn btn--sm btn--primary', type: 'button', text: 'Download JSON backup' });
    backupBtn.addEventListener('click', async () => {
      try {
        const board = await db.get('boards', 'current');
        const payload = {
          app: 'SmartBoardOS', version: VERSION, exportedAt: new Date().toISOString(),
          settings: os.settings,
          notes: ls.get('notes', []),
          students: ls.get('classNames', []),
          teams: ls.get('classTeams', []),
          sticky: ls.get('sticky', ''),
          board: board ? { pages: board.pages, activePage: board.activePage } : null,
        };
        download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `smartboardos-backup-${new Date().toISOString().slice(0, 10)}.json`);
        toast('Backup downloaded');
      } catch (err) { console.warn(err); toast('Backup failed', { type: 'error' }); }
    });

    const stats = el('div', { class: 'rows' });
    (async () => {
      const board = await db.get('boards', 'current');
      const media = await db.all('media');
      const pages = board?.pages?.length || 0;
      const objects = (board?.pages || []).reduce((n, p) => n + (p.objects?.length || 0), 0);
      [['Board pages', pages], ['Board objects', objects], ['Images stored', media.length], ['Notes', (ls.get('notes', []) || []).length]]
        .forEach(([k, v]) => stats.append(el('div', { class: 'row' }, el('b', { text: k }), el('span', { text: String(v) }))));
    })();

    const resetBtn = el('button', { class: 'btn btn--sm', type: 'button', text: 'Reset everything', style: { color: 'var(--bad)' } });
    resetBtn.addEventListener('click', async () => {
      if (!window.confirm('Delete the board, notes, media and settings from this device? This cannot be undone.')) return;
      try {
        ls.clearAll();
        await db.clearAll();
        localStorage.removeItem('smartboardos-deleted');
        toast('Everything cleared — reloading');
        setTimeout(() => location.reload(), 500);
      } catch (err) { console.warn(err); toast('Reset failed — close other tabs and retry', { type: 'error' }); }
    });

    wrap.append(backupBtn, el('div', {}, el('div', { class: 'setrow', style: { marginBottom: '6px' } }, el('div', { text: 'On this device' })), stats));
    wrap.append(el('div', { class: 'setrow' },
      el('div', {}, el('div', { text: 'Full reset' }), el('small', { text: 'Deletes board, notes, media and settings from this browser.' })), resetBtn));
    return wrap;
  }

  function aboutPage() {
    const wrap = el('div', { class: 'setgroup' }, el('h4', { text: 'About' }));
    wrap.append(el('div', { style: { display: 'flex', gap: '14px', alignItems: 'center' } },
      el('img', { src: './assets/icons/icon-192.png', alt: '', width: '64', height: '64', style: { borderRadius: '16px' } }),
      el('div', {},
        el('div', { style: { fontWeight: '700', fontSize: '16px' }, text: 'SmartBoardOS' }),
        el('div', { class: 'hint', text: `Version ${VERSION} · offline-first · data stays on device` })
      )));
    wrap.append(el('p', { class: 'hint', text: 'A complete teacher’s hub in one tab: whiteboard, PDF studio, class tools, notes and calculator. No accounts, no uploads, no analytics, no network calls at runtime.' }));
    wrap.append(el('div', { class: 'setrow' }, el('div', { text: 'Licence' }), el('span', { class: 'badge', text: 'MIT' })));
    wrap.append(el('div', { class: 'setrow' }, el('div', { text: 'Third-party libraries' }), el('span', { class: 'badge', text: 'pdf.js · jsPDF' })));
    return wrap;
  }

  function render() {
    nav.querySelectorAll('.listitem').forEach((b) => b.classList.toggle('is-active', b.dataset.panel === current));
    page.innerHTML = '';
    const map = { appearance: appearancePage, classroom: classroomPage, pen: penPage, app: appPage, data: dataPage, about: aboutPage };
    page.append((map[current] || appearancePage)());
  }

  render();
  api.setSubtitle?.(VERSION);
  return () => { /* nothing to tear down */ };
}
