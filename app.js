import { load, save, importState } from './store.js';
import { newCard, review, DAY } from './srs.js';
import { addXp, currentStreak, todayXp, dayKey } from './game.js';
import { pickExercise, buildQuestion, checkTyped, checkTiles, canRead } from './exercises.js';
import { buildSession, lessonSession, lessonUnlocked, lessonDone, cardSession } from './session.js';
import { isSyllable, keystrokes, syllablePool, assembleRound, typingPool, blankRound, romanize } from './games.js';
import * as T from './tutor.js';
import * as M from './mine.js';

const UNIT_IDS = ['hangul', 'phrases', 'vocab', 'grammar'];
const app = document.getElementById('app');
const byId = {};
const lessonById = {};
const mine = { id: 'mine', title: 'Mes mots', icon: '✍️', lessons: [], items: [] };
let units = [];
let patterns = [];
let state = load();
let voice = null;
let session = null;
let tutor = null;

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
  speechSynthesis.onvoiceschanged = () => { pick(); if (!/^#\/(session|game\/)/.test(location.hash)) route(); };
  pick();
}

// --- routing ---
function route() {
  const [, screen, arg] = location.hash.split('/');
  if (screen !== 'session') session = null;
  if (screen !== 'tutor') tutor = null;
  stopGame();
  if (screen === 'unit') renderUnit(arg);
  else if (screen === 'session') session ? renderSession() : (location.hash = '#/');
  else if (screen === 'field') renderField(arg);
  else if (screen === 'cards') renderCards(arg);
  else if (screen === 'games') renderGames();
  else if (screen === 'game') renderGame(arg);
  else if (screen === 'tutor') arg === 'go' ? startTutor() : renderTutorHome();
  else if (screen === 'mine') renderMine();
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
      <a class="unit" href="#/tutor"><span class="ko">🧑‍🏫</span><div><b>Mon tuteur</b><small>Exercices ciblés sur tes difficultés</small></div></a>
      ${units.map(u => `<a class="unit" href="#/unit/${u.id}"><span class="ko">${esc(u.icon)}</span><div><b>${esc(u.title)}</b><small>${u.lessons.filter(l => lessonDone(l, state.cards)).length}/${u.lessons.length} leçons</small></div></a>`).join('')}
      <a class="unit" href="#/mine"><span class="ko">✍️</span><div><b>Mes mots</b><small>${state.custom.length} mot${state.custom.length > 1 ? 's' : ''} · ajoute ce que tu croises, même en photo</small></div></a>
      <a class="unit" href="#/games"><span class="ko">🎮</span><div><b>Jeux</b><small>Syllabes, frappe, dictée, phrases à trous</small></div></a>
      <a class="unit" href="#/cards"><span class="ko">🃏</span><div><b>Mes cartes</b><small>${Object.keys(state.cards).filter(id => byId[id]).length} mots vus · flashcards</small></div></a>
      <a class="unit" href="#/field"><span class="ko">💬</span><div><b>Sur le terrain</b><small>Phrases à montrer ou faire écouter</small></div></a>
    </section>`;
  $('#start').onclick = () => startSession(buildSession([...units, mine], state.cards, Date.now()));
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

function renderCards(unitId) {
  const now = Date.now();
  const unit = [...units, mine].find(u => u.id === unitId);
  const items = (unit ? unit.items : [...units, mine].flatMap(u => u.items))
    .filter(it => state.cards[it.id])
    .sort((a, b) => state.cards[a.id].due - state.cards[b.id].due);
  const when = due => (due <= now ? 'à réviser' : `dans ${Math.ceil((due - now) / DAY)} j`);
  const chip = (id, label) => `<a class="chip${(unit?.id ?? '') === id ? ' on' : ''}" href="#/cards${id ? '/' + id : ''}">${esc(label)}</a>`;
  app.innerHTML = header('Mes cartes', '#/') + `<nav class="chips">${chip('', 'Tout')}${[...units, mine].map(u => chip(u.id, u.title)).join('')}</nav>
    <button class="primary big" id="review" ${items.length ? '' : 'disabled'}>Réviser en flashcards (${Math.min(20, items.length)})</button>
    ${items.length ? '' : '<p class="notice">Aucun mot vu ici pour l\'instant. Commence une leçon !</p>'}
    <section class="field">${items.map(it =>
      `<button class="phrase" data-id="${it.id}"><span class="ko">${esc(it.ko)}</span><small>${esc(it.rom)} · ${when(state.cards[it.id].due)}</small><span>${esc(it.fr)}</span></button>`).join('')}</section>`;
  $('#review').onclick = () => startSession(cardSession(items.map(it => it.id), state.cards));
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
      refreshMine();
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
  if (step.kind === 'rule') { session.current = { type: 'rule', lesson: lessonById[step.lesson] }; return; }
  const { item, unit } = byId[step.id];
  const readable = canRead(item.ko, knownLetters());
  const type = step.kind === 'intro' ? 'intro'
    : step.kind === 'card' ? (readable ? 'flashcard' : unit.id === 'hangul' ? 'recognize' : 'reverse')
    : pickExercise(item, unit.id, Math.random, !!voice, readable);
  const pool = unit === mine ? [...mine.items, ...units.find(u => u.id === 'vocab').items] : unit.items;
  session.current = { ...buildQuestion(type, item, pool), unit: unit.id, readable };
}

// Letters learned so far: the Hangul letter cards already opened.
function knownLetters() {
  const hangul = units.find(u => u.id === 'hangul');
  return new Set(hangul.items.filter(it => state.cards[it.id] && [...it.ko].length === 1 && !isSyllable(it.ko)).map(it => it.ko));
}

function advance() {
  session.pos++;
  prepare();
  renderSession();
}

const size = ko => (ko.length > 4 ? 'lg' : 'xl');
// Romanization shows while the word can't be read yet; once its letters are learned, exercises hide it.
const rom = (q, always) => (state.showRom && (always || (q.unit !== 'hangul' && !q.readable)) ? `<p class="rom">${esc(q.item.rom)}</p>` : '');
const audioBtn = () => (voice ? '<button class="icon-btn audio" data-say aria-label="Écouter">🔊</button>' : '');
const full = q => `<p class="ko ${size(q.item.ko)}">${esc(q.item.ko)}</p>${rom(q, true)}<p class="fr">${esc(q.item.fr)}</p>${q.item.note ? `<p class="note">${esc(q.item.note)}</p>` : ''}`;
const choices = (q, key) => `<div class="choices">${q.choices.map((c, i) =>
  `<button class="choice${key === 'ko' ? ' ko' : ''}" data-i="${i}">${esc(c[key])}${key === 'ko' && state.showRom && !q.readable ? `<small class="rom">${esc(c.rom)}</small>` : ''}</button>`).join('')}</div>`;

const ruleCard = lesson => `<div class="flash rule"><h2>${esc(lesson.title)}</h2>${lesson.rule.text.map(t => `<p>${esc(t)}</p>`).join('')}
  ${lesson.rule.forms ? `<table class="forms">${lesson.rule.forms.map(([form, when, ex]) =>
    `<tr><td class="ko">${esc(form)}</td><td>${esc(when)}</td><td class="ko">${esc(ex)}</td></tr>`).join('')}</table>` : ''}</div>`;

const VIEWS = {
  rule: q => `<p class="label">📖 Règle</p>${ruleCard(q.lesson)}<button class="primary" id="next">Compris, on pratique</button>`,
  gap: q => `<p class="label">Complète</p><div class="flash"><p class="ko lg">${esc(q.prompt)}</p><p class="fr">${esc(q.item.fr)}</p></div>
    <div class="choices">${q.options.map((o, i) => `<button class="choice ko" data-i="${i}">${esc(o)}</button>`).join('')}</div>`,
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
  flashcard: q => `<p class="label">Carte · écris en coréen</p><div class="flash" id="card"><p class="fr">${esc(q.item.fr)}</p></div>${TYPE_INPUT}
    <div class="row2" id="actions"><button class="secondary" id="dunno">Je ne sais pas</button><button class="primary" id="flip">Retourner</button></div>
    <div class="grades" id="grades" hidden>${[['Difficile', 1], ['Bien', 2], ['Facile', 3]].map(([l, g]) => `<button class="g${g}" data-g="${g}">${l}</button>`).join('')}</div>
    <button class="primary" id="next" hidden>Continuer</button>`,
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
  rule: () => { $('#next').onclick = advance; },
  gap: q => {
    const buttons = app.querySelectorAll('.choice');
    buttons.forEach(b => {
      b.onclick = () => {
        const ok = q.options[+b.dataset.i] === q.item.gap.answer;
        buttons.forEach((c, i) => { c.disabled = true; if (q.options[i] === q.item.gap.answer) c.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        answer(ok);
      };
    });
  },
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
  // Type, then flip: right answer lets you grade Hard/Good/Easy, wrong answer counts as Again.
  flashcard: q => {
    const input = $('#typed');
    const reveal = typed => {
      const ok = checkTyped(typed, q.item) && typed.trim() !== '';
      const card = $('#card');
      input.disabled = true;
      $('#actions').remove();
      card.classList.add('flip', ok ? 'good' : 'bad');
      setTimeout(() => {
        card.innerHTML = `<span class="badge">${ok ? '✓' : '✗'}</span>${full(q)}${ok || !typed.trim() ? '' : `<p class="note">Tu as écrit : ${esc(typed)}</p>`}`;
      }, 200);
      say(q.item);
      if (ok) {
        buzz(30);
        $('#grades').hidden = false;
      } else {
        grade(0);
        $('#next').hidden = false;
        $('#next').onclick = advance;
      }
    };
    $('#flip').onclick = () => reveal(input.value);
    $('#dunno').onclick = () => reveal('');
    input.onkeydown = e => { if (e.key === 'Enter') reveal(input.value); };
    $('#grades').onclick = e => {
      const b = e.target.closest('[data-g]');
      if (b) { grade(+b.dataset.g); advance(); }
    };
    input.focus();
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
    if (!s.retried.has(id)) { s.retried.add(id); s.queue.push({ kind: s.queue[s.pos].kind === 'card' ? 'card' : 'quiz', id }); }
  }
  persist();
}

function answer(ok) {
  grade(ok ? 2 : 0);
  const q = session.current;
  const fb = $('#feedback');
  fb.className = ok ? 'good' : 'bad';
  fb.innerHTML = `<b>${ok ? (session.combo >= 5 ? `🔥 Combo ×${session.combo} ! +20 XP` : 'Bien joué ! +10 XP') : 'Pas tout à fait…'}</b>
    ${ok && !q.why ? '' : `<p class="ko">${esc(q.item.ko)}</p>${rom(q, true)}<p>${esc(q.item.fr)}</p>`}
    ${q.why ? `<p class="tip">💡 ${esc(q.why)}</p>` : ''}
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

// --- games ---
const GAMES = {
  assemble: { title: 'Assemble la syllabe', icon: '🧩', desc: 'Touche les lettres dans l\'ordre du clavier' },
  flash: { title: 'Frappe éclair', icon: '⚡', desc: '60 s pour taper un max de mots' },
  dictee: { title: 'Dictée', icon: '🎧', desc: 'Écoute et écris', voice: true },
  blanks: { title: 'Phrases à trous', icon: '🧱', desc: 'Complète la phrase en tapant' },
};
const FLASH_SECONDS = 60;
const TYPE_INPUT = '<input type="text" id="typed" lang="ko" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="한글로…">';
let game = null;

const stopGame = () => { clearInterval(game?.timer); game = null; };
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
const syllables = ko => [...ko].filter(isSyllable).length;

function renderGames() {
  app.innerHTML = header('Jeux', '#/') + `<section class="units">${Object.entries(GAMES).map(([id, g]) => {
    const off = g.voice && !voice;
    return `<a class="unit${off ? ' off' : ''}" href="${off ? '#/games' : `#/game/${id}`}"><span class="ko">${g.icon}</span><div><b>${esc(g.title)}</b><small>${off ? 'Nécessite la voix coréenne' : esc(g.desc)} · 🏆 ${state.best[id] ?? 0}</small></div></a>`;
  }).join('')}</section>
  <p class="notice">Pour taper : Gboard → Langues → Coréen, disposition 2-Beolsik.</p>`;
}

function renderGame(id) {
  stopGame();
  if (!GAMES[id] || (GAMES[id].voice && !voice)) return renderGames();
  game = { id, score: 0, round: 0, rounds: 10 };
  if (id === 'flash') {
    game.timeLeft = FLASH_SECONDS;
    game.timer = setInterval(tick, 1000);
  }
  nextRound();
}

function tick() {
  game.timeLeft--;
  const bar = $('.bar div');
  if (bar) bar.style.width = `${(game.timeLeft / FLASH_SECONDS) * 100}%`;
  if (game.timeLeft <= 0) endGame();
}

function nextRound() {
  if (game.id !== 'flash' && game.round >= game.rounds) return endGame();
  game.round++;
  ROUNDS[game.id]();
}

function play(inner) {
  const g = game;
  const progress = g.id === 'flash' ? g.timeLeft / FLASH_SECONDS : (g.round - 1) / g.rounds;
  app.innerHTML = `<header class="top"><a href="#/games" class="icon-btn" aria-label="Quitter">✕</a>
      <div class="bar"><div style="width:${progress * 100}%"></div></div><span class="combo" id="score">${g.score} pts</span></header>
    <main class="card-area">${inner}</main><footer id="feedback"></footer>`;
}

function addPoints(points) {
  game.score += points;
  $('#score').textContent = `${game.score} pts`;
}

function roundDone(ok, points, html) {
  const g = game;
  addPoints(points);
  buzz(ok ? 30 : [60, 40, 60]);
  app.querySelectorAll('.card-area input, .card-area .row2 button').forEach(e => { e.disabled = true; });
  const fb = $('#feedback');
  fb.className = ok ? 'good' : 'bad';
  fb.innerHTML = `<b>${ok ? `+${points} pts` : 'Raté…'}</b>${html}${ok ? '' : '<button class="primary" id="next">Continuer</button>'}`;
  if (ok) setTimeout(() => { if (game === g) nextRound(); }, 1200);
  else $('#next').onclick = nextRound;
}

// Shared by dictée and phrases à trous: type, 💡 reveals the answer for half points.
function bindTyping(answer, check, reveal, spoken) {
  const input = $('#typed');
  let hinted = false;
  const submit = () => {
    if (!input.value.trim() || input.disabled) return;
    const ok = check(input.value);
    const pts = ok ? (hinted ? Math.ceil(syllables(answer) / 2) : syllables(answer)) * 5 : 0;
    roundDone(ok, pts, reveal);
    if (spoken) speak(spoken);
  };
  $('#hint').onclick = () => { hinted = true; $('#keys').textContent = `${answer} · ${keystrokes(answer).join(' ')}`; input.focus(); };
  $('#check').onclick = submit;
  input.onkeydown = e => { if (e.key === 'Enter') submit(); };
  input.focus();
}
const typingControls = `${TYPE_INPUT}<div class="row2"><button class="secondary" id="hint">💡 Indice</button><button class="primary" id="check">Vérifier</button></div><p class="note ko" id="keys"></p>`;

const ROUNDS = {
  assemble() {
    const r = assembleRound(game.pool ??= syllablePool(units));
    let pos = 0;
    let missed = false;
    play(`<p class="label">Assemble la syllabe</p><div class="flash"><p class="xl">${esc(r.rom)}</p></div>
      ${voice ? '<button class="icon-btn audio" id="snd" aria-label="Écouter">🔊</button>' : ''}
      <div class="picked ko" id="picked"></div>
      <div class="tiles ko">${r.tiles.map((t, i) => `<button class="tile" data-i="${i}">${t}</button>`).join('')}</div>`);
    speak(r.syllable);
    if (voice) $('#snd').onclick = () => speak(r.syllable);
    app.querySelector('.tiles').onclick = e => {
      const b = e.target.closest('.tile');
      if (!b || pos === r.keys.length) return;
      if (b.textContent !== r.keys[pos]) {
        missed = true;
        buzz(80);
        b.classList.remove('wrong');
        void b.offsetWidth; // restart the shake animation
        b.classList.add('wrong');
        return;
      }
      b.disabled = true;
      pos++;
      $('#picked').textContent = r.keys.slice(0, pos).join(' ');
      if (pos === r.keys.length) {
        speak(r.syllable);
        roundDone(true, missed ? 5 : 10, `<p class="ko xl">${r.syllable}</p><p>${r.keys.join(' + ')}</p>`);
      }
    };
  },

  // One persistent input: re-rendering per word would close the phone keyboard.
  flash() {
    const it = pickOne(game.pool ??= typingPool(units.flatMap(u => u.items), state.cards));
    let hinted = false;
    if (game.round === 1) {
      play(`<p class="label">Tape ce mot</p><div class="flash" id="word"></div>${TYPE_INPUT}
        <button class="secondary" id="hint">💡 Touches</button><p class="note ko" id="keys"></p>`);
    }
    $('#word').innerHTML = `<p class="ko ${size(it.ko)}">${esc(it.ko)}</p><p class="fr">${esc(it.fr)}</p>`;
    $('#word').classList.remove('pop');
    void $('#word').offsetWidth;
    $('#word').classList.add('pop');
    $('#keys').textContent = '';
    const input = $('#typed');
    input.value = '';
    input.focus();
    $('#hint').onclick = () => { hinted = true; $('#keys').textContent = keystrokes(it.ko).join(' '); input.focus(); };
    input.oninput = () => {
      if (!checkTyped(input.value, it)) return;
      buzz(30);
      addPoints(hinted ? Math.ceil(syllables(it.ko) / 2) : syllables(it.ko));
      nextRound();
    };
  },

  dictee() {
    const it = pickOne(game.pool ??= typingPool(units.flatMap(u => u.items), state.cards));
    play(`<p class="label">Écoute et écris</p><button class="play" id="snd" aria-label="Réécouter">🔊</button>${typingControls}`);
    say(it);
    $('#snd').onclick = () => say(it);
    bindTyping(it.ko, v => checkTyped(v, it), `<p class="ko">${esc(it.ko)}</p><p class="rom">${esc(it.rom)}</p><p>${esc(it.fr)}</p>`);
  },

  blanks() {
    const r = blankRound(patterns, Object.fromEntries(Object.entries(byId).map(([id, v]) => [id, v.item])));
    play(`<p class="label">Complète en coréen</p><div class="flash"><p class="ko lg">${esc(r.prompt)}</p><p class="fr">${esc(r.fr)}</p></div>${typingControls}`);
    bindTyping(r.noun.ko, v => checkTyped(v, r.noun) || checkTyped(v, { ko: r.full }), `<p class="ko">${esc(r.full)}</p><p>${esc(r.fr)}</p>`, r.full);
  },
};

function endGame() {
  if (!game) return;
  const { id, score } = game;
  stopGame();
  const record = score > (state.best[id] ?? 0);
  if (record) state.best[id] = score;
  addXp(state, score, Date.now());
  persist();
  app.innerHTML = `<main class="summary"><p class="big-emoji">${record ? '🏆' : '🎉'}</p>
    <h1>${record ? 'Nouveau record !' : 'Partie terminée'}</h1><p>${score} points · +${score} XP</p><p>Record : ${state.best[id] ?? 0}</p>
    <button class="primary big" id="again">Rejouer</button><a class="secondary" href="#/games">Autres jeux</a></main>`;
  $('#again').onclick = () => renderGame(id);
}

// --- tutor ---
const TUTOR_XP = 10;
const hangulItems = () => units.find(u => u.id === 'hangul').items;

function tutorCtx() {
  const items = hangulItems();
  const known = T.knownLetters(items, state.cards);
  return { known, weights: T.scores(state.tutor, state.cards, items, known) };
}

function nextLessonTitle() {
  for (const u of units) {
    const l = u.lessons.find(x => !lessonDone(x, state.cards));
    if (l) return l.title;
  }
  return null;
}

const letterBox = d => `<span class="jamo ko">${esc(d.jamo)}</span>`;
const letterRom = (slot, rom) => (slot === 2 ? `${rom} · en bas de la syllabe` : rom);

function renderTutorHome() {
  const { weights } = tutorCtx();
  const list = T.difficulties(state.tutor, weights);
  app.innerHTML = header('Mon tuteur', '#/') + `
    <button class="primary big" id="go">Commencer une séance</button>
    <p class="notice">${esc(T.advice(weights, nextLessonTitle()))}</p>
    <p class="label">Tes difficultés</p>
    ${list.length ? `<section class="field">${list.map(d => `<div class="phrase diff">
      <div class="diff-head">${letterBox(d)}<div><b>${esc(letterRom(d.slot, d.rom))}</b><small>${d.seen
        ? `${d.miss} erreur${d.miss > 1 ? 's' : ''} sur ${d.seen}`
        : 'fragile d\'après tes cartes'}${d.got != null ? ` · confondu avec <span class="ko">${esc(d.got || 'rien')}</span> (${d.times}×)` : ''}</small></div></div>
      <p class="tip">💡 ${esc(d.tip)}</p></div>`).join('')}</section>`
      : '<p class="notice">Rien d\'alarmant pour l\'instant 👌</p>'}`;
  $('#go').onclick = () => { location.hash = '#/tutor/go'; };
}

function startTutor() {
  const words = T.wordPool(units.flatMap(u => u.items), state.cards, hangulItems());
  tutor = { plan: T.planTypes(words.length > 0, !!voice).map(type => ({ type })), pos: 0, right: 0, xp: 0, words,
    retried: new Set(), missed: {}, lastFocus: null, lastSyl: null, q: null };
  tutorNext();
}

function tutorNext() {
  const step = tutor.plan[tutor.pos];
  if (!step) return tutorSummary();
  const { known, weights } = tutorCtx();
  if (step.type === 'word') {
    tutor.q = { type: 'word', item: T.pickWord(tutor.words, weights) };
  } else {
    const focus = step.focus ?? T.pickFocus(weights, Math.random, tutor.lastFocus);
    let syl;
    for (let i = 0; i < 6 && (!syl || syl === tutor.lastSyl); i++) syl = T.makeSyllable(focus, weights, known);
    const q = { type: step.type, focus, syl, rom: romanize(syl) };
    if (['pickRom', 'pickKo', 'listen'].includes(q.type)) q.choices = T.choicesFor(syl, focus, known, q.type === 'listen');
    if (q.type === 'build') Object.assign(q, T.tilesFor(syl));
    tutor.q = q;
    tutor.lastFocus = focus;
    tutor.lastSyl = syl;
  }
  renderTutorStep();
}

const ROM_INPUT = (ph) => `<input type="text" id="typed" lang="fr" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${ph}">
  <div class="row2"><button class="secondary" id="dunno">Je ne sais pas</button><button class="primary" id="check">Vérifier</button></div>`;
const tChoices = (q, key) => `<div class="choices">${q.choices.map((c, i) =>
  `<button class="choice${key === 'syl' ? ' ko' : ''}" data-i="${i}">${esc(c[key])}</button>`).join('')}</div>`;
const sndBtn = () => (voice ? '<button class="icon-btn audio" id="snd" aria-label="Écouter">🔊</button>' : '');

const TUTOR_VIEWS = {
  read: q => `<p class="label">Lis cette syllabe</p><div class="flash"><p class="ko xl">${q.syl}</p></div>${ROM_INPUT('en lettres latines, ex : ga')}`,
  pickRom: q => `<p class="label">Comment ça se lit ?</p><div class="flash"><p class="ko xl">${q.syl}</p></div>${tChoices(q, 'rom')}`,
  pickKo: q => `<p class="label">Trouve la syllabe</p><div class="flash"><p class="xl">${esc(q.rom)}</p></div>${sndBtn()}${tChoices(q, 'syl')}`,
  listen: q => `<p class="label">Qu'entends-tu ?</p><button class="play" id="snd" aria-label="Réécouter">🔊</button>${tChoices(q, 'syl')}`,
  build: q => `<p class="label">Construis la syllabe</p><div class="flash"><p class="xl">${esc(q.rom)}</p></div>${sndBtn()}
    <div class="picked ko" id="picked"></div><div class="tiles ko">${q.tiles.map((t, i) => `<button class="tile" data-i="${i}">${t}</button>`).join('')}</div>`,
  word: q => `<p class="label">Déchiffre lettre par lettre</p><div class="flash"><p class="ko ${size(q.item.ko)}">${esc(q.item.ko)}</p><p class="note">${esc(q.item.fr)}</p></div>
    ${ROM_INPUT(`sépare les syllabes : ${[...q.item.ko].filter(isSyllable).map(() => '…').join(' ')}`)}`,
};

function renderTutorStep() {
  const q = tutor.q;
  app.innerHTML = `<header class="top"><a href="#/tutor" class="icon-btn" aria-label="Quitter">✕</a>
      <div class="bar"><div style="width:${(tutor.pos / tutor.plan.length) * 100}%"></div></div><span class="combo">${tutor.right}</span></header>
    <main class="card-area">${TUTOR_VIEWS[q.type](q)}</main><footer id="feedback"></footer>`;
  const spoken = q.type === 'word' ? q.item.say || q.item.ko : q.syl;
  app.querySelectorAll('#snd').forEach(b => { b.onclick = () => speak(spoken); });
  if (q.type === 'listen' || q.type === 'pickKo' || q.type === 'build') speak(spoken);
  TUTOR_BIND[q.type](q);
}

function bindRomInput(onSubmit) {
  const input = $('#typed');
  const submit = typed => {
    if (input.disabled) return;
    input.disabled = true;
    app.querySelectorAll('.card-area .row2 button').forEach(b => { b.disabled = true; });
    onSubmit(typed);
  };
  $('#check').onclick = () => input.value.trim() && submit(input.value);
  $('#dunno').onclick = () => submit('');
  input.onkeydown = e => { if (e.key === 'Enter' && input.value.trim()) submit(input.value); };
  input.focus();
}

// A choice differs from the answer only in the focus letter, so the pick names the confusion.
function bindTutorChoices(q) {
  const buttons = app.querySelectorAll('.choice');
  buttons.forEach(b => {
    b.onclick = () => {
      const pick = q.choices[+b.dataset.i];
      buttons.forEach((c, i) => { c.disabled = true; if (q.choices[i].syl === q.syl) c.classList.add('right'); });
      if (pick.syl !== q.syl) b.classList.add('wrong');
      const want = T.split(q.syl);
      const got = T.split(pick.syl);
      const diffs = [0, 1, 2].filter(i => want[i] !== got[i]).map(i => ({ slot: i, want: want[i], got: got[i] }));
      tutorAnswer(q, diffs);
    };
  });
}

const TUTOR_BIND = {
  read: q => bindRomInput(typed => {
    const d = typed ? T.decode(typed, q.syl) : { ok: false, diffs: [] };
    tutorAnswer(q, d.diffs, typed && !d.got ? 'Je n\'ai pas reconnu cette lecture.' : typed ? '' : 'Pas grave, regarde bien la décomposition.', !d.ok && !d.diffs.length);
  }),
  pickRom: bindTutorChoices,
  pickKo: bindTutorChoices,
  listen: bindTutorChoices,
  build: q => {
    let pos = 0;
    const diffs = [];
    const isVowel = j => T.slotOf(j) === 1;
    app.querySelector('.tiles').onclick = e => {
      const b = e.target.closest('.tile');
      if (!b || pos === q.letters.length) return;
      const slot = pos;
      if (b.textContent !== q.letters[pos]) {
        if (isVowel(b.textContent) === (slot === 1) && !diffs.some(d => d.slot === slot)) diffs.push({ slot, want: q.letters[pos], got: b.textContent });
        buzz(80);
        b.classList.remove('wrong');
        void b.offsetWidth;
        b.classList.add('wrong');
        return;
      }
      b.disabled = true;
      pos++;
      $('#picked').textContent = q.letters.slice(0, pos).join(' ');
      if (pos === q.letters.length) tutorAnswer(q, diffs);
    };
  },
  word: q => bindRomInput(typed => tutorWordAnswer(q, typed)),
};

const spellHtml = (syl, diffs = []) => `<div class="spell">${T.spell(syl).map(p => {
  const d = diffs.find(x => x.slot === p.slot);
  return `<span class="${d ? 'bad' : ''}"><b class="ko">${esc(p.jamo)}</b>${esc(p.rom)}${d ? `<small>${d.got ? `pas ${esc(d.got)}` : 'oublié'}</small>` : ''}</span>`;
}).join('')}</div>`;

function tipsHtml(diffs) {
  const tips = [...new Set(diffs.map(d => T.tipFor(d.slot, d.want, d.got)))].slice(0, 2);
  return tips.map(t => `<p class="tip">💡 ${esc(t)}</p>`).join('');
}

// Wrong letters come back a few questions later, once each.
function scheduleRetry(keys) {
  for (const key of keys) {
    if (tutor.retried.has(key) || tutor.retried.size >= 4) continue;
    tutor.retried.add(key);
    tutor.plan.splice(Math.min(tutor.pos + 3, tutor.plan.length), 0, { type: T.slotOf(key) === 2 ? 'pickKo' : 'read', focus: key });
  }
}

function tutorScore(ok, marks) {
  T.record(state.tutor, marks, Date.now());
  for (const m of marks) {
    if (m.ok) continue;
    const x = (tutor.missed[m.key] ??= { got: null, n: 0 });
    x.n++;
    if (m.got != null) x.got = m.got;
  }
  if (ok) {
    tutor.right++;
    tutor.xp += TUTOR_XP;
    addXp(state, TUTOR_XP, Date.now());
    buzz(30);
  } else {
    buzz([60, 40, 60]);
    scheduleRetry(marks.filter(m => !m.ok).map(m => m.key));
  }
  persist();
  return marks.filter(m => m.ok && state.tutor.letters[m.key]?.streak === 3).map(m => m.key);
}

function tutorFeedback(ok, html) {
  const fb = $('#feedback');
  fb.className = ok ? 'good' : 'bad';
  fb.innerHTML = `${html}<button class="primary" id="next">Continuer</button>`;
  $('#next').onclick = () => { tutor.pos++; tutorNext(); };
  fb.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function tutorAnswer(q, diffs, note = '', unknown = false) {
  const marks = unknown
    ? T.split(q.syl).flatMap((j, slot) => (slot === 2 && !j ? [] : [{ key: T.keyOf(slot, j), ok: false }]))
    : T.marksFor(q.syl, diffs);
  const ok = !unknown && diffs.length === 0;
  const fixed = tutorScore(ok, marks);
  speak(q.syl);
  tutorFeedback(ok, `<b>${ok ? `Bien lu ! +${TUTOR_XP} XP` : 'Pas tout à fait…'}</b>
    <p class="ko">${q.syl} <span class="rom">${esc(q.rom)}</span></p>${spellHtml(q.syl, diffs)}
    ${note ? `<p class="note">${esc(note)}</p>` : ''}${ok ? '' : tipsHtml(diffs)}
    ${fixed.map(k => `<p class="note">💪 <span class="ko">${esc(k.replace('_', ''))}</span> : 3 bonnes d'affilée !</p>`).join('')}`);
}

function tutorWordAnswer(q, typed) {
  const r = typed ? T.checkWord(typed, q.item) : { ok: false, res: [...q.item.ko].filter(isSyllable).map(syl => ({ syl, diffs: [] })) };
  const marks = r.unsplit || !typed ? [] : r.res.flatMap(x => (x.got ? T.marksFor(x.syl, x.diffs) : []));
  const fixed = tutorScore(r.ok, marks);
  const diffs = r.res.flatMap(x => x.diffs ?? []);
  const changes = T.soundChanges(q.item.ko);
  say(q.item);
  tutorFeedback(r.ok, `<b>${r.ok ? `Bien déchiffré ! +${TUTOR_XP} XP` : 'Pas tout à fait…'}</b>
    <div class="spell-word">${r.res.map(x => spellHtml(x.syl, x.diffs ?? [])).join('')}</div>
    ${r.unsplit && typed ? '<p class="note">Sépare les syllabes par des espaces pour que je voie où ça coince.</p>' : ''}
    ${r.ok ? '' : tipsHtml(diffs)}
    <p>À l'oral : <b>${esc(q.item.rom)}</b> · ${esc(q.item.fr)}</p>
    ${changes.map(c => `<p class="tip">🗣️ ${esc(c)}</p>`).join('')}
    ${fixed.map(k => `<p class="note">💪 <span class="ko">${esc(k.replace('_', ''))}</span> : 3 bonnes d'affilée !</p>`).join('')}`);
}

function tutorSummary() {
  const t = tutor;
  const { weights } = tutorCtx();
  const stuck = Object.entries(t.missed).sort((a, b) => b[1].n - a[1].n).slice(0, 3).map(([key, { got }]) => {
    const slot = T.slotOf(key);
    const j = key.replace('_', '');
    return `<div class="phrase diff"><div class="diff-head"><span class="jamo ko">${esc(j)}</span><b>${esc(letterRom(slot, T.romLabel(slot, j)))}</b></div>
      <p class="tip">💡 ${esc(got != null ? T.tipFor(slot, j, got.replace('_', '')) : T.letterTip(key))}</p></div>`;
  }).join('');
  app.innerHTML = `<main class="summary"><p class="big-emoji">${t.right === t.plan.length ? '🏆' : '🎉'}</p>
    <h1>Séance terminée</h1><p>${t.right}/${t.plan.length} bonnes réponses · +${t.xp} XP</p>
    ${stuck ? `<p class="label">À retenir</p><section class="field left">${stuck}</section>` : '<p>Aucune erreur, bravo !</p>'}
    <p class="notice">${esc(T.advice(weights, nextLessonTitle()))}</p>
    <button class="primary big" id="again">Encore une séance</button><a class="secondary" href="#/tutor">Mes difficultés</a></main>`;
  $('#again').onclick = startTutor;
}

// --- my words ---
const OCR_SCRIPT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

// Own words live in state.custom; this registers them like content items.
function refreshMine() {
  for (const id of Object.keys(byId)) if (byId[id].unit === mine) delete byId[id];
  mine.items = state.custom;
  mine.lessons = [{ id: 'my-l', title: 'Mes mots', items: state.custom }];
  for (const item of state.custom) byId[item.id] = { item, unit: mine };
}

// Vocabulary and phrases first: a word should match its meaning, not a Hangul reading drill.
const contentItems = () => [...units.filter(u => u.id !== 'hangul'), ...units.filter(u => u.id === 'hangul')].flatMap(u => u.items);

function addWord(ko, fr, note = '') {
  const existing = M.findExisting(ko, contentItems());
  if (existing) {
    const had = !!state.cards[existing.id];
    state.cards[existing.id] ??= newCard(Date.now());
    persist();
    const where = byId[existing.id].unit.title;
    return `« ${existing.ko} » est déjà dans l'app (${where} : ${existing.fr}). ${had ? 'Il est déjà dans tes révisions.' : 'Je l\'ai ajouté à tes révisions.'}`;
  }
  if (state.custom.some(it => it.ko === ko.normalize('NFC').trim())) return `« ${ko} » est déjà dans tes mots.`;
  const item = M.makeCustom(ko, fr, note, Date.now());
  state.custom.unshift(item);
  state.cards[item.id] = newCard(Date.now());
  persist();
  refreshMine();
  return null;
}

function renderMine() {
  const now = Date.now();
  const when = id => (state.cards[id]?.due <= now ? 'à réviser' : `dans ${Math.ceil((state.cards[id].due - now) / DAY)} j`);
  app.innerHTML = header('Mes mots', '#/') + `
    <section class="settings add-word">
      <input type="text" id="ko" lang="ko" autocomplete="off" placeholder="Mot en coréen (한글)">
      <input type="text" id="fr" autocomplete="off" placeholder="Traduction en français">
      <input type="text" id="where" autocomplete="off" placeholder="Où tu l'as vu (facultatif)">
      <div class="row2"><a class="secondary" id="tr" target="_blank" rel="noopener">🔎 Traduire</a><button class="primary" id="add">Ajouter</button></div>
      <p id="msg" class="note"></p>
      <label class="secondary">📷 Depuis une photo <small>(expérimental, connexion requise la 1re fois)</small><input type="file" id="photo" accept="image/*" hidden></label>
      <div id="ocr"></div>
    </section>
    ${state.custom.length ? `<button class="primary big" id="review">Réviser mes mots (${Math.min(20, state.custom.length)})</button>` : ''}
    <section class="field">${state.custom.map(it => `<div class="phrase mine" data-id="${it.id}">
      <button class="say" data-say="${it.id}"><span class="ko">${esc(it.ko)}</span><small>${esc(it.rom)} · ${when(it.id)}</small><span>${esc(it.fr)}</span>${it.note ? `<small>📍 ${esc(it.note)}</small>` : ''}</button>
      <button class="icon-btn del" data-del="${it.id}" aria-label="Supprimer">🗑</button></div>`).join('')}</section>`;
  const ko = $('#ko');
  const fr = $('#fr');
  const syncTr = () => { $('#tr').href = M.translateUrl(ko.value.trim() || '안녕하세요'); };
  ko.oninput = syncTr;
  syncTr();
  $('#add').onclick = () => {
    const msg = $('#msg');
    if (!M.hasHangul(ko.value)) { msg.textContent = 'Écris le mot en hangeul (clavier coréen).'; return ko.focus(); }
    if (!fr.value.trim()) { msg.textContent = 'Ajoute la traduction : 🔎 Traduire peut t\'aider.'; return fr.focus(); }
    const info = addWord(ko.value, fr.value, $('#where').value);
    if (info) { msg.textContent = info; return; }
    buzz(30);
    renderMine();
    $('#msg').textContent = 'Ajouté ✓ Il arrive dans ta prochaine session.';
  };
  $('#review')?.addEventListener('click', () => startSession(cardSession(state.custom.map(it => it.id), state.cards)));
  app.querySelectorAll('[data-say]').forEach(b => { b.onclick = () => say(byId[b.dataset.say].item); });
  app.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => {
      const it = state.custom.find(x => x.id === b.dataset.del);
      if (!it || !confirm(`Supprimer « ${it.ko} » de tes mots ?`)) return;
      state.custom = state.custom.filter(x => x !== it);
      delete state.cards[it.id];
      persist();
      refreshMine();
      renderMine();
    };
  });
  $('#photo').onchange = e => { const f = e.target.files[0]; if (f) readPhoto(f); };
}

function loadOcr() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = OCR_SCRIPT;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => reject(new Error('script'));
    document.head.append(s);
  });
}

