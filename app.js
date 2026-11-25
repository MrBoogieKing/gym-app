'use strict';

/* =====================================================================
   Gym Log — a tiny offline-first workout tracker (no dependencies).
   All data lives in localStorage on the device.
   ===================================================================== */

const KEY = 'gymlog.v1';
const DAY = 86400000;

let _c = 0;
function uid() {
  return Date.now().toString(36) + (_c++).toString(36) + Math.random().toString(36).slice(2, 6);
}

const DEFAULT_EXERCISES = [
  'Жим лежачи', 'Жим гантелей лежачи', 'Жим на похилій лаві', 'Розведення гантелей лежачи',
  'Армійський жим', 'Жим гантелей сидячи', 'Розведення гантелей в сторони', 'Віджимання на брусах',
  'Французький жим', 'Розгинання рук на блоці', 'Підтягування', 'Тяга штанги в нахилі',
  'Тяга гантелі однією рукою', 'Тяга верхнього блоку', 'Тяга горизонтального блоку', 'Face pull',
  'Підйом штанги на біцепс', 'Молотки з гантелями', 'Присідання зі штангою', 'Фронтальні присідання',
  'Станова тяга', 'Румунська тяга', 'Жим ногами', 'Випади', 'Розгинання ніг', 'Згинання ніг',
  'Підйом на носки', 'Планка', 'Скручування',
];

const TEMPLATE = {
  name: 'Push / Pull / Legs',
  days: [
    ['Push', [['Жим лежачи', 4, 8], ['Жим на похилій лаві', 3, 10], ['Армійський жим', 3, 8], ['Розведення гантелей в сторони', 3, 12], ['Французький жим', 3, 10]]],
    ['Pull', [['Підтягування', 4, 8], ['Тяга штанги в нахилі', 4, 8], ['Тяга верхнього блоку', 3, 10], ['Face pull', 3, 15], ['Підйом штанги на біцепс', 3, 10]]],
    ['Legs', [['Присідання зі штангою', 4, 6], ['Румунська тяга', 3, 8], ['Жим ногами', 3, 10], ['Згинання ніг', 3, 12], ['Підйом на носки', 4, 15]]],
  ],
};

function defaults() {
  return {
    version: 1,
    exercises: DEFAULT_EXERCISES.map((name) => ({ id: uid(), name })),
    programs: [],
    workouts: [],
    active: null,
    settings: { rest: 90, step: 2.5, lastBackup: null },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const def = defaults();
      return { ...def, ...d, settings: { ...def.settings, ...(d.settings || {}) } };
    }
  } catch (e) { console.error(e); }
  return defaults();
}

let S = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('⚠️ Не вдалося зберегти дані'); }
}

/* ---------- Helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmtW = (n) => (n == null ? '' : String(Math.round(n * 100) / 100));
const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const exById = (id) => S.exercises.find((e) => e.id === id);
const exName = (id) => exById(id)?.name ?? 'Вправа';
const prog = (id) => S.programs.find((p) => p.id === id);

function plural(n, [one, few, many]) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function getOrCreateExercise(name) {
  name = name.trim();
  let e = S.exercises.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!e) { e = { id: uid(), name }; S.exercises.push(e); }
  return e;
}

function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function ago(ts) {
  const n = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  if (n <= 0) return 'сьогодні';
  if (n === 1) return 'вчора';
  return `${n} ${plural(n, ['день', 'дні', 'днів'])} тому`;
}
const fmtDate = (ts) => new Date(ts).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDateLong = (ts) => new Date(ts).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = (ts) => new Date(ts).toLocaleDateString('uk-UA', { day: 'numeric', month: 'numeric' });
function fmtDur(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
function fmtMin(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} год ${m % 60} хв` : `${m} хв`;
}
function fmtClock(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
const fmtVol = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')} т` : `${Math.round(v)} кг`);

/* ---------- History queries ---------- */
// Sessions of an exercise, newest first: [{ wk, sets }]
function sessionsFor(exId) {
  const out = [];
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const wk = S.workouts[i];
    for (const e of wk.exercises) if (e.exerciseId === exId && e.sets.length) out.push({ wk, sets: e.sets });
  }
  return out.sort((a, b) => b.wk.startedAt - a.wk.startedAt);
}
const lastSets = (exId) => sessionsFor(exId)[0]?.sets ?? null;

function histBest(exId) {
  let best = null;
  for (const wk of S.workouts) for (const e of wk.exercises) if (e.exerciseId === exId) {
    for (const s of e.sets) { const v = e1rm(s.w, s.r); if (best == null || v > best) best = v; }
  }
  return best;
}

function wStats(wk) {
  let sets = 0, vol = 0;
  for (const e of wk.exercises) for (const s of e.sets) { sets++; vol += s.w * s.r; }
  return { sets, vol };
}

/* ---------- Active workout ---------- */
function newActiveEx(exerciseId, plan) {
  const last = lastSets(exerciseId);
  const n = plan?.sets || last?.length || 3;
  return {
    exerciseId,
    plan: plan && plan.sets ? { sets: plan.sets, reps: plan.reps || null } : null,
    sets: Array.from({ length: n }, () => ({ w: '', r: '', done: false })),
  };
}

