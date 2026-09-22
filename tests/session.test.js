import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSession, lessonSession, lessonUnlocked, cardSession } from '../session.js';
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

test('card session: seen cards only, most overdue first, capped', () => {
  const cards = { a: card(NOW + DAY), b: card(NOW - 10), c: card(NOW - 50) };
  const q = cardSession(['a', 'b', 'c', 'unseen'], cards, 2);
  assert.deepEqual(q.map(s => s.kind + ':' + s.id).sort(), ['card:b', 'card:c']);
});
