import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../tutor.js';

const hangul = JSON.parse(readFileSync(new URL('../content/hangul.json', import.meta.url), 'utf8'));
const hangulItems = hangul.lessons.flatMap(l => l.items);
const seed = (() => { let x = 42; return () => (x = (x * 16807) % 2147483647) / 2147483647; })();
const errors = (syl, typed) => T.decode(typed, syl).diffs.map(d => `${d.want}>${d.got}`);

test('decode names the misread letter', () => {
  assert.deepEqual(errors('러', 'ro'), ['ㅓ>ㅗ']);
  assert.deepEqual(errors('부', 'pou'), ['ㅂ>ㅍ']);
  assert.deepEqual(errors('피', 'ti'), ['ㅍ>ㅌ']);
  assert.deepEqual(errors('혀', 'yo'), ['ㅎ>ㅇ', 'ㅕ>ㅛ']);
  assert.deepEqual(errors('노', 'nu'), ['ㅗ>ㅜ']);
  assert.deepEqual(errors('감', 'kam'), ['ㄱ>ㅋ']);
  assert.deepEqual(errors('니', 'ri'), ['ㄴ>ㄹ']);
  assert.deepEqual(errors('가', 'gang'), ['>ㅇ']);
  assert.deepEqual(errors('강', 'ga'), ['ㅇ>']);
});

test('decode accepts RR, French-friendly vowels and letter-by-letter finals', () => {
  for (const [syl, typed] of [['부', 'bu'], ['부', 'bou'], ['표', 'pyo'], ['합', 'hab'], ['합', 'hap'], ['강', 'gang'], ['와', 'wa'],
    ['의', 'ui'], ['아', 'a'], ['라', 'la'], ['옷', 'ot'], ['물', 'mul'], ['책', 'chaek'], ['유', 'YU'], ['닭', 'dak']]) {
    assert.ok(T.decode(typed, syl).ok, `${syl} ${typed}`);
  }
  assert.equal(T.decode('zzz', '가').got, null);
  assert.equal(T.decode('', '가').ok, false);
});