function startWorkout(pid, did) {
  const p = pid ? prog(pid) : null;
  const d = p ? p.days.find((x) => x.id === did) : null;
  S.active = {
    id: uid(),
    startedAt: Date.now(),
    programId: p?.id ?? null,
    dayId: d?.id ?? null,
    title: d ? d.name || 'Тренування' : 'Тренування',
    exercises: d ? d.items.map((it) => newActiveEx(it.exerciseId, it)) : [],
    restEnd: null,
  };
  save();
  go('#/');
  if (!d || !d.items.length) setTimeout(() => openPicker(addExToWorkout), 150);
}

// Suggested values for a set (shown as placeholders, used if the field is left empty).
function hint(ax, si) {
  const last = lastSets(ax.exerciseId);
  const lastS = last ? last[si] || last[last.length - 1] : null;
  const prev = si > 0 ? ax.sets[si - 1] : null;
  const prevW = prev ? num(prev.w) : null;
  const prevR = prev ? num(prev.r) : null;
  const w = prevW ?? lastS?.w ?? (prev ? hint(ax, si - 1).w : null);
  const r = ax.plan?.reps || prevR || lastS?.r || null;
  return { w, r };
}

function addExToWorkout(ex) {
  S.active.exercises.push(newActiveEx(ex.id, null));
  save(); render();
  setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
}

function startRest() {
  const sec = S.settings.rest;
  if (!sec) return;
  S.active.restEnd = Date.now() + sec * 1000;
  S.active.restBeeped = false;
}

function finishWorkout() {
  const a = S.active;
  const exercises = a.exercises
    .map((ax) => ({
      exerciseId: ax.exerciseId,
      sets: ax.sets.filter((s) => s.done).map((s) => {
        const o = { w: num(s.w) ?? 0, r: num(s.r) ?? 0 };
        if (s.pr) o.pr = true;
        return o;
      }),
    }))
    .filter((e) => e.sets.length);

  if (!exercises.length) {
    if (confirm('Жодного підходу не відмічено ✓. Скасувати тренування?')) { S.active = null; save(); render(); }
    return;
  }
  if (!confirm('Завершити тренування?')) return;
  const wk = { id: a.id, startedAt: a.startedAt, finishedAt: Date.now(), programId: a.programId, dayId: a.dayId, title: a.title, exercises };
  S.workouts.push(wk);
  S.active = null;
  save();
  go('#/history/' + wk.id);
  toast('💪 Тренування збережено');
}

/* ---------- Sound ---------- */
let actx = null;
function unlockAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { /* no audio */ }
}
function beep() {
  try { navigator.vibrate?.([200, 100, 200]); } catch (e) { /* ignore */ }
  if (!actx) return;
  const t = actx.currentTime;
  [0, 0.22, 0.44].forEach((d) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
    o.connect(g).connect(actx.destination);
    o.start(t + d); o.stop(t + d + 0.18);
  });
}

/* ---------- Icons ---------- */
const svg = (d) => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
const I = {
  dumbbell: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  chart: svg('<path d="M3 20h18M6 16v-4M11 16V7M16 16v-6M21 16V4" transform="translate(-1 0)"/>'),
  gear: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
};
const settingsBtn = `<a class="icon-btn" href="#/settings" aria-label="Налаштування">${I.gear}</a>`;

/* =====================================================================
   Views
   ===================================================================== */

function viewHome() {
  if (S.active) return viewWorkout();
  let body = '';

  if (S.workouts.length) {
    const week = S.workouts.filter((w) => w.startedAt >= Date.now() - 7 * DAY).length;
    const last = Math.max(...S.workouts.map((w) => w.startedAt));
    body += `<div class="stats">
      <div><b>${week}</b><span>за 7 днів</span></div>
      <div><b>${S.workouts.length}</b><span>всього</span></div>
      <div><b>${cap(ago(last))}</b><span>останнє</span></div>
    </div>`;
    const lb = S.settings.lastBackup;
    if (S.workouts.length >= 3 && (!lb || Date.now() - lb > 14 * DAY)) {
      body += `<a class="notice" href="#/settings">💾 ${lb ? 'Давно не було' : 'Ще немає'} резервної копії. Зроби її — це 2 секунди →</a>`;
    }
  }

  if (!S.programs.length) {
    body += `<div class="empty">
      <div class="big-ico">🏋️</div>
      <p><b>Почнімо!</b></p>
      <p class="small">Створи свою програму тренувань або візьми готовий приклад.</p>
    </div>
    <button class="btn primary wide" data-a="newProgram">Створити програму</button>
    <button class="btn wide" data-a="addTemplate">Приклад: Push / Pull / Legs</button>`;
  } else {
    for (const p of S.programs) {
      const lastOfProg = S.workouts.filter((w) => w.programId === p.id).sort((a, b) => b.startedAt - a.startedAt)[0];
      const lastIdx = lastOfProg ? p.days.findIndex((d) => d.id === lastOfProg.dayId) : -1;
      const nextId = p.days.length ? p.days[(lastIdx + 1) % p.days.length].id : null;
      body += `<h2 class="sec">${esc(p.name || 'Без назви')}</h2>`;
      for (const d of p.days) {
        const lastDay = S.workouts.filter((w) => w.dayId === d.id).sort((a, b) => b.startedAt - a.startedAt)[0];
        const isNext = d.id === nextId && p.days.length > 1;
        const n = d.items.length;
        body += `<button class="card day${isNext ? ' next' : ''}" data-a="start" data-pid="${p.id}" data-did="${d.id}">
          <div class="day-main">
            <div class="day-name">${esc(d.name || 'День')}${isNext ? '<span class="badge">Наступне</span>' : ''}</div>
            <div class="muted small">${n} ${plural(n, ['вправа', 'вправи', 'вправ'])} · ${lastDay ? 'було ' + ago(lastDay.startedAt) : 'ще не було'}</div>
            ${n ? `<div class="day-ex small">${d.items.map((it) => esc(exName(it.exerciseId))).join(' · ')}</div>` : ''}
          </div>
          <span class="play">${I.play}</span>
        </button>`;
      }
    }
  }
  body += `<button class="btn ghost wide" data-a="startEmpty">+ Тренування без програми</button>`;
  return { title: 'Тренування', actions: settingsBtn, body };
}

