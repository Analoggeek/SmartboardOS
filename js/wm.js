/* wm.js — a small but real window manager: drag, resize (e/w/s/se),
   focus stacking, minimise to dock, maximise above the dock, geometry memory. */

import { el, clamp, isMobile } from './utils.js';
import { icon } from './icons.js';
import { ls } from './db.js';

const MIN_W = 320;
const MIN_H = 220;

export class WindowManager {
  constructor(layer, { onChange = () => {}, dockClearance = 96 } = {}) {
    this.layer = layer;
    this.windows = new Map();
    this.z = 10;
    this.onChange = onChange;
    this.dockClearance = dockClearance;
    this.cascade = 0;
    window.addEventListener('resize', () => this.handleViewportChange());
  }

  get(id) { return this.windows.get(id); }
  has(id) { return this.windows.has(id); }
  isOpen(id) { return this.windows.has(id) && !this.windows.get(id).minimized; }
  apps() { return [...this.windows.keys()]; }

  /**
   * @param {{id:string,title:string,subtitle?:string,icon?:string,mount:Function,
   *          width?:number,height?:number,destroy?:Function}} def
   */
  open(def) {
    const existing = this.windows.get(def.id);
    if (existing) {
      if (existing.minimized) this.restore(def.id);
      this.focus(def.id);
      return existing.api;
    }

    const saved = ls.get('win:' + def.id, null);
    const mobile = isMobile();
    const layerRect = this.layer.getBoundingClientRect();
    const w = Math.min(def.width || 960, Math.max(MIN_W, layerRect.width - 24));
    const h = Math.min(def.height || 620, Math.max(MIN_H, layerRect.height - this.dockClearance - 12));

    const light = (kind, glyph, label) => {
      const b = el('button', {
        class: `tl tl--${kind}`, type: 'button', title: label, 'aria-label': label,
      });
      b.innerHTML = `<span class="tl__glyph" aria-hidden="true">${glyph}</span>`;
      return b;
    };
    const closeBtn = light('close', '×', 'Close window');
    const minBtn = light('min', '−', 'Minimise window');
    const maxBtn = light('max', '+', 'Maximise window');

    const titleWrap = el('div', { class: 'win__title' });
    const titleIcon = el('span', { html: def.icon || icon('board'), style: { display: 'inline-flex', width: '15px', height: '15px' } });
    titleIcon.querySelector('svg')?.style.setProperty('width', '15px');
    titleWrap.append(titleIcon, el('span', { text: def.title }));
    if (def.subtitle) titleWrap.append(el('em', { text: def.subtitle }));

    const head = el('div', { class: 'win__head' },
      el('div', { class: 'win__lights' }, closeBtn, minBtn, maxBtn),
      titleWrap
    );

    const body = el('div', { class: 'win__body' });
    const grips = ['e', 'w', 's', 'se'].map((dir) => el('div', { class: `win__grip win__grip--${dir}`, dataset: { dir }, 'aria-hidden': 'true' }));
    const win = el('div', { class: 'win', dataset: { app: def.id }, role: 'dialog', 'aria-label': def.title }, head, body, grips);

    const offsets = { x: 20 + (this.cascade % 5) * 26, y: 14 + (this.cascade % 5) * 22 };
    this.cascade++;

    const state = {
      id: def.id, def, win, body, head, api: null, destroy: null,
      minimized: false, maximized: false, rect: null, prevRect: null,
      resizeHandlers: new Set(),
    };

    const baseRect = saved && saved.w ? saved : {
      x: offsets.x, y: offsets.y, w: Math.max(MIN_W, Math.round(w)), h: Math.max(MIN_H, Math.round(h)),
    };
    // keep restored geometry on screen
    baseRect.x = clamp(baseRect.x, -20, Math.max(0, layerRect.width - 140));
    baseRect.y = clamp(baseRect.y, 0, Math.max(0, layerRect.height - 90));
    state.rect = { ...baseRect };

    const paint = () => {
      const r = state.rect;
      win.style.left = r.x + 'px';
      win.style.top = r.y + 'px';
      win.style.width = r.w + 'px';
      win.style.height = r.h + 'px';
    };
    paint();

    if (mobile) {
      win.classList.add('is-maximized');
      state.maximized = true;
    } else if (def.maximized) {
      // apps that want the whole desk (whiteboard) open like this straight away
      state.prevRect = { ...state.rect };
      state.maximized = true;
      win.classList.add('is-maximized');
      state.rect = {
        x: 8, y: 8,
        w: Math.round(layerRect.width - 16),
        h: Math.round(layerRect.height - this.dockClearance),
      };
      paint();
    }

    this.layer.append(win);

    const api = {
      id: def.id,
      win, body, head,
      focus: () => this.focus(def.id),
      close: () => this.close(def.id),
      minimize: () => this.minimize(def.id),
      toggleMaximize: () => this.toggleMaximize(def.id),
      isMaximized: () => state.maximized,
      setTitle: (text) => { titleWrap.querySelector('span').textContent = text; },
      setSubtitle: (text) => {
        let em = titleWrap.querySelector('em');
        if (!em) { em = el('em'); titleWrap.append(em); }
        em.textContent = text;
      },
      onResize: (fn) => { state.resizeHandlers.add(fn); return () => state.resizeHandlers.delete(fn); },
      refresh: () => this.notifyResize(state),
    };
    state.api = api;

    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.close(def.id); });
    minBtn.addEventListener('click', (e) => { e.stopPropagation(); this.minimize(def.id); });
    maxBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMaximize(def.id); });

    win.addEventListener('pointerdown', () => this.focus(def.id), true);
    head.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('.tl') || isMobile()) return;
      this.toggleMaximize(def.id);
    });

    this.windows.set(def.id, state);
    this.focus(def.id);

    // mount the app
    try {
      state.destroy = def.mount({ body, win, api, header: head }) || null;
    } catch (err) {
      console.error('[wm] mount failed', def.id, err);
      body.append(el('div', { class: 'empty' }, el('b', { text: 'This app could not start' }),
        el('small', { text: String(err?.message || err) })));
    }

    if (!mobile) {
      this.enableDrag(state);
      this.enableResize(state);
    }
    requestAnimationFrame(() => this.notifyResize(state));
    this.emit();
    return api;
  }

  emit() { this.onChange([...this.windows.values()].map((s) => ({ id: s.id, minimized: s.minimized, maximized: s.maximized }))); }

  focus(id) {
    const state = this.windows.get(id);
    if (!state) return;
    if (state.minimized) this.restore(id);
    this.z += 1;
    state.win.style.zIndex = String(this.z);
    this.windows.forEach((s, key) => s.win.classList.toggle('is-focused', key === id));
    this.emit();
  }

  close(id) {
    const state = this.windows.get(id);
    if (!state) return;
    try { state.destroy?.(); } catch (err) { console.warn('[wm] destroy failed', id, err); }
    try { state.def.onClose?.(); } catch { /* ignore */ }
    state.win.remove();
    this.windows.delete(id);
    this.emit();
  }

  minimize(id) {
    const state = this.windows.get(id);
    if (!state) return;
    if (state.maximized && !isMobile()) {
      // remember where it was so restore keeps the maximised state
      state.wasMaximized = true;
    }
    state.minimized = true;
    state.win.classList.add('is-minimized');
    state.win.classList.remove('is-focused');
    this.emit();
  }

  restore(id) {
    const state = this.windows.get(id);
    if (!state) return;
    state.minimized = false;
    state.win.classList.remove('is-minimized');
    this.focus(id);
    requestAnimationFrame(() => this.notifyResize(state));
  }

  toggle(id) {
    const state = this.windows.get(id);
    if (!state) return false;
    if (state.minimized) { this.restore(id); return true; }
    this.minimize(id);
    return false;
  }

  toggleMaximize(id) {
    const state = this.windows.get(id);
    if (!state || isMobile()) return;
    const rect = this.layer.getBoundingClientRect();
    if (!state.maximized) {
      state.prevRect = { ...state.rect };
      state.maximized = true;
      state.win.classList.add('is-maximized');
      state.rect = {
        x: 10, y: 8,
        w: Math.round(rect.width - 20),
        h: Math.round(rect.height - this.dockClearance),
      };
    } else {
      state.maximized = false;
      state.win.classList.remove('is-maximized');
      state.rect = state.prevRect || state.rect;
    }
    this.paint(state);
    this.notifyResize(state);
    this.saveGeometry(state);
    this.emit();
  }

  paint(state) {
    const r = state.rect;
    state.win.style.left = r.x + 'px';
    state.win.style.top = r.y + 'px';
    state.win.style.width = r.w + 'px';
    state.win.style.height = r.h + 'px';
  }

  notifyResize(state) {
    const rect = state.body.getBoundingClientRect();
    for (const fn of state.resizeHandlers) {
      try { fn(rect); } catch (err) { console.warn('[wm] resize handler failed', err); }
    }
  }

  saveGeometry(state) {
    if (state.maximized || isMobile()) return;
    ls.set('win:' + state.id, { ...state.rect });
  }

  enableDrag(state) {
    const { head, win } = state;
    let start = null;

    head.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      if (ev.target.closest('.tl')) return;
      if (isMobile() || state.maximized) return;
      const rect = this.layer.getBoundingClientRect();
      start = { px: ev.clientX, py: ev.clientY, x: state.rect.x, y: state.rect.y, rect };
      win.classList.add('is-dragging');
      head.setPointerCapture?.(ev.pointerId);
      ev.preventDefault();
    });

    head.addEventListener('pointermove', (ev) => {
      if (!start) return;
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      state.rect.x = clamp(start.x + dx, -state.rect.w + 120, start.rect.width - 80);
      state.rect.y = clamp(start.y + dy, 0, start.rect.height - 44);
      win.style.left = state.rect.x + 'px';
      win.style.top = state.rect.y + 'px';
    });

    const end = (ev) => {
      if (!start) return;
      start = null;
      win.classList.remove('is-dragging');
      try { head.releasePointerCapture?.(ev.pointerId); } catch { /* ignore */ }
      this.saveGeometry(state);
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
    head.addEventListener('lostpointercapture', end);
  }

  enableResize(state) {
    for (const grip of state.win.querySelectorAll('.win__grip')) {
      const dir = grip.dataset.dir;
      let start = null;
      grip.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0 || isMobile() || state.maximized) return;
        const r = this.layer.getBoundingClientRect();
        start = { px: ev.clientX, py: ev.clientY, rect: { ...state.rect }, box: r };
        grip.setPointerCapture?.(ev.pointerId);
        win_addDragging(state.win);
        ev.preventDefault();
        ev.stopPropagation();
      });
      grip.addEventListener('pointermove', (ev) => {
        if (!start) return;
        const dx = ev.clientX - start.px;
        const dy = ev.clientY - start.py;
        let { x, y, w, h } = start.rect;
        if (dir.includes('e')) w = clamp(start.rect.w + dx, MIN_W, start.box.width - x - 2);
        if (dir.includes('s')) h = clamp(start.rect.h + dy, MIN_H, start.box.height - y - 2);
        if (dir.includes('w')) {
          const nw = clamp(start.rect.w - dx, MIN_W, start.rect.x + start.rect.w - 2);
          x = start.rect.x + (start.rect.w - nw);
          w = nw;
        }
        state.rect = { x, y, w, h };
        this.paint(state);
        this.notifyResize(state);
      });
      const end = (ev) => {
        if (!start) return;
        start = null;
        state.win.classList.remove('is-dragging');
        try { grip.releasePointerCapture?.(ev.pointerId); } catch { /* ignore */ }
        this.saveGeometry(state);
        this.notifyResize(state);
      };
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
      grip.addEventListener('lostpointercapture', end);
    }
  }

  handleViewportChange() {
    const mobile = isMobile();
    const rect = this.layer.getBoundingClientRect();
    this.windows.forEach((state) => {
      if (mobile) {
        state.win.classList.add('is-maximized');
        state.win.style.left = '0px'; state.win.style.top = '0px';
        state.win.style.width = '100%'; state.win.style.height = '100%';
      } else if (state.maximized) {
        state.rect = { x: 10, y: 8, w: Math.round(rect.width - 20), h: Math.round(rect.height - this.dockClearance) };
        this.paint(state);
      } else {
        state.rect.x = clamp(state.rect.x, -state.rect.w + 140, Math.max(0, rect.width - 120));
        state.rect.y = clamp(state.rect.y, 0, Math.max(0, rect.height - 60));
        state.rect.w = Math.min(state.rect.w, Math.max(MIN_W, rect.width - 8));
        state.rect.h = Math.min(state.rect.h, Math.max(MIN_H, rect.height - 8));
        this.paint(state);
      }
      requestAnimationFrame(() => this.notifyResize(state));
    });
  }
}

function win_addDragging(win) {
  win.classList.add('is-dragging');
  const clear = () => { win.classList.remove('is-dragging'); window.removeEventListener('pointerup', clear); };
  window.addEventListener('pointerup', clear);
}
