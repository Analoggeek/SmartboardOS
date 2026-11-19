/* notes.js — autosaving lesson notes with search, markdown export and restore. */

import { el, toast, uid, download, debounce, timeAgo } from '../utils.js';
import { icon } from '../icons.js';
import { ls } from '../db.js';

const STARTER = {
  title: 'Lesson plan',
  body: '# Lesson plan\n\n- Starter (5 min): quick recap question\n- Main (20 min): explain with the whiteboard\n- Practice (10 min): students solve on their own\n- Exit ticket: one thing you learned today\n',
};

export function mount({ body, api, os }) {
  let notes = ls.get('notes', null);
  if (!Array.isArray(notes) || !notes.length) {
    notes = [{ id: uid('note'), ...STARTER, createdAt: Date.now(), updatedAt: Date.now() }];
    ls.set('notes', notes);
  }
  let activeId = ls.get('notesActive', notes[0]?.id) || notes[0]?.id;
  let query = '';
  let showDeleted = false;

  const toolbar = el('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Notes tools' });
  const split = el('div', { class: 'pane pane--split' });
  const sidebar = el('div', { class: 'sidebar' });
  const search = el('input', { class: 'field field--search', placeholder: 'Search notes…', 'aria-label': 'Search notes' });
  const list = el('div', { style: { display: 'grid', gap: '4px' } });
  const newBtn = el('button', { class: 'btn btn--sm btn--primary', type: 'button', text: 'New note' });
  const trashBtn = el('button', { class: 'btn btn--sm', type: 'button', text: 'Trash' });
  sidebar.append(search, newBtn, list, trashBtn);

  const editorPane = el('div', { style: { display: 'flex', flexDirection: 'column', minHeight: '0' } });
  const textarea = el('textarea', { placeholder: 'Start writing… Markdown welcome.', 'aria-label': 'Note body', spellcheck: 'true' });
  const meta = el('div', { class: 'note__meta' });
  editorPane.append(el('div', { class: 'note', style: { flex: '1 1 auto', minHeight: '0' } }, textarea), meta);

  toolbar.append(
    el('span', { class: 'badge', text: 'autosaves locally' }),
    el('div', { class: 'toolbar__spacer' }),
    (() => {
      const b = el('button', { class: 'tbtn', type: 'button', title: 'Export as Markdown', 'aria-label': 'Export note as Markdown' });
      b.innerHTML = icon('download') + '<span>Markdown</span>';
      b.addEventListener('click', exportMarkdown);
      return b;
    })(),
    (() => {
      const b = el('button', { class: 'tbtn', type: 'button', title: 'Delete note', 'aria-label': 'Delete note' });
      b.innerHTML = icon('trash');
      b.addEventListener('click', () => deleteNote(activeId));
      return b;
    })()
  );

  split.append(sidebar, editorPane);
  body.append(el('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: '0' } }, toolbar, split));

  const active = () => notes.find((n) => n.id === activeId) || notes[0];

  function save() {
    ls.set('notes', notes);
    ls.set('notesActive', activeId);
    os.refreshStats?.();
  }
  const autosave = debounce(() => {
    const note = active();
    if (!note) return;
    note.updatedAt = Date.now();
    save();
    renderMeta();
    renderList();
  }, 350);

  function titleOf(note) {
    const first = (note.body || '').split('\n').find((l) => l.trim());
    return (note.title || first || 'Untitled').replace(/^#+\s*/, '').slice(0, 60);
  }

  function renderList() {
    list.innerHTML = '';
    const visible = notes
      .filter((n) => (showDeleted ? !!n.deletedAt : !n.deletedAt))
      .filter((n) => !query || (n.body + ' ' + titleOf(n)).toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!visible.length) {
      list.append(el('p', { class: 'hint', style: { padding: '6px' }, text: showDeleted ? 'Trash is empty.' : 'No notes match that search.' }));
    }
    visible.forEach((n) => {
      const item = el('button', {
        class: 'listitem' + (n.id === activeId && !showDeleted ? ' is-active' : ''), type: 'button',
        title: titleOf(n),
      }, el('span', { text: titleOf(n), style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
        el('small', { text: timeAgo(n.updatedAt) }));
      item.addEventListener('click', () => {
        if (showDeleted) return;
        activeId = n.id;
        loadEditor(); renderList(); save();
        textarea.focus();
      });
      list.append(item);
    });
  }

  function renderMeta() {
    const n = active();
    meta.textContent = n
      ? `Saved ${timeAgo(n.updatedAt)} · ${(n.body || '').length} characters · ${(n.body || '').trim().split(/\s+/).filter(Boolean).length} words`
      : 'No note selected';
  }

  function loadEditor() {
    const n = active();
    textarea.value = n?.body || '';
    textarea.disabled = !n || !!n.deletedAt;
    renderMeta();
  }

  textarea.addEventListener('input', () => {
    const n = active();
    if (!n) return;
    n.body = textarea.value;
    autosave();
  });

  search.addEventListener('input', () => { query = search.value; renderList(); });

  newBtn.addEventListener('click', () => newNote());

  function newNote() {
    const note = { id: uid('note'), title: '', body: '', createdAt: Date.now(), updatedAt: Date.now() };
    notes.unshift(note);
    activeId = note.id;
    showDeleted = false;
    save(); renderList(); loadEditor();
    textarea.focus();
    toast('New note created');
  }

  function deleteNote(id) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    note.deletedAt = Date.now();
    save();
    const next = notes.find((n) => !n.deletedAt);
    activeId = next?.id || activeId;
    renderList(); loadEditor();
    toast('Note moved to trash — open Trash to restore');
  }

  function restoreNote(id) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    delete note.deletedAt;
    note.updatedAt = Date.now();
    activeId = note.id;
    showDeleted = false;
    save(); renderList(); loadEditor();
    toast('Note restored');
  }

  trashBtn.addEventListener('click', () => {
    showDeleted = !showDeleted;
    trashBtn.textContent = showDeleted ? 'Back to notes' : 'Trash';
    renderList();
  });

  function exportMarkdown() {
    const n = active();
    if (!n) { toast('No note to export', { type: 'warn' }); return; }
    const safe = titleOf(n).replace(/[^\w\- ]+/g, '').trim() || 'note';
    download(new Blob([n.body || ''], { type: 'text/markdown' }), `${safe}.md`);
    toast('Markdown exported');
  }

  // deleted notes get a restore action appended as a small row
  const baseRender = renderList;
  renderList = function renderWithRestore() {
    baseRender();
    if (!showDeleted) return;
    notes.filter((n) => n.deletedAt).forEach((n) => {
      const btn = el('button', { class: 'btn btn--sm', type: 'button', text: 'Restore', style: { margin: '0 4px 4px' } });
      btn.addEventListener('click', () => restoreNote(n.id));
      list.append(el('div', { class: 'listitem', style: { gap: '6px' } },
        el('span', { text: titleOf(n), style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }), btn));
    });
  };

  renderList(); loadEditor();
  api.newNote = newNote;
  api.setSubtitle?.(`${notes.filter((n) => !n.deletedAt).length} notes`);

  return () => { autosave.flush(); };
}
