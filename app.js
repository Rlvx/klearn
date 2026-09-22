import { load, save, importState } from './store.js';
import { newCard, review } from './srs.js';
import { addXp, currentStreak, todayXp, dayKey } from './game.js';
import { pickExercise, buildQuestion, checkTyped, checkTiles } from './exercises.js';
import { buildSession, lessonSession, lessonUnlocked, lessonDone } from './session.js';

const UNIT_IDS = ['hangul', 'phrases', 'vocab'];
const app = document.getElementById('app');
const byId = {};
let units = [];
let state = load();
let voice = null;
let session = null;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = sel => app.querySelector(sel);
const persist = () => save(state);
const buzz = pattern => navigator.vibrate?.(pattern);
const header = (title, back) =>
  `<header class="top">${back ? `<a href="${back}" class="icon-btn" aria-label="Retour">←</a>` : ''}<h1>${title}</h1></header>`;

// --- audio ---
function speak(text) {
  if (!voice) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.voice = voice;
  u.rate = 0.85;
  speechSynthesis.speak(u);
}
const say = item => speak(item.say || item.ko);

function initVoice() {
  if (!('speechSynthesis' in window)) return;
  const pick = () => { voice = speechSynthesis.getVoices().find(v => /^ko/i.test(v.lang)) || null; };
  speechSynthesis.onvoiceschanged = () => { pick(); if (!location.hash.startsWith('#/session')) route(); };
  pick();
}

// --- routing ---
function route() {
  const [, screen, arg] = location.hash.split('/');
  if (screen === 'unit') renderUnit(arg);
  else if (screen === 'session') session ? renderSession() : (location.hash = '#/');
  else if (screen === 'field') renderField(arg);
  else if (screen === 'settings') renderSettings();
  else renderHome();
  window.scrollTo(0, 0);
}

function renderHome() {
  const now = Date.now();
  const xp = todayXp(state, now);
  const due = Object.keys(state.cards).filter(id => byId[id] && state.cards[id].due <= now).length;
  app.innerHTML = `
    <header class="top"><h1>klearn <span class="ko">한국어</span></h1><a href="#/settings" class="icon-btn" aria-label="Réglages">⚙</a></header>
    <section class="stats">
      <div class="stat"><b>🔥 ${currentStreak(state, now)}</b><span>jours</span></div>
      <div class="stat"><b>${xp}/${state.goal}</b><span>XP du jour</span></div>
      <div class="stat"><b>${due}</b><span>à réviser</span></div>
    </section>
    <div class="goal"><div style="width:${Math.min(100, (xp / state.goal) * 100)}%"></div></div>
    <button class="primary big" id="start">Session du jour</button>
    ${voice ? '' : '<p class="notice">Pas de voix coréenne détectée. Android : Paramètres → Synthèse vocale → Google → Installer les données vocales → Coréen.</p>'}
    <section class="units">
      ${units.map(u => `<a class="unit" href="#/unit/${u.id}"><span class="ko">${esc(u.icon)}</span><div><b>${esc(u.title)}</b><small>${u.lessons.filter(l => lessonDone(l, state.cards)).length}/${u.lessons.length} leçons</small></div></a>`).join('')}
      <a class="unit" href="#/field"><span class="ko">💬</span><div><b>Sur le terrain</b><small>Phrases à montrer ou faire écouter</small></div></a>
    </section>`;
  $('#start').onclick = () => startSession(buildSession(units, state.cards, Date.now()));
}

function renderUnit(id) {
  const unit = units.find(u => u.id === id);
  if (!unit) return renderHome();
  app.innerHTML = header(esc(unit.title), '#/') + `<ol class="path">${unit.lessons.map((l, i) => {
    const open = lessonUnlocked(unit, i, state.cards);
    const done = lessonDone(l, state.cards);
    return `<li><button class="lesson ${done ? 'done' : open ? 'open' : 'locked'}" data-i="${i}" ${open ? '' : 'disabled'}><span>${done ? '✓' : open ? i + 1 : '🔒'}</span>${esc(l.title)}</button></li>`;
  }).join('')}</ol>`;
  app.querySelectorAll('.lesson').forEach(b => {
    b.onclick = () => startSession(lessonSession(unit.lessons[+b.dataset.i], state.cards));
  });
}