function viewWorkout() {
  const a = S.active;
  const cards = a.exercises.map((ax, ei) => exCard(ax, ei)).join('');
  const empty = a.exercises.length ? '' : `<div class="empty"><p>Додай першу вправу</p></div>`;
  return {
    title: esc(a.title),
    sub: `⏱ <span id="elapsed">${fmtDur(Date.now() - a.startedAt)}</span>`,
    actions: `<button class="btn primary sm" data-a="finish">Завершити</button>`,
    body: empty + cards
      + `<button class="btn ghost wide" data-a="addEx">+ Додати вправу</button>`
      + `<button class="btn danger-ghost wide" data-a="cancelWorkout">Скасувати тренування</button>`,
  };
}

function exCard(ax, ei) {
  const last = lastSets(ax.exerciseId);
  const done = ax.sets.filter((s) => s.done).length;
  const meta = [ax.plan ? `план ${ax.plan.sets} × ${ax.plan.reps || '—'}` : '', `${done}/${ax.sets.length} підх.`].filter(Boolean).join(' · ');
  const lastTxt = last ? last.map((s) => `${fmtW(s.w)}×${s.r}`).join(' · ') : 'ще не робив — вперше 🎉';
  let tip = '';
  if (last && ax.plan?.reps && last.length >= ax.plan.sets && last.every((s) => s.r >= ax.plan.reps) && last[0].w > 0) {
    tip = `<div class="tip">💪 Минулого разу план виконано — спробуй +${fmtW(S.settings.step)} кг</div>`;
  }
  return `<section class="card">
    <div class="ex-h">
      <div><div class="ex-name">${esc(exName(ax.exerciseId))}</div><div class="muted small">${meta}</div></div>
      <button class="icon-btn" data-a="removeEx" data-ei="${ei}" aria-label="Прибрати вправу">✕</button>
    </div>
    <div class="last small"><span class="muted">Минулого разу:</span> ${lastTxt}</div>
    ${tip}
    <div class="sets-head small muted"><span>#</span><span>кг</span><span></span><span>повт.</span><span></span></div>
    ${ax.sets.map((s, si) => setRow(ax, ei, s, si)).join('')}
    <div class="ex-f">
      <button class="btn sm" data-a="removeSet" data-ei="${ei}" ${ax.sets.length ? '' : 'disabled'}>− підхід</button>
      <button class="btn sm" data-a="addSet" data-ei="${ei}">+ підхід</button>
    </div>
  </section>`;
}

function setRow(ax, ei, s, si) {
  const h = hint(ax, si);
  const at = `data-ei="${ei}" data-si="${si}"`;
  return `<div class="set${s.done ? ' done' : ''}">
    <span class="sn">${s.pr ? '🏆' : si + 1}</span>
    <div class="wgrp">
      <button class="step" data-a="wStep" ${at} data-d="-1" aria-label="Менше ваги">−</button>
      <input class="in" data-f="w" ${at} inputmode="decimal" autocomplete="off" value="${esc(s.w)}" placeholder="${h.w == null ? '' : fmtW(h.w)}">
      <button class="step" data-a="wStep" ${at} data-d="1" aria-label="Більше ваги">+</button>
    </div>
    <span class="x">×</span>
    <input class="in" data-f="r" ${at} inputmode="numeric" autocomplete="off" value="${esc(s.r)}" placeholder="${h.r ?? ''}">
    <button class="chk" data-a="setDone" ${at} aria-label="Підхід виконано">✓</button>
  </div>`;
}

