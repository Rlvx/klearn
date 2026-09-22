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

test('listen distractors never sound identical to the item', () => {
  const item = { id: 'g', ko: 'ㄱ', say: '가', fr: 'g' };
  const listenPool = [
    item,
    { id: 'ga', ko: '가', fr: 'ga' },
    { id: 'na', ko: '나', fr: 'na' },
    { id: 'da', ko: '다', fr: 'da' },
    { id: 'ra', ko: '라', fr: 'ra' },
  ];
  for (let i = 0; i < 50; i++) {
    const q = buildQuestion('listen', item, listenPool);
    assert.ok(!q.choices.some(c => c.id === 'ga'));
  }
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
