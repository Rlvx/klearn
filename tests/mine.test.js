import test from 'node:test';
import assert from 'node:assert/strict';
import { autoRom, makeCustom, knownWords, isKnown, wordsFromText, findExisting, hasHangul } from '../mine.js';
import { defaultState, importState } from '../store.js';

test('auto romanization follows how words are said', () => {
  const cases = {
    한국어: 'hangugeo', 맛있어요: 'masisseoyo', 감사합니다: 'gamsahamnida', 괜찮아요: 'gwaenchanayo', 좋아요: 'joayo',
    설날: 'seollal', 종로: 'jongno', 닭이: 'dalgi', 김치찌개: 'gimchijjigae', 편의점: 'pyeonuijeom', 제육볶음: 'jeyukbokkeum',
    한국말: 'hangungmal', '카드 결제 가능': 'kadeu gyeolje ganeung', 안녕하세요: 'annyeonghaseyo', 커피: 'keopi',
  };
  for (const [ko, rom] of Object.entries(cases)) assert.equal(autoRom(ko), rom, ko);
});

test('a custom word gets a stable id, a romanization and a trimmed form', () => {
  const it = makeCustom('  공기밥  ', ' bol de riz ', '', 1_790_000_000_000);
  assert.deepEqual(it, { id: 'my-mubbs7i8', ko: '공기밥', rom: 'gonggibap', fr: 'bol de riz' });
  assert.equal(makeCustom('추가', 'supplément', ' menu ', 1).note, 'menu');
  assert.ok(hasHangul('추가') && !hasHangul('chuga'));
});

test('photo text: new words first, known ones (even with a particle) set aside', () => {
  const known = knownWords([{ ko: '오늘' }, { ko: '메뉴 주세요' }, { ko: '원' }, { ko: '카드 돼요?' }]);
  assert.ok(isKnown('오늘의', known) && isKnown('카드', known) && !isKnown('추가', known));
  const text = '오늘의 메뉴\n김치찌개 .….… 9,000원\n공기밥 추가 1,000원\n카드 결제 가능\n김치찌개';
  assert.deepEqual(wordsFromText(text, known), { fresh: ['김치찌개', '공기밥', '추가', '결제', '가능'], old: ['오늘의', '메뉴', '원', '카드'] });
  assert.deepEqual(wordsFromText('hello 123', known), { fresh: [], old: [] });
});

test('words already taught are found instead of duplicated', () => {
  const items = [{ id: 'vo-mul', ko: '물' }, { id: 'ph-hello', ko: '안녕하세요' }];
  assert.equal(findExisting(' 물 ', items).id, 'vo-mul');
  assert.equal(findExisting('안녕하세요!', items).id, 'ph-hello');
  assert.equal(findExisting('추가', items), null);
});

test('own words survive export and import, older exports get an empty list', () => {
  assert.deepEqual(defaultState().custom, []);
  assert.deepEqual(importState(JSON.stringify({ cards: {} })).custom, []);
  const s = { ...defaultState(), custom: [{ id: 'my-1', ko: '추가', rom: 'chuga', fr: 'supplément' }] };
  assert.equal(importState(JSON.stringify(s)).custom[0].ko, '추가');
});
