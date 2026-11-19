/* pdf.js — PDF Studio: open local PDFs, thumbnails, zoom/rotate and
   “send page to whiteboard” as an annotation background. Files stay on device. */

import { el, toast, uid, clamp, escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { db } from '../db.js';

const MAX_RECENTS = 6;

export function mount({ body, api, os }) {
  const lib = window.pdfjsLib;
  if (lib) {
    try { lib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js'; }
    catch (err) { console.warn('[pdf] worker setup failed', err); }
  }

  let doc = null;
  let current = 1;
  let scale = 1.1;
  let rotation = 0;
  let docName = '';
  let renderToken = 0;
  let recents = [];

  const toolbarWrap = document.createElement('div');
  toolbarWrap.innerHTML = heightToolbar().trim();
  const toolbar = toolbarWrap.firstElementChild;
  const pane = el('div', { class: 'pdfpane' });
  const thumbsEl = el('div', { class: 'pdfthumbs', 'aria-label': 'PDF pages' });
  const viewEl = el('div', { class: 'pdfview' });
  const bodyEl = el('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: '0' } }, toolbar, pane);
  pane.append(thumbsEl, viewEl);
  body.append(bodyEl);

  const pageLabel = toolbar.querySelector('[data-page-label]');
  const zoomLabel = toolbar.querySelector('[data-zoom-label]');
  const titleLabel = toolbar.querySelector('[data-doc-name]');

  function heightToolbar() {
    return `
    <div class="toolbar" role="toolbar" aria-label="PDF tools">
      <button class="tbtn" data-act="open" title="Open a PDF" aria-label="Open a PDF">${icon('upload')}<span>Open</span></button>
      <button class="tbtn" data-act="recent" title="Recent files" aria-label="Recent files">${icon('clock')}</button>
      <div class="toolbar__sep"></div>
      <button class="tbtn" data-act="prev" title="Previous page (←)" aria-label="Previous page">${icon('chevronLeft')}</button>
      <span class="badge" data-page-label>—</span>
      <button class="tbtn" data-act="next" title="Next page (→)" aria-label="Next page">${icon('chevronRight')}</button>
      <div class="toolbar__sep"></div>
      <button class="tbtn" data-act="zoomout" title="Zoom out" aria-label="Zoom out">${icon('zoomOut')}</button>
      <span class="badge" data-zoom-label>110%</span>
      <button class="tbtn" data-act="zoomin" title="Zoom in" aria-label="Zoom in">${icon('zoomIn')}</button>
      <button class="tbtn" data-act="fit" title="Fit width" aria-label="Fit to width">${icon('expand')}</button>
      <button class="tbtn" data-act="rotate" title="Rotate 90°" aria-label="Rotate page">${icon('rotate')}</button>
      <div class="toolbar__spacer"></div>
      <span class="badge" data-doc-name style="max-width:180px;overflow:hidden;text-overflow:ellipsis">No file</span>
      <button class="tbtn" data-act="send" title="Send this page to the whiteboard" aria-label="Send page to whiteboard">${icon('board')}<span>Send to board</span></button>
    </div>`;
  }

  /* ————— empty state ————— */
  function showEmpty(message = '') {
    thumbsEl.innerHTML = '';
    viewEl.innerHTML = '';
    const pick = el('button', { class: 'btn btn--primary', type: 'button' }, 'Choose a PDF');
    pick.addEventListener('click', pickFile);
    const recentBtn = el('button', { class: 'btn', type: 'button', text: 'Open recent file' });
    recentBtn.addEventListener('click', showRecents);
    const zone = el('div', { class: 'dropzone', style: { maxWidth: '420px' } },
      el('b', { text: 'Open a PDF from this device' }),
      el('div', { text: 'Drag & drop a .pdf anywhere in this window, or choose a file. Nothing is uploaded.' }),
      el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' } }, pick, recentBtn),
      message ? el('small', { text: message, style: { display: 'block', marginTop: '10px', color: 'var(--warn)' } }) : null
    );
    viewEl.append(el('div', { class: 'empty', style: { width: '100%' } },
      el('span', { html: icon('pdf'), style: { display: 'inline-flex', width: '40px', height: '40px' } }),
      el('b', { text: lib ? 'PDF Studio ready' : 'PDF engine still loading…' }),
      zone
    ));
    pageLabel.textContent = '—';
    titleLabel.textContent = 'No file';
  }

  /* ————— open ————— */
  function pickFile() {
    const input = el('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
    document.body.append(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (file) await openFile(file);
    });
    input.click();
  }

  async function openFile(file) {
    if (!lib) { toast('PDF engine is not available', { type: 'error' }); return; }
    try {
      const buf = await file.arrayBuffer();
      await loadDocument(buf, file.name, file.size);
      saveRecent(file.name, buf, file.size);
    } catch (err) {
      console.warn('[pdf] open failed', err);
      toast(err?.name === 'PasswordException' ? 'This PDF is password protected' : 'Could not open that PDF', { type: 'error' });
    }
  }

  async function loadDocument(data, name, size = 0) {
    const task = lib.getDocument({ data: data.slice ? data.slice(0) : data });
    doc = await task.promise;
    docName = name || 'document.pdf';
    current = 1;
    rotation = 0;
    titleLabel.textContent = docName;
    api?.setSubtitle?.(`${doc.numPages} page${doc.numPages > 1 ? 's' : ''}`);
    viewEl.innerHTML = '';
    await renderThumbs();
    await renderPage();
    toast(`Opened ${docName} · ${doc.numPages} page${doc.numPages > 1 ? 's' : ''}`);
  }

  async function renderThumbs() {
    thumbsEl.innerHTML = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const btn = el('button', {
        class: 'pdfthumb' + (i === current ? ' is-active' : ''), type: 'button',
        title: `Page ${i}`, 'aria-label': `Go to page ${i}`,
      });
      const canvas = el('canvas');
      btn.append(canvas);
      btn.addEventListener('click', () => goTo(i));
      thumbsEl.append(btn);
      renderThumbPage(i, canvas).catch(() => {});
    }
  }

  async function renderThumbPage(num, canvas) {
    const page = await doc.getPage(num);
    const vp = page.getViewport({ scale: 0.22 });
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  }

  async function renderPage() {
    if (!doc) return;
    const token = ++renderToken;
    try {
      const page = await doc.getPage(current);
      if (token !== renderToken) return;
      const stageRect = viewEl.getBoundingClientRect();
      const base = page.getViewport({ scale: 1, rotation: page.rotate + rotation });
      let useScale = scale;
      if (stageRect.width > 40 && base.width * scale > stageRect.width - 32) {
        useScale = Math.max(0.25, (stageRect.width - 32) / base.width);
      }
      const vp = page.getViewport({ scale: useScale * Math.min(window.devicePixelRatio || 1, 2), rotation: page.rotate + rotation });
      const cssVp = page.getViewport({ scale: useScale, rotation: page.rotate + rotation });
      const canvas = el('canvas', { width: Math.round(vp.width), height: Math.round(vp.height) });
      canvas.style.width = Math.round(cssVp.width) + 'px';
      canvas.style.height = Math.round(cssVp.height) + 'px';
      viewEl.innerHTML = '';
      viewEl.append(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      pageLabel.textContent = `page ${current} / ${doc.numPages}`;
      zoomLabel.textContent = Math.round(useScale * 100) + '%';
      updateThumbActive();
    } catch (err) {
      console.warn('[pdf] render failed', err);
      if (token === renderToken) toast('This page could not be rendered', { type: 'error' });
    }
  }

  function updateThumbActive() {
    [...thumbsEl.children].forEach((btn, i) => btn.classList.toggle('is-active', i + 1 === current));
    thumbsEl.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }

  function goTo(n) {
    if (!doc) return;
    current = clamp(n, 1, doc.numPages);
    renderPage();
  }

  /* ————— actions ————— */
  toolbar.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'open') pickFile();
    if (act === 'recent') showRecents();
    if (act === 'prev') goTo(current - 1);
    if (act === 'next') goTo(current + 1);
    if (act === 'zoomout') { scale = clamp(scale - 0.15, 0.25, 4); renderPage(); }
    if (act === 'zoomin') { scale = clamp(scale + 0.15, 0.25, 4); renderPage(); }
    if (act === 'fit') { scale = 1.1; renderPage(); }
    if (act === 'rotate') { rotation = (rotation + 90) % 360; renderPage(); }
    if (act === 'send') sendToBoard();
  });

  async function sendToBoard() {
    if (!doc) { toast('Open a PDF first', { type: 'warn' }); return; }
    try {
      const page = await doc.getPage(current);
      const vp = page.getViewport({ scale: 2, rotation: page.rotate + rotation });
      const canvas = el('canvas', { width: Math.round(vp.width), height: Math.round(vp.height) });
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      await os.openApp('board');
      setTimeout(() => {
        os.boardApi?.insertImage(dataUrl, { source: 'pdf' });
        toast(`Page ${current} sent to the whiteboard`);
      }, 120);
    } catch (err) {
      console.warn(err);
      toast('Could not send this page to the board', { type: 'error' });
    }
  }

  /* ————— recents ————— */
  async function loadRecents() {
    try {
      const all = await db.all('docs');
      recents = all.filter((r) => r && r.kind === 'pdf').sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, MAX_RECENTS);
    } catch { recents = []; }
  }

  async function saveRecent(name, buf, size) {
    try {
      const existing = recents.find((r) => r.name === name && r.size === size);
      const id = existing?.id || uid('doc');
      const record = { id, kind: 'pdf', name, size, addedAt: Date.now(), data: buf };
      await db.put('docs', record, id);
      await loadRecents();
    } catch (err) {
      console.warn('[pdf] could not remember file', err?.message);
    }
  }

  function showRecents() {
    const sheet = el('div', { class: 'sheet' });
    const close = el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close recent files', title: 'Close' });
    close.innerHTML = icon('close');
    const list = el('div', { style: { display: 'grid', gap: '6px' } });
    if (!recents.length) list.append(el('p', { class: 'hint', text: 'No recent PDFs yet — open one and it will be remembered on this device.' }));
    recents.forEach((r) => {
      const item = el('button', { class: 'listitem', type: 'button', style: { width: '100%' } },
        el('span', { html: icon('pdf'), style: { display: 'inline-flex', width: '16px', height: '16px' } }),
        el('span', { text: r.name }),
        el('small', { text: new Date(r.addedAt).toLocaleDateString() })
      );
      item.addEventListener('click', async () => {
        sheet.remove();
        try { await loadDocument(r.data, r.name, r.size); } catch { toast('That stored PDF could not be opened', { type: 'error' }); }
      });
      list.append(item);
    });
    const box = el('div', { class: 'sheet__box' },
      el('div', { class: 'sheet__head' }, el('b', { text: 'Recent PDFs' }), close),
      list
    );
    sheet.append(box);
    body.append(sheet);
    close.addEventListener('click', () => sheet.remove());
    sheet.addEventListener('click', (ev) => { if (ev.target === sheet) sheet.remove(); });
  }

  /* ————— drop + keys ————— */
  function onDrop(ev) {
    ev.preventDefault();
    const file = [...(ev.dataTransfer?.files || [])].find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (file) openFile(file); else toast('That file is not a PDF', { type: 'warn' });
  }
  body.addEventListener('dragover', (ev) => { ev.preventDefault(); });
  body.addEventListener('drop', onDrop);

  function onKey(ev) {
    if (!api?.win.classList.contains('is-focused')) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); goTo(current + 1); }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); goTo(current - 1); }
  }
  window.addEventListener('keydown', onKey);

  let lastWidth = 0;
  const ro = new ResizeObserver((entries) => {
    const w = Math.round(entries[0]?.contentRect?.width || 0);
    if (!doc || Math.abs(w - lastWidth) < 24) return;
    lastWidth = w;
    clearTimeout(ro._t);
    ro._t = setTimeout(() => renderPage(), 180);
  });
  ro.observe(viewEl);

  (async () => {
    showEmpty();
    await loadRecents();
    if (os.options?.openRecent && recents.length) {
      const r = recents[0];
      try { await loadDocument(r.data, r.name, r.size); } catch { /* ignore */ }
    }
  })();

  return () => {
    ro.disconnect();
    window.removeEventListener('keydown', onKey);
    try { doc?.destroy?.(); } catch { /* ignore */ }
    doc = null;
  };
}
