/* calculator.js — keyboard-friendly calculator with a real parser (no eval),
   live preview and a persisted history. */

import { el, toast } from '../utils.js';
import { icon } from '../icons.js';
import { ls } from '../db.js';

/** Safe recursive-descent evaluator: + - * / % ^, parentheses, unary minus. */
export function evaluate(input) {
  const src = String(input).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '').trim();
  if (!src) throw new Error('empty');
  let i = 0;
  const peek = () => src[i];
  const skip = () => { while (src[i] === ' ') i++; };

  function number() {
    skip();
    const start = i;
    while (i < src.length && /[0-9.]/.test(src[i])) i++;
    if (start === i) throw new Error('number expected');
    const raw = src.slice(start, i);
    if ((raw.match(/\./g) || []).length > 1) throw new Error('bad number');
    return parseFloat(raw);
  }
  function primary() {
    skip();
    if (peek() === '(') {
      i++;
      const v = expression();
      skip();
      if (peek() !== ')') throw new Error('missing )');
      i++;
      return v;
    }
    if (peek() === '-') { i++; return -primary(); }
    if (peek() === '+') { i++; return primary(); }
    return number();
  }
  function power() {
    const base = primary();
    skip();
    if (peek() === '^') { i++; const exp = power(); return Math.pow(base, exp); }
    return base;
  }
  function term() {
    let v = power();
    for (;;) {
      skip();
      const op = peek();
      if (op !== '*' && op !== '/' && op !== '%') break;
      i++;
      const rhs = power();
      if (op === '*') v *= rhs;
      else if (op === '/') { if (rhs === 0) throw new Error('divide by zero'); v /= rhs; }
      else v %= rhs;
    }
    return v;
  }
  function expression() {
    let v = term();
    for (;;) {
      skip();
      const op = peek();
      if (op !== '+' && op !== '-') break;
      i++;
      const rhs = term();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  }

  const result = expression();
  skip();
  if (i < src.length) throw new Error('unexpected ' + src[i]);
  if (!Number.isFinite(result)) throw new Error('not finite');
  return result;
}

const fmt = (n) => {
  if (!Number.isFinite(n)) return 'Error';
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e10) / 1e10);
};

export function mount({ body, api, os }) {
  let expr = '';
  let history = ls.get('calcHistory', []) || [];
  let justEvaluated = false;

  const screen = el('div', { class: 'calc__screen' },
    el('div', { class: 'calc__preview', 'aria-live': 'polite' }),
    el('div', { class: 'calc__main', text: '0' })
  );
  const preview = screen.querySelector('.calc__preview');
  const main = screen.querySelector('.calc__main');

  const historyBox = el('div', { class: 'calc__history', 'aria-label': 'History' });
  const keys = el('div', { class: 'calc__keys' });
  const wrap = el('div', { class: 'calcwrap' }, screen, keys, historyBox);
  body.append(wrap);

  const KEYS = [
    { t: 'C', act: 'clear' }, { t: '⌫', act: 'back' }, { t: '%', op: '%' }, { t: '÷', op: '/' },
    { t: '7' }, { t: '8' }, { t: '9' }, { t: '×', op: '*' },
    { t: '4' }, { t: '5' }, { t: '6' }, { t: '−', op: '-' },
    { t: '1' }, { t: '2' }, { t: '3' }, { t: '+', op: '+' },
    { t: '0' }, { t: '.' }, { t: '(' }, { t: ')' },
    { t: '^' }, { t: '±', act: 'sign' }, { t: '00' }, { t: '=', act: 'eq' },
  ];

  KEYS.forEach((k) => {
    const b = el('button', { type: 'button', text: k.t, 'aria-label': k.t === '=' ? 'Equals' : k.t });
    if (k.op) b.dataset.op = k.op;
    if (k.act) b.dataset.act = k.act;
    b.addEventListener('click', () => {
      if (k.act === 'clear') { expr = ''; justEvaluated = false; }
      else if (k.act === 'back') { expr = expr.slice(0, -1); justEvaluated = false; }
      else if (k.act === 'sign') {
        if (expr.startsWith('-')) expr = expr.slice(1);
        else expr = '-' + expr;
      } else if (k.act === 'eq') { commit(); return; }
      else if (k.op) {
        if (justEvaluated) justEvaluated = false;
        expr += k.op;
      } else {
        if (justEvaluated) { expr = ''; justEvaluated = false; }
        expr += k.t;
      }
      render();
    });
    keys.append(b);
  });

  function render() {
    const clean = expr.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
    main.textContent = clean || '0';
    if (!expr.trim()) { preview.textContent = ''; return; }
    try {
      const v = evaluate(expr);
      preview.textContent = '= ' + fmt(v);
    } catch { preview.textContent = ''; }
  }

  function commit() {
    if (!expr.trim()) return;
    try {
      const value = evaluate(expr);
      history.unshift({ expr, value, at: Date.now() });
      history = history.slice(0, 30);
      ls.set('calcHistory', history);
      expr = fmt(value);
      justEvaluated = true;
      renderHistory();
      render();
    } catch {
      toast('That expression is not valid yet', { type: 'warn' });
      preview.textContent = 'incomplete expression';
    }
  }

  function renderHistory() {
    historyBox.innerHTML = '';
    if (!history.length) {
      historyBox.append(el('p', { class: 'hint', text: 'Your calculations will appear here.' }));
      return;
    }
    history.slice(0, 12).forEach((h) => {
      const b = el('button', { type: 'button', title: 'Use this result' });
      b.textContent = `${h.expr.replace(/\*/g, '×').replace(/\//g, '÷')} = ${fmt(h.value)}`;
      b.addEventListener('click', () => { expr = fmt(h.value); justEvaluated = true; render(); });
      historyBox.append(b);
    });
  }

  function onKey(ev) {
    if (!api?.win.classList.contains('is-focused')) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const k = ev.key;
    if (/^[0-9.]$/.test(k)) {
      if (justEvaluated) { expr = ''; justEvaluated = false; }
      expr += k; render(); ev.preventDefault(); return;
    }
    if (['+', '-', '*', '/', '%', '^', '(', ')'].includes(k)) { expr += k; render(); ev.preventDefault(); return; }
    if (k === 'x') { expr += '*'; render(); ev.preventDefault(); return; }
    if (k === 'Enter' || k === '=') { commit(); ev.preventDefault(); return; }
    if (k === 'Backspace') { expr = expr.slice(0, -1); justEvaluated = false; render(); ev.preventDefault(); return; }
    if (k === 'Escape' || k.toLowerCase() === 'c') { expr = ''; justEvaluated = false; render(); ev.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  render(); renderHistory();

  return () => window.removeEventListener('keydown', onKey);
}
