/* camera.js — one shared camera sheet used by the whiteboard, the toolbox
   and Settings. Photos never leave the device. */

import { el, toast } from './utils.js';
import { icon } from './icons.js';

function friendlyError(err) {
  const name = err?.name || '';
  if (!window.isSecureContext) {
    return 'Camera needs a secure context. Open SmartBoardOS over HTTPS or on localhost, then try again.';
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'This browser does not expose a camera API. Try Chrome, Edge or Safari on a recent device.';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera permission was blocked. Allow camera access in the browser’s site settings and press Retry.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera is busy in another app or tab. Close it there and press Retry.';
  }
  return 'The camera could not start. ' + (err?.message ? `(${err.message})` : 'Please try again.');
}

/**
 * Opens a camera sheet.
 * @param {{onCapture?:(dataUrl:string)=>void, container?:HTMLElement, facing?:string}} opts
 * @returns {{close:()=>void}}
 */
export function openCamera({ onCapture, container = document.body, facing = 'environment', title = 'Camera' } = {}) {
  let stream = null;
  let currentFacing = facing;
  let closed = false;

  const video = el('video', { autoplay: '', playsinline: '', muted: true });
  video.setAttribute('playsinline', '');
  video.muted = true;

  const message = el('div', { class: 'cam__msg', text: 'Starting camera…' });
  const view = el('div', { class: 'cam__view' }, video, message);
  const captureBtn = el('button', { class: 'btn btn--primary', type: 'button' },
    el('span', { html: icon('camera'), style: { width: '16px', height: '16px', display: 'inline-flex' } }), 'Capture');
  const switchBtn = el('button', { class: 'btn', type: 'button', title: 'Switch front / back camera' }, 'Flip camera');
  const retryBtn = el('button', { class: 'btn', type: 'button' }, 'Retry');
  const closeBtn = el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close camera', title: 'Close' });
  closeBtn.innerHTML = icon('close');

  const box = el('div', { class: 'sheet__box', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div', { class: 'sheet__head' },
      el('b', { text: title }),
      closeBtn
    ),
    el('p', { class: 'hint', text: 'Photos are captured on this device and inserted straight onto the board. Nothing is uploaded.' }),
    view,
    el('div', { class: 'cam__row' }, captureBtn, switchBtn, retryBtn)
  );

  const sheet = el('div', { class: 'sheet', style: { position: 'fixed', zIndex: '300' } }, box);
  container.append(sheet);

  captureBtn.disabled = true;
  switchBtn.disabled = true;
  retryBtn.hidden = true;
  message.hidden = false;

  async function start() {
    message.hidden = false;
    message.textContent = 'Starting camera…';
    retryBtn.hidden = true;
    stop();
    if (!window.isSecureContext && !location.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
      message.textContent = friendlyError({ name: 'InsecureContext' });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      message.textContent = friendlyError({ name: 'Unsupported' });
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: currentFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (closed) { stop(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      message.hidden = true;
      captureBtn.disabled = false;
      switchBtn.disabled = false;
    } catch (err) {
      message.hidden = false;
      message.textContent = friendlyError(err);
      retryBtn.hidden = false;
      captureBtn.disabled = true;
      switchBtn.disabled = true;
    }
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
      stream = null;
    }
    video.srcObject = null;
  }

  function close() {
    if (closed) return;
    closed = true;
    stop();
    sheet.remove();
    document.removeEventListener('keydown', onKey, true);
  }

  function onKey(ev) {
    if (ev.key === 'Escape') { ev.stopPropagation(); close(); }
  }

  captureBtn.addEventListener('click', () => {
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    if (!w || !h) { toast('Camera is still warming up', { type: 'warn' }); return; }
    const canvas = el('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    try {
      if (currentFacing === 'user') { ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      close();
      onCapture?.(dataUrl, { width: w, height: h });
    } catch (err) {
      toast('Could not capture the frame', { type: 'error' });
      console.warn(err);
    }
  });

  switchBtn.addEventListener('click', () => {
    currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
    start();
  });
  retryBtn.addEventListener('click', start);
  closeBtn.addEventListener('click', close);
  sheet.addEventListener('click', (ev) => { if (ev.target === sheet) close(); });
  document.addEventListener('keydown', onKey, true);
  start();

  return { close };
}
