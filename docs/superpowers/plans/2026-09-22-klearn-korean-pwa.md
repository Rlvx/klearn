# klearn Korean PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline-first, gamified PWA to learn Hangul, survival phrases and vocabulary with SM-2 spaced repetition, installable on Android tonight.

**Architecture:** Static site, no build. Pure ES modules (`srs.js`, `game.js`, `exercises.js`, `session.js`, `store.js`) hold all logic and are unit-tested with `node --test`; `app.js` is the only DOM code (hash router + screen renderers). Content lives in `content/*.json`; `sw.js` precaches everything, cache-first.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), Web Speech API (`speechSynthesis`), Service Worker + Cache API, `localStorage`, Node 23 `node:test`, GitHub Pages.

## Global Constraints

- No framework, no npm dependencies, no build step. `package.json` exists only for `"type": "module"` and the `test` script.
- Must work fully offline after one online load (every asset listed in `sw.js` `ASSETS`).
- Target: Android Chrome. No iOS work.
- Korean audio only through `speechSynthesis` with a voice whose `lang` starts with `ko`; hide audio UI when none.
- Jamo in content use Hangul Compatibility Jamo (U+3131–U+318E, what phone keyboards type).
- UI language: French. Romanization: Revised Romanization.
- `tiles.join(' ')` must equal `ko` for every item with `tiles`.
- Bump `CACHE` in `sw.js` on every deploy that changes any file.

---

### Task 1: SM-2 scheduler

**Files:**
- Create: `package.json`, `srs.js`, `tests/srs.test.js`, `.gitignore`

**Interfaces:**
- Produces: `DAY` (ms), `newCard(now) -> Card`, `review(card, grade, now) -> Card` where `Card = { ease, interval, due, reps, lapses }`, grade 0 Again / 1 Hard / 2 Good / 3 Easy, `interval` in days, `due` epoch ms.

- [ ] **Step 1: Write package.json and .gitignore**

```json
{ "name": "klearn", "private": true, "type": "module", "scripts": { "test": "node --test" } }
```

`.gitignore`:
```
node_modules/
```

- [ ] **Step 2: Write the failing test** — `tests/srs.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCard, review, DAY } from '../srs.js';

const NOW = 1_700_000_000_000;

test('new card is due now', () => {
  const c = newCard(NOW);
  assert.equal(c.due, NOW);
  assert.equal(c.reps, 0);
});

test('good on new card -> 1 day', () => {
  const c = review(newCard(NOW), 2, NOW);
  assert.equal(c.interval, 1);
  assert.equal(c.due, NOW + DAY);
  assert.equal(c.reps, 1);
});

test('good twice -> 3 days, then grows by ease', () => {
  let c = review(newCard(NOW), 2, NOW);
  c = review(c, 2, NOW);
  assert.equal(c.interval, 3);
  c = review(c, 2, NOW);
  assert.equal(c.interval, 8);
});

test('again resets, lowers ease, due in 10 min', () => {
  let c = review(review(newCard(NOW), 2, NOW), 2, NOW);
  c = review(c, 0, NOW);
  assert.equal(c.reps, 0);
  assert.equal(c.lapses, 1);
  assert.equal(c.ease, 2.3);
  assert.equal(c.due, NOW + 10 * 60_000);
});

test('ease never below 1.3', () => {
  let c = newCard(NOW);
  for (let i = 0; i < 20; i++) c = review(c, 0, NOW);
  assert.equal(c.ease, 1.3);
});

test('easy on new card -> 4 days, ease up', () => {
  const c = review(newCard(NOW), 3, NOW);
  assert.equal(c.interval, 4);
  assert.equal(c.ease, 2.65);
});

test('hard on new card -> 1 day, ease down', () => {
  const c = review(newCard(NOW), 1, NOW);
  assert.equal(c.interval, 1);
  assert.equal(c.ease, 2.35);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test`
Expected: FAIL, `Cannot find module '.../srs.js'`

- [ ] **Step 4: Implement** — `srs.js`

```js
export const DAY = 86_400_000;
const MIN = 60_000;
const round2 = x => Math.round(x * 100) / 100;

export function newCard(now) {
  return { ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0 };
}

// grade: 0 Again, 1 Hard, 2 Good, 3 Easy
export function review(card, grade, now) {
  if (grade === 0) {
    return { ease: Math.max(1.3, round2(card.ease - 0.2)), interval: 0, due: now + 10 * MIN, reps: 0, lapses: card.lapses + 1 };
  }
  let { ease, interval, reps } = card;
  if (grade === 1) {
    interval = Math.max(1, Math.round(interval * 1.2));
    ease -= 0.15;
  } else if (grade === 2) {
    interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease);
  } else {
    interval = reps === 0 ? 4 : Math.round(Math.max(interval, 1) * ease * 1.3);
    ease += 0.15;
  }
  return { ease: Math.max(1.3, round2(ease)), interval, due: now + interval * DAY, reps: reps + 1, lapses: card.lapses };
}
```

- [ ] **Step 5: Run tests** — `node --test` — Expected: 7 pass.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore srs.js tests/srs.test.js
git commit -m "feat: add SM-2 scheduler"
```

---

### Task 2: Persistence and gamification state

**Files:**
- Create: `store.js`, `game.js`, `tests/store.test.js`, `tests/game.test.js`

**Interfaces:**
- Consumes: `DAY` from `srs.js`.
- Produces:
  - `store.js`: `KEY`, `defaultState() -> State`, `load(storage = localStorage) -> State`, `save(state, storage = localStorage)`, `importState(text) -> State` (throws `Error` on invalid). `State = { cards: {[id]: Card}, xp: {[dayKey]: number}, streak: number, lastGoalDay: string|null, goal: number, showRom: boolean }`.
  - `game.js`: `dayKey(now) -> 'YYYY-M-D'` (local time), `addXp(state, n, now)` (mutates), `todayXp(state, now) -> number`, `currentStreak(state, now) -> number`.

- [ ] **Step 1: Write failing tests**

`tests/store.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { load, save, importState, defaultState, KEY } from '../store.js';

const mem = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), keys: () => [...m.keys()] };
};

test('empty storage -> default state', () => {
  assert.deepEqual(load(mem()), defaultState());
});

test('save then load roundtrip', () => {
  const s = mem();
  const st = defaultState();
  st.cards.a = { due: 1 };
  save(st, s);
  assert.deepEqual(load(s), st);
});

test('corrupt data -> default state, blob kept as backup', () => {
  const s = mem();
  s.setItem(KEY, '{oops');
  assert.deepEqual(load(s), defaultState());
  assert.ok(s.keys().some(k => k.startsWith(KEY + '-corrupt-')));
});

test('import rejects invalid files', () => {
  assert.throws(() => importState('nope'));
  assert.throws(() => importState('null'));
  assert.throws(() => importState('{"cards":1}'));
});

test('import fills missing fields', () => {
  assert.equal(importState('{"cards":{}}').goal, 50);
});
```

`tests/game.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addXp, currentStreak, todayXp } from '../game.js';
import { defaultState } from '../store.js';
import { DAY } from '../srs.js';

const NOW = new Date(2026, 8, 23, 12).getTime();

test('xp accumulates per day', () => {
  const s = defaultState();
  addXp(s, 10, NOW);
  addXp(s, 20, NOW);
  assert.equal(todayXp(s, NOW), 30);
  assert.equal(todayXp(s, NOW + DAY), 0);
});

test('streak starts once the goal is reached, counted once per day', () => {
  const s = defaultState();
  addXp(s, 40, NOW);
  assert.equal(currentStreak(s, NOW), 0);
  addXp(s, 10, NOW);
  assert.equal(currentStreak(s, NOW), 1);
  addXp(s, 50, NOW);
  assert.equal(s.streak, 1);
});

test('streak continues next day and resets after a gap', () => {
  const s = defaultState();
  addXp(s, 50, NOW);
  addXp(s, 50, NOW + DAY);
  assert.equal(currentStreak(s, NOW + DAY), 2);
  assert.equal(currentStreak(s, NOW + 3 * DAY), 0);
  addXp(s, 50, NOW + 3 * DAY);
  assert.equal(s.streak, 1);
});
```

- [ ] **Step 2: Run** `node --test` — Expected: FAIL, missing modules.

- [ ] **Step 3: Implement**

`store.js`:
```js
export const KEY = 'klearn-v1';

export function defaultState() {
  return { cards: {}, xp: {}, streak: 0, lastGoalDay: null, goal: 50, showRom: true };
}

export function load(storage = globalThis.localStorage) {
  const raw = storage.getItem(KEY);
  if (!raw) return defaultState();
  try {
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    storage.setItem(`${KEY}-corrupt-${Date.now()}`, raw);
    return defaultState();
  }
}

export function save(state, storage = globalThis.localStorage) {
  storage.setItem(KEY, JSON.stringify(state));
}

export function importState(text) {
  const s = JSON.parse(text);
  if (!s || typeof s.cards !== 'object' || !s.cards) throw new Error('Fichier de progression invalide');
  return { ...defaultState(), ...s };
}
```

`game.js`:
```js
import { DAY } from './srs.js';

