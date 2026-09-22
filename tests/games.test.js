import test from 'node:test';
import assert from 'node:assert/strict';
import { keystrokes, romanize, syllablePool, assembleRound, typingPool, blankRound } from '../games.js';

test('keystrokes follow the 2-beolsik keyboard', () => {
  assert.deepEqual(keystrokes('가'), ['ㄱ', 'ㅏ']);
  assert.deepEqual(keystrokes('관'), ['ㄱ', 'ㅗ', 'ㅏ', 'ㄴ']);
  assert.deepEqual(keystrokes('닭'), ['ㄷ', 'ㅏ', 'ㄹ', 'ㄱ']);
  assert.deepEqual(keystrokes('의'), ['ㅇ', 'ㅡ', 'ㅣ']);
  assert.deepEqual(keystrokes('까'), ['ㄲ', 'ㅏ']);
  assert.deepEqual(keystrokes('물 주세요?'), ['ㅁ', 'ㅜ', 'ㄹ', 'ㅈ', 'ㅜ', 'ㅅ', 'ㅔ', 'ㅇ', 'ㅛ']);
});

test('romanize a single syllable', () => {
  const cases = { 가: 'ga', 관: 'gwan', 닭: 'dak', 의: 'ui', 까: 'kka', 아: 'a', 을: 'eul', 덟: 'deol', 강: 'gang', 밥: 'bap' };
  for (const [s, r] of Object.entries(cases)) assert.equal(romanize(s), r, s);
});

const units = [{ lessons: [{ items: [
  { id: 'hg-g', ko: 'ㄱ', fr: 'g' },
  { id: 'hg-w-coffee', ko: '커피', fr: 'café' },
  { id: 'hg-s-ga', ko: '가', fr: 'ga' },
  { id: 'vo-mul', ko: '물', fr: 'eau' },
  { id: 'vo-cha', ko: '차', fr: 'thé' },
] }] }];
const items = units[0].lessons[0].items;

test('syllable pool: unique syllables, no lone jamo', () => {
  assert.deepEqual(syllablePool(units).sort(), ['가', '물', '차', '커', '피'].sort());
});

test('assemble round: tiles hold every key plus 3 decoys', () => {
  for (let i = 0; i < 30; i++) {
    const r = assembleRound(['관', '닭', '가']);
    assert.deepEqual(r.keys, keystrokes(r.syllable));
    assert.equal(r.rom, romanize(r.syllable));
    assert.equal(r.tiles.length, r.keys.length + 3);
    assert.deepEqual([...r.tiles].filter(t => r.keys.includes(t)).sort(), [...r.keys].sort());
  }
});

test('typing pool: seen words first, topped up with hangul words, no lone jamo', () => {
  const pool = typingPool(items, { 'vo-mul': {}, 'hg-g': {} }, 3);
  assert.deepEqual(pool.map(it => it.id), ['vo-mul', 'hg-w-coffee', 'hg-s-ga']);
  const seen = typingPool(items, { 'vo-mul': {}, 'vo-cha': {} }, 2);
  assert.deepEqual(seen.map(it => it.id), ['vo-mul', 'vo-cha']);
});

test('blank round builds prompt, French and full sentence', () => {
  const patterns = [{ id: 'want', ko: '{} 주세요', fr: 'Je voudrais… {}', nouns: ['vo-mul'] }];
  const r = blankRound(patterns, { 'vo-mul': items[3] });
  assert.equal(r.prompt, '___ 주세요');
  assert.equal(r.fr, 'Je voudrais… eau');
  assert.equal(r.full, '물 주세요');
  assert.equal(r.noun.id, 'vo-mul');
});