test('tips target the exact confusion', () => {
  assert.match(T.tipFor(1, 'ㅓ', 'ㅗ'), /à droite/);
  assert.match(T.tipFor(1, 'ㅗ', 'ㅜ'), /haut/);
  assert.match(T.tipFor(1, 'ㅛ', 'ㅗ'), /deux/);
  assert.match(T.tipFor(1, 'ㅏ', 'ㅓ'), /extérieur/);
  assert.match(T.tipFor(0, 'ㅂ', 'ㅍ'), /π/);
  assert.match(T.tipFor(0, 'ㄱ', 'ㅋ'), /souffle/);
  assert.match(T.tipFor(0, 'ㅎ', 'ㅇ'), /soupir/);
  assert.match(T.tipFor(0, 'ㅇ', 'ㅎ'), /muet/);
  assert.match(T.tipFor(2, 'ㅇ', ''), /oublié/);
  assert.match(T.tipFor(2, '', 'ㅇ'), /Pas de consonne/);
  for (const j of [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ']) assert.ok(T.letterTip(j), j);
});

test('words: syllable by syllable diagnosis, pronounced form, sound changes', () => {
  const item = { ko: '감사합니다', rom: 'gamsahamnida' };
  const r = T.checkWord('kam sa hab ri da', item);
  assert.equal(r.ok, false);
  assert.deepEqual(r.res.map(x => x.diffs.map(d => d.want + d.got).join()), ['ㄱㅋ', '', '', 'ㄴㄹ', '']);
  assert.ok(T.checkWord('gam sa hap ni da', item).ok);
  assert.ok(T.checkWord('gamsahamnida', item).ok);
  assert.ok(T.checkWord('garbage', item).unsplit);
  assert.match(T.soundChanges('감사합니다')[0], /hamnida/);
  assert.match(T.soundChanges('한국어')[0], /liaison/);
  assert.deepEqual(T.soundChanges('안녕하세요'), []);
});

test('weak letters from the cards come first', () => {
  const cards = {};
  for (const it of hangulItems) cards[it.id] = { reps: 2, lapses: 0 };
  cards['hg-n'] = { reps: 1, lapses: 3 };
  const known = T.knownLetters(hangulItems, cards);
  assert.ok(known[2].includes('_ㅇ'));
  const w = T.scores({ letters: {}, confusions: {} }, cards, hangulItems, known);
  assert.ok(w['ㄴ'] > w['ㅁ']);
  assert.equal(T.difficulties({ letters: {}, confusions: {} }, w)[0].key, 'ㄴ');
});

test('record keeps misses, streaks and confusions', () => {
  const tutor = { letters: {}, confusions: {} };
  T.record(tutor, T.marksFor('러', T.decode('ro', '러').diffs));
  assert.deepEqual(tutor.letters['ㅓ'], { seen: 1, miss: 1, streak: 0, last: tutor.letters['ㅓ'].last });
  assert.equal(tutor.letters['ㄹ'].streak, 1);
  assert.equal(tutor.confusions['ㅓ>ㅗ'], 1);
  const d = T.difficulties(tutor, { ㅓ: 3 });
  assert.equal(d[0].got, 'ㅗ');
  assert.match(d[0].tip, /à droite/);
});

test('choices differ only in the focus letter, sound distinct when listening', () => {
  const known = T.knownLetters(hangulItems, Object.fromEntries(hangulItems.map(it => [it.id, {}])));
  for (let i = 0; i < 200; i++) {
    const focus = ['ㅓ', 'ㅂ', 'ㅐ', '_ㅇ', 'ㅘ'][i % 5];
    const syl = T.makeSyllable(focus, {}, known, seed);
    assert.equal(T.split(syl)[T.slotOf(focus)], focus.replace('_', ''));
    const listen = i % 2 === 0;
    const c = T.choicesFor(syl, focus, known, listen, seed);
    assert.equal(c.length, 4, syl);
    assert.ok(c.some(x => x.syl === syl));
    assert.equal(new Set(c.map(x => x.rom)).size, 4);
    for (const x of c) {
      const diff = [0, 1, 2].filter(s => T.split(x.syl)[s] !== T.split(syl)[s]);
      assert.ok(diff.length <= 1);
      if (listen && T.slotOf(focus) === 1) assert.ok(!(focus === 'ㅐ' && T.split(x.syl)[1] === 'ㅔ'));
    }
  }
});

test('build tiles hold the letters plus same-slot decoys', () => {
  const { letters, tiles } = T.tilesFor('강', seed);
  assert.deepEqual(letters, ['ㄱ', 'ㅏ', 'ㅇ']);
  assert.ok(letters.every(l => tiles.includes(l)));
  assert.ok(tiles.length > letters.length);
});

test('session plan is varied and falls back without words or voice', () => {
  const plan = T.planTypes(true, true);
  assert.equal(plan.length, 12);
  assert.ok(new Set(plan).size >= 6);
  assert.ok(!T.planTypes(false, false).some(t => t === 'word' || t === 'listen'));
  const pool = T.wordPool([{ id: 'ph-hello', ko: '안녕하세요' }, { id: 'ph-yes', ko: '네' }], { 'ph-hello': {}, 'ph-yes': {} }, hangulItems);
  assert.equal(pool[0].id, 'ph-hello');
  assert.ok(!pool.some(it => it.id === 'ph-yes'));
});

test('drills stay on beginner-friendly syllables', () => {
  const known = T.knownLetters(hangulItems, Object.fromEntries(hangulItems.map(it => [it.id, {}])));
  const weights = T.scores({ letters: {}, confusions: {} }, {}, hangulItems, known);
  for (let i = 0; i < 500; i++) {
    const focus = T.pickFocus(weights, seed);
    const [l, v, t] = T.split(T.makeSyllable(focus, weights, known, seed));
    assert.ok(T.plausible(l, v, t), l + v + t);
  }
});

test('letters never practised are not flagged without a reason', () => {
  const cards = Object.fromEntries(hangulItems.map(it => [it.id, { reps: 1, lapses: 0 }]));
  const known = T.knownLetters(hangulItems, cards);
  const w = T.scores({ letters: {}, confusions: {} }, cards, hangulItems, known);
  assert.deepEqual(T.difficulties({ letters: {}, confusions: {} }, w), []);
});

test('word reading choices: one right spelling, three that differ by exactly the letter they name', () => {
  for (const ko of ['감사합니다', '원', '가', '안녕하세요', '이거 얼마예요?', '닭', '와이파이']) {
    for (let r = 0; r < 20; r++) {
      const c = T.wordChoices(ko, seed);
      assert.equal(c.length, 4, ko);
      assert.equal(new Set(c.map(o => o.text)).size, 4, ko);
      assert.equal(c.filter(o => !o.diff).length, 1, ko);
      const right = c.find(o => !o.diff).text.split(/[·\s]/);
      for (const o of c.filter(x => x.diff)) {
        const parts = o.text.split(/[·\s]/);
        assert.equal(parts.length, right.length, `${ko}: ${o.text}`);
        assert.equal(parts.filter((p, i) => p !== right[i]).length, 1, `${ko}: ${o.text}`);
        assert.notEqual(o.diff.want, o.diff.got);
      }
    }
  }
});