export function dayKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function addXp(state, n, now) {
  const k = dayKey(now);
  state.xp[k] = (state.xp[k] || 0) + n;
  if (state.xp[k] >= state.goal && state.lastGoalDay !== k) {
    state.streak = state.lastGoalDay === dayKey(now - DAY) ? state.streak + 1 : 1;
    state.lastGoalDay = k;
  }
}

export const todayXp = (state, now) => state.xp[dayKey(now)] || 0;

export function currentStreak(state, now) {
  return [dayKey(now), dayKey(now - DAY)].includes(state.lastGoalDay) ? state.streak : 0;
}
```

- [ ] **Step 4: Run** `node --test` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add store.js game.js tests/store.test.js tests/game.test.js
git commit -m "feat: add progress storage, XP and streak"
```

---

### Task 3: Exercises and session queues

**Files:**
- Create: `exercises.js`, `session.js`, `tests/exercises.test.js`, `tests/session.test.js`

**Interfaces:**
- Consumes: `Item = { id, ko, rom, fr, note?, tiles?, say? }`, `Unit = { id, title, icon, lessons: [{ id, title, icon?, items: Item[] }] }`, cards map from `store.js`.
- Produces:
  - `exercises.js`: `shuffle(arr, rand = Math.random) -> new array`, `pickExercise(item, unitId, rand = Math.random, hasVoice = true) -> 'flashcard'|'recognize'|'reverse'|'listen'|'type'|'build'|'shadow'`, `buildQuestion(type, item, pool, rand = Math.random) -> { type, item, choices?: Item[4], tiles?: string[], front?: 'ko'|'fr' }`, `normalize(s)`, `checkTyped(input, item) -> bool`, `checkTiles(order: string[], item) -> bool`.
  - `session.js`: `lessonDone(lesson, cards) -> bool`, `lessonUnlocked(unit, i, cards) -> bool`, `buildSession(units, cards, now, newLimit = 5, max = 20, rand) -> Step[]`, `lessonSession(lesson, cards, rand) -> Step[]`, `Step = { kind: 'intro'|'quiz', id }`.

- [ ] **Step 1: Write failing tests**

`tests/exercises.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, pickExercise, buildQuestion, checkTyped, checkTiles } from '../exercises.js';

const pool = [
  { id: 'a', ko: '가', fr: 'ga' }, { id: 'b', ko: '나', fr: 'na' }, { id: 'c', ko: '다', fr: 'da' },
  { id: 'd', ko: '라', fr: 'ra' }, { id: 'e', ko: '마', fr: 'ma' }, { id: 'f', ko: '가', fr: 'ga' },
];

test('shuffle keeps elements and does not mutate', () => {
  const a = [1, 2, 3, 4];
  assert.deepEqual([...shuffle(a)].sort(), [1, 2, 3, 4]);
  assert.deepEqual(a, [1, 2, 3, 4]);
});

test('choices: 4 distinct answers including the item', () => {
  for (let i = 0; i < 50; i++) {
    for (const [type, key] of [['recognize', 'fr'], ['listen', 'ko']]) {
      const q = buildQuestion(type, pool[0], pool);
      assert.equal(q.choices.length, 4);
      assert.ok(q.choices.includes(pool[0]));
      assert.equal(new Set(q.choices.map(c => c[key])).size, 4);
    }
  }
});

test('typed answers ignore spaces and punctuation', () => {
  assert.ok(checkTyped(' 이거 얼마 예요 ', { ko: '이거 얼마예요?' }));
  assert.ok(!checkTyped('이거', { ko: '이거 얼마예요?' }));
});

test('typed answers accept decomposed Hangul', () => {
  assert.ok(checkTyped('가'.normalize('NFD'), { ko: '가' }));
});

test('tiles must be in order', () => {
  const it = { tiles: ['이거', '주세요'] };
  assert.ok(checkTiles(['이거', '주세요'], it));
  assert.ok(!checkTiles(['주세요', '이거'], it));
});

test('pickExercise respects unit and voice', () => {
  const a = new Set();
  for (let i = 0; i < 300; i++) a.add(pickExercise({}, 'hangul', Math.random, false));
  assert.deepEqual([...a].sort(), ['flashcard', 'recognize', 'type']);
  const b = new Set();
  for (let i = 0; i < 500; i++) b.add(pickExercise({ tiles: ['x'] }, 'phrases', Math.random, true));
  assert.deepEqual([...b].sort(), ['build', 'flashcard', 'listen', 'recognize', 'reverse', 'shadow', 'type']);
});
```

`tests/session.test.js`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSession, lessonSession, lessonUnlocked } from '../session.js';
import { DAY } from '../srs.js';

const NOW = 1e12;
const card = due => ({ ease: 2.5, interval: 1, due, reps: 1, lapses: 0 });
const units = [
  { id: 'hangul', lessons: [{ items: [{ id: 'h1' }, { id: 'h2' }] }, { items: [{ id: 'h3' }] }] },
  { id: 'vocab', lessons: [{ items: [{ id: 'v1' }] }] },
];

test('a lesson unlocks when the previous one is fully seen', () => {
  assert.ok(lessonUnlocked(units[0], 0, {}));
  assert.ok(!lessonUnlocked(units[0], 1, { h1: card(0) }));
  assert.ok(lessonUnlocked(units[0], 1, { h1: card(0), h2: card(0) }));
});

test('session: intro then quiz for new items, due reviews, unknown ids dropped', () => {
  const cards = { h1: card(NOW - 5), zz: card(NOW - 100), v1: card(NOW + DAY) };
  assert.deepEqual(buildSession(units, cards, NOW), [
    { kind: 'intro', id: 'h2' },
    { kind: 'quiz', id: 'h1' },
    { kind: 'quiz', id: 'h2' },
  ]);
});

test('session caps quiz questions at 20', () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ id: 'x' + i }));
  const cards = Object.fromEntries(items.slice(0, 30).map((it, i) => [it.id, card(NOW - i)]));
  const q = buildSession([{ id: 'vocab', lessons: [{ items }] }], cards, NOW);
  assert.equal(q.filter(s => s.kind === 'quiz').length, 20);
  assert.equal(q.filter(s => s.kind === 'intro').length, 5);
});

test('lesson session teaches unseen items, else quizzes the whole lesson', () => {
  const L = units[0].lessons[0];
  assert.deepEqual(lessonSession(L, { h1: card(0) }).map(s => s.kind + ':' + s.id), ['intro:h2', 'quiz:h2']);
  assert.deepEqual(lessonSession(L, { h1: card(0), h2: card(0) }).map(s => s.kind), ['quiz', 'quiz']);
});
```

- [ ] **Step 2: Run** `node --test` — Expected: FAIL, missing modules.

- [ ] **Step 3: Implement**

`exercises.js`:
```js
export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickExercise(item, unitId, rand = Math.random, hasVoice = true) {
  const types = ['flashcard', 'recognize', 'type'];
  if (unitId !== 'hangul') types.push('reverse');
  if (hasVoice) types.push('listen');
  if (item.tiles) types.push('build');
  if (unitId === 'phrases' && hasVoice) types.push('shadow');
  return types[Math.floor(rand() * types.length)];
}

export function buildQuestion(type, item, pool, rand = Math.random) {
  const q = { type, item };
  if (type === 'recognize' || type === 'reverse' || type === 'listen') {
    const key = type === 'recognize' ? 'fr' : 'ko';
    const picked = [];
    for (const p of shuffle(pool, rand)) {
      if (picked.length === 3) break;
      if (p[key] !== item[key] && !picked.some(x => x[key] === p[key])) picked.push(p);
    }
    q.choices = shuffle([item, ...picked], rand);
  }
  if (type === 'build') q.tiles = shuffle(item.tiles, rand);
  if (type === 'flashcard') q.front = rand() < 0.5 ? 'ko' : 'fr';
  return q;
}