function renderField(lessonId) {
  const phrases = units.find(u => u.id === 'phrases');
  const lesson = phrases.lessons.find(l => l.id === lessonId);
  if (!lesson) {
    app.innerHTML = header('Sur le terrain', '#/') + `<section class="units">${phrases.lessons.map(l =>
      `<a class="unit" href="#/field/${l.id}"><span class="ko">${esc(l.icon ?? '💬')}</span><div><b>${esc(l.title)}</b><small>${l.items.length} phrases</small></div></a>`).join('')}</section>`;
    return;
  }
  app.innerHTML = header(esc(lesson.title), '#/field') + `<section class="field">${lesson.items.map(it =>
    `<button class="phrase" data-id="${it.id}"><span class="ko">${esc(it.ko)}</span><small>${esc(it.rom)}</small><span>${esc(it.fr)}</span></button>`).join('')}</section>`;
  app.querySelectorAll('.phrase').forEach(b => { b.onclick = () => say(byId[b.dataset.id].item); });
}

function renderSettings() {
  app.innerHTML = header('Réglages', '#/') + `<section class="settings">
    <label>Objectif quotidien (XP)<input type="number" id="goal" min="10" step="10" value="${state.goal}"></label>
    <label class="row"><input type="checkbox" id="rom" ${state.showRom ? 'checked' : ''}>Afficher la romanisation</label>
    <button class="secondary" id="test-voice">🔊 Tester la voix</button>
    <p class="notice">${voice ? `Voix : ${esc(voice.name)}` : 'Aucune voix coréenne. Android : Paramètres → Synthèse vocale → Google → Installer les données vocales → Coréen.'}</p>
    <button class="secondary" id="export">Exporter ma progression</button>
    <label class="secondary">Importer une progression<input type="file" id="import" accept="application/json,.json" hidden></label>
    <p id="msg"></p>
  </section>`;
  $('#goal').onchange = e => { state.goal = Math.max(10, Math.round(+e.target.value) || 50); persist(); };
  $('#rom').onchange = e => { state.showRom = e.target.checked; persist(); };
  $('#test-voice').onclick = () => speak('안녕하세요');
  $('#export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' }));
    a.download = `klearn-${dayKey(Date.now())}.json`;
    a.click();
  };
  $('#import').onchange = async e => {
    const file = e.target.files[0];
    if (!file || !confirm('Remplacer ta progression actuelle ?')) return;
    try {
      state = importState(await file.text());
      persist();
      $('#msg').textContent = 'Progression importée ✓';
    } catch {
      $('#msg').textContent = 'Fichier invalide, rien n\'a été changé.';
    }
  };
}

// --- session ---
function startSession(queue) {
  session = { queue, pos: 0, combo: 0, right: 0, answered: 0, xp: 0, retried: new Set(), current: null };
  prepare();
  location.hash = '#/session';
}

function prepare() {
  const step = session.queue[session.pos];
  if (!step) { session.current = null; return; }
  const { item, unit } = byId[step.id];
  const type = step.kind === 'intro' ? 'intro' : pickExercise(item, unit.id, Math.random, !!voice);
  session.current = { ...buildQuestion(type, item, unit.items), unit: unit.id };
}

function advance() {
  session.pos++;
  prepare();
  renderSession();
}

const size = ko => (ko.length > 4 ? 'lg' : 'xl');
const rom = (q, always) => (state.showRom && (always || q.unit !== 'hangul') ? `<p class="rom">${esc(q.item.rom)}</p>` : '');
const audioBtn = () => (voice ? '<button class="icon-btn audio" data-say aria-label="Écouter">🔊</button>' : '');
const full = q => `<p class="ko ${size(q.item.ko)}">${esc(q.item.ko)}</p>${rom(q, true)}<p class="fr">${esc(q.item.fr)}</p>${q.item.note ? `<p class="note">${esc(q.item.note)}</p>` : ''}`;
const choices = (q, key) => `<div class="choices">${q.choices.map((c, i) =>
  `<button class="choice${key === 'ko' ? ' ko' : ''}" data-i="${i}">${esc(c[key])}</button>`).join('')}</div>`;

