'use strict';

/* =====================================================================
   Gym Log — offline-first workout & body tracker. No dependencies.
   Data   → localStorage (one JSON object, see defaults()).
   Photos → IndexedDB (too big for localStorage).
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

// Body measurements: [key, label, unit]
const BODY_FIELDS = [
  ['weight', 'Вага', 'кг'], ['fat', 'Жир', '%'], ['chest', 'Груди', 'см'], ['waist', 'Талія', 'см'],
  ['hips', 'Сідниці', 'см'], ['arm', 'Біцепс', 'см'], ['thigh', 'Стегно', 'см'], ['neck', 'Шия', 'см'],
];

function defaults() {
  return {
    version: 1,
    exercises: DEFAULT_EXERCISES.map((name) => ({ id: uid(), name })),
    programs: [],
    workouts: [],
    body: [],
    marks: {},       // 'YYYY-MM-DD' → { t: 'plan'|'done'|'rest', pid, did, note }
    active: null,
    settings: { rest: 90, step: 2.5, weekGoal: 3, lastBackup: null },
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
const round1 = (n) => Math.round(n * 10) / 10;
const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const exById = (id) => S.exercises.find((e) => e.id === id);
const exName = (id) => exById(id)?.name ?? 'Вправа';
const prog = (id) => S.programs.find((p) => p.id === id);
function findDay(pid, did) {
  const p = prog(pid);
  const d = p?.days.find((x) => x.id === did);
  return d ? { p, d } : null;
}
const allDays = () => S.programs.flatMap((p) => p.days.map((d) => ({ p, d })));

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

const WD = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const dkey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const keyToTs = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function weekStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
function ago(ts) {
  const n = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  if (n <= 0) return 'сьогодні';
  if (n === 1) return 'вчора';
  return `${n} ${plural(n, ['день', 'дні', 'днів'])} тому`;
}
const fmtDate = (ts) => new Date(ts).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDateLong = (ts) => new Date(ts).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = (ts) => new Date(ts).toLocaleDateString('uk-UA', { day: 'numeric', month: 'numeric' });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
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

/* ---------- Photo store (IndexedDB) ---------- */
const photos = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('gymlog', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction('photos', mode);
      const req = fn(tx.objectStore('photos'));
      tx.oncomplete = () => res(req ? req.result : undefined);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  };
  const cache = new Map();
  return {
    async get(id) {
      if (cache.has(id)) return cache.get(id);
      const v = await run('readonly', (s) => s.get(id));
      if (v) cache.set(id, v);
      return v;
    },
    async put(id, v) { cache.set(id, v); await run('readwrite', (s) => s.put(v, id)); },
    async del(id) { cache.delete(id); await run('readwrite', (s) => s.delete(id)); },
    keys: () => run('readonly', (s) => s.getAllKeys()),
  };
})();