function viewPrograms() {
  let body = S.programs.map((p) => `<a class="card row" href="#/program/${p.id}">
      <div><div class="ex-name">${esc(p.name || 'Без назви')}</div>
      <div class="muted small">${p.days.length} ${plural(p.days.length, ['день', 'дні', 'днів'])} · ${p.days.map((d) => esc(d.name)).join(' · ')}</div></div>
      <span class="go">›</span>
    </a>`).join('');
  if (!S.programs.length) body = `<div class="empty"><div class="big-ico">📋</div><p>Ще немає програм</p></div>`;
  body += `<button class="btn primary wide" data-a="newProgram">+ Нова програма</button>`;
  body += `<button class="btn ghost wide" data-a="addTemplate">+ Приклад: Push / Pull / Legs</button>`;
  return { title: 'Програми', actions: settingsBtn, body };
}

function viewProgram(p) {
  const days = p.days.map((d, di) => {
    const at = `data-pid="${p.id}" data-di="${di}"`;
    const items = d.items.map((it, ii) => `<div class="item">
        <div class="item-n">${esc(exName(it.exerciseId))}</div>
        <input class="in num" data-f="isets" ${at} data-ii="${ii}" inputmode="numeric" value="${it.sets ?? ''}" placeholder="підх." aria-label="Підходи">
        <span class="x">×</span>
        <input class="in num" data-f="ireps" ${at} data-ii="${ii}" inputmode="numeric" value="${it.reps ?? ''}" placeholder="повт." aria-label="Повтори">
        <div class="item-a">
          <button class="icon-btn sm" data-a="moveItem" ${at} data-ii="${ii}" data-d="-1" ${ii === 0 ? 'disabled' : ''} aria-label="Вгору">↑</button>
          <button class="icon-btn sm" data-a="moveItem" ${at} data-ii="${ii}" data-d="1" ${ii === d.items.length - 1 ? 'disabled' : ''} aria-label="Вниз">↓</button>
          <button class="icon-btn sm" data-a="delItem" ${at} data-ii="${ii}" aria-label="Видалити">✕</button>
        </div>
      </div>`).join('');
    return `<section class="card">
      <div class="day-h">
        <input class="in" data-f="dname" ${at} value="${esc(d.name)}" placeholder="Назва дня, напр. Груди">
        <button class="icon-btn" data-a="delDay" ${at} aria-label="Видалити день">✕</button>
      </div>
      ${d.items.length ? '<div class="muted small">підходи × повтори</div>' : '<p class="muted small">Додай вправи в цей день</p>'}
      ${items}
      <button class="btn sm" data-a="addItem" ${at}>+ вправа</button>
    </section>`;
  }).join('');
  return {
    title: 'Програма',
    back: '#/programs',
    body: `<input class="in big" data-f="pname" data-pid="${p.id}" value="${esc(p.name)}" placeholder="Назва програми">
      ${days}
      <button class="btn ghost wide" data-a="addDay" data-pid="${p.id}">+ Додати день</button>
      <button class="btn danger-ghost wide" data-a="delProgram" data-pid="${p.id}">Видалити програму</button>`,
  };
}