const VIEWS = {
  intro: q => `<p class="label">Nouveau</p><div class="flash">${full(q)}</div>${audioBtn()}<button class="primary" id="next">Compris</button>`,
  recognize: q => `<p class="label">Que veut dire…</p><div class="flash"><p class="ko ${size(q.item.ko)}">${esc(q.item.ko)}</p>${rom(q)}</div>${q.unit === 'hangul' ? '' : audioBtn()}${choices(q, 'fr')}`,
  reverse: q => `<p class="label">Comment dit-on…</p><div class="flash"><p class="fr">${esc(q.item.fr)}</p></div>${choices(q, 'ko')}`,
  listen: q => `<p class="label">Qu'entends-tu ?</p><button class="play" data-say aria-label="Réécouter">🔊</button>${choices(q, 'ko')}`,
  type: q => `<p class="label">Écris en coréen</p><div class="flash"><p class="fr">${esc(q.item.fr)}</p></div>${audioBtn()}
    <input type="text" id="typed" lang="ko" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="한글로…"><button class="primary" id="check">Vérifier</button>`,
  build: q => `<p class="label">Remets dans l'ordre</p><div class="flash"><p class="fr">${esc(q.item.fr)}</p></div>
    <div class="picked ko" id="picked"></div><div class="tiles ko">${q.tiles.map((t, i) => `<button class="tile" data-i="${i}">${esc(t)}</button>`).join('')}</div>
    <button class="primary" id="check" disabled>Vérifier</button>`,
  shadow: q => `<p class="label">Écoute et répète à voix haute</p><div class="flash">${full(q)}</div>${audioBtn()}
    <div class="row2"><button class="secondary" data-ok="0">À revoir</button><button class="primary" data-ok="1">Bien dit</button></div>`,
  flashcard: q => `<p class="label">Carte</p><div class="flash" id="card">${q.front === 'ko' ? `<p class="ko ${size(q.item.ko)}">${esc(q.item.ko)}</p>` : `<p class="fr">${esc(q.item.fr)}</p>`}</div>
    <button class="primary" id="flip">Retourner</button>
    <div class="grades" id="grades" hidden>${['Encore', 'Difficile', 'Bien', 'Facile'].map((l, g) => `<button class="g${g}" data-g="${g}">${l}</button>`).join('')}</div>`,
};

function bindChoices(q) {
  const buttons = app.querySelectorAll('.choice');
  buttons.forEach(b => {
    b.onclick = () => {
      const ok = q.choices[+b.dataset.i] === q.item;
      buttons.forEach((c, i) => { c.disabled = true; if (q.choices[i] === q.item) c.classList.add('right'); });
      if (!ok) b.classList.add('wrong');
      answer(ok);
    };
  });
}

const BIND = {
  intro: q => {
    $('#next').onclick = () => { state.cards[q.item.id] ??= newCard(Date.now()); persist(); advance(); };
  },
  recognize: bindChoices,
  reverse: bindChoices,
  listen: bindChoices,
  type: q => {
    const input = $('#typed');
    const check = () => {
      if (!input.value.trim()) return;
      input.disabled = true;
      $('#check').remove();
      answer(checkTyped(input.value, q.item));
    };
    $('#check').onclick = check;
    input.onkeydown = e => { if (e.key === 'Enter') check(); };
    input.focus();
  },
  build: q => {
    const picked = [];
    const tiles = app.querySelector('.tiles');
    const draw = () => {
      $('#picked').innerHTML = picked.map((i, n) => `<button class="tile" data-n="${n}">${esc(q.tiles[i])}</button>`).join('');
      tiles.querySelectorAll('.tile').forEach(b => { b.disabled = picked.includes(+b.dataset.i); });
      $('#check').disabled = picked.length !== q.tiles.length;
    };
    tiles.onclick = e => { const b = e.target.closest('.tile'); if (b) { picked.push(+b.dataset.i); draw(); } };
    $('#picked').onclick = e => { const b = e.target.closest('.tile'); if (b) { picked.splice(+b.dataset.n, 1); draw(); } };
    $('#check').onclick = () => {
      tiles.onclick = $('#picked').onclick = null;
      $('#check').remove();
      answer(checkTiles(picked.map(i => q.tiles[i]), q.item));
    };
  },
  shadow: () => {
    app.querySelectorAll('[data-ok]').forEach(b => {
      b.onclick = () => { $('.row2').remove(); answer(b.dataset.ok === '1'); };
    });
  },
  flashcard: q => {
    $('#flip').onclick = () => {
      $('#card').innerHTML = full(q);
      $('#flip').remove();
      $('#grades').hidden = false;
      say(q.item);
    };
    $('#grades').onclick = e => {
      const b = e.target.closest('[data-g]');
      if (b) { grade(+b.dataset.g); advance(); }
    };
  },
};