export const normalize = s => s.normalize('NFC').replace(/[\s.,!?~'"…]/g, '');
export const checkTyped = (input, item) => normalize(input) === normalize(item.ko);
export const checkTiles = (order, item) => order.join(' ') === item.tiles.join(' ');
```

`session.js`:
```js
import { shuffle } from './exercises.js';

export const lessonDone = (lesson, cards) => lesson.items.every(it => cards[it.id]);
export const lessonUnlocked = (unit, i, cards) => i === 0 || lessonDone(unit.lessons[i - 1], cards);

const quiz = (ids, rand) => shuffle(ids, rand).map(id => ({ kind: 'quiz', id }));
const intro = ids => ids.map(id => ({ kind: 'intro', id }));

// Unseen items from the first incomplete lesson of each unit, in unit order.
function nextNewIds(units, cards, n) {
  const out = [];
  for (const unit of units) {
    const lesson = unit.lessons.find(l => !lessonDone(l, cards));
    if (!lesson) continue;
    for (const it of lesson.items) if (!cards[it.id] && out.length < n) out.push(it.id);
  }
  return out;
}

export function buildSession(units, cards, now, newLimit = 5, max = 20, rand = Math.random) {
  const known = new Set(units.flatMap(u => u.lessons.flatMap(l => l.items.map(it => it.id))));
  const fresh = nextNewIds(units, cards, newLimit);
  const due = Object.keys(cards)
    .filter(id => known.has(id) && cards[id].due <= now)
    .sort((a, b) => cards[a].due - cards[b].due)
    .slice(0, max - fresh.length);
  return [...intro(fresh), ...due.map(id => ({ kind: 'quiz', id })), ...quiz(fresh, rand)];
}

export function lessonSession(lesson, cards, rand = Math.random) {
  const fresh = lesson.items.filter(it => !cards[it.id]).map(it => it.id);
  return fresh.length ? [...intro(fresh), ...quiz(fresh, rand)] : quiz(lesson.items.map(it => it.id), rand);
}
```

- [ ] **Step 4: Run** `node --test` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add exercises.js session.js tests/exercises.test.js tests/session.test.js
git commit -m "feat: add exercise builders and session queues"
```

---

### Task 4: Content

**Files:**
- Create: `content/hangul.json`, `content/phrases.json`, `content/vocab.json`, `tests/content.test.js`

**Interfaces:**
- Produces: `Unit` JSON consumed by `app.js` and `session.js` (shape in Task 3). Unit ids exactly `hangul`, `phrases`, `vocab`.

- [ ] **Step 1: Write the failing test** — `tests/content.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const units = ['hangul', 'phrases', 'vocab'].map(u =>
  JSON.parse(readFileSync(new URL(`../content/${u}.json`, import.meta.url), 'utf8')));

test('content is well-formed', () => {
  const ids = new Set();
  for (const u of units) {
    assert.ok(u.id && u.title && u.icon && u.lessons.length, u.id);
    for (const l of u.lessons) {
      assert.ok(l.id && l.title && l.items.length >= 4, `${l.id}: needs 4+ items`);
      for (const it of l.items) {
        assert.ok(it.id && it.ko && it.rom && it.fr, JSON.stringify(it));
        assert.ok(!ids.has(it.id), 'duplicate id ' + it.id);
        ids.add(it.id);
        if (it.tiles) assert.equal(it.tiles.join(' '), it.ko, it.id);
      }
    }
  }
});
```

- [ ] **Step 2: Run** `node --test` — Expected: FAIL, ENOENT.

- [ ] **Step 3: Write** `content/hangul.json`

```json
{ "id": "hangul", "title": "Hangeul", "icon": "한", "lessons": [
  { "id": "hg-l1", "title": "Consonnes 1", "items": [
    { "id": "hg-g", "ko": "ㄱ", "rom": "g/k", "fr": "g / k", "say": "가", "note": "g doux en début de mot, k en finale" },
    { "id": "hg-n", "ko": "ㄴ", "rom": "n", "fr": "n", "say": "나" },
    { "id": "hg-d", "ko": "ㄷ", "rom": "d/t", "fr": "d / t", "say": "다" },
    { "id": "hg-r", "ko": "ㄹ", "rom": "r/l", "fr": "r / l", "say": "라", "note": "r léger entre voyelles, l en finale" },
    { "id": "hg-m", "ko": "ㅁ", "rom": "m", "fr": "m", "say": "마" },
    { "id": "hg-b", "ko": "ㅂ", "rom": "b/p", "fr": "b / p", "say": "바" },
    { "id": "hg-s", "ko": "ㅅ", "rom": "s", "fr": "s", "say": "사", "note": "devient « ch » devant i : 시 = chi" }
  ]},
  { "id": "hg-l2", "title": "Consonnes 2", "items": [
    { "id": "hg-ng", "ko": "ㅇ", "rom": "-/ng", "fr": "muet / ng", "say": "아, 앙", "note": "muet en début de syllabe, ng en finale" },
    { "id": "hg-j", "ko": "ㅈ", "rom": "j", "fr": "dj", "say": "자" },
    { "id": "hg-ch", "ko": "ㅊ", "rom": "ch", "fr": "tch (soufflé)", "say": "차" },
    { "id": "hg-k", "ko": "ㅋ", "rom": "k", "fr": "k (soufflé)", "say": "카" },
    { "id": "hg-t", "ko": "ㅌ", "rom": "t", "fr": "t (soufflé)", "say": "타" },
    { "id": "hg-p", "ko": "ㅍ", "rom": "p", "fr": "p (soufflé)", "say": "파" },
    { "id": "hg-h", "ko": "ㅎ", "rom": "h", "fr": "h (expiré)", "say": "하" }
  ]},
  { "id": "hg-l3", "title": "Voyelles 1", "items": [
    { "id": "hg-a", "ko": "ㅏ", "rom": "a", "fr": "a", "say": "아" },
    { "id": "hg-eo", "ko": "ㅓ", "rom": "eo", "fr": "o ouvert (« or »)", "say": "어" },
    { "id": "hg-o", "ko": "ㅗ", "rom": "o", "fr": "o fermé (« eau »)", "say": "오" },
    { "id": "hg-u", "ko": "ㅜ", "rom": "u", "fr": "ou", "say": "우" },
    { "id": "hg-eu", "ko": "ㅡ", "rom": "eu", "fr": "eu (lèvres étirées)", "say": "으" },
    { "id": "hg-i", "ko": "ㅣ", "rom": "i", "fr": "i", "say": "이" }
  ]},
  { "id": "hg-l4", "title": "Voyelles 2", "items": [
    { "id": "hg-ya", "ko": "ㅑ", "rom": "ya", "fr": "ya", "say": "야" },
    { "id": "hg-yeo", "ko": "ㅕ", "rom": "yeo", "fr": "yo ouvert", "say": "여" },
    { "id": "hg-yo", "ko": "ㅛ", "rom": "yo", "fr": "yo fermé", "say": "요" },
    { "id": "hg-yu", "ko": "ㅠ", "rom": "yu", "fr": "you", "say": "유" },
    { "id": "hg-ae", "ko": "ㅐ", "rom": "ae", "fr": "è", "say": "애" },
    { "id": "hg-e", "ko": "ㅔ", "rom": "e", "fr": "é", "say": "에", "note": "ㅐ et ㅔ se prononcent presque pareil aujourd'hui" },
    { "id": "hg-yae", "ko": "ㅒ", "rom": "yae", "fr": "yè", "say": "얘" },
    { "id": "hg-ye", "ko": "ㅖ", "rom": "ye", "fr": "yé", "say": "예" }
  ]},
  { "id": "hg-l5", "title": "Syllabes", "items": [
    { "id": "hg-s-ga", "ko": "가", "rom": "ga", "fr": "ga", "note": "consonne + voyelle verticale côte à côte" },
    { "id": "hg-s-no", "ko": "노", "rom": "no", "fr": "no", "note": "voyelle horizontale sous la consonne" },
    { "id": "hg-s-du", "ko": "두", "rom": "du", "fr": "dou" },
    { "id": "hg-s-ri", "ko": "리", "rom": "ri", "fr": "ri" },
    { "id": "hg-s-meo", "ko": "머", "rom": "meo", "fr": "mo (ouvert)" },
    { "id": "hg-s-bo", "ko": "보", "rom": "bo", "fr": "bo" },
    { "id": "hg-s-su", "ko": "수", "rom": "su", "fr": "sou" },
    { "id": "hg-s-a", "ko": "아", "rom": "a", "fr": "a (ㅇ muet)" },
    { "id": "hg-s-jeo", "ko": "저", "rom": "jeo", "fr": "djo (ouvert)" },
    { "id": "hg-s-ha", "ko": "하", "rom": "ha", "fr": "ha" }
  ]},
  { "id": "hg-l6", "title": "Consonnes doubles", "items": [
    { "id": "hg-kk", "ko": "ㄲ", "rom": "kk", "fr": "k tendu", "say": "까", "note": "gorge serrée, sans souffle" },
    { "id": "hg-tt", "ko": "ㄸ", "rom": "tt", "fr": "t tendu", "say": "따" },
    { "id": "hg-pp", "ko": "ㅃ", "rom": "pp", "fr": "p tendu", "say": "빠" },
    { "id": "hg-ss", "ko": "ㅆ", "rom": "ss", "fr": "s appuyé", "say": "싸" },
    { "id": "hg-jj", "ko": "ㅉ", "rom": "jj", "fr": "tj tendu", "say": "짜" }
  ]},
  { "id": "hg-l7", "title": "Voyelles composées", "items": [
    { "id": "hg-wa", "ko": "ㅘ", "rom": "wa", "fr": "wa", "say": "와", "note": "ㅗ + ㅏ" },
    { "id": "hg-wo", "ko": "ㅝ", "rom": "wo", "fr": "wo (ouvert)", "say": "워", "note": "ㅜ + ㅓ" },
    { "id": "hg-oe", "ko": "ㅚ", "rom": "oe", "fr": "wé (oe)", "say": "외" },
    { "id": "hg-wi", "ko": "ㅟ", "rom": "wi", "fr": "oui", "say": "위" },
    { "id": "hg-ui", "ko": "ㅢ", "rom": "ui", "fr": "eu-i", "say": "의" },
    { "id": "hg-wae", "ko": "ㅙ", "rom": "wae", "fr": "wè", "say": "왜" },
    { "id": "hg-we", "ko": "ㅞ", "rom": "we", "fr": "wé (we)", "say": "웨" }
  ]},
  { "id": "hg-l8", "title": "Consonnes finales (batchim)", "items": [
    { "id": "hg-b-k", "ko": "책", "rom": "chaek", "fr": "livre — finale k", "note": "une consonne sous la syllabe se prononce à la fin" },
    { "id": "hg-b-n", "ko": "산", "rom": "san", "fr": "montagne — finale n" },
    { "id": "hg-b-t", "ko": "옷", "rom": "ot", "fr": "vêtement — finale t", "note": "ㅅ ㅈ ㅊ ㅌ ㅎ en finale sonnent tous t" },
    { "id": "hg-b-l", "ko": "물", "rom": "mul", "fr": "eau — finale l" },
    { "id": "hg-b-m", "ko": "밤", "rom": "bam", "fr": "nuit — finale m" },
    { "id": "hg-b-p", "ko": "밥", "rom": "bap", "fr": "riz — finale p" },
    { "id": "hg-b-ng", "ko": "강", "rom": "gang", "fr": "rivière — finale ng" }
  ]},
  { "id": "hg-l9", "title": "Lire des mots 1", "items": [
    { "id": "hg-w-coffee", "ko": "커피", "rom": "keopi", "fr": "café" },
    { "id": "hg-w-taxi", "ko": "택시", "rom": "taeksi", "fr": "taxi" },
    { "id": "hg-w-hotel", "ko": "호텔", "rom": "hotel", "fr": "hôtel" },
    { "id": "hg-w-bus", "ko": "버스", "rom": "beoseu", "fr": "bus" },
    { "id": "hg-w-cola", "ko": "콜라", "rom": "kolla", "fr": "cola" },
    { "id": "hg-w-pizza", "ko": "피자", "rom": "pija", "fr": "pizza" },
    { "id": "hg-w-camera", "ko": "카메라", "rom": "kamera", "fr": "appareil photo" },
    { "id": "hg-w-icecream", "ko": "아이스크림", "rom": "aiseukeurim", "fr": "glace" },
    { "id": "hg-w-banana", "ko": "바나나", "rom": "banana", "fr": "banane" }
  ]},
  { "id": "hg-l10", "title": "Lire des mots 2", "items": [
    { "id": "hg-w-seoul", "ko": "서울", "rom": "Seoul", "fr": "Séoul" },
    { "id": "hg-w-busan", "ko": "부산", "rom": "Busan", "fr": "Busan" },
    { "id": "hg-w-korea", "ko": "한국", "rom": "hanguk", "fr": "Corée" },
    { "id": "hg-w-kimchi", "ko": "김치", "rom": "gimchi", "fr": "kimchi" },
    { "id": "hg-w-bibimbap", "ko": "비빔밥", "rom": "bibimbap", "fr": "bibimbap" },
    { "id": "hg-w-metro", "ko": "지하철", "rom": "jihacheol", "fr": "métro" },
    { "id": "hg-w-store", "ko": "편의점", "rom": "pyeonuijeom", "fr": "supérette" },
    { "id": "hg-w-toilet", "ko": "화장실", "rom": "hwajangsil", "fr": "toilettes" }
  ]}
]}
```

- [ ] **Step 4: Write** `content/phrases.json`

```json
{ "id": "phrases", "title": "Phrases", "icon": "말", "lessons": [
  { "id": "ph-l1", "title": "Essentiels", "icon": "👋", "items": [
    { "id": "ph-hello", "ko": "안녕하세요", "rom": "annyeonghaseyo", "fr": "Bonjour" },
    { "id": "ph-thanks", "ko": "감사합니다", "rom": "gamsahamnida", "fr": "Merci" },
    { "id": "ph-yes", "ko": "네", "rom": "ne", "fr": "Oui" },
    { "id": "ph-no", "ko": "아니요", "rom": "aniyo", "fr": "Non" },
    { "id": "ph-sorry", "ko": "죄송합니다", "rom": "joesonghamnida", "fr": "Pardon / Désolé" },
    { "id": "ph-excuse", "ko": "저기요", "rom": "jeogiyo", "fr": "Excusez-moi (pour appeler)" },
    { "id": "ph-ok", "ko": "괜찮아요", "rom": "gwaenchanayo", "fr": "Ça va / Pas de souci" },
    { "id": "ph-bye-stay", "ko": "안녕히 계세요", "rom": "annyeonghi gyeseyo", "fr": "Au revoir (à qui reste)", "tiles": ["안녕히", "계세요"] },
    { "id": "ph-bye-go", "ko": "안녕히 가세요", "rom": "annyeonghi gaseyo", "fr": "Au revoir (à qui part)", "tiles": ["안녕히", "가세요"] }
  ]},
  { "id": "ph-l2", "title": "Se comprendre", "icon": "🗣️", "items": [
    { "id": "ph-no-korean", "ko": "한국어 못해요", "rom": "hangugeo motaeyo", "fr": "Je ne parle pas coréen", "tiles": ["한국어", "못해요"] },
    { "id": "ph-english", "ko": "영어 할 수 있어요?", "rom": "yeongeo hal su isseoyo?", "fr": "Vous parlez anglais ?", "tiles": ["영어", "할 수", "있어요?"] },
    { "id": "ph-slowly", "ko": "천천히 말해 주세요", "rom": "cheoncheonhi malhae juseyo", "fr": "Parlez lentement, s'il vous plaît", "tiles": ["천천히", "말해", "주세요"] },
    { "id": "ph-again", "ko": "다시 한번 말해 주세요", "rom": "dasi hanbeon malhae juseyo", "fr": "Pouvez-vous répéter ?", "tiles": ["다시", "한번", "말해", "주세요"] },
    { "id": "ph-dunno", "ko": "몰라요", "rom": "mollayo", "fr": "Je ne sais pas" },
    { "id": "ph-got-it", "ko": "알겠어요", "rom": "algesseoyo", "fr": "Compris / D'accord" },
    { "id": "ph-not-understood", "ko": "이해 못 했어요", "rom": "ihae mot haesseoyo", "fr": "Je n'ai pas compris", "tiles": ["이해", "못 했어요"] },
    { "id": "ph-french", "ko": "저는 프랑스 사람이에요", "rom": "jeoneun peurangseu saramieyo", "fr": "Je suis français(e)", "tiles": ["저는", "프랑스", "사람이에요"] }
  ]},
  { "id": "ph-l3", "title": "Restaurant & café", "icon": "🍜", "items": [
    { "id": "ph-menu", "ko": "메뉴 주세요", "rom": "menyu juseyo", "fr": "Le menu, s'il vous plaît", "tiles": ["메뉴", "주세요"] },
    { "id": "ph-this-please", "ko": "이거 주세요", "rom": "igeo juseyo", "fr": "Je voudrais ça", "tiles": ["이거", "주세요"] },
    { "id": "ph-water", "ko": "물 주세요", "rom": "mul juseyo", "fr": "De l'eau, s'il vous plaît", "tiles": ["물", "주세요"] },
    { "id": "ph-americano", "ko": "아이스 아메리카노 한 잔 주세요", "rom": "aiseu amerikano han jan juseyo", "fr": "Un americano glacé, s'il vous plaît", "tiles": ["아이스", "아메리카노", "한 잔", "주세요"] },
    { "id": "ph-delicious", "ko": "맛있어요", "rom": "masisseoyo", "fr": "C'est délicieux" },
    { "id": "ph-bill", "ko": "계산해 주세요", "rom": "gyesanhae juseyo", "fr": "L'addition, s'il vous plaît", "tiles": ["계산해", "주세요"] },
    { "id": "ph-two-people", "ko": "두 명이에요", "rom": "du myeongieyo", "fr": "Nous sommes deux", "tiles": ["두", "명이에요"] },
    { "id": "ph-not-spicy", "ko": "안 맵게 해 주세요", "rom": "an maepge hae juseyo", "fr": "Pas épicé, s'il vous plaît", "tiles": ["안", "맵게", "해", "주세요"] },
    { "id": "ph-takeaway", "ko": "포장해 주세요", "rom": "pojanghae juseyo", "fr": "À emporter, s'il vous plaît", "tiles": ["포장해", "주세요"] },
    { "id": "ph-eat-here", "ko": "여기서 먹을게요", "rom": "yeogiseo meogeulgeyo", "fr": "Je mange sur place", "tiles": ["여기서", "먹을게요"] }
  ]},
  { "id": "ph-l4", "title": "Shopping", "icon": "🛍️", "items": [
    { "id": "ph-how-much", "ko": "이거 얼마예요?", "rom": "igeo eolmayeyo?", "fr": "Combien ça coûte ?", "tiles": ["이거", "얼마예요?"] },
    { "id": "ph-too-expensive", "ko": "너무 비싸요", "rom": "neomu bissayo", "fr": "C'est trop cher", "tiles": ["너무", "비싸요"] },
    { "id": "ph-discount", "ko": "깎아 주세요", "rom": "kkakka juseyo", "fr": "Vous me faites un prix ?", "tiles": ["깎아", "주세요"] },
    { "id": "ph-card-ok", "ko": "카드 돼요?", "rom": "kadeu dwaeyo?", "fr": "Je peux payer par carte ?", "tiles": ["카드", "돼요?"] },
    { "id": "ph-cash", "ko": "현금으로 할게요", "rom": "hyeongeumeuro halgeyo", "fr": "Je paie en espèces", "tiles": ["현금으로", "할게요"] },
    { "id": "ph-no-bag", "ko": "봉투 필요 없어요", "rom": "bongtu piryo eopseoyo", "fr": "Pas besoin de sac", "tiles": ["봉투", "필요", "없어요"] },
    { "id": "ph-just-looking", "ko": "그냥 볼게요", "rom": "geunyang bolgeyo", "fr": "Je regarde seulement", "tiles": ["그냥", "볼게요"] },
    { "id": "ph-have-this", "ko": "이거 있어요?", "rom": "igeo isseoyo?", "fr": "Vous avez ça ?", "tiles": ["이거", "있어요?"] }
  ]},
  { "id": "ph-l5", "title": "Se déplacer", "icon": "🚇", "items": [
    { "id": "ph-toilet", "ko": "화장실 어디예요?", "rom": "hwajangsil eodiyeyo?", "fr": "Où sont les toilettes ?", "tiles": ["화장실", "어디예요?"] },
    { "id": "ph-metro-where", "ko": "지하철역 어디예요?", "rom": "jihacheollyeok eodiyeyo?", "fr": "Où est la station de métro ?", "tiles": ["지하철역", "어디예요?"] },
    { "id": "ph-go-here", "ko": "여기로 가 주세요", "rom": "yeogiro ga juseyo", "fr": "Emmenez-moi ici (en montrant l'adresse)", "tiles": ["여기로", "가", "주세요"] },
    { "id": "ph-stop-here", "ko": "여기서 세워 주세요", "rom": "yeogiseo sewo juseyo", "fr": "Arrêtez-vous ici, s'il vous plaît", "tiles": ["여기서", "세워", "주세요"] },
    { "id": "ph-how-long", "ko": "얼마나 걸려요?", "rom": "eolmana geollyeoyo?", "fr": "Combien de temps ça prend ?", "tiles": ["얼마나", "걸려요?"] },
    { "id": "ph-bus-goes", "ko": "이 버스 명동 가요?", "rom": "i beoseu myeongdong gayo?", "fr": "Ce bus va à Myeongdong ?", "tiles": ["이", "버스", "명동", "가요?"] },
    { "id": "ph-one-ticket", "ko": "표 한 장 주세요", "rom": "pyo han jang juseyo", "fr": "Un billet, s'il vous plaît", "tiles": ["표", "한 장", "주세요"] },
    { "id": "ph-where-is-this", "ko": "여기 어디예요?", "rom": "yeogi eodiyeyo?", "fr": "Où est-ce ? (en montrant la carte)", "tiles": ["여기", "어디예요?"] }
  ]},
  { "id": "ph-l6", "title": "Hôtel", "icon": "🏨", "items": [
    { "id": "ph-checkin", "ko": "체크인 할게요", "rom": "chekeuin halgeyo", "fr": "Je voudrais faire le check-in", "tiles": ["체크인", "할게요"] },
    { "id": "ph-booked", "ko": "예약했어요", "rom": "yeyakaesseoyo", "fr": "J'ai une réservation" },
    { "id": "ph-wifi", "ko": "와이파이 비밀번호가 뭐예요?", "rom": "waipai bimilbeonhoga mwoyeyo?", "fr": "Quel est le mot de passe wifi ?", "tiles": ["와이파이", "비밀번호가", "뭐예요?"] },
    { "id": "ph-luggage", "ko": "짐 맡겨도 돼요?", "rom": "jim matgyeodo dwaeyo?", "fr": "Je peux laisser mes bagages ?", "tiles": ["짐", "맡겨도", "돼요?"] },
    { "id": "ph-checkout-time", "ko": "몇 시에 체크아웃이에요?", "rom": "myeot sie chekeuausieyo?", "fr": "Le check-out est à quelle heure ?", "tiles": ["몇 시에", "체크아웃이에요?"] },
    { "id": "ph-towels", "ko": "수건 더 주세요", "rom": "sugeon deo juseyo", "fr": "Plus de serviettes, s'il vous plaît", "tiles": ["수건", "더", "주세요"] }
  ]},
  { "id": "ph-l7", "title": "Santé & urgences", "icon": "🚑", "items": [
    { "id": "ph-help", "ko": "도와주세요!", "rom": "dowajuseyo!", "fr": "Au secours ! / Aidez-moi !" },
    { "id": "ph-hospital", "ko": "병원 어디예요?", "rom": "byeongwon eodiyeyo?", "fr": "Où est l'hôpital ?", "tiles": ["병원", "어디예요?"] },
    { "id": "ph-pharmacy", "ko": "약국 어디예요?", "rom": "yakguk eodiyeyo?", "fr": "Où est la pharmacie ?", "tiles": ["약국", "어디예요?"] },
    { "id": "ph-hurts", "ko": "여기가 아파요", "rom": "yeogiga apayo", "fr": "J'ai mal ici", "tiles": ["여기가", "아파요"] },
    { "id": "ph-allergy", "ko": "알레르기가 있어요", "rom": "allereugiga isseoyo", "fr": "J'ai une allergie", "tiles": ["알레르기가", "있어요"] },
    { "id": "ph-peanut", "ko": "땅콩 알레르기가 있어요", "rom": "ttangkong allereugiga isseoyo", "fr": "Je suis allergique aux cacahuètes", "tiles": ["땅콩", "알레르기가", "있어요"] },
    { "id": "ph-police", "ko": "경찰 불러 주세요", "rom": "gyeongchal bulleo juseyo", "fr": "Appelez la police", "tiles": ["경찰", "불러", "주세요"] },
    { "id": "ph-lost", "ko": "길을 잃었어요", "rom": "gireul ireosseoyo", "fr": "Je suis perdu(e)", "tiles": ["길을", "잃었어요"] }
  ]},
  { "id": "ph-l8", "title": "Rencontres", "icon": "🥂", "items": [
    { "id": "ph-name", "ko": "이름이 뭐예요?", "rom": "ireumi mwoyeyo?", "fr": "Comment tu t'appelles ?", "tiles": ["이름이", "뭐예요?"] },
    { "id": "ph-nice-meet", "ko": "만나서 반가워요", "rom": "mannaseo bangawoyo", "fr": "Enchanté(e)", "tiles": ["만나서", "반가워요"] },
    { "id": "ph-cheers", "ko": "건배!", "rom": "geonbae!", "fr": "Santé ! (trinquer)" },
    { "id": "ph-good", "ko": "좋아요", "rom": "joayo", "fr": "C'est bien / J'aime" },
    { "id": "ph-photo-me", "ko": "사진 찍어 주세요", "rom": "sajin jjigeo juseyo", "fr": "Vous pouvez me prendre en photo ?", "tiles": ["사진", "찍어", "주세요"] },
    { "id": "ph-photo-ok", "ko": "사진 찍어도 돼요?", "rom": "sajin jjigeodo dwaeyo?", "fr": "Je peux prendre une photo ?", "tiles": ["사진", "찍어도", "돼요?"] },
    { "id": "ph-awesome", "ko": "대박!", "rom": "daebak!", "fr": "Génial ! / Incroyable !" },
    { "id": "ph-before-meal", "ko": "잘 먹겠습니다", "rom": "jal meokgetseumnida", "fr": "Bon appétit (avant de manger)", "tiles": ["잘", "먹겠습니다"] },
    { "id": "ph-after-meal", "ko": "잘 먹었습니다", "rom": "jal meogeotseumnida", "fr": "Merci pour le repas", "tiles": ["잘", "먹었습니다"] }
  ]}
]}
```

- [ ] **Step 5: Write** `content/vocab.json`

```json
{ "id": "vocab", "title": "Vocabulaire", "icon": "단", "lessons": [
  { "id": "vo-l1", "title": "Nombres sino-coréens 1–10", "items": [
    { "id": "vo-il", "ko": "일", "rom": "il", "fr": "1 (sino)", "note": "sino-coréens : prix, dates, minutes, numéros" },
    { "id": "vo-i", "ko": "이", "rom": "i", "fr": "2 (sino)" },
    { "id": "vo-sam", "ko": "삼", "rom": "sam", "fr": "3 (sino)" },
    { "id": "vo-sa", "ko": "사", "rom": "sa", "fr": "4 (sino)" },
    { "id": "vo-o", "ko": "오", "rom": "o", "fr": "5 (sino)" },
    { "id": "vo-yuk", "ko": "육", "rom": "yuk", "fr": "6 (sino)" },
    { "id": "vo-chil", "ko": "칠", "rom": "chil", "fr": "7 (sino)" },
    { "id": "vo-pal", "ko": "팔", "rom": "pal", "fr": "8 (sino)" },
    { "id": "vo-gu", "ko": "구", "rom": "gu", "fr": "9 (sino)" },
    { "id": "vo-sip", "ko": "십", "rom": "sip", "fr": "10 (sino)" }
  ]},
  { "id": "vo-l2", "title": "Prix", "items": [
    { "id": "vo-baek", "ko": "백", "rom": "baek", "fr": "100" },
    { "id": "vo-cheon", "ko": "천", "rom": "cheon", "fr": "1 000" },
    { "id": "vo-man", "ko": "만", "rom": "man", "fr": "10 000", "note": "le coréen compte par 10 000" },
    { "id": "vo-won", "ko": "원", "rom": "won", "fr": "won (monnaie)" },
    { "id": "vo-5000won", "ko": "오천 원", "rom": "ocheon won", "fr": "5 000 wons" },
    { "id": "vo-10000won", "ko": "만 원", "rom": "man won", "fr": "10 000 wons" },
    { "id": "vo-30000won", "ko": "삼만 원", "rom": "samman won", "fr": "30 000 wons" },
    { "id": "vo-1500won", "ko": "천오백 원", "rom": "cheonobaek won", "fr": "1 500 wons" }
  ]},
  { "id": "vo-l3", "title": "Nombres natifs 1–10", "items": [
    { "id": "vo-hana", "ko": "하나", "rom": "hana", "fr": "1 (natif)", "note": "natifs : compter des objets, des personnes, l'âge, l'heure" },
    { "id": "vo-dul", "ko": "둘", "rom": "dul", "fr": "2 (natif)" },
    { "id": "vo-set", "ko": "셋", "rom": "set", "fr": "3 (natif)" },
    { "id": "vo-net", "ko": "넷", "rom": "net", "fr": "4 (natif)" },
    { "id": "vo-daseot", "ko": "다섯", "rom": "daseot", "fr": "5 (natif)" },
    { "id": "vo-yeoseot", "ko": "여섯", "rom": "yeoseot", "fr": "6 (natif)" },
    { "id": "vo-ilgop", "ko": "일곱", "rom": "ilgop", "fr": "7 (natif)" },
    { "id": "vo-yeodeol", "ko": "여덟", "rom": "yeodeol", "fr": "8 (natif)" },
    { "id": "vo-ahop", "ko": "아홉", "rom": "ahop", "fr": "9 (natif)" },
    { "id": "vo-yeol", "ko": "열", "rom": "yeol", "fr": "10 (natif)" }
  ]},
  { "id": "vo-l4", "title": "Compter", "items": [
    { "id": "vo-han-gae", "ko": "한 개", "rom": "han gae", "fr": "1 objet", "note": "하나 devient 한 devant un compteur" },
    { "id": "vo-du-gae", "ko": "두 개", "rom": "du gae", "fr": "2 objets" },
    { "id": "vo-se-gae", "ko": "세 개", "rom": "se gae", "fr": "3 objets" },
    { "id": "vo-han-myeong", "ko": "한 명", "rom": "han myeong", "fr": "1 personne" },
    { "id": "vo-du-myeong", "ko": "두 명", "rom": "du myeong", "fr": "2 personnes" },
    { "id": "vo-han-jan", "ko": "한 잔", "rom": "han jan", "fr": "1 verre / tasse" },
    { "id": "vo-du-jan", "ko": "두 잔", "rom": "du jan", "fr": "2 verres / tasses" },
    { "id": "vo-han-byeong", "ko": "한 병", "rom": "han byeong", "fr": "1 bouteille" }
  ]},
  { "id": "vo-l5", "title": "Aliments", "items": [
    { "id": "vo-bap", "ko": "밥", "rom": "bap", "fr": "riz / repas" },
    { "id": "vo-gogi", "ko": "고기", "rom": "gogi", "fr": "viande" },
    { "id": "vo-sogogi", "ko": "소고기", "rom": "sogogi", "fr": "bœuf" },
    { "id": "vo-dwaeji", "ko": "돼지고기", "rom": "dwaejigogi", "fr": "porc" },
    { "id": "vo-dak", "ko": "닭고기", "rom": "dakgogi", "fr": "poulet (viande)" },
    { "id": "vo-saengseon", "ko": "생선", "rom": "saengseon", "fr": "poisson" },
    { "id": "vo-yachae", "ko": "야채", "rom": "yachae", "fr": "légumes" },
    { "id": "vo-gyeran", "ko": "계란", "rom": "gyeran", "fr": "œuf" },
    { "id": "vo-ramyeon", "ko": "라면", "rom": "ramyeon", "fr": "nouilles instantanées" }
  ]},
  { "id": "vo-l6", "title": "Plats", "items": [
    { "id": "vo-bulgogi", "ko": "불고기", "rom": "bulgogi", "fr": "bulgogi (bœuf mariné)" },
    { "id": "vo-samgyeopsal", "ko": "삼겹살", "rom": "samgyeopsal", "fr": "poitrine de porc grillée" },
    { "id": "vo-tteokbokki", "ko": "떡볶이", "rom": "tteokbokki", "fr": "gâteaux de riz épicés" },
    { "id": "vo-gimbap", "ko": "김밥", "rom": "gimbap", "fr": "gimbap (rouleau de riz)" },
    { "id": "vo-chikin", "ko": "치킨", "rom": "chikin", "fr": "poulet frit" },
    { "id": "vo-naengmyeon", "ko": "냉면", "rom": "naengmyeon", "fr": "nouilles froides" },
    { "id": "vo-mandu", "ko": "만두", "rom": "mandu", "fr": "raviolis" },
    { "id": "vo-guk", "ko": "국", "rom": "guk", "fr": "soupe" },
    { "id": "vo-jjigae", "ko": "찌개", "rom": "jjigae", "fr": "ragoût" }
  ]},
  { "id": "vo-l7", "title": "Boissons", "items": [
    { "id": "vo-mul", "ko": "물", "rom": "mul", "fr": "eau" },
    { "id": "vo-keopi", "ko": "커피", "rom": "keopi", "fr": "café (boisson)" },
    { "id": "vo-cha", "ko": "차", "rom": "cha", "fr": "thé", "note": "차 veut aussi dire « voiture »" },
    { "id": "vo-maekju", "ko": "맥주", "rom": "maekju", "fr": "bière" },
    { "id": "vo-soju", "ko": "소주", "rom": "soju", "fr": "soju" },
    { "id": "vo-uyu", "ko": "우유", "rom": "uyu", "fr": "lait" },
    { "id": "vo-juseu", "ko": "주스", "rom": "juseu", "fr": "jus" }
  ]},
  { "id": "vo-l8", "title": "Goûts", "items": [
    { "id": "vo-maewoyo", "ko": "매워요", "rom": "maewoyo", "fr": "c'est épicé" },
    { "id": "vo-darayo", "ko": "달아요", "rom": "darayo", "fr": "c'est sucré" },
    { "id": "vo-jjayo", "ko": "짜요", "rom": "jjayo", "fr": "c'est salé" },
    { "id": "vo-tteugeowoyo", "ko": "뜨거워요", "rom": "tteugeowoyo", "fr": "c'est brûlant" },
    { "id": "vo-chagawoyo", "ko": "차가워요", "rom": "chagawoyo", "fr": "c'est froid" },
    { "id": "vo-madeopseoyo", "ko": "맛없어요", "rom": "madeopseoyo", "fr": "ce n'est pas bon" }
  ]},
  { "id": "vo-l9", "title": "Lieux", "items": [
    { "id": "vo-yeok", "ko": "역", "rom": "yeok", "fr": "gare / station" },
    { "id": "vo-gonghang", "ko": "공항", "rom": "gonghang", "fr": "aéroport" },
    { "id": "vo-sikdang", "ko": "식당", "rom": "sikdang", "fr": "restaurant" },
    { "id": "vo-kape", "ko": "카페", "rom": "kape", "fr": "café (lieu)" },
    { "id": "vo-yakguk", "ko": "약국", "rom": "yakguk", "fr": "pharmacie" },
    { "id": "vo-byeongwon", "ko": "병원", "rom": "byeongwon", "fr": "hôpital" },
    { "id": "vo-eunhaeng", "ko": "은행", "rom": "eunhaeng", "fr": "banque" },
    { "id": "vo-sijang", "ko": "시장", "rom": "sijang", "fr": "marché" }
  ]},
  { "id": "vo-l10", "title": "Transports", "items": [
    { "id": "vo-gicha", "ko": "기차", "rom": "gicha", "fr": "train" },
    { "id": "vo-bihaenggi", "ko": "비행기", "rom": "bihaenggi", "fr": "avion" },
    { "id": "vo-pyo", "ko": "표", "rom": "pyo", "fr": "billet" },
    { "id": "vo-chulgu", "ko": "출구", "rom": "chulgu", "fr": "sortie" },
    { "id": "vo-ipgu", "ko": "입구", "rom": "ipgu", "fr": "entrée" },
    { "id": "vo-gyotong", "ko": "교통카드", "rom": "gyotongkadeu", "fr": "carte de transport (T-money)" },
    { "id": "vo-hoseon", "ko": "호선", "rom": "hoseon", "fr": "ligne (de métro)", "note": "2호선 = ligne 2" },
    { "id": "vo-garaeta", "ko": "갈아타요", "rom": "garatayo", "fr": "changer (de ligne)" }
  ]},
  { "id": "vo-l11", "title": "Directions", "items": [
    { "id": "vo-yeogi", "ko": "여기", "rom": "yeogi", "fr": "ici" },
    { "id": "vo-geogi", "ko": "거기", "rom": "geogi", "fr": "là (près de toi)" },
    { "id": "vo-jeogi", "ko": "저기", "rom": "jeogi", "fr": "là-bas" },
    { "id": "vo-oenjjok", "ko": "왼쪽", "rom": "oenjjok", "fr": "gauche" },
    { "id": "vo-oreunjjok", "ko": "오른쪽", "rom": "oreunjjok", "fr": "droite" },
    { "id": "vo-ap", "ko": "앞", "rom": "ap", "fr": "devant" },
    { "id": "vo-dwi", "ko": "뒤", "rom": "dwi", "fr": "derrière" },
    { "id": "vo-yeop", "ko": "옆", "rom": "yeop", "fr": "à côté" },
    { "id": "vo-jikjin", "ko": "직진", "rom": "jikjin", "fr": "tout droit" }
  ]},
  { "id": "vo-l12", "title": "Le temps", "items": [
    { "id": "vo-oneul", "ko": "오늘", "rom": "oneul", "fr": "aujourd'hui" },
    { "id": "vo-naeil", "ko": "내일", "rom": "naeil", "fr": "demain" },
    { "id": "vo-eoje", "ko": "어제", "rom": "eoje", "fr": "hier" },
    { "id": "vo-jigeum", "ko": "지금", "rom": "jigeum", "fr": "maintenant" },
    { "id": "vo-achim", "ko": "아침", "rom": "achim", "fr": "matin / petit-déjeuner" },
    { "id": "vo-jeomsim", "ko": "점심", "rom": "jeomsim", "fr": "midi / déjeuner" },
    { "id": "vo-jeonyeok", "ko": "저녁", "rom": "jeonyeok", "fr": "soir / dîner" },
    { "id": "vo-si", "ko": "시", "rom": "si", "fr": "heure (3시 = 3 h)" },
    { "id": "vo-bun", "ko": "분", "rom": "bun", "fr": "minute" }
  ]},
  { "id": "vo-l13", "title": "Verbes utiles", "items": [
    { "id": "vo-gayo", "ko": "가요", "rom": "gayo", "fr": "aller" },
    { "id": "vo-wayo", "ko": "와요", "rom": "wayo", "fr": "venir" },
    { "id": "vo-meogeoyo", "ko": "먹어요", "rom": "meogeoyo", "fr": "manger" },
    { "id": "vo-masyeoyo", "ko": "마셔요", "rom": "masyeoyo", "fr": "boire" },
    { "id": "vo-bwayo", "ko": "봐요", "rom": "bwayo", "fr": "regarder / voir" },
    { "id": "vo-sayo", "ko": "사요", "rom": "sayo", "fr": "acheter" },
    { "id": "vo-isseoyo", "ko": "있어요", "rom": "isseoyo", "fr": "avoir / il y a" },
    { "id": "vo-eopseoyo", "ko": "없어요", "rom": "eopseoyo", "fr": "ne pas avoir / il n'y a pas" },
    { "id": "vo-joahaeyo", "ko": "좋아해요", "rom": "joahaeyo", "fr": "aimer (bien)" },
    { "id": "vo-haeyo", "ko": "해요", "rom": "haeyo", "fr": "faire" }
  ]},
  { "id": "vo-l14", "title": "Adjectifs", "items": [
    { "id": "vo-keoyo", "ko": "커요", "rom": "keoyo", "fr": "c'est grand" },
    { "id": "vo-jagayo", "ko": "작아요", "rom": "jagayo", "fr": "c'est petit" },
    { "id": "vo-bissayo", "ko": "비싸요", "rom": "bissayo", "fr": "c'est cher" },
    { "id": "vo-ssayo", "ko": "싸요", "rom": "ssayo", "fr": "c'est bon marché" },
    { "id": "vo-manayo", "ko": "많아요", "rom": "manayo", "fr": "il y en a beaucoup" },
    { "id": "vo-gakkawoyo", "ko": "가까워요", "rom": "gakkawoyo", "fr": "c'est près" },
    { "id": "vo-meoreoyo", "ko": "멀어요", "rom": "meoreoyo", "fr": "c'est loin" },
    { "id": "vo-joayo", "ko": "좋아요", "rom": "joayo", "fr": "c'est bien" }
  ]},
  { "id": "vo-l15", "title": "Les gens", "items": [
    { "id": "vo-jeo", "ko": "저", "rom": "jeo", "fr": "moi (poli)" },
    { "id": "vo-chingu", "ko": "친구", "rom": "chingu", "fr": "ami(e)" },
    { "id": "vo-namja", "ko": "남자", "rom": "namja", "fr": "homme" },
    { "id": "vo-yeoja", "ko": "여자", "rom": "yeoja", "fr": "femme" },
    { "id": "vo-ai", "ko": "아이", "rom": "ai", "fr": "enfant" },
    { "id": "vo-ireum", "ko": "이름", "rom": "ireum", "fr": "nom / prénom" },
    { "id": "vo-saram", "ko": "사람", "rom": "saram", "fr": "personne" },
    { "id": "vo-ssi", "ko": "씨", "rom": "ssi", "fr": "M. / Mme (après le prénom)" }
  ]}
]}
```

- [ ] **Step 6: Run** `node --test` — Expected: all pass (content test included).

- [ ] **Step 7: Commit**

```bash
git add content tests/content.test.js
git commit -m "feat: add hangul, phrases and vocabulary content"
```

---

### Task 5: App shell and screens

**Files:**
- Create: `index.html`, `style.css`, `app.js`

**Interfaces:**
- Consumes: everything from Tasks 1–4 with the exact signatures listed there.
- Produces: routes `#/`, `#/unit/<unitId>`, `#/session`, `#/field`, `#/field/<lessonId>`, `#/settings`.

- [ ] **Step 1: Write** `index.html`

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#fbf7f2" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#14121f" media="(prefers-color-scheme: dark)">
  <title>klearn</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icons/icon-192.png">
  <link rel="stylesheet" href="style.css">
  <script type="module" src="app.js"></script>
</head>
<body><div id="app"></div></body>
</html>
```

- [ ] **Step 2: Write** `style.css`

```css
:root {
  --bg: #fbf7f2; --surface: #fff; --text: #1d1a24; --muted: #6c6679; --line: #e9e3da;
  --accent: #ff4f6d; --accent-2: #6b5bff; --good: #1faa6b; --bad: #e5484d; --warn: #f59e0b;
  --radius: 18px;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #14121f; --surface: #1f1c2e; --text: #f3f0ff; --muted: #a09bb5; --line: #2e2a42; }
}
* { box-sizing: border-box; margin: 0; }
html, body { background: var(--bg); color: var(--text); }
body { font: 17px/1.45 system-ui, "Noto Sans KR", "Noto Sans CJK KR", sans-serif; -webkit-tap-highlight-color: transparent; }
#app { max-width: 560px; min-height: 100dvh; margin: 0 auto; padding: 16px 16px calc(24px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 16px; }
a { color: inherit; text-decoration: none; }
button, input { font: inherit; color: inherit; }
button { border: 0; background: none; cursor: pointer; }

.top { display: flex; align-items: center; gap: 12px; }
.top h1 { font-size: 22px; flex: 1; }
.top h1 .ko { color: var(--accent); }
.icon-btn { flex: none; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: var(--surface); border: 1px solid var(--line); font-size: 20px; }

.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 6px; text-align: center; display: flex; flex-direction: column; }
.stat b { font-size: 22px; }
.stat span { color: var(--muted); font-size: 13px; }
.goal, .bar { height: 10px; background: var(--line); border-radius: 99px; overflow: hidden; }
.bar { flex: 1; }
.goal div, .bar div { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--accent-2)); }

