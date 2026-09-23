import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, pickExercise, buildQuestion, checkTyped, checkTiles, lettersOf, canRead, expectedParticle, particleWhy } from '../exercises.js';

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

test('typed answers accept compound jamo typed as separate keys', () => {
  // Un clavier coréen ne fusionne pas les voyelles hors syllabe : ㅗ + ㅏ reste ㅗㅏ.
  assert.ok(checkTyped('ㅗㅏ', { ko: 'ㅘ' }));
  assert.ok(checkTyped('ㅜㅓ', { ko: 'ㅝ' }));
  assert.ok(checkTyped('ㅡㅣ', { ko: 'ㅢ' }));
  assert.ok(checkTyped('ㅇㅗㅏ', { ko: '와' }));
  assert.ok(checkTyped('ㅂㅅ', { ko: 'ㅄ' }));
  assert.ok(!checkTyped('ㅗㅐ', { ko: 'ㅘ' }));
  assert.ok(!checkTyped('ㅗ', { ko: 'ㅘ' }));
  assert.ok(!checkTyped('ㅏㅗ', { ko: 'ㅘ' }));
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

test('letters of a word: initials, vowels and each consonant of the final', () => {
  assert.deepEqual(lettersOf('안녕').sort(), ['ㄴ', 'ㅇ', 'ㅏ', 'ㅕ'].sort());
  assert.deepEqual(lettersOf('닭').sort(), ['ㄷ', 'ㅏ', 'ㄹ', 'ㄱ'].sort());
  assert.deepEqual(lettersOf('과 !'), ['ㄱ', 'ㅘ']);
  assert.ok(canRead('안녕', new Set([...'ㅇㅏㄴㅕ'])));
  assert.ok(!canRead('안녕하세요', new Set([...'ㅇㅏㄴㅕ'])));
});

test('words that cannot be read yet only get button exercises', () => {
  const typing = new Set(['flashcard', 'type', 'build']);
  for (let i = 0; i < 500; i++) {
    assert.ok(!typing.has(pickExercise({ tiles: ['x'] }, 'phrases', Math.random, true, false)));
    assert.ok(!typing.has(pickExercise({}, 'hangul', Math.random, false, false)));
  }
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(pickExercise({ tiles: ['x'] }, 'phrases', Math.random, true, true));
  assert.ok(seen.has('type') && seen.has('flashcard') && seen.has('build'));
});

test('particles follow the last letter of the word', () => {
  assert.equal(expectedParticle('커피', ['를', '을']), '를');
  assert.equal(expectedParticle('물', ['를', '을']), '을');
  assert.equal(expectedParticle('저', ['은', '는']), '는');
  assert.equal(expectedParticle('명동', ['예요', '이에요']), '이에요');
  assert.equal(expectedParticle('서울', ['로', '으로']), '로');
  assert.equal(expectedParticle('명동', ['에', '를']), null);
  assert.match(particleWhy('커피', '를'), /voyelle/);
  assert.match(particleWhy('물', '을'), /consonne.*ㄹ/);
});

test('gap question hides the particle and explains it', () => {
  const item = { ko: '이거 물이에요', gap: { before: '물', answer: '이에요', options: ['예요', '이에요'] } };
  const q = buildQuestion('gap', item, [item]);
  assert.equal(q.prompt, '이거 물 ___');
  assert.deepEqual([...q.options].sort(), ['예요', '이에요']);
  assert.match(q.why, /consonne/);
  const kinds = new Set();
  for (let i = 0; i < 300; i++) kinds.add(pickExercise(item, 'grammar', Math.random, false, true));
  assert.ok(kinds.has('gap'));
  for (let i = 0; i < 300; i++) assert.notEqual(pickExercise(item, 'grammar', Math.random, false, false), 'gap');
});