function grade(g) {
  const s = session;
  const id = s.current.item.id;
  const now = Date.now();
  state.cards[id] = review(state.cards[id] ?? newCard(now), g, now);
  s.answered++;
  if (g > 0) {
    s.right++;
    s.combo++;
    const gain = s.combo >= 5 ? 20 : 10;
    s.xp += gain;
    addXp(state, gain, now);
    buzz(30);
  } else {
    s.combo = 0;
    buzz([60, 40, 60]);
    if (!s.retried.has(id)) { s.retried.add(id); s.queue.push({ kind: 'quiz', id }); }
  }
  persist();
}

function answer(ok) {
  grade(ok ? 2 : 0);
  const q = session.current;
  const fb = $('#feedback');
  fb.className = ok ? 'good' : 'bad';
  fb.innerHTML = `<b>${ok ? (session.combo >= 5 ? `🔥 Combo ×${session.combo} ! +20 XP` : 'Bien joué ! +10 XP') : 'Pas tout à fait…'}</b>
    ${ok ? '' : `<p class="ko">${esc(q.item.ko)}</p><p>${esc(q.item.fr)}</p>`}
    <button class="primary" id="next">Continuer</button>`;
  $('#next').onclick = advance;
  fb.scrollIntoView({ behavior: 'smooth', block: 'end' });
  say(q.item);
}

function renderSession() {
  const s = session;
  const q = s.current;
  if (!q) return renderSummary();
  app.innerHTML = `<header class="top"><a href="#/" class="icon-btn" aria-label="Quitter">✕</a>
      <div class="bar"><div style="width:${(s.pos / s.queue.length) * 100}%"></div></div>
      <span class="combo${s.combo >= 5 ? ' hot' : ''}">${s.combo >= 2 ? '×' + s.combo : ''}</span></header>
    <main class="card-area">${VIEWS[q.type](q)}</main><footer id="feedback"></footer>`;
  BIND[q.type](q);
  app.querySelectorAll('[data-say]').forEach(b => { b.onclick = () => say(q.item); });
  if (q.type === 'intro' || q.type === 'listen' || q.type === 'shadow') say(q.item);
}

function renderSummary() {
  const s = session;
  const now = Date.now();
  app.innerHTML = `<main class="summary">${s.queue.length
    ? `<p class="big-emoji">🎉</p><h1>Session terminée</h1><p>${s.right}/${s.answered} bonnes réponses · +${s.xp} XP</p>`
    : '<p class="big-emoji">😴</p><h1>Rien à réviser</h1><p>Reviens plus tard ou ouvre une nouvelle leçon.</p>'}
    <p>🔥 ${currentStreak(state, now)} jours · ${todayXp(state, now)}/${state.goal} XP aujourd'hui</p>
    <a class="primary big" href="#/">Accueil</a></main>`;
  session = null;
}

// --- boot ---
async function boot() {
  const data = await Promise.all(UNIT_IDS.map(id => fetch(`content/${id}.json`).then(r => r.json())));
  units = data.map(u => ({ ...u, items: u.lessons.flatMap(l => l.items) }));
  for (const unit of units) for (const item of unit.items) byId[item.id] = { item, unit };
  initVoice();
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
}

boot();