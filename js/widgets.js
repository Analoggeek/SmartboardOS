/* widgets.js — desktop widgets: clock, quick timer with chime, sticky note, dice.
   Add/remove is persisted with the rest of the settings. */

import { el, $, toast, debounce, chime, formatClock, formatDate, formatDuration, confetti } from './utils.js';
import { icon } from './icons.js';
import { ls } from './db.js';

const WIDGETS = {
  clock: { label: 'Clock', icon: 'clock' },
  timer: { label: 'Timer', icon: 'timer' },
  sticky: { label: 'Sticky note', icon: 'sticky' },
  dice: { label: 'Dice', icon: 'dice' },
};

const DICE_DOTS = {
  1: [4], 2: [0, 8], 3: [0, 4, 8],
  4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

const timerState = { remaining: 300, running: false, endAt: 0, handle: null, duration: 300 };

export function initWidgets({ host, addRow, os, onChange = () => {} }) {
  const settings = os.settings;
  let diceValues = [4, 2];
  let clockHandle = null;

  const persist = () => os.saveSettings({ widgets: settings.widgets }, true);

  function remove(id) {
    settings.widgets = settings.widgets.filter((w) => w !== id);
    persist();
    render();
    onChange();
    toast(`${WIDGETS[id]?.label || id} widget removed`);
  }

  function add(id) {
    if (!WIDGETS[id]) return;
    if (!settings.widgets.includes(id)) {
      settings.widgets = [...settings.widgets, id];
      persist();
      render();
      onChange();
      toast(`${WIDGETS[id].label} widget added`);
    } else {
      toast(`${WIDGETS[id].label} is already on the desktop`, { type: 'warn' });
    }
  }

  function card(id, title, ...content) {
    const close = el('button', { class: 'widget__close', type: 'button', title: `Remove ${title} widget`, 'aria-label': `Remove ${title} widget` });
    close.innerHTML = icon('close');
    close.addEventListener('click', () => remove(id));
    return el('section', { class: 'card widget', dataset: { widget: id } },
      el('div', { class: 'widget__head' }, el('b', { text: title }), close),
      ...content
    );
  }

  /* — clock — */
  function clockWidget() {
    const time = el('div', { class: 'wclock', text: '--:--' });
    const date = el('small', { text: '' });
    time.append(date);
    const node = card('clock', 'Clock', time);
    const tick = () => {
      if (!node.isConnected) return;
      const now = new Date();
      time.firstChild.nodeValue = formatClock(now, settings.use24);
      date.textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    };
    tick();
    node._tick = tick;
    return node;
  }

  /* — timer — */
  function renderTimer(node) {
    const display = node.querySelector('[data-timer-display]');
    const startBtn = node.querySelector('[data-timer-start]');
    if (!display) return;
    display.textContent = formatDuration(timerState.remaining * 1000);
    startBtn.textContent = timerState.running ? 'Pause' : 'Start';
    startBtn.setAttribute('aria-label', timerState.running ? 'Pause timer' : 'Start timer');
  }

  function tickTimer() {
    if (!timerState.running) return;
    const left = Math.max(0, Math.ceil((timerState.endAt - Date.now()) / 1000));
    timerState.remaining = left;
    document.querySelectorAll('[data-widget="timer"]').forEach(renderTimer);
    if (left <= 0) {
      stopTimer();
      chime('timer');
      toast('Time is up!');
      confetti({ count: 70 });
    }
  }

  function startTimer(seconds) {
    if (seconds) {
      timerState.duration = seconds;
      timerState.remaining = seconds;
    }
    if (timerState.remaining <= 0) timerState.remaining = timerState.duration || 300;
    if (!settings.widgets.includes('timer')) add('timer');
    timerState.running = true;
    timerState.endAt = Date.now() + timerState.remaining * 1000;
    clearInterval(timerState.handle);
    timerState.handle = setInterval(tickTimer, 250);
    document.querySelectorAll('[data-widget="timer"]').forEach(renderTimer);
    toast(`Timer started — ${formatDuration(timerState.remaining * 1000)}`);
  }
  function pauseTimer() {
    timerState.running = false;
    clearInterval(timerState.handle);
    document.querySelectorAll('[data-widget="timer"]').forEach(renderTimer);
  }
  function stopTimer() {
    timerState.running = false;
    clearInterval(timerState.handle);
    document.querySelectorAll('[data-widget="timer"]').forEach(renderTimer);
  }
  function resetTimer() {
    stopTimer();
    timerState.remaining = timerState.duration;
    document.querySelectorAll('[data-widget="timer"]').forEach(renderTimer);
  }

  function timerWidget() {
    const display = el('div', { class: 'wtimer__time', text: formatDuration(timerState.remaining * 1000), dataset: { timerDisplay: '' } });
    const startBtn = el('button', { class: 'btn btn--sm btn--primary', type: 'button', text: timerState.running ? 'Pause' : 'Start', dataset: { timerStart: '' } });
    const resetBtn = el('button', { class: 'btn btn--sm', type: 'button', text: 'Reset', title: 'Reset timer' });
    const presets = el('div', { class: 'wtimer__row' },
      [60, 180, 300, 600].map((s) => {
        const b = el('button', { class: 'btn btn--sm', type: 'button', text: s < 60 ? `${s}s` : `${s / 60}m` });
        b.addEventListener('click', () => {
          timerState.duration = s;
          timerState.remaining = s;
          if (timerState.running) startTimer(s);
          else document.querySelectorAll('[data-widget="timer"]').forEach(renderTimer);
        });
        return b;
      })
    );
    startBtn.addEventListener('click', () => {
      if (timerState.running) pauseTimer();
      else startTimer();
    });
    resetBtn.addEventListener('click', resetTimer);
    const node = card('timer', 'Quick timer', display, presets,
      el('div', { class: 'wtimer__row' }, startBtn, resetBtn));
    renderTimer(node);
    return node;
  }

  /* — sticky note — */
  function stickyWidget() {
    const saved = ls.get('sticky', '');
    const ta = el('textarea', {
      placeholder: 'Pinned thought for this lesson…', 'aria-label': 'Sticky note',
      rows: 4, value: saved,
    });
    ta.value = saved;
    const save = debounce(() => { ls.set('sticky', ta.value); }, 400);
    ta.addEventListener('input', save);
    ta.addEventListener('blur', () => save.flush());
    let clear;
    clear = el('button', { class: 'btn btn--sm', type: 'button', text: 'Clear' });
    clear.addEventListener('click', () => { ta.value = ''; save.flush(); toast('Sticky note cleared'); });
    return card('sticky', 'Sticky note', el('div', { class: 'wsticky' }, ta), el('div', { class: 'wtimer__row' }, clear));
  }

  /* — dice — */
  function dieFace(value) {
    const die = el('div', { class: 'die', role: 'img', 'aria-label': `Die showing ${value}` });
    for (let i = 0; i < 9; i++) die.append(el('i', { class: DICE_DOTS[value]?.includes(i) ? 'on' : '' }));
    return die;
  }
  function diceWidget() {
    const row = el('div', { class: 'dicerow' });
    const total = el('div', { class: 'hint', text: '' });
    const sync = () => {
      row.innerHTML = '';
      diceValues.forEach((v) => row.append(dieFace(v)));
      total.textContent = `Total: ${diceValues.reduce((a, b) => a + b, 0)}`;
    };
    const rollBtn = el('button', { class: 'btn btn--sm btn--primary', type: 'button', text: 'Roll dice' });
    rollBtn.addEventListener('click', () => {
      diceValues = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      row.querySelectorAll('.die').forEach((d) => d.classList.add('is-rolling'));
      setTimeout(() => { sync(); }, 160);
    });
    sync();
    return card('dice', 'Dice', el('div', { class: 'wdice' }, row, total),
      el('div', { class: 'wtimer__row', style: { justifyContent: 'center' } }, rollBtn));
  }

  /* — add row — */
  function renderAddRow() {
    if (!addRow) return;
    addRow.innerHTML = '';
    const missing = Object.keys(WIDGETS).filter((id) => !settings.widgets.includes(id));
    if (!missing.length) return;
    missing.forEach((id) => {
      const b = el('button', { class: 'btn btn--sm btn--ghost', type: 'button', title: `Add ${WIDGETS[id].label} widget` });
      b.innerHTML = `<span style="display:inline-flex;width:14px;height:14px">${icon('add')}</span>${WIDGETS[id].label}`;
      b.addEventListener('click', () => add(id));
      addRow.append(b);
    });
  }

  function render() {
    if (!host) return;
    host.innerHTML = '';
    if (!settings.widgets.length) {
      host.append(el('div', { class: 'card card--pad empty', style: { padding: '22px' } },
        el('b', { text: 'No widgets yet' }),
        el('small', { text: 'Add a clock, timer, sticky note or dice below.' })));
    }
    settings.widgets.forEach((id) => {
      let node;
      if (id === 'clock') node = clockWidget();
      if (id === 'timer') node = timerWidget();
      if (id === 'sticky') node = stickyWidget();
      if (id === 'dice') node = diceWidget();
      if (node) host.append(node);
    });
    renderAddRow();
    clearInterval(clockHandle);
    clockHandle = setInterval(() => {
      document.querySelectorAll('[data-widget="clock"]').forEach((n) => n._tick?.());
    }, 5000);
  }

  render();
  // resume a running timer's display if the UI re-renders
  window.addEventListener('pagehide', () => {
    if (timerState.running) ls.set('timerLeft', Math.max(0, Math.ceil((timerState.endAt - Date.now()) / 1000)));
  });

  return { add, remove, startTimer, pauseTimer, resetTimer, render };
}
