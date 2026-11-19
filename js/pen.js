/* pen.js — stylus pressure / tilt reading and software palm rejection.
   Works with generic Pointer Events, so Wacom, Huion, XP-Pen, Apple Pencil,
   S Pen, USI and laptop digitizers all behave the same. */

export const PALM_SIZES = { auto: 44, strong: 30, off: Infinity };

export function defaultPenConfig() {
  return { palm: 'auto', pressure: true, tilt: true, finger: true, palmDelay: 900, smoothing: 35 };
}

/** Normalised pressure for any pointer: 0.05…1 */
export function pressureOf(ev, cfg, fallback = 0.5) {
  if (!cfg.pressure) return fallback;
  let p = ev.pressure;
  // Mouse / most touch screens report 0.5 while pressed and 0 otherwise.
  if (ev.pointerType === 'mouse' || ev.pointerType === 'touch') {
    if (ev.pointerType === 'touch') {
      // Some touch drivers expose force through `pressure` 0..1, use it if it varies.
      p = (p > 0 && p !== 0.5) ? p : fallback;
    } else {
      p = fallback;
    }
  } else if (!p) p = fallback;
  return Math.min(1, Math.max(0.05, p));
}

/** Contact tilt magnitude 0…1 from tiltX / tiltY (degrees) */
export function tiltOf(ev) {
  const tx = Number(ev.tiltX) || 0;
  const ty = Number(ev.tiltY) || 0;
  return Math.min(1, Math.hypot(tx, ty) / 90);
}

/** Contact size in CSS px (browsers expose this for touch / pen) */
export function contactSize(ev) {
  return Math.max(Number(ev.width) || 0, Number(ev.height) || 0);
}

/**
 * PalmGuard decides whether a pointerdown should draw.
 * It learns from real events instead of trusting hardware palm rejection.
 */
export class PalmGuard {
  constructor(config = defaultPenConfig()) {
    this.cfg = { ...defaultPenConfig(), ...config };
    this.penDown = false;
    this.lastPenUp = 0;
    this.lastContact = 0;
    this.rejections = 0;
  }
  setConfig(cfg = {}) {
    this.cfg = { ...this.cfg, ...cfg };
    if (this.cfg.palm === 'off') this.rejections = 0;
  }
  noteDown(ev) {
    if (ev.pointerType === 'pen') {
      this.penDown = true;
      this.lastContact = Date.now();
    }
  }
  noteUp(ev) {
    if (ev.pointerType === 'pen') {
      this.penDown = false;
      this.lastPenUp = Date.now();
    }
  }
  /** true when this pointer is allowed to paint */
  allows(ev) {
    const cfg = this.cfg;
    if (ev.pointerType === 'pen') return true;
    if (ev.pointerType === 'mouse') return true;
    // touch below
    if (cfg.finger === false) return false;
    if (cfg.palm === 'off') return true;
    if (this.penDown) { this.rejections++; return false; }
    const sincePen = Date.now() - this.lastPenUp;
    if (sincePen < cfg.palmDelay) { this.rejections++; return false; }
    const size = contactSize(ev);
    const limit = PALM_SIZES[cfg.palm] ?? PALM_SIZES.auto;
    if (size > limit) { this.rejections++; return false; }
    return true;
  }
  get palmRejectionCount() { return this.rejections; }
}

/**
 * Light exponential smoothing used while collecting stroke points.
 * `amount` is 0…1 (0 = raw, 1 = very smooth).
 */
export function smoothPoint(prev, next, amount) {
  const k = 1 - Math.min(0.92, Math.max(0, amount));
  if (!prev) return { ...next };
  return {
    x: prev.x + (next.x - prev.x) * k,
    y: prev.y + (next.y - prev.y) * k,
    p: prev.p + (next.p - prev.p) * Math.min(1, Math.max(0.35, k + 0.25)),
  };
}

/** Variable width for a pressure-aware stroke point. */
export function widthAt(baseWidth, p, { minRatio = 0.28 } = {}) {
  const ratio = minRatio + (1 - minRatio) * Math.min(1, Math.max(0, p));
  return Math.max(0.4, baseWidth * ratio);
}