function viewHistory() {
  if (!S.workouts.length) {
    return { title: 'Історія', actions: settingsBtn, body: `<div class="empty"><div class="big-ico">🗓️</div><p>Тут з’являться твої тренування</p></div>` };
  }
  const list = [...S.workouts].sort((a, b) => b.startedAt - a.startedAt);
  let body = '', month = '';
  for (const wk of list) {
    const m = cap(new Date(wk.startedAt).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' }));
    if (m !== month) { month = m; body += `<h2 class="sec">${esc(m)}</h2>`; }
    const st = wStats(wk);
    body += `<a class="card row" href="#/history/${wk.id}">
      <div><div class="ex-name">${esc(wk.title)}</div>
      <div class="muted small">${fmtDate(wk.startedAt)} · ${fmtMin(wk.finishedAt - wk.startedAt)} · ${st.sets} підх. · ${fmtVol(st.vol)}</div></div>
      <span class="go">›</span>
    </a>`;
  }
  return { title: 'Історія', actions: settingsBtn, body };
}

function viewWorkoutDetail(wk) {
  const st = wStats(wk);
  const body = `<div class="stats">
      <div><b>${fmtMin(wk.finishedAt - wk.startedAt)}</b><span>тривалість</span></div>
      <div><b>${st.sets}</b><span>підходів</span></div>
      <div><b>${fmtVol(st.vol)}</b><span>об’єм</span></div>
    </div>`
    + wk.exercises.map((e) => `<section class="card">
      <a class="ex-name link" href="#/progress/${e.exerciseId}">${esc(exName(e.exerciseId))} ›</a>
      <div class="setlist">${e.sets.map((s, i) => `<div><span class="muted">${i + 1}.</span> ${fmtW(s.w)} кг × ${s.r}${s.pr ? ' 🏆' : ''}</div>`).join('')}</div>
    </section>`).join('')
    + `<button class="btn danger-ghost wide" data-a="delWorkout" data-id="${wk.id}">Видалити тренування</button>`;
  return { title: esc(wk.title), sub: cap(fmtDateLong(wk.startedAt)), back: '#/history', body };
}

function viewProgress() {
  const rows = S.exercises.map((e) => {
    const ss = sessionsFor(e.id);
    if (!ss.length) return null;
    let best = null;
    for (const x of ss) for (const s of x.sets) if (!best || s.w > best.w || (s.w === best.w && s.r > best.r)) best = s;
    return { e, n: ss.length, last: ss[0].wk.startedAt, best };
  }).filter(Boolean).sort((a, b) => b.last - a.last);

  if (!rows.length) {
    return { title: 'Прогрес', actions: settingsBtn, body: `<div class="empty"><div class="big-ico">📈</div><p>Після першого тренування тут буде твій прогрес по кожній вправі</p></div>` };
  }
  const body = rows.map((r) => `<a class="card row" href="#/progress/${r.e.id}">
      <div><div class="ex-name">${esc(r.e.name)}</div>
      <div class="muted small">Рекорд ${fmtW(r.best.w)} кг × ${r.best.r} · ${r.n} ${plural(r.n, ['тренування', 'тренування', 'тренувань'])} · ${ago(r.last)}</div></div>
      <span class="go">›</span>
    </a>`).join('');
  return { title: 'Прогрес', actions: settingsBtn, body };
}

let metric = 'e1rm';
const METRICS = {
  e1rm: { label: '1ПМ', unit: 'кг', val: (sets) => Math.max(...sets.map((s) => e1rm(s.w, s.r))) },
  max: { label: 'Макс. вага', unit: 'кг', val: (sets) => Math.max(...sets.map((s) => s.w)) },
  vol: { label: 'Об’єм', unit: 'кг', val: (sets) => sets.reduce((a, s) => a + s.w * s.r, 0) },
};

function viewProgressEx(e) {
  const ss = sessionsFor(e.id);
  const M = METRICS[metric];
  const pts = [...ss].reverse().map((x) => ({ t: x.wk.startedAt, y: M.val(x.sets) }));

  let heavy = null, strong = null, reps = null, bestVol = 0;
  for (const x of ss) {
    for (const s of x.sets) {
      if (!heavy || s.w > heavy.w || (s.w === heavy.w && s.r > heavy.r)) heavy = s;
      if (!strong || e1rm(s.w, s.r) > e1rm(strong.w, strong.r)) strong = s;
      if (!reps || s.r > reps.r || (s.r === reps.r && s.w > reps.w)) reps = s;
    }
    bestVol = Math.max(bestVol, METRICS.vol.val(x.sets));
  }

  let body = `<div class="seg">${Object.entries(METRICS).map(([k, m]) => `<button class="${k === metric ? 'on' : ''}" data-a="metric" data-m="${k}">${m.label}</button>`).join('')}</div>`;
  body += `<section class="card">${chartSvg(pts)}
    ${metric === 'e1rm' ? '<p class="muted small" style="margin-top:6px">1ПМ — розрахунковий максимум на 1 повтор (формула Еплі). Найкраще показує силу, навіть коли змінюєш кількість повторів.</p>' : ''}
  </section>`;
  if (ss.length) {
    body += `<div class="recs">
      <div><b>${fmtW(heavy.w)} × ${heavy.r}</b><span>найбільша вага</span></div>
      <div><b>${fmtW(Math.round(e1rm(strong.w, strong.r) * 10) / 10)} кг</b><span>1ПМ (${fmtW(strong.w)} × ${strong.r})</span></div>
      <div><b>${reps.r} повт.</b><span>найбільше повторів (${fmtW(reps.w)} кг)</span></div>
      <div><b>${fmtVol(bestVol)}</b><span>найбільший об’єм</span></div>
    </div>`;
    body += `<h2 class="sec">Останні тренування</h2><section class="card">${ss.slice(0, 15).map((x) => `<a class="hist-row" href="#/history/${x.wk.id}">
        <span class="muted">${fmtDate(x.wk.startedAt)}</span>
        <span class="r">${x.sets.map((s) => `${fmtW(s.w)}×${s.r}`).join(' · ')}</span>
      </a>`).join('')}</section>`;
  } else {
    body += `<div class="empty"><p>Цю вправу ще не виконували</p></div>`;
  }
  return { title: esc(e.name), back: '#/progress', body };
}

function chartSvg(pts) {
  if (pts.length < 2) return `<div class="chart-empty muted small">Графік з’явиться після 2+ тренувань з цією вправою</div>`;
  const W = 340, H = 180, pl = 38, pr = 10, pt = 14, pb = 24;
  let min = Math.min(...pts.map((p) => p.y)), max = Math.max(...pts.map((p) => p.y));
  if (max === min) { max += 1; min -= 1; }
  const pad = (max - min) * 0.12; min = Math.max(0, min - pad); max += pad;
  const x = (i) => pl + (i * (W - pl - pr)) / (pts.length - 1);
  const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const area = `${line}L${x(pts.length - 1).toFixed(1)},${H - pb}L${x(0).toFixed(1)},${H - pb}Z`;
  const grid = [0, 0.5, 1].map((f) => {
    const v = min + (max - min) * f, yy = y(v).toFixed(1);
    return `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" stroke="#2c3039" stroke-dasharray="3 4"/><text x="${pl - 6}" y="${(+yy + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`;
  }).join('');
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 3}" fill="${i === pts.length - 1 ? '#ff6b35' : '#17191f'}" stroke="#ff6b35" stroke-width="2"/>`).join('');
  const lastV = pts[pts.length - 1].y;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
    <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b35" stop-opacity=".35"/><stop offset="1" stop-color="#ff6b35" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#ga)"/>
    <path d="${line}" fill="none" stroke="#ff6b35" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${pl}" y="${H - 6}">${fmtShort(pts[0].t)}</text>
    <text x="${W - pr}" y="${H - 6}" text-anchor="end">${fmtShort(pts[pts.length - 1].t)} · ${fmtW(Math.round(lastV * 10) / 10)} кг</text>
  </svg>`;
}

function viewSettings() {
  const lb = S.settings.lastBackup;
  const body = `<section class="card">
      <label class="field"><span>Відпочинок між підходами, сек</span><input class="in num" data-f="rest" inputmode="numeric" value="${S.settings.rest}"></label>
      <label class="field"><span>Крок ваги для кнопок − / +, кг</span><input class="in num" data-f="step" inputmode="decimal" value="${fmtW(S.settings.step)}"></label>
      <p class="muted small">Таймер відпочинку стартує сам після кожного ✓. Постав 0, щоб вимкнути.</p>
    </section>
    <section class="card">
      <div class="ex-name">Резервна копія</div>
      <p class="muted small" style="margin-top:4px">Усі дані зберігаються тільки на цьому телефоні. Зберігай копію у «Файли» / iCloud Drive або надсилай собі в Telegram.<br>${lb ? 'Остання копія: ' + fmtDate(lb) + ' (' + ago(lb) + ')' : 'Копій ще не було.'}</p>
      <button class="btn primary wide" data-a="export">Зберегти копію</button>
      <button class="btn wide" data-a="import">Відновити з файлу</button>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </section>
    <section class="card">
      <div class="muted small">Тренувань: ${S.workouts.length} · Програм: ${S.programs.length} · Вправ у бібліотеці: ${S.exercises.length}</div>
      <button class="btn danger-ghost wide" data-a="resetAll" style="margin-top:8px">Видалити всі дані</button>
    </section>
    <p class="muted small center">Gym Log · v1.0</p>`;
  return { title: 'Налаштування', back: '#/', body };
}

/* =====================================================================
   Router & render
   ===================================================================== */

function view() {
  const [a, b] = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  switch (a) {
    case undefined: return { tab: '/', ...viewHome() };
    case 'programs': return { tab: '/programs', ...viewPrograms() };
    case 'program': { const p = prog(b); if (p) return { tab: '/programs', ...viewProgram(p) }; break; }
    case 'history': {
      if (!b) return { tab: '/history', ...viewHistory() };
      const wk = S.workouts.find((w) => w.id === b);
      if (wk) return { tab: '/history', ...viewWorkoutDetail(wk) };
      break;
    }
    case 'progress': {
      if (!b) return { tab: '/progress', ...viewProgress() };
      const e = exById(b);
      if (e) return { tab: '/progress', ...viewProgressEx(e) };
      break;
    }
    case 'settings': return { tab: '', ...viewSettings() };
  }
  history.replaceState(null, '', '#/');
  return { tab: '/', ...viewHome() };
}

function navHtml(tab) {
  const tabs = [['/', 'Тренування', I.dumbbell], ['/programs', 'Програми', I.list], ['/history', 'Історія', I.clock], ['/progress', 'Прогрес', I.chart]];
  return `<nav class="nav">${tabs.map(([h, l, i]) => `<a href="#${h}" class="${tab === h ? 'on' : ''}">${i}<span>${l}</span></a>`).join('')}</nav>`;
}

function restBarHtml() {
  const a = S.active;
  if (!a || !a.restEnd) return '';
  const rem = a.restEnd - Date.now();
  if (rem < -5000) return '';
  return `<div id="rest" class="rest${rem <= 0 ? ' over' : ''}">
    <button data-a="restAdj" data-d="-15">−15</button>
    <div class="rest-t"><small>Відпочинок</small><b id="restT">${rem > 0 ? fmtClock(rem) : 'Час!'}</b></div>
    <button data-a="restAdj" data-d="15">+15</button>
    <button data-a="restSkip" aria-label="Закрити таймер">✕</button>
  </div>`;
}

function render() {
  const v = view();
  const banner = S.active && v.tab !== '/'
    ? `<a class="active-banner" href="#/"><span>● Тренування триває</span><span id="bannerT">${fmtDur(Date.now() - S.active.startedAt)}</span></a>`
    : '';
  $('#app').innerHTML = `
    <header class="top">
      ${v.back ? `<a class="back" href="${v.back}" aria-label="Назад">‹</a>` : ''}
      <div class="top-t"><h1>${v.title}</h1>${v.sub ? `<div class="sub">${v.sub}</div>` : ''}</div>
      <div class="top-a">${v.actions || ''}</div>
    </header>
    <main>${v.body}</main>
    ${restBarHtml()}
    ${banner}
    ${navHtml(v.tab)}`;
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

/* ---------- Ticker: elapsed time & rest timer ---------- */
function tick() {
  const a = S.active;
  if (!a) return;
  const el = $('#elapsed') || $('#bannerT');
  if (el) el.textContent = fmtDur(Date.now() - a.startedAt);
  if (!a.restEnd) return;
  const rem = a.restEnd - Date.now();
  if (rem <= 0 && !a.restBeeped) {
    a.restBeeped = true; save(); beep();
    $('#rest')?.classList.add('over');
  }
  if (rem < -5000) { a.restEnd = null; save(); $('#rest')?.remove(); return; }
  const t = $('#restT');
  if (t) t.textContent = rem > 0 ? fmtClock(rem) : 'Час!';
}
setInterval(tick, 250);

/* ---------- Exercise picker ---------- */
let picker = null;
function openPicker(cb) {
  picker = { cb, q: '' };
  const el = document.createElement('div');
  el.id = 'picker';
  el.className = 'modal';
  el.innerHTML = `<div class="sheet">
    <div class="sheet-h">
      <input id="pq" class="in" data-f="pq" placeholder="Пошук або нова вправа" autocomplete="off" enterkeyhint="done">
      <button class="btn" data-a="pickClose">Скасувати</button>
    </div>
    <div id="plist"></div>
  </div>`;
  document.body.appendChild(el);
  renderPickerList();
  $('#pq').focus();
}
function closePicker() { picker = null; $('#picker')?.remove(); }
function renderPickerList() {
  const q = picker.q.trim();
  const ql = q.toLowerCase();
  const list = S.exercises.filter((e) => e.name.toLowerCase().includes(ql)).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  const exact = S.exercises.some((e) => e.name.toLowerCase() === ql);
  $('#plist').innerHTML = (q && !exact ? `<button class="pick new" data-a="pickNew">+ Створити «${esc(q)}»</button>` : '')
    + list.map((e) => `<button class="pick" data-a="pick" data-id="${e.id}">${esc(e.name)}</button>`).join('')
    + (!list.length && !q ? '<p class="muted small">Почни вводити назву вправи</p>' : '');
}
function pickDone(ex) { const cb = picker.cb; closePicker(); cb(ex); }

/* ---------- Backup ---------- */
async function exportData() {
  S.settings.lastBackup = Date.now();
  save();
  const json = JSON.stringify(S);
  const name = `gym-log-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Gym Log — резервна копія' });
      render(); toast('✅ Копію збережено');
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') { render(); return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  render(); toast('✅ Копію збережено');
}