async function hydratePhotos(root = document) {
  for (const img of root.querySelectorAll('img[data-photo]:not([src])')) {
    try { const v = await photos.get(img.dataset.photo); if (v) img.src = v; } catch (e) { /* ignore */ }
  }
}

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
// Downscale to max 1280px JPEG so photos stay small (~150–300 KB).
async function compressImage(file, max = 1280, q = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- History queries ---------- */
// Sessions of an exercise, newest first: [{ wk, sets }]
function sessionsFor(exId) {
  const out = [];
  for (const wk of S.workouts) for (const e of wk.exercises) if (e.exerciseId === exId && e.sets.length) out.push({ wk, sets: e.sets });
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

function workoutsByDay() {
  const m = {};
  for (const w of S.workouts) (m[dkey(w.startedAt)] ||= []).push(w);
  return m;
}

function weekStreak() {
  const weeks = new Set(S.workouts.map((w) => weekStart(w.startedAt)));
  for (const [k, m] of Object.entries(S.marks)) if (m.t === 'done') weeks.add(weekStart(keyToTs(k)));
  let w = weekStart(Date.now());
  if (!weeks.has(w)) w = weekStart(w - 1);
  let n = 0;
  while (weeks.has(w)) { n++; w = weekStart(w - 1); }
  return n;
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

// dateKey: log the workout for another (past) day.
function startWorkout(pid, did, dateKey = null) {
  if (S.active) { toast('Спочатку заверши поточне тренування'); go('#/'); return; }
  const fd = pid && did ? findDay(pid, did) : null;
  const d = fd?.d;
  S.active = {
    id: uid(),
    startedAt: Date.now(),
    programId: fd?.p.id ?? null,
    dayId: d?.id ?? null,
    title: d?.name || 'Тренування',
    exercises: d ? d.items.map((it) => newActiveEx(it.exerciseId, it)) : [],
    restEnd: null,
    dateKey: dateKey && dateKey !== dkey(Date.now()) ? dateKey : null,
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

async function finishWorkout() {
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
    if (await ask('Жодного підходу не відмічено ✓.\nВийти без збереження?', { ok: 'Вийти', danger: true })) {
      S.active = null; save(); render();
    }
    return;
  }
  if (!await ask('Завершити й зберегти тренування?', { ok: 'Завершити' })) return;
  let startedAt = a.startedAt, finishedAt = Date.now();
  if (a.dateKey) { // backdated: keep duration, move to that day 18:00
    const dur = finishedAt - startedAt;
    startedAt = keyToTs(a.dateKey) + 18 * 3600e3;
    finishedAt = startedAt + dur;
  }
  const wk = { id: a.id, startedAt, finishedAt, programId: a.programId, dayId: a.dayId, title: a.title, exercises };
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
  cal: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  chart: svg('<path d="M4 19l5-6 4 3 7-9"/><path d="M15 7h5v5"/>'),
  body: svg('<circle cx="12" cy="4.8" r="2.3"/><path d="M5 9.5h14M12 9.5v5.5M12 15l-3.2 6M12 15l3.2 6"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
  gear: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  camera: svg('<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
};
const settingsBtn = `<a class="icon-btn" href="#/settings" aria-label="Налаштування">${I.gear}</a>`;

function ring(v, max) {
  const r = 26, c = 2 * Math.PI * r, p = Math.min(1, max ? v / max : 0);
  return `<div class="ring${p >= 1 ? ' full' : ''}" aria-label="${v} з ${max} тренувань цього тижня">
    <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" class="ring-bg"/>${p > 0 ? `<circle cx="32" cy="32" r="${r}" class="ring-fg" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/>` : ''}</svg>
    <div class="ring-t"><b>${v}</b><span>з ${max}</span></div>
  </div>`;
}

/* =====================================================================
   Views
   ===================================================================== */

function viewHome() {
  if (S.active) return viewWorkout();
  const now = Date.now(), todayK = dkey(now);
  const byDay = workoutsByDay();
  const tm = S.marks[todayK];
  const doneToday = byDay[todayK];
  const planned = tm?.t === 'plan' && tm.did ? findDay(tm.pid, tm.did) : null;

  // This week
  const ws = weekStart(now);
  const weekDays = new Set();
  for (const w of S.workouts) if (w.startedAt >= ws && w.startedAt < ws + 7 * DAY) weekDays.add(dkey(w.startedAt));
  for (const [k, m] of Object.entries(S.marks)) { const t = keyToTs(k); if (m.t === 'done' && t >= ws && t < ws + 7 * DAY) weekDays.add(k); }

  let headline = 'Готовий до залу?';
  if (doneToday) headline = 'Сьогодні вже відпрацьовано 💪';
  else if (planned) headline = `Сьогодні за планом: ${planned.d.name}`;
  else if (tm?.t === 'plan') headline = 'Сьогодні в плані тренування';
  else if (tm?.t === 'rest') headline = 'Сьогодні відпочинок 😴';

  let strip = '';
  for (let i = 0; i < 7; i++) {
    const t = ws + i * DAY + 12 * 3600e3;
    const k = dkey(t), m = S.marks[k];
    const cls = ['wd', k === todayK && 'today', byDay[k] && 'wk', !byDay[k] && m?.t === 'done' && 'done', !byDay[k] && m?.t === 'plan' && 'plan', m?.t === 'rest' && 'rest']
      .filter(Boolean).join(' ');
    strip += `<button class="${cls}" data-a="goDay" data-k="${k}"><span>${WD[new Date(t).getDay()]}</span><b>${new Date(t).getDate()}</b></button>`;
  }

  let body = `<section class="card hero">
    <div class="hero-top">
      <a class="hero-txt" href="#/calendar">
        <div class="eyebrow">${esc(cap(fmtDateLong(now)))}</div>
        <div class="hero-title">${esc(headline)}</div>
      </a>
      <a href="#/calendar" aria-label="Відкрити календар">${ring(weekDays.size, S.settings.weekGoal || 3)}</a>
    </div>
    <div class="week">${strip}</div>
    <a class="hero-link" href="#/calendar">${I.cal}<span>Відкрити календар</span><span class="go">›</span></a>
    ${planned && !doneToday ? `<button class="btn primary wide" data-a="start" data-pid="${planned.p.id}" data-did="${planned.d.id}">${I.play} Почати ${esc(planned.d.name)}</button>` : ''}
  </section>`;

  const upcoming = Object.entries(S.marks).filter(([k, m]) => m.t === 'plan' && k > todayK).sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, 3);
  if (upcoming.length) {
    body += `<h2 class="sec">Заплановано</h2><section class="card list">${upcoming.map(([k, m]) => {
      const fd = m.did ? findDay(m.pid, m.did) : null;
      return `<button class="li" data-a="goDay" data-k="${k}"><span class="li-date">${esc(fmtDate(keyToTs(k)))}</span><b>${esc(fd ? fd.d.name : 'Тренування')}</b><span class="go">›</span></button>`;
    }).join('')}</section>`;
  }

  const lb = S.settings.lastBackup;
  if (S.workouts.length >= 3 && (!lb || now - lb > 14 * DAY)) {
    body += `<a class="notice" href="#/settings">💾 ${lb ? 'Давно не було' : 'Ще немає'} резервної копії — зроби її, це 2 секунди →</a>`;
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
      const nextId = planned && planned.p.id === p.id ? planned.d.id : (p.days.length ? p.days[(lastIdx + 1) % p.days.length].id : null);
      body += `<h2 class="sec">${esc(p.name || 'Без назви')}</h2>`;
      for (const d of p.days) {
        const lastDay = S.workouts.filter((w) => w.dayId === d.id).sort((a, b) => b.startedAt - a.startedAt)[0];
        const isNext = d.id === nextId && p.days.length > 1 && !doneToday;
        const n = d.items.length;
        body += `<button class="card day${isNext ? ' next' : ''}" data-a="start" data-pid="${p.id}" data-did="${d.id}">
          <div class="day-main">
            <div class="day-name">${esc(d.name || 'День')}${isNext ? `<span class="badge">${planned?.d.id === d.id ? 'За планом' : 'Наступне'}</span>` : ''}</div>
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
    sub: `${a.dateKey ? '📅 ' + esc(fmtDate(keyToTs(a.dateKey))) + ' · ' : ''}⏱ <span id="elapsed">${fmtDur(Date.now() - a.startedAt)}</span>`,
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
  const lastTxt = last ? last.map((s) => `${fmtW(s.w)}×${s.r}`).join(' · ') : 'вперше 🎉';
  let tip = '';
  if (last && ax.plan?.reps && last.length >= ax.plan.sets && last.every((s) => s.r >= ax.plan.reps) && last[0].w > 0) {
    tip = `<div class="tip">⚡ Минулого разу план виконано — спробуй +${fmtW(S.settings.step)} кг</div>`;
  }
  return `<section class="card ex${done && done === ax.sets.length ? ' complete' : ''}">
    <div class="ex-h">
      <div><div class="ex-name">${esc(exName(ax.exerciseId))}</div><div class="muted small">${meta}</div></div>
      <button class="icon-btn" data-a="removeEx" data-ei="${ei}" aria-label="Прибрати вправу">✕</button>
    </div>
    <div class="last small"><span class="muted">Минулого разу:</span> <span class="mono">${lastTxt}</span></div>
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

function historyListHtml() {
  if (!S.workouts.length) return `<div class="empty"><div class="big-ico">🗓️</div><p>Тут з’являться твої тренування</p></div>`;
  const list = [...S.workouts].sort((a, b) => b.startedAt - a.startedAt);
  let html = '', month = '';
  for (const wk of list) {
    const m = cap(new Date(wk.startedAt).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' }));
    if (m !== month) { month = m; html += `<h2 class="sec">${esc(m)}</h2>`; }
    const st = wStats(wk);
    html += `<a class="card row" href="#/history/${wk.id}">
      <div><div class="ex-name">${esc(wk.title)}</div>
      <div class="muted small">${fmtDate(wk.startedAt)} · ${fmtMin(wk.finishedAt - wk.startedAt)} · ${st.sets} підх. · ${fmtVol(st.vol)}</div></div>
      <span class="go">›</span>
    </a>`;
  }
  return html;
}

function workoutSummaryHtml(w) {
  const st = wStats(w);
  return `<div class="wk-card">
    <a class="wk-head" href="#/history/${w.id}">
      <div><b>${esc(w.title)}</b><div class="muted small">${fmtTime(w.startedAt)} · ${fmtMin(w.finishedAt - w.startedAt)} · ${st.sets} підх. · ${fmtVol(st.vol)}</div></div>
      <span class="go">›</span>
    </a>
    ${w.exercises.map((e) => `<div class="wk-ex"><span>${esc(exName(e.exerciseId))}</span><span class="mono">${e.sets.map((s) => `${fmtW(s.w)}×${s.r}${s.pr ? '🏆' : ''}`).join(' · ')}</span></div>`).join('')}
  </div>`;
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
  return { title: esc(wk.title), sub: esc(cap(fmtDateLong(wk.startedAt))) + ' · ' + fmtTime(wk.startedAt), back: '#/calendar', body };
}

/* ---------- Calendar ---------- */
let cal = null; // { y, m, sel, mode: 'month'|'list' }
function calInit() {
  if (!cal) { const n = new Date(); cal = { y: n.getFullYear(), m: n.getMonth(), sel: dkey(Date.now()), mode: 'month' }; }
}

function viewCalendar() {
  calInit();
  const seg = `<div class="seg"><button class="${cal.mode === 'month' ? 'on' : ''}" data-a="calMode" data-m="month">Календар</button><button class="${cal.mode === 'list' ? 'on' : ''}" data-a="calMode" data-m="list">Історія</button></div>`;
  if (cal.mode === 'list') return { title: 'Календар', actions: settingsBtn, body: seg + historyListHtml() };

  const now = new Date();
  const { y, m } = cal;
  const todayK = dkey(Date.now());
  const byDay = workoutsByDay();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  let cells = '<span class="cd out"></span>'.repeat(lead);
  let mDays = 0, mPlan = 0;
  for (let d = 1; d <= days; d++) {
    const k = dkey(new Date(y, m, d).getTime());
    const wks = byDay[k], mk = S.marks[k];
    if (wks || mk?.t === 'done') mDays++;
    if (mk?.t === 'plan' && k >= todayK && !wks) mPlan++;
    const cls = ['cd', k === todayK && 'today', k === cal.sel && 'sel', wks && 'wk', !wks && mk?.t && 'm-' + mk.t, mk?.note && 'note', k < todayK && 'past']
      .filter(Boolean).join(' ');
    cells += `<button class="${cls}" data-a="calSel" data-k="${k}"><span>${d}</span></button>`;
  }
  const month = cap(new Date(y, m, 1).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' }));
  const isThisMonth = y === now.getFullYear() && m === now.getMonth();

  const body = seg + `<div class="stats">
      <div><b>${mDays}</b><span>днів у залі</span></div>
      <div><b>${mPlan}</b><span>заплановано</span></div>
      <div><b>${weekStreak()}🔥</b><span>тижнів поспіль</span></div>
    </div>
    <section class="card cal">
      <div class="cal-h">
        <button class="icon-btn" data-a="calNav" data-d="-1" aria-label="Попередній місяць">‹</button>
        <div class="cal-m">${esc(month)}${isThisMonth ? '' : '<button class="cal-today" data-a="calToday">до сьогодні</button>'}</div>
        <button class="icon-btn" data-a="calNav" data-d="1" aria-label="Наступний місяць">›</button>
      </div>
      <div class="cal-grid">
        ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((d) => `<span class="cal-dow">${d}</span>`).join('')}
        ${cells}
      </div>
      <div class="cal-legend"><span><i class="lg wk"></i>тренування</span><span><i class="lg plan"></i>заплановано</span><span><i class="lg done"></i>був</span><span><i class="lg rest"></i>відпочинок</span></div>
    </section>
    ${dayPanelHtml(cal.sel, byDay)}`;
  return { title: 'Календар', actions: settingsBtn, body };
}

function dayPanelHtml(k, byDay) {
  const todayK = dkey(Date.now());
  const when = k === todayK ? 'today' : k > todayK ? 'future' : 'past';
  const wks = byDay[k] || [];
  const mk = S.marks[k] || {};
  const planned = mk.t === 'plan' && mk.did ? findDay(mk.pid, mk.did) : null;
  const days = allDays();
  const multi = S.programs.length > 1;
  const dayChip = ({ p, d }, a, on, prefix = '') => `<button class="chip${on ? ' on' : ''}" data-a="${a}" data-k="${k}" data-pid="${p.id}" data-did="${d.id}">${prefix}${esc(d.name)}${multi ? `<small>${esc(p.name)}</small>` : ''}</button>`;

  let h = `<section class="card day-panel">
    <div class="eyebrow">${when === 'today' ? 'Сьогодні' : when === 'future' ? 'Попереду' : ago(keyToTs(k))}</div>
    <div class="dp-title">${esc(cap(fmtDateLong(keyToTs(k))))}</div>`;

  h += wks.map(workoutSummaryHtml).join('');

  if (mk.t === 'plan' && !wks.length) {
    h += `<div class="plan-line">📌 У плані: <b>${esc(planned ? planned.d.name : 'тренування')}</b></div>`;
  }

  if (when === 'future') {
    h += `<div class="dp-sec">Яке тренування плануєш?</div><div class="chips">`
      + days.map((x) => dayChip(x, 'planDay', mk.t === 'plan' && mk.did === x.d.id)).join('')
      + `<button class="chip${mk.t === 'plan' && !mk.did ? ' on' : ''}" data-a="planDay" data-k="${k}">📌 Будь-яке</button>`
      + `<button class="chip${mk.t === 'rest' ? ' on' : ''}" data-a="calMark" data-k="${k}" data-t="rest">💤 Відпочинок</button>`
      + `</div>`;
  } else {
    if (when === 'today' && planned && !wks.length) {
      h += `<button class="btn primary wide" data-a="start" data-pid="${planned.p.id}" data-did="${planned.d.id}">${I.play} Почати ${esc(planned.d.name)}</button>`;
    }
    const label = when === 'today' ? (wks.length ? 'Ще одне тренування' : 'Почати тренування') : (wks.length ? 'Додати ще тренування за цей день' : 'Забув записати? Додай тренування за цей день');
    h += `<div class="dp-sec">${label}</div><div class="chips">`
      + days.map((x) => dayChip(x, 'startOn', false, '▶ ')).join('')
      + `<button class="chip" data-a="startOn" data-k="${k}">▶ Без програми</button></div>`;
    h += `<div class="chips">`
      + (when === 'past' && !wks.length ? `<button class="chip${mk.t === 'done' ? ' on' : ''}" data-a="calMark" data-k="${k}" data-t="done">✔ Був у залі</button>` : '')
      + `<button class="chip${mk.t === 'rest' ? ' on' : ''}" data-a="calMark" data-k="${k}" data-t="rest">💤 Відпочинок</button>`
      + `</div>`;
  }
  if (!days.length) {
    h += `<div class="hint-box">Щоб тут з’явились <b>Push / Pull / Legs</b> чи твої дні — спершу додай програму.
      <div class="chips"><button class="chip on" data-a="addTemplate">+ Приклад Push / Pull / Legs</button><button class="chip" data-a="newProgram">Створити свою</button></div></div>`;
  }
  h += `<input class="in" data-f="note" data-k="${k}" value="${esc(mk.note || '')}" placeholder="Нотатка: самопочуття, сон, вага…" autocomplete="off">`;
  return h + '</section>';
}

/* ---------- Progress ---------- */
function viewProgress() {
  const rows = S.exercises.map((e) => {
    const ss = sessionsFor(e.id);
    if (!ss.length) return null;
    let best = null;
    for (const x of ss) for (const s of x.sets) if (!best || s.w > best.w || (s.w === best.w && s.r > best.r)) best = s;
    return { e, n: ss.length, last: ss[0].wk.startedAt, best };
  }).filter(Boolean).sort((a, b) => b.last - a.last);

  if (!rows.length) {
    return { title: 'Прогрес', actions: settingsBtn, body: `<div class="empty"><div class="big-ico">📈</div><p>Після першого тренування тут буде прогрес по кожній вправі</p></div>` };
  }
  const body = rows.map((r) => `<a class="card row" href="#/progress/${r.e.id}">
      <div><div class="ex-name">${esc(r.e.name)}</div>
      <div class="muted small">Рекорд <span class="mono hl">${fmtW(r.best.w)}×${r.best.r}</span> · ${r.n} ${plural(r.n, ['тренування', 'тренування', 'тренувань'])} · ${ago(r.last)}</div></div>
      <span class="go">›</span>
    </a>`).join('');
  return { title: 'Прогрес', actions: settingsBtn, body };
}

let metric = 'e1rm';
const METRICS = {
  e1rm: { label: '1ПМ', val: (sets) => Math.max(...sets.map((s) => e1rm(s.w, s.r))) },
  max: { label: 'Макс. вага', val: (sets) => Math.max(...sets.map((s) => s.w)) },
  vol: { label: 'Об’єм', val: (sets) => sets.reduce((a, s) => a + s.w * s.r, 0) },
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
  body += `<section class="card">${chartSvg(pts, 'кг')}
    ${metric === 'e1rm' ? '<p class="muted small" style="margin-top:6px">1ПМ — розрахунковий максимум на 1 повтор (формула Еплі). Найкраще показує силу, навіть коли змінюєш кількість повторів.</p>' : ''}
  </section>`;
  if (ss.length) {
    body += `<div class="recs">
      <div><b>${fmtW(heavy.w)} × ${heavy.r}</b><span>найбільша вага</span></div>
      <div><b>${fmtW(round1(e1rm(strong.w, strong.r)))} кг</b><span>1ПМ (${fmtW(strong.w)} × ${strong.r})</span></div>
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

function chartSvg(pts, unit) {
  if (pts.length < 2) return `<div class="chart-empty muted small">Графік з’явиться, коли буде 2+ записи</div>`;
  const W = 340, H = 170, pl = 36, pr = 10, pt = 14, pb = 24;
  let min = Math.min(...pts.map((p) => p.y)), max = Math.max(...pts.map((p) => p.y));
  if (max === min) { max += 1; min -= 1; }
  const pad = (max - min) * 0.15; min = Math.max(0, min - pad); max += pad;
  const fine = max - min < 8;
  const fmt = (v) => (fine ? String(round1(v)) : String(Math.round(v)));
  const x = (i) => pl + (i * (W - pl - pr)) / (pts.length - 1);
  const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const area = `${line}L${x(pts.length - 1).toFixed(1)},${H - pb}L${x(0).toFixed(1)},${H - pb}Z`;
  const grid = [0, 0.5, 1].map((f) => {
    const v = min + (max - min) * f, yy = y(v).toFixed(1);
    return `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" class="grid"/><text x="${pl - 6}" y="${(+yy + 3).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`;
  }).join('');
  const li = pts.length - 1;
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="${i === li ? 5 : 2.6}" class="${i === li ? 'dot-last' : 'dot'}"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
    ${grid}
    <path d="${area}" fill="url(#gArea)"/>
    <path d="${line}" fill="none" stroke="url(#gLine)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    <text x="${pl}" y="${H - 6}">${fmtShort(pts[0].t)}</text>
    <text x="${W - pr}" y="${H - 6}" text-anchor="end">${fmtShort(pts[li].t)} · ${fmt(pts[li].y)} ${unit}</text>
  </svg>`;
}

/* ---------- Body ---------- */
let bodyMetric = 'weight';
let bodyDraft = null;
const bodyVal = (e, f) => { const v = e.v?.[f]; return v == null || v === '' ? null : v; };
const bodySorted = () => [...S.body].sort((a, b) => b.date - a.date);

function deltaHtml(d, unit, label) {
  if (d == null) return '';
  const r = round1(d);
  const cls = r > 0 ? 'up' : r < 0 ? 'down' : '';
  return `<span class="delta ${cls}">${r > 0 ? '▲' : r < 0 ? '▼' : '•'} ${fmtW(Math.abs(r))} ${unit}${label ? ` <small>${label}</small>` : ''}</span>`;
}

function viewBody() {
  const list = bodySorted();
  const add = `<a class="btn primary sm" href="#/body/new">+ Замір</a>`;
  if (!list.length) {
    return {
      title: 'Тіло', actions: add,
      body: `<div class="empty"><div class="big-ico">📏</div><p><b>Відстежуй своє тіло</b></p>
        <p class="small">Вага, обхвати і фото прогресу. Найточніше — раз на 1–2 тижні, зранку натщесерце.</p></div>
        <a class="btn primary wide" href="#/body/new">Перший замір</a>`,
    };
  }
  const used = BODY_FIELDS.filter(([f]) => list.some((e) => bodyVal(e, f) != null));
  if (used.length && !used.some(([f]) => f === bodyMetric)) bodyMetric = used[0][0];
  const [mf, ml, mu] = BODY_FIELDS.find((x) => x[0] === bodyMetric);
  const series = list.filter((e) => bodyVal(e, mf) != null).reverse();
  const cur = series[series.length - 1], prev = series[series.length - 2], first = series[0];

  let body = '';
  if (used.length) {
    body += `<div class="chips scroll">${used.map(([f, l]) => `<button class="chip${f === bodyMetric ? ' on' : ''}" data-a="bodyMetric" data-m="${f}">${l}</button>`).join('')}</div>`;
    body += `<section class="card hero-metric">
      <div class="eyebrow">${ml}</div>
      <div class="big">${cur ? fmtW(cur.v[mf]) : '—'}<small>${mu}</small></div>
      <div class="deltas">${prev ? deltaHtml(cur.v[mf] - prev.v[mf], mu, 'з минулого') : ''}${first && series.length > 2 ? deltaHtml(cur.v[mf] - first.v[mf], mu, 'від старту') : ''}</div>
      ${chartSvg(series.map((e) => ({ t: e.date, y: +e.v[mf] })), mu)}
    </section>`;

    // Latest known value of each measurement + change vs the one before it
    body += `<h2 class="sec">Поточні показники</h2><div class="bstats">`
      + used.map(([f, l, u]) => {
        const [c1, c0] = list.filter((e) => bodyVal(e, f) != null);
        return `<button class="bs${f === bodyMetric ? ' on' : ''}" data-a="bodyMetric" data-m="${f}"><span>${l}</span><b>${fmtW(c1.v[f])}<small>${u}</small></b>${c0 ? deltaHtml(c1.v[f] - c0.v[f], '') : `<em>${fmtShort(c1.date)}</em>`}</button>`;
      }).join('') + `</div>`;
  }

  const allPh = list.slice().reverse().flatMap((e) => (e.photos || []).map((id) => ({ id, date: e.date })));
  if (allPh.length) {
    body += `<h2 class="sec">Фото прогресу</h2>`;
    if (allPh.length >= 2) {
      const a = allPh[0], b = allPh[allPh.length - 1];
      body += `<div class="compare">
        <figure data-a="viewPhoto" data-id="${a.id}" data-date="${a.date}"><img data-photo="${a.id}" alt=""><figcaption>До · ${fmtShort(a.date)}</figcaption></figure>
        <figure data-a="viewPhoto" data-id="${b.id}" data-date="${b.date}"><img data-photo="${b.id}" alt=""><figcaption>Зараз · ${fmtShort(b.date)}</figcaption></figure>
      </div>`;
    }
    body += `<div class="gallery">${allPh.slice().reverse().map((p) => `<button class="ph" data-a="viewPhoto" data-id="${p.id}" data-date="${p.date}"><img data-photo="${p.id}" alt=""></button>`).join('')}</div>`;
  }

  body += `<h2 class="sec">Усі заміри</h2><section class="card list">${list.map((e) => {
    const parts = BODY_FIELDS.filter(([f]) => bodyVal(e, f) != null).slice(0, 3).map(([f, l, u]) => `${l.toLowerCase()} ${fmtW(e.v[f])}${u === '%' ? '%' : ''}`);
    return `<a class="li" href="#/body/${e.id}"><span class="li-date">${esc(fmtDate(e.date))}</span><span class="li-main">${esc(parts.join(' · ') || 'тільки фото')}${e.photos?.length ? ` · 📷${e.photos.length}` : ''}</span><span class="go">›</span></a>`;
  }).join('')}</section>`;

  return { title: 'Тіло', actions: add, body };
}

function viewBodyEdit(id) {
  const ex = id === 'new' ? null : S.body.find((e) => e.id === id);
  if (id !== 'new' && !ex) return null;
  const did = ex ? ex.id : 'new';
  if (!bodyDraft || bodyDraft.id !== did) {
    bodyDraft = ex
      ? { id: ex.id, date: dkey(ex.date), v: Object.fromEntries(Object.entries(ex.v || {}).map(([k, v]) => [k, String(v)])), note: ex.note || '', photos: [...(ex.photos || [])] }
      : { id: 'new', date: dkey(Date.now()), v: {}, note: '', photos: [] };
  }
  const others = bodySorted().filter((e) => e.id !== bodyDraft.id);
  const lastVal = (f) => others.find((e) => bodyVal(e, f) != null)?.v[f];
  const body = `<section class="card">
      <label class="field"><span>Дата</span><input type="date" class="in date" data-f="bdate" value="${bodyDraft.date}" max="${dkey(Date.now())}"></label>
    </section>
    <section class="card">
      <div class="bgrid">${BODY_FIELDS.map(([f, l, u]) => `<label class="bf"><span>${l}, ${u}</span>
        <input class="in num" data-f="bval" data-k="${f}" inputmode="decimal" autocomplete="off" value="${esc(bodyDraft.v[f] ?? '')}" placeholder="${lastVal(f) != null ? fmtW(lastVal(f)) : '—'}"></label>`).join('')}</div>
      <p class="muted small" style="margin-top:10px">Заповнюй тільки потрібне. Сірим — значення з минулого заміру.</p>
    </section>
    <section class="card">
      <div class="ex-name">Фото</div>
      <div class="photos">
        ${bodyDraft.photos.map((pid) => `<div class="ph"><img data-photo="${pid}" alt=""><button class="ph-x" data-a="draftDelPhoto" data-id="${pid}" aria-label="Прибрати фото">✕</button></div>`).join('')}
        <label class="ph add">${I.camera}<span>Додати</span><input type="file" accept="image/*" multiple data-f="photoIn" hidden></label>
      </div>
      <p class="muted small" style="margin-top:10px">Порада: те саме світло, поза й відстань — так різницю видно найкраще. Фото зберігаються тільки на телефоні.</p>
    </section>
    <input class="in" data-f="bnote" value="${esc(bodyDraft.note)}" placeholder="Нотатка (необов’язково)" autocomplete="off">
    <button class="btn primary wide" data-a="saveBody">Зберегти</button>
    ${ex ? `<button class="btn danger-ghost wide" data-a="delBody" data-id="${ex.id}">Видалити замір</button>` : ''}`;
  return { title: ex ? 'Замір' : 'Новий замір', back: '#/body', body };
}

/* ---------- Settings ---------- */
function viewSettings() {
  const lb = S.settings.lastBackup;
  const body = `<section class="card">
      <label class="field"><span>Ціль: тренувань на тиждень</span><input class="in num" data-f="goal" inputmode="numeric" value="${S.settings.weekGoal}"></label>
      <label class="field"><span>Відпочинок між підходами, сек</span><input class="in num" data-f="rest" inputmode="numeric" value="${S.settings.rest}"></label>
      <label class="field"><span>Крок ваги для кнопок − / +, кг</span><input class="in num" data-f="step" inputmode="decimal" value="${fmtW(S.settings.step)}"></label>
      <p class="muted small">Таймер відпочинку стартує сам після кожного ✓. Постав 0, щоб вимкнути.</p>
    </section>
    <section class="card">
      <div class="ex-name">Резервна копія</div>
      <p class="muted small" style="margin-top:4px">Усі дані й фото зберігаються тільки на цьому телефоні. Зберігай копію у «Файли» / iCloud Drive або надсилай собі в Telegram.<br>${lb ? 'Остання копія: ' + fmtDate(lb) + ' (' + ago(lb) + ')' : 'Копій ще не було.'}</p>
      <button class="btn primary wide" data-a="export">Зберегти копію</button>
      <button class="btn wide" data-a="import">Відновити з файлу</button>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </section>
    <section class="card">
      <div class="muted small">Тренувань: ${S.workouts.length} · Замірів: ${S.body.length} · Програм: ${S.programs.length} · Вправ: ${S.exercises.length}</div>
      <button class="btn danger-ghost wide" data-a="resetAll" style="margin-top:8px">Видалити всі дані</button>
    </section>
    <p class="muted small center">Gym Log · v2.0</p>`;
  return { title: 'Налаштування', back: '#/', body };
}

/* =====================================================================
   Router & render
   ===================================================================== */

function view() {
  const [a, b] = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  switch (a) {
    case undefined: return { tab: '/', ...viewHome() };
    case 'calendar': return { tab: '/calendar', ...viewCalendar() };
    case 'programs': return { tab: '/programs', ...viewPrograms() };
    case 'program': { const p = prog(b); if (p) return { tab: '/programs', ...viewProgram(p) }; break; }
    case 'history': {
      const wk = b && S.workouts.find((w) => w.id === b);
      if (wk) return { tab: '/calendar', ...viewWorkoutDetail(wk) };
      calInit(); cal.mode = 'list';
      history.replaceState(null, '', '#/calendar');
      return { tab: '/calendar', ...viewCalendar() };
    }
    case 'progress': {
      if (!b) return { tab: '/progress', ...viewProgress() };
      const e = exById(b);
      if (e) return { tab: '/progress', ...viewProgressEx(e) };
      break;
    }
    case 'body': {
      if (!b) return { tab: '/body', ...viewBody() };
      const v = viewBodyEdit(b);
      if (v) return { tab: '/body', ...v };
      break;
    }
    case 'settings': return { tab: '', ...viewSettings() };
  }
  history.replaceState(null, '', '#/');
  return { tab: '/', ...viewHome() };
}

function navHtml(tab) {
  const tabs = [['/', 'Тренування', I.dumbbell], ['/calendar', 'Календар', I.cal], ['/progress', 'Прогрес', I.chart], ['/body', 'Тіло', I.body], ['/programs', 'Програми', I.list]];
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
  hydratePhotos();
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

/* ---------- In-app confirm dialog (native confirm() can be blocked on iOS) ---------- */
function ask(msg, { ok = 'Так', cancel = 'Скасувати', danger = false } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal dialog-wrap';
    el.innerHTML = `<div class="dialog" role="alertdialog">
      <p>${esc(msg).replace(/\n/g, '<br>')}</p>
      <div class="dialog-a">
        <button class="btn" data-r="0">${esc(cancel)}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button>
      </div>
    </div>`;
    const done = (v) => { el.remove(); resolve(v); };
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-r]');
      if (b) done(b.dataset.r === '1');
      else if (e.target === el) done(false);
    });
    document.body.appendChild(el);
    el.querySelector('[data-r="1"]').focus();
  });
}

/* ---------- Exercise picker ---------- */
let picker = null;
function openPicker(cb) {
  closePicker();
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

/* ---------- Photo viewer ---------- */
function openViewer(id, caption) {
  const el = document.createElement('div');
  el.className = 'viewer';
  el.innerHTML = `<img data-photo="${esc(id)}" alt=""><div class="viewer-c">${esc(caption)} · торкнись, щоб закрити</div>`;
  el.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); });
  document.body.appendChild(el);
  hydratePhotos(el);
}

/* ---------- Backup ---------- */
async function exportData() {
  S.settings.lastBackup = Date.now();
  save();
  const ph = {};
  try { for (const id of S.body.flatMap((e) => e.photos || [])) { const v = await photos.get(id); if (v) ph[id] = v; } } catch (e) { /* ignore */ }
  const json = JSON.stringify({ ...S, photos: ph });
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
  let d;
  try {
    d = JSON.parse(await file.text());
    if (!d || !Array.isArray(d.workouts) || !Array.isArray(d.programs) || !Array.isArray(d.exercises)) throw new Error('bad');
  } catch (e) {
    toast('⚠️ Це не схоже на файл копії Gym Log');
    return;
  }
  if (!await ask(`Відновити копію?\n${d.workouts.length} тренувань, ${(d.body || []).length} замірів, ${d.programs.length} програм.\nПоточні дані на телефоні буде замінено.`, { ok: 'Відновити', danger: true })) return;
  const ph = d.photos || {};
  delete d.photos;
  try { for (const [id, v] of Object.entries(ph)) await photos.put(id, v); } catch (e) { toast('⚠️ Частину фото не вдалося відновити'); }
  const def = defaults();
  S = { ...def, ...d, settings: { ...def.settings, ...(d.settings || {}) } };
  save(); go('#/'); toast('✅ Дані відновлено');
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

function setMark(k, m) {
  if (!m.t) { delete m.t; delete m.pid; delete m.did; }
  if (!m.t && !m.note) delete S.marks[k]; else S.marks[k] = m;
  save(); render();
}

const A = {
  // --- home / programs
  start: (d) => { unlockAudio(); startWorkout(d.pid, d.did); },
  startEmpty: () => { unlockAudio(); startWorkout(null, null); },
  startOn: (d) => { unlockAudio(); startWorkout(d.pid || null, d.did || null, d.k); },
  goDay: (d) => {
    calInit();
    const t = new Date(keyToTs(d.k));
    Object.assign(cal, { y: t.getFullYear(), m: t.getMonth(), sel: d.k, mode: 'month' });
    go('#/calendar');
  },
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
  delDay: async (d) => {
    const p = prog(d.pid), day = p.days[+d.di];
    if (day.items.length && !await ask(`Видалити день «${day.name}»?`, { ok: 'Видалити', danger: true })) return;
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
  delProgram: async (d) => {
    const p = prog(d.pid);
    if (!await ask(`Видалити програму «${p.name || 'Без назви'}»?\nІсторія тренувань залишиться.`, { ok: 'Видалити', danger: true })) return;
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
  removeSet: async (d) => {
    const sets = S.active.exercises[+d.ei].sets;
    if (sets[sets.length - 1]?.done && !await ask('Останній підхід уже виконано. Видалити його?', { ok: 'Видалити', danger: true })) return;
    sets.pop(); save(); render();
  },
  removeEx: async (d) => {
    const ax = S.active.exercises[+d.ei];
    if (ax.sets.some((s) => s.done) && !await ask(`Прибрати «${exName(ax.exerciseId)}» з тренування?`, { ok: 'Прибрати', danger: true })) return;
    S.active.exercises.splice(+d.ei, 1); save(); render();
  },
  addEx: () => openPicker(addExToWorkout),
  finish: () => finishWorkout(),
  cancelWorkout: async () => {
    if (!await ask('Скасувати тренування?\nЙого дані не збережуться.', { ok: 'Скасувати тренування', cancel: 'Назад', danger: true })) return;
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

  // --- calendar
  calMode: (d) => { cal.mode = d.m; render(); },
  calNav: (d) => {
    cal.m += +d.d;
    if (cal.m < 0) { cal.m = 11; cal.y--; }
    if (cal.m > 11) { cal.m = 0; cal.y++; }
    render();
  },
  calToday: () => { const mode = cal.mode; cal = null; calInit(); cal.mode = mode; render(); },
  calSel: (d) => { cal.sel = d.k; render(); },
  calMark: (d) => {
    const m = { ...(S.marks[d.k] || {}) };
    m.t = m.t === d.t ? undefined : d.t;
    delete m.pid; delete m.did;
    setMark(d.k, m);
  },
  planDay: (d) => {
    const m = { ...(S.marks[d.k] || {}) };
    const same = m.t === 'plan' && (m.did || null) === (d.did || null);
    if (same) m.t = undefined;
    else { m.t = 'plan'; m.pid = d.pid || null; m.did = d.did || null; }
    setMark(d.k, m);
  },

  // --- history / progress
  delWorkout: async (d) => {
    if (!await ask('Видалити це тренування назавжди?', { ok: 'Видалити', danger: true })) return;
    S.workouts = S.workouts.filter((w) => w.id !== d.id);
    save(); go('#/calendar');
  },
  metric: (d) => { metric = d.m; render(); },

  // --- body
  bodyMetric: (d) => { bodyMetric = d.m; render(); },
  viewPhoto: (d) => openViewer(d.id, cap(fmtDateLong(+d.date))),
  draftDelPhoto: (d) => { bodyDraft.photos = bodyDraft.photos.filter((p) => p !== d.id); render(); },
  saveBody: async () => {
    const v = {};
    for (const [f] of BODY_FIELDS) { const n = num(bodyDraft.v[f]); if (n != null && n > 0) v[f] = n; }
    if (!Object.keys(v).length && !bodyDraft.photos.length) { toast('Введи хоча б один замір або додай фото'); return; }
    const date = keyToTs(bodyDraft.date || dkey(Date.now())) + 12 * 3600e3;
    const note = bodyDraft.note.trim();
    if (bodyDraft.id === 'new') {
      S.body.push({ id: uid(), date, v, note, photos: bodyDraft.photos });
    } else {
      const e = S.body.find((x) => x.id === bodyDraft.id);
      for (const p of (e.photos || [])) if (!bodyDraft.photos.includes(p)) photos.del(p).catch(() => {});
      Object.assign(e, { date, v, note, photos: bodyDraft.photos });
    }
    bodyDraft = null;
    save(); go('#/body'); toast('✅ Замір збережено');
  },
  delBody: async (d) => {
    if (!await ask('Видалити цей замір разом із фото?', { ok: 'Видалити', danger: true })) return;
    const e = S.body.find((x) => x.id === d.id);
    for (const p of (e?.photos || [])) photos.del(p).catch(() => {});
    S.body = S.body.filter((x) => x.id !== d.id);
    bodyDraft = null;
    save(); go('#/body');
  },

  // --- picker
  pick: (d) => pickDone(exById(d.id)),
  pickNew: () => { const ex = getOrCreateExercise(picker.q); save(); pickDone(ex); },
  pickClose: () => closePicker(),

  // --- settings
  export: () => exportData(),
  import: () => $('#importFile').click(),
  resetAll: async () => {
    if (!await ask('Видалити ВСІ дані: програми, історію, заміри, фото?\nЦе не можна скасувати.', { ok: 'Видалити все', danger: true })) return;
    try { for (const k of await photos.keys()) await photos.del(k); } catch (e) { /* ignore */ }
    S = defaults(); save(); go('#/'); toast('Дані видалено');
  },
};

document.addEventListener('click', (e) => {
  if (e.target.id === 'picker') { closePicker(); return; }
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const fn = A[b.dataset.a];
  if (fn) {
    e.preventDefault();
    Promise.resolve(fn(b.dataset, b)).catch((err) => { console.error(err); toast('⚠️ Помилка: ' + err.message); });
  }
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
    case 'goal': { const n = parseInt(v, 10); if (n >= 1 && n <= 7) S.settings.weekGoal = n; break; }
    case 'rest': { const n = parseInt(v, 10); if (Number.isFinite(n) && n >= 0) S.settings.rest = Math.min(n, 900); break; }
    case 'step': { const n = num(v); if (n > 0) S.settings.step = n; break; }
    case 'note': {
      const m = { ...(S.marks[d.k] || {}) };
      m.note = v;
      if (!m.t && !m.note) delete S.marks[d.k]; else S.marks[d.k] = m;
      break;
    }
    case 'bval': if (bodyDraft) bodyDraft.v[d.k] = v; return;
    case 'bnote': if (bodyDraft) bodyDraft.note = v; return;
    case 'bdate': if (bodyDraft && v) bodyDraft.date = v; return;
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

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'importFile' && t.files[0]) importData(t.files[0]);
  if (t.dataset.f === 'photoIn' && t.files.length && bodyDraft) {
    const files = [...t.files];
    toast(`Обробка фото… (${files.length})`);
    for (const f of files) {
      try {
        const data = await compressImage(f);
        const pid = 'p' + uid();
        await photos.put(pid, data);
        bodyDraft.photos.push(pid);
      } catch (err) { toast('⚠️ Не вдалося додати фото'); }
    }
    render();
  }
});

window.addEventListener('hashchange', () => { closePicker(); render(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

/* ---------- Boot ---------- */
render();
navigator.storage?.persist?.().catch(() => {});

// Remove photos that no measurement references (e.g. an abandoned draft).
(async () => {
  try {
    const used = new Set(S.body.flatMap((e) => e.photos || []));
    for (const k of await photos.keys()) if (!used.has(k)) await photos.del(k);
  } catch (e) { /* IndexedDB unavailable */ }
})();

if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  // When a new version is deployed, reload once so the update shows up immediately.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  }
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
