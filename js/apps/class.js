/* class.js — Class tools: random student picker, name wheel, timer,
   stopwatch with laps, team scoreboard and dice. All state stays local. */

import { el, toast, chime, confetti, formatDuration, clamp, debounce } from '../utils.js';
import { icon } from '../icons.js';
import { ls } from '../db.js';

const DEFAULT_NAMES = ['Aarav', 'Ananya', 'Ishaan', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Sara', 'Vivaan', 'Zoya'];

export function mount({ body, api, os }) {
  let names = ls.get('classNames', DEFAULT_NAMES) || DEFAULT_NAMES;
  if (!Array.isArray(names) || !names.length) names = [...DEFAULT_NAMES];
  let teams = ls.get('classTeams', [{ name: 'Team A', score: 0 }, { name: 'Team B', score: 0 }]);
  if (!Array.isArray(teams) || !teams.length) teams = [{ name: 'Team A', score: 0 }, { name: 'Team B', score: 0 }];

  const timer = { duration: ls.get('classTimerDuration', 300), left: 300, running: false, endAt: 0, handle: null };
  timer.left = timer.duration;
  const sw = { elapsed: 0, running: false, startedAt: 0, handle: null, laps: [] };
  let wheelRotation = 0;

  const content = el('div', { class: 'content' });
  const grid = el('div', { class: 'classgrid' });
  content.append(grid);
  body.append(content);

  const persistNames = debounce(() => ls.set('classNames', names), 300);
  const persistTeams = debounce(() => ls.set('classTeams', teams), 300);

  /* —————————— random student —————————— */
  const pickedEl = el('div', { class: 'bigread', text: 'Ready?' });
  const pickBtn = el('button', { class: 'btn btn--primary', type: 'button', text: 'Pick a student' });
  const editorToggle = el('button', { class: 'btn btn--sm', type: 'button', text: 'Edit list' });
  const editorWrap = el('div', { hidden: true, style: { display: 'grid', gap: '8px' } });
  const editor = el('textarea', { class: 'field', rows: 6, style: { height: 'auto', padding: '8px', resize: 'vertical' } });
  editor.value = names.join('\n');
  const saveBtn = el('button', { class: 'btn btn--sm btn--primary', type: 'button', text: 'Save names' });
  editorWrap.append(el('p', { class: 'hint', text: 'One name per line.' }), editor, saveBtn);

  pickBtn.addEventListener('click', () => pickRandom(true));
  editorToggle.addEventListener('click', () => {
    editorWrap.hidden = !editorWrap.hidden;
    editor.value = names.join('\n');
    if (!editorWrap.hidden) editor.focus();
  });
  saveBtn.addEventListener('click', () => {
    const list = editor.value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!list.length) { toast('Add at least one name', { type: 'warn' }); return; }
    names = list;
    persistNames();
    editorWrap.hidden = true;
    drawWheel();
    toast(`${names.length} names saved`);
  });

  function pickRandom(celebrate = false) {
    const name = names[Math.floor(Math.random() * names.length)] || '—';
    let ticks = 0;
    const spin = setInterval(() => {
      pickedEl.textContent = names[Math.floor(Math.random() * names.length)] || '—';
      ticks++;
      if (ticks > 8) {
        clearInterval(spin);
        pickedEl.textContent = name;
        if (celebrate) {
          confetti({ count: 110 });
          const r = pickedEl.getBoundingClientRect();
          confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 40 });
        }
      }
    }, 55);
  }

  const pickerPanel = el('section', { class: 'panel' },
    el('h4', { text: 'Random student' }),
    pickedEl,
    el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } }, pickBtn, editorToggle),
    editorWrap
  );

  /* —————————— name wheel —————————— */
  const wheelCanvas = el('canvas', { class: 'wheel', width: 360, height: 360, 'aria-label': 'Name wheel' });
  const wheelPin = el('div', { class: 'wheel__pin' });
  const spinBtn = el('button', { class: 'btn btn--sm btn--primary', type: 'button', text: 'Spin the wheel' });
  const wheelResult = el('div', { class: 'hint', text: 'Spin to choose fairly.' });
  const wheelWrap = el('div', { class: 'wheelwrap' }, wheelPin, wheelCanvas);
  spinBtn.addEventListener('click', spinWheel);

  function drawWheel() {
    const ctx = wheelCanvas.getContext('2d');
    const size = wheelCanvas.width;
    const r = size / 2;
    ctx.clearRect(0, 0, size, size);
    const n = Math.max(1, names.length);
    const colors = ['#8b7dff', '#5ad1ff', '#4ade80', '#fbbf24', '#ff6f9c', '#c8a7ff', '#7fd6a1', '#ff8f6b'];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(r, r);
      ctx.arc(r, r, r - 6, a0, a1);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate((a0 + a1) / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#10131f';
      ctx.font = '600 15px Inter, system-ui, sans-serif';
      const label = names[i].length > 12 ? names[i].slice(0, 11) + '…' : names[i];
      ctx.fillText(label, r - 18, 5);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(r, r, r - 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r, r, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#10131f';
    ctx.fill();
  }

  function spinWheel() {
    if (names.length < 2) { toast('Add at least two names first', { type: 'warn' }); return; }
    const idx = Math.floor(Math.random() * names.length);
    const seg = 360 / names.length;
    const target = 360 * 5 + (360 - (idx * seg + seg / 2));
    wheelRotation += target;
    wheelCanvas.style.transform = `rotate(${wheelRotation}deg)`;
    wheelResult.textContent = 'Spinning…';
    setTimeout(() => {
      wheelResult.textContent = `🎉 ${names[idx]}`;
      confetti({ count: 60 });
      pickedEl.textContent = names[idx];
    }, 2450);
  }

  const wheelPanel = el('section', { class: 'panel' },
    el('h4', { text: 'Name wheel' }),
    wheelWrap,
    el('div', { style: { display: 'flex', justifyContent: 'center', gap: '8px' } }, spinBtn),
    wheelResult
  );

  /* —————————— timer —————————— */
  const timerDisplay = el('div', { class: 'bigread', text: formatDuration(timer.left * 1000) });
  const timerStart = el('button', { class: 'btn btn--primary', type: 'button', text: 'Start' });
  const timerReset = el('button', { class: 'btn btn--sm', type: 'button', text: 'Reset' });
  const timerPresets = el('div', { class: 'scrollrow' });
  [60, 120, 300, 600, 900, 1800].forEach((s) => {
    const b = el('button', { class: 'btn btn--sm', type: 'button', text: s >= 60 ? `${s / 60} min` : `${s}s` });
    b.addEventListener('click', () => setTimerDuration(s));
    timerPresets.append(b);
  });

  function renderTimer() {
    timerDisplay.textContent = formatDuration(timer.left * 1000);
    timerStart.textContent = timer.running ? 'Pause' : 'Start';
    timerDisplay.style.color = timer.left <= 10 && timer.left > 0 ? '#ff6f7d' : '';
  }
  function setTimerDuration(seconds) {
    clearInterval(timer.handle);
    timer.running = false;
    timer.duration = seconds;
    timer.left = seconds;
    ls.set('classTimerDuration', seconds);
    renderTimer();
  }
  function startTimer() {
    if (timer.running) {
      timer.running = false;
      clearInterval(timer.handle);
      renderTimer();
      return;
    }
    if (timer.left <= 0) timer.left = timer.duration;
    timer.running = true;
    timer.endAt = Date.now() + timer.left * 1000;
    clearInterval(timer.handle);
    timer.handle = setInterval(() => {
      timer.left = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
      renderTimer();
      if (timer.left <= 0) {
        clearInterval(timer.handle);
        timer.running = false;
        renderTimer();
        chime('timer');
        toast('Time is up!');
        confetti({ count: 90 });
      }
    }, 250);
    renderTimer();
  }
  timerStart.addEventListener('click', startTimer);
  timerReset.addEventListener('click', () => { setTimerDuration(timer.duration); });

  const timerPanel = el('section', { class: 'panel' },
    el('h4', { text: 'Class timer' }), timerDisplay,
    el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } }, timerStart, timerReset),
    timerPresets
  );

  /* —————————— stopwatch —————————— */
  const swDisplay = el('div', { class: 'bigread', text: '0:00.0' });
  const swStart = el('button', { class: 'btn btn--primary', type: 'button', text: 'Start' });
  const swLap = el('button', { class: 'btn btn--sm', type: 'button', text: 'Lap' });
  const swReset = el('button', { class: 'btn btn--sm', type: 'button', text: 'Reset' });
  const lapList = el('div', { class: 'rows', style: { maxHeight: '110px', overflow: 'auto' } });

  function swValue() {
    const ms = sw.elapsed + (sw.running ? Date.now() - sw.startedAt : 0);
    return ms;
  }
  function renderSw() {
    const ms = swValue();
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    const tenth = Math.floor((ms % 1000) / 100);
    swDisplay.textContent = `${min}:${String(sec).padStart(2, '0')}.${tenth}`;
    swStart.textContent = sw.running ? 'Pause' : 'Start';
  }
  swStart.addEventListener('click', () => {
    if (sw.running) {
      sw.elapsed = swValue();
      sw.running = false;
      clearInterval(sw.handle);
    } else {
      sw.startedAt = Date.now();
      sw.running = true;
      sw.handle = setInterval(renderSw, 100);
    }
    renderSw();
  });
  swLap.addEventListener('click', () => {
    if (!sw.running) { toast('Start the stopwatch first', { type: 'warn' }); return; }
    const ms = swValue();
    const prev = sw.laps.length ? sw.laps[0].total : 0;
    sw.laps.unshift({ total: ms, split: ms - prev });
    renderLaps();
  });
  swReset.addEventListener('click', () => {
    clearInterval(sw.handle);
    Object.assign(sw, { elapsed: 0, running: false, startedAt: 0, laps: [] });
    renderSw(); renderLaps();
  });
  function renderLaps() {
    lapList.innerHTML = '';
    sw.laps.forEach((l, i) => {
      lapList.append(el('div', { class: 'row' },
        el('b', { text: `Lap ${sw.laps.length - i}` }),
        el('span', { text: formatDuration(l.split) }),
        el('span', { text: formatDuration(l.total), style: { color: 'var(--muted-2)' } })
      ));
    });
  }

  const swPanel = el('section', { class: 'panel' },
    el('h4', { text: 'Stopwatch' }), swDisplay,
    el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } }, swStart, swLap, swReset),
    lapList
  );

  /* —————————— scoreboard —————————— */
  const teamRows = el('div', { class: 'rows' });
  const teamInput = el('input', { class: 'field', placeholder: 'New team name', 'aria-label': 'New team name' });
  const addTeamBtn = el('button', { class: 'btn btn--sm', type: 'button', text: 'Add team' });
  const resetTeams = el('button', { class: 'btn btn--sm', type: 'button', text: 'Reset scores' });

  function renderTeams() {
    teamRows.innerHTML = '';
    teams.forEach((t, i) => {
      const minus = el('button', { type: 'button', title: `Remove a point from ${t.name}`, 'aria-label': `Minus one point for ${t.name}` });
      minus.innerHTML = icon('minus');
      minus.addEventListener('click', () => { t.score -= 1; persistTeams(); renderTeams(); });
      const plus = el('button', { type: 'button', title: `Add a point to ${t.name}`, 'aria-label': `Plus one point for ${t.name}` });
      plus.innerHTML = icon('add');
      plus.addEventListener('click', () => { t.score += 1; persistTeams(); renderTeams(); });
      const del = el('button', { type: 'button', title: `Remove ${t.name}`, 'aria-label': `Remove ${t.name}` });
      del.innerHTML = icon('close');
      del.addEventListener('click', () => { teams.splice(i, 1); persistTeams(); renderTeams(); });
      teamRows.append(el('div', { class: 'row' }, el('b', { text: t.name }), minus, el('span', { text: String(t.score) }), plus, del));
    });
    if (!teams.length) teamRows.append(el('p', { class: 'hint', text: 'Add a team to start scoring.' }));
  }
  addTeamBtn.addEventListener('click', () => {
    const name = (teamInput.value || '').trim() || `Team ${teams.length + 1}`;
    teams.push({ name, score: 0 });
    teamInput.value = '';
    persistTeams(); renderTeams();
  });
  teamInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') addTeamBtn.click(); });
  resetTeams.addEventListener('click', () => { teams.forEach((t) => { t.score = 0; }); persistTeams(); renderTeams(); toast('Scores reset'); });

  const scorePanel = el('section', { class: 'panel' },
    el('h4', { text: 'Team scoreboard' }), teamRows,
    el('div', { style: { display: 'flex', gap: '6px' } }, teamInput, addTeamBtn),
    el('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, resetTeams)
  );

  /* —————————— dice —————————— */
  const DOTS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  let dice = [3, 5];
  const diceRow = el('div', { class: 'dicerow' });
  const diceTotal = el('div', { class: 'hint', text: '' });
  function renderDice() {
    diceRow.innerHTML = '';
    dice.forEach((v, i) => {
      const die = el('div', { class: 'die', role: 'img', 'aria-label': `Die ${i + 1}: ${v}` });
      for (let d = 0; d < 9; d++) die.append(el('i', { class: DOTS[v].includes(d) ? 'on' : '' }));
      diceRow.append(die);
    });
    diceTotal.textContent = `Total: ${dice.reduce((a, b) => a + b, 0)}`;
  }
  const rollBtn = el('button', { class: 'btn btn--primary', type: 'button', text: 'Roll dice' });
  rollBtn.addEventListener('click', () => {
    diceRow.querySelectorAll('.die').forEach((d) => d.classList.add('is-rolling'));
    dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    setTimeout(() => { renderDice(); chime('correct'); }, 180);
  });
  const dicePanel = el('section', { class: 'panel' },
    el('h4', { text: 'Dice roller' }), diceRow, diceTotal,
    el('div', { style: { display: 'flex', justifyContent: 'center' } }, rollBtn)
  );

  /* —————————— assemble —————————— */
  grid.append(pickerPanel, wheelPanel, timerPanel, swPanel, scorePanel, dicePanel);
  drawWheel(); renderTeams(); renderDice(); renderTimer(); renderSw();

  api.pickRandom = () => pickRandom(true);
  api.spinWheel = spinWheel;
  api.startTimer = (s) => { if (s) setTimerDuration(s); startTimer(); };

  // redraw the wheel when the window resizes (canvas is CSS-scaled, so just keep crisp)
  const ro = new ResizeObserver(() => { /* canvas scales with CSS */ });
  ro.observe(content);

  return () => {
    clearInterval(timer.handle);
    clearInterval(sw.handle);
    ro.disconnect();
    persistNames.flush();
    persistTeams.flush();
  };
}
