import test from 'node:test';
import assert from 'node:assert/strict';
import { keystrokes, romanize, syllablePool, assembleRound, typingPool, blankRound, transliterate, romMatches, readingPool, pickByLength } from '../games.js';

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

test('letter-by-letter spelling is unique for every Hangul syllable', () => {
  const seen = new Set();
  for (let c = 0xac00; c <= 0xd7a3; c++) seen.add(transliterate(String.fromCharCode(c)));
  assert.equal(seen.size, 11172);
  assert.equal(transliterate('감사합니다'), 'gam·sa·hab·ni·da');
  assert.equal(transliterate('이거 얼마예요?'), 'i·geo eol·ma·ye·yo');
  assert.equal(transliterate('닭'), 'dalg');
});

test('romanization answers: as said, letter by letter, with or without separators', () => {
  const it = { ko: '감사합니다', rom: 'gamsahamnida' };
  for (const ok of ['gamsahamnida', 'Gam-sa-ham-ni-da', 'gam sa hab ni da', 'gamsahabnida', 'gamsahapnida']) assert.ok(romMatches(ok, it), ok);
  for (const ko of ['', 'gamsahamnda', '감사합니다']) assert.ok(!romMatches(ko, it), ko);
  assert.ok(romMatches('masisseoyo', { ko: '맛있어요' }, ['masisseoyo']));
});

test('reading pool: Hangul words of 1 to 6 syllables, each spelling once; length follows the level', () => {
  const pool = readingPool([
    { ko: '가' }, { ko: '커피' }, { ko: '커피' }, { ko: 'ㄱ' }, { ko: '3시' }, { ko: '이거 얼마예요?' }, { ko: '아이스 아메리카노 한 잔 주세요' },
  ]);
  assert.deepEqual(pool.map(it => it.ko), ['가', '커피', '이거 얼마예요?']);
  for (let i = 0; i < 50; i++) {
    assert.equal(pickByLength(pool, 1).ko, '가');
    assert.equal(pickByLength(pool, 2, Math.random, pool[1]).ko, '가');
  }
  assert.equal(pickByLength(pool, 6).ko, '이거 얼마예요?');
});