// Large phone photos are slow to read: scale down to 1600 px first.
async function shrink(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function readPhoto(file) {
  const box = $('#ocr');
  const status = t => { if ($('#ocr') === box) box.innerHTML = `<p class="notice">${t}</p>`; };
  status('Chargement de la lecture de texte…');
  let worker;
  try {
    const Tesseract = await loadOcr();
    worker = await Tesseract.createWorker('kor', 1, {
      logger: m => { if (m.status === 'recognizing text') status(`Lecture de la photo… ${Math.round(m.progress * 100)} %`); },
    });
    status('Lecture de la photo…');
    const { data } = await worker.recognize(await shrink(file));
    showWords(M.wordsFromText(data.text, M.knownWords([...contentItems(), ...state.custom])));
  } catch {
    status(navigator.onLine ? 'La lecture a échoué. Essaie une photo plus nette, bien de face.' : 'Il faut une connexion la première fois pour télécharger la lecture de texte (~5 Mo).');
  } finally {
    worker?.terminate();
  }
}

function showWords({ fresh, old }) {
  const box = $('#ocr');
  if (!box) return;
  box.innerHTML = `${fresh.length ? `<p class="label">Mots nouveaux (${fresh.length})</p>` : '<p class="notice">Aucun mot nouveau trouvé. Essaie une photo plus nette, bien de face.</p>'}
    <div class="field">${fresh.map((w, i) => `<div class="phrase ocr-word" data-i="${i}">
      <div class="diff-head"><span class="ko lg">${esc(w)}</span><small>${esc(M.autoRom(w))}</small></div>
      <input type="text" placeholder="Traduction" autocomplete="off">
      <div class="row2"><a class="secondary" href="${M.translateUrl(w)}" target="_blank" rel="noopener">🔎 Traduire</a><button class="primary">Ajouter</button></div>
    </div>`).join('')}</div>
    ${old.length ? `<p class="note">Déjà connus : <span class="ko">${old.map(esc).join(' · ')}</span></p>` : ''}
    <p class="note">La lecture peut se tromper : vérifie chaque mot avant de l'ajouter.</p>`;
  box.querySelectorAll('.ocr-word').forEach(row => {
    row.querySelector('button').onclick = () => {
      const w = fresh[+row.dataset.i];
      const tr = row.querySelector('input');
      if (!tr.value.trim()) { tr.placeholder = 'Ajoute la traduction d\'abord'; return tr.focus(); }
      const info = addWord(w, tr.value, 'photo');
      row.innerHTML = `<p>${info ? esc(info) : `<span class="ko">${esc(w)}</span> ajouté ✓`}</p>`;
      buzz(30);
    };
  });
}

// --- boot ---
async function boot() {
  navigator.storage?.persist?.();
  try {
    const data = await Promise.all(UNIT_IDS.map(id => fetch(`content/${id}.json`).then(r => r.json())));
    units = data.map(u => ({ ...u, items: u.lessons.flatMap(l => l.items) }));
    for (const unit of units) for (const item of unit.items) byId[item.id] = { item, unit };
    for (const unit of units) for (const lesson of unit.lessons) lessonById[lesson.id] = lesson;
    refreshMine();
    ({ patterns } = await fetch('content/patterns.json').then(r => r.json()));
    initVoice();
    window.addEventListener('hashchange', route);
    route();
  } catch {
    app.innerHTML = '<p class="notice">Impossible de charger le contenu. Connecte-toi à Internet une première fois puis recharge.</p>';
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
}

boot();