async function importData(file) {
  try {
    const d = JSON.parse(await file.text());
    if (!d || !Array.isArray(d.workouts) || !Array.isArray(d.programs) || !Array.isArray(d.exercises)) throw new Error('bad');
    if (!confirm(`Відновити копію? (${d.workouts.length} тренувань, ${d.programs.length} програм)\nПоточні дані на телефоні буде замінено.`)) return;
    const def = defaults();
    S = { ...def, ...d, settings: { ...def.settings, ...(d.settings || {}) } };
    save(); go('#/'); toast('✅ Дані відновлено');
  } catch (e) {
    toast('⚠️ Це не схоже на файл копії Gym Log');
  }
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* =====================================================================
   Actions (event delegation)
   ===================================================================== */

const A = {
  // --- home / programs
  start: (d) => { unlockAudio(); startWorkout(d.pid, d.did); },
  startEmpty: () => { unlockAudio(); startWorkout(null, null); },
  addTemplate: () => {
    S.programs.push({
      id: uid(),
      name: TEMPLATE.name,
      days: TEMPLATE.days.map(([name, items]) => ({
        id: uid(), name,
        items: items.map(([n, sets, reps]) => ({ exerciseId: getOrCreateExercise(n).id, sets, reps })),
      })),
    });
    save(); render(); toast('✅ Програму додано — можеш змінити її під себе');
  },
  newProgram: () => {
    const p = { id: uid(), name: '', days: [{ id: uid(), name: 'День 1', items: [] }] };
    S.programs.push(p); save(); go('#/program/' + p.id);
    setTimeout(() => $('[data-f="pname"]')?.focus(), 50);
  },
  addDay: (d) => {
    const p = prog(d.pid);
    p.days.push({ id: uid(), name: `День ${p.days.length + 1}`, items: [] });
    save(); render();
  },
  delDay: (d) => {
    const p = prog(d.pid), day = p.days[+d.di];
    if (day.items.length && !confirm(`Видалити день «${day.name}»?`)) return;
    p.days.splice(+d.di, 1); save(); render();
  },
  addItem: (d) => openPicker((ex) => {
    prog(d.pid).days[+d.di].items.push({ exerciseId: ex.id, sets: 3, reps: 10 });
    save(); render();
  }),
  delItem: (d) => { prog(d.pid).days[+d.di].items.splice(+d.ii, 1); save(); render(); },
  moveItem: (d) => {
    const items = prog(d.pid).days[+d.di].items, i = +d.ii, j = i + +d.d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    save(); render();
  },
  delProgram: (d) => {
    const p = prog(d.pid);
    if (!confirm(`Видалити програму «${p.name || 'Без назви'}»?\nІсторія тренувань залишиться.`)) return;
    S.programs = S.programs.filter((x) => x.id !== p.id);
    save(); go('#/programs');
  },

  // --- active workout
  setDone: (d) => {
    unlockAudio();
    const ax = S.active.exercises[+d.ei], s = ax.sets[+d.si];
    if (s.done) { s.done = false; s.pr = false; save(); render(); return; }
    const h = hint(ax, +d.si);
    const r = num(s.r) ?? h.r;
    const w = num(s.w) ?? h.w ?? 0;
    if (!r || r <= 0) {
      toast('Введи кількість повторів');
      $(`[data-f="r"][data-ei="${d.ei}"][data-si="${d.si}"]`)?.focus();
      return;
    }
    s.w = fmtW(w); s.r = String(r); s.done = true; s.pr = false;
    const hb = histBest(ax.exerciseId);
    const v = e1rm(w, r);
    const todayBest = Math.max(-1, ...ax.sets.filter((x) => x !== s && x.done).map((x) => e1rm(num(x.w) ?? 0, num(x.r) ?? 0)));
    if (hb != null && w > 0 && v > hb + 1e-9 && v > todayBest) { s.pr = true; toast('🏆 Новий рекорд!'); }
    startRest();
    save(); render();
  },
  wStep: (d) => {
    const ax = S.active.exercises[+d.ei], s = ax.sets[+d.si];
    const base = num(s.w) ?? hint(ax, +d.si).w ?? 0;
    s.w = fmtW(Math.max(0, Math.round((base + +d.d * S.settings.step) * 100) / 100));
    save(); render();
  },
  addSet: (d) => { S.active.exercises[+d.ei].sets.push({ w: '', r: '', done: false }); save(); render(); },
  removeSet: (d) => {
    const sets = S.active.exercises[+d.ei].sets;
    if (sets[sets.length - 1]?.done && !confirm('Останній підхід уже виконано. Видалити його?')) return;
    sets.pop(); save(); render();
  },
  removeEx: (d) => {
    const ax = S.active.exercises[+d.ei];
    if (ax.sets.some((s) => s.done) && !confirm(`Прибрати «${exName(ax.exerciseId)}» з тренування?`)) return;
    S.active.exercises.splice(+d.ei, 1); save(); render();
  },
  addEx: () => openPicker(addExToWorkout),
  finish: () => finishWorkout(),
  cancelWorkout: () => {
    if (!confirm('Скасувати тренування? Його дані не збережуться.')) return;
    S.active = null; save(); render();
  },
  restAdj: (d) => {
    const a = S.active;
    a.restEnd = Math.max(Date.now() + 1000, a.restEnd + +d.d * 1000);
    a.restBeeped = false;
    $('#rest')?.classList.remove('over');
    save(); tick();
  },
  restSkip: () => { S.active.restEnd = null; save(); $('#rest')?.remove(); },

  // --- history / progress
  delWorkout: (d) => {
    if (!confirm('Видалити це тренування назавжди?')) return;
    S.workouts = S.workouts.filter((w) => w.id !== d.id);
    save(); go('#/history');
  },
  metric: (d) => { metric = d.m; render(); },

  // --- picker
  pick: (d) => pickDone(exById(d.id)),
  pickNew: () => { const ex = getOrCreateExercise(picker.q); save(); pickDone(ex); },
  pickClose: () => closePicker(),

  // --- settings
  export: () => exportData(),
  import: () => $('#importFile').click(),
  resetAll: () => {
    if (!confirm('Видалити ВСІ дані: програми, історію, рекорди?\nЦе не можна скасувати.')) return;
    S = defaults(); save(); go('#/'); toast('Дані видалено');
  },
};

document.addEventListener('click', (e) => {
  if (e.target.id === 'picker') { closePicker(); return; }
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const fn = A[b.dataset.a];
  if (fn) { e.preventDefault(); fn(b.dataset, b); }
});

document.addEventListener('input', (e) => {
  const t = e.target, d = t.dataset, f = d.f;
  if (!f) return;
  const v = t.value;
  switch (f) {
    case 'w': case 'r': {
      const s = S.active?.exercises[+d.ei]?.sets[+d.si];
      if (s) s[f] = v;
      break;
    }
    case 'pname': prog(d.pid).name = v; break;
    case 'dname': prog(d.pid).days[+d.di].name = v; break;
    case 'isets': case 'ireps': {
      const it = prog(d.pid).days[+d.di].items[+d.ii];
      const n = parseInt(v, 10);
      it[f === 'isets' ? 'sets' : 'reps'] = Number.isFinite(n) && n > 0 ? n : null;
      break;
    }
    case 'rest': { const n = parseInt(v, 10); if (Number.isFinite(n) && n >= 0) S.settings.rest = Math.min(n, 900); break; }
    case 'step': { const n = num(v); if (n > 0) S.settings.step = n; break; }
    case 'pq': picker.q = v; renderPickerList(); return;
  }
  save();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'pq' && picker) {
    e.preventDefault();
    const first = $('#plist .pick');
    if (first) first.click();
  }
  if (e.key === 'Escape' && picker) closePicker();
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'importFile' && e.target.files[0]) importData(e.target.files[0]);
});

window.addEventListener('hashchange', () => { closePicker(); render(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); tick(); } });

/* ---------- Boot ---------- */
render();
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
