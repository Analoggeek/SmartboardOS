/* media.js — on-device image library stored in IndexedDB.
   Upload, send to the board, download or delete. Nothing leaves the device. */

import { el, toast, uid, download, fileToDataURL } from '../utils.js';
import { icon } from '../icons.js';
import { db, ls } from '../db.js';

export function mount({ body, api, os }) {
  let items = [];

  const countBadge = el('span', { class: 'badge', text: '0 files' });
  const toolbar = el('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Media tools' },
    el('button', { class: 'btn btn--sm btn--primary', type: 'button', id: 'mediaUpload' }, 'Upload images'),
    el('button', { class: 'btn btn--sm', type: 'button', id: 'mediaToBoard', text: 'Send to board' }),
    el('div', { class: 'toolbar__spacer' }),
    countBadge,
    el('span', { class: 'hint', text: 'stored on this device' })
  );
  const content = el('div', { class: 'content' });
  body.append(el('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: '0' } }, toolbar, content));

  async function load() {
    try {
      const all = await db.all('media');
      items = (all || []).filter((m) => m && m.dataUrl).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    } catch { items = []; }
    syncIndex();
    render();
  }

  function syncIndex() {
    ls.set('mediaIndex', items.map((m) => ({ id: m.id, name: m.name, size: m.size, addedAt: m.addedAt })));
    countBadge.textContent = `${items.length} file${items.length === 1 ? '' : 's'}`;
    os.refreshStats?.();
  }

  function render() {
    content.innerHTML = '';
    if (!items.length) {
      const zone = el('div', { class: 'dropzone' },
        el('b', { text: 'Your image library is empty' }),
        el('div', { text: 'Drop images here or press Upload. Photos stay in this browser — nothing is uploaded anywhere.' }),
        el('button', { class: 'btn btn--sm btn--primary', type: 'button', style: { marginTop: '10px' }, text: 'Upload images' })
      );
      zone.querySelector('button').addEventListener('click', pickFiles);
      content.append(el('div', { class: 'empty' }, el('span', { html: icon('media'), style: { width: '40px', height: '40px', display: 'inline-flex' } }), zone));
      return;
    }
    const grid = el('div', { class: 'mediagrid' });
    items.forEach((m) => {
      const send = el('button', { type: 'button', title: 'Send to whiteboard', 'aria-label': `Send ${m.name} to whiteboard` });
      send.innerHTML = icon('board');
      send.addEventListener('click', () => sendToBoard(m));
      const dl = el('button', { type: 'button', title: 'Download', 'aria-label': `Download ${m.name}` });
      dl.innerHTML = icon('download');
      dl.addEventListener('click', () => download(m.dataUrl, m.name || 'image.png'));
      const rm = el('button', { type: 'button', title: 'Delete', 'aria-label': `Delete ${m.name}` });
      rm.innerHTML = icon('trash');
      rm.addEventListener('click', () => removeItem(m));

      grid.append(el('div', { class: 'mediacard' },
        el('img', { class: 'mediacard__img', src: m.dataUrl, alt: m.name || 'image', loading: 'lazy' }),
        el('div', { class: 'mediacard__body' },
          el('span', { text: m.name || 'image' }),
          send, dl, rm
        )
      ));
    });
    content.append(grid);
  }

  function pickFiles() {
    const input = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    document.body.append(input);
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])];
      input.remove();
      await addFiles(files);
    });
    input.click();
  }

  async function addFiles(files) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) { toast('No images were selected', { type: 'warn' }); return; }
    let added = 0;
    for (const f of images) {
      try {
        const dataUrl = await fileToDataURL(f);
        const record = { id: uid('img'), name: f.name, size: f.size, type: f.type, addedAt: Date.now(), dataUrl };
        const ok = await db.put('media', record, record.id);
        if (ok) { items.unshift(record); added++; }
      } catch (err) {
        console.warn('[media] add failed', err);
        toast(`${f.name} could not be stored (device storage may be full)`, { type: 'error' });
      }
    }
    syncIndex(); render();
    if (added) toast(`${added} image${added > 1 ? 's' : ''} added to your library`);
  }

  async function removeItem(m) {
    await db.del('media', m.id);
    items = items.filter((x) => x.id !== m.id);
    syncIndex(); render();
    toast('Image deleted from this device');
  }

  async function sendToBoard(m) {
    await os.openApp('board');
    setTimeout(() => {
      os.boardApi?.insertImage(m.dataUrl);
      toast('Sent to the whiteboard');
    }, 120);
  }

  toolbar.querySelector('#mediaUpload').addEventListener('click', pickFiles);
  toolbar.querySelector('#mediaToBoard').addEventListener('click', async () => {
    if (!items.length) { toast('Upload an image first', { type: 'warn' }); return; }
    await sendToBoard(items[0]);
  });

  function onDrop(ev) {
    ev.preventDefault();
    content.classList.remove('is-over');
    const files = [...(ev.dataTransfer?.files || [])];
    if (files.length) addFiles(files);
  }
  body.addEventListener('dragover', (ev) => { ev.preventDefault(); content.classList.add('is-over'); });
  body.addEventListener('dragleave', () => content.classList.remove('is-over'));
  body.addEventListener('drop', onDrop);

  load().then(() => api?.setSubtitle?.(`${items.length} file${items.length === 1 ? '' : 's'} on device`));

  return () => { content.innerHTML = ''; };
}