.primary { display: block; text-align: center; color: #fff; font-weight: 700; padding: 14px 20px; border-radius: 99px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 6px 20px -8px var(--accent); transition: transform .1s; }
.primary:active, .secondary:active, .choice:active, .tile:active { transform: scale(.97); }
.primary:disabled { opacity: .4; box-shadow: none; }
.secondary { display: block; text-align: center; font-weight: 700; padding: 14px 20px; border-radius: 99px; background: var(--surface); border: 2px solid var(--line); }
.big { font-size: 19px; padding: 18px; }
.notice { background: color-mix(in srgb, var(--accent) 12%, transparent); border-radius: 12px; padding: 10px 14px; font-size: 14px; }

.units { display: flex; flex-direction: column; gap: 10px; }
.unit { display: flex; align-items: center; gap: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; }
.unit > .ko { flex: none; width: 52px; height: 52px; display: grid; place-items: center; border-radius: 14px; font-size: 26px; background: color-mix(in srgb, var(--accent-2) 15%, transparent); }
.unit small { display: block; color: var(--muted); }

.path { list-style: none; padding: 8px 0; display: flex; flex-direction: column; gap: 18px; }
.path li:nth-child(4n+2), .path li:nth-child(4n) { padding-left: 22%; }
.path li:nth-child(4n+3) { padding-left: 44%; }
.lesson { display: flex; align-items: center; gap: 12px; text-align: left; font-weight: 600; }
.lesson span { flex: none; width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; font-size: 20px; background: var(--line); color: var(--muted); box-shadow: 0 5px 0 rgba(0, 0, 0, .15); }
.lesson.open span { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; }
.lesson.done span { background: var(--good); color: #fff; }
.lesson.locked { opacity: .45; }

.card-area { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 16px; animation: pop .25s ease; }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98); } }
.label { color: var(--muted); font-weight: 700; font-size: 13px; letter-spacing: .06em; text-transform: uppercase; }
.flash { background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: 28px 20px; text-align: center; display: flex; flex-direction: column; gap: 6px; }
.xl { font-size: 64px; font-weight: 700; line-height: 1.15; }
.lg { font-size: 32px; font-weight: 700; line-height: 1.3; }
.rom { color: var(--muted); }
.fr { font-size: 20px; font-weight: 600; }
.note { color: var(--muted); font-size: 14px; }
.audio { align-self: center; }
.play { align-self: center; width: 104px; height: 104px; border-radius: 50%; font-size: 42px; color: #fff; background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 10px 30px -10px var(--accent-2); }

.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.choice { min-height: 64px; padding: 14px 10px; font-weight: 600; background: var(--surface); border: 2px solid var(--line); border-bottom-width: 4px; border-radius: 16px; }
.choice.ko { font-size: 22px; }
.choice.right { border-color: var(--good); background: color-mix(in srgb, var(--good) 15%, var(--surface)); }
.choice.wrong { border-color: var(--bad); background: color-mix(in srgb, var(--bad) 15%, var(--surface)); animation: shake .3s; }
@keyframes shake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }

input[type=text], input[type=number] { width: 100%; padding: 14px 16px; font-size: 22px; background: var(--surface); border: 2px solid var(--line); border-radius: 14px; }
input:focus { outline: none; border-color: var(--accent-2); }

.picked, .tiles { display: flex; flex-wrap: wrap; gap: 8px; min-height: 56px; }
.picked { padding-bottom: 10px; border-bottom: 2px dashed var(--line); }
.tile { padding: 8px 14px; font-size: 20px; background: var(--surface); border: 2px solid var(--line); border-bottom-width: 4px; border-radius: 12px; }
.tiles .tile:disabled { visibility: hidden; }

.grades { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.grades button { padding: 12px 4px; border-radius: 14px; font-size: 14px; font-weight: 700; color: #fff; }
.g0 { background: var(--bad); } .g1 { background: var(--warn); } .g2 { background: var(--good); } .g3 { background: var(--accent-2); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

#feedback:empty { display: none; }
#feedback { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 20px; animation: pop .2s; }
#feedback.good { background: color-mix(in srgb, var(--good) 18%, var(--surface)); }
#feedback.bad { background: color-mix(in srgb, var(--bad) 18%, var(--surface)); }
#feedback .ko { font-size: 24px; font-weight: 700; }
.combo { min-width: 40px; text-align: right; font-weight: 800; color: var(--accent); }
.combo.hot { animation: pulse 1s infinite; }
@keyframes pulse { 50% { transform: scale(1.2); } }

.summary { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 14px; text-align: center; }
.big-emoji { font-size: 72px; animation: pop .5s; }

.field { display: flex; flex-direction: column; gap: 10px; }
.phrase { display: flex; flex-direction: column; gap: 2px; padding: 16px; text-align: left; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
.phrase .ko { font-size: 26px; font-weight: 700; }
.phrase small { color: var(--muted); }

.settings { display: flex; flex-direction: column; gap: 14px; }
.settings label { display: flex; flex-direction: column; gap: 6px; font-weight: 600; }
.settings label.row { flex-direction: row; align-items: center; gap: 10px; }
.settings input[type=checkbox] { width: 22px; height: 22px; accent-color: var(--accent); }
```

- [ ] **Step 3: Write** `app.js`

```js
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
```

- [ ] **Step 4: Manual check in a browser**

Run: `python3 -m http.server 8000` then open `http://localhost:8000` in Chrome (from Windows, WSL forwards localhost).
Check:
- The home screen shows the stats and the three units. The console shows no errors (`sw.js` 404 is expected until Task 6).
- Tap « Session du jour ». You should get intro cards (Hangul ㄱ…), then quizzes. Answer one wrong: it shakes and turns red, and the item comes back at the end.
- Open Unit Hangeul. Lesson 1 is open and lesson 2 is locked. Finish lesson 1, and lesson 2 unlocks.
- Sur le terrain → Essentiels lists the phrases.
- Réglages: export downloads a JSON file, and importing it back works.
- Use DevTools device mode (Pixel 7) to check the mobile layout.

- [ ] **Step 5: Commit**

```bash
git add index.html style.css app.js
git commit -m "feat: add app shell, screens and exercises UI"
```

---

### Task 6: Offline PWA (service worker, manifest, icons)

**Files:**
- Create: `sw.js`, `manifest.webmanifest`, `tools/icons.mjs`, `icons/icon-192.png`, `icons/icon-512.png` (generated)

**Interfaces:**
- Consumes: every file path of Tasks 1–5 (listed in `ASSETS`).

- [ ] **Step 1: Write** `tools/icons.mjs` (dependency-free PNG writer; draws ㅎ on a pink→violet gradient, content inside the maskable safe zone)

```js
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), body.length + 4);
  return out;
};

function png(size, pixel) {
  const row = size * 3 + 1;
  const raw = Buffer.alloc(size * row);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raw.set(pixel((x + 0.5) / size, (y + 0.5) / size), y * row + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function pixel(u, v) {
  const r = Math.hypot(u - 0.5, v - 0.62);
  const white = (Math.abs(u - 0.5) < 0.08 && v > 0.17 && v < 0.25)
    || (Math.abs(u - 0.5) < 0.25 && v > 0.31 && v < 0.39)
    || (r > 0.12 && r < 0.19);
  return white ? [255, 255, 255] : mix([255, 79, 109], [107, 91, 255], (u + v) / 2);
}

mkdirSync('icons', { recursive: true });
for (const s of [192, 512]) writeFileSync(`icons/icon-${s}.png`, png(s, pixel));
```

- [ ] **Step 2: Generate and look at the icons**

Run: `node tools/icons.mjs && file icons/*.png`
Expected: `PNG image data, 192 x 192, 8-bit/color RGB` and `512 x 512`. Open `icons/icon-512.png` and check you see a white ㅎ on the gradient.

- [ ] **Step 3: Write** `manifest.webmanifest`

```json
{
  "name": "klearn — apprendre le coréen",
  "short_name": "klearn",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#14121f",
  "theme_color": "#14121f",
  "lang": "fr",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 4: Write** `sw.js`

```js
// Bump on every deploy that changes any file, or phones keep the old version.
const CACHE = 'klearn-v1';
const ASSETS = [
  './', 'index.html', 'style.css', 'app.js', 'srs.js', 'game.js', 'exercises.js', 'session.js', 'store.js',
  'manifest.webmanifest', 'content/hangul.json', 'content/phrases.json', 'content/vocab.json',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' skips the HTTP cache so a new version never precaches stale files.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
```

- [ ] **Step 5: Offline check in the browser**

Run: `python3 -m http.server 8000` and open `http://localhost:8000`.
- DevTools → Application → Service workers: `sw.js` is activated. Cache storage `klearn-v1` holds 15 entries.
- Application → Manifest: no installability errors.
- Network → Offline, then reload: the app loads and a full session works.

- [ ] **Step 6: Run the tests** — `node --test` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add sw.js manifest.webmanifest tools/icons.mjs icons
git commit -m "feat: make the app an installable offline PWA"
```

---

### Task 7: Deploy to GitHub Pages and install on the phone

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write** `README.md`

```markdown
# klearn

Offline PWA to learn Korean (Hangul, survival phrases, vocabulary) with SM-2 spaced repetition.

- Run locally: `python3 -m http.server 8000`
- Tests: `node --test`
- Regenerate icons: `node tools/icons.mjs`
- Deploy: push to `main` (GitHub Pages). **Bump `CACHE` in `sw.js` on every deploy.**
- Add content: append items to `content/*.json` with new unique `id`s (never reuse or rename an id: progress is keyed on it).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

- [ ] **Step 3: Create the repo and push.** Requires `gh auth status` OK, and the user must confirm that a public repo is fine (free GitHub Pages needs a public repo).

```bash
git branch -M main
gh repo create klearn --public --source . --push
gh api -X POST "repos/$(gh api user -q .login)/klearn/pages" -f "source[branch]=main" -f "source[path]=/"
```

- [ ] **Step 4: Wait for the Pages build and check it**

Run: `gh api "repos/$(gh api user -q .login)/klearn/pages/builds/latest" -q .status` until it prints `built`, then `curl -sI https://<login>.github.io/klearn/sw.js | head -1`
Expected: `HTTP/2 200`

- [ ] **Step 5: Phone checklist (user)**

1. Install the Korean voice: Paramètres → Synthèse vocale → Google → Installer les données vocales → Coréen.
2. Add the Korean keyboard: Gboard → Langues → Coréen, disposition 2-Beolsik.
3. Open `https://<login>.github.io/klearn/` in Chrome, then ⋮ → « Installer l'application ».
4. Launch the app from the home screen and do one lesson.
5. Switch on airplane mode, close the app, relaunch it, and do a session with audio.
