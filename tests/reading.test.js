import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tokenize, proofTokens, optionsFor, answerOf, fullText, missingLessons, pointsFor, TF, UNKNOWN } from '../reading.js';

const load = f => JSON.parse(readFileSync(new URL(`../content/${f}.json`, import.meta.url), 'utf8'));
const { texts } = load('reading');
const lessonIds = new Set(['hangul', 'phrases', 'vocab', 'grammar'].flatMap(u => load(u).lessons.map(l => l.id)));

test('reading texts are complete and self-consistent', () => {
  const ids = new Set();
  for (const t of texts) {
    assert.ok(t.id.startsWith('rd-') && !ids.has(t.id), t.id);
    ids.add(t.id);
    assert.ok(t.title && t.fr && t.lines.length && t.questions.length >= 2, t.id);
    for (const n of t.needs) assert.ok(lessonIds.has(n), `${t.id}: unknown lesson ${n}`);
    for (const tok of tokenize(t).flatMap(l => l.tokens)) assert.ok(t.gloss[tok.key], `${t.id}: no gloss for ${tok.key}`);
    assert.ok((t.new ?? []).length <= 2 && (t.new ?? []).every(w => t.gloss[w]), `${t.id}: new words`);
    for (const q of t.questions) {
      const opts = q.tf ? TF : q.options;
      assert.ok(opts.includes(answerOf(q)), `${t.id}: answer not in options`);
      assert.equal(new Set(opts).size, opts.length, `${t.id}: duplicate options`);
      assert.ok(q.why, `${t.id}: why`);
      if (answerOf(q) === UNKNOWN) assert.ok(!q.proof, `${t.id}: « on ne sait pas » has nothing to prove`);
      else assert.ok(q.proof && fullText(t).includes(q.proof), `${t.id}: proof « ${q.proof} » not in text`);
    }
  }
  assert.ok(texts.length >= 15);
});

test('proof highlights exactly the words it covers', () => {
  const t = { lines: [{ ko: '저는 커피를 좋아해요.' }, { ko: '그런데 오늘은 물을 마셔요.' }] };
  const words = tokenize(t).flatMap(l => l.tokens);
  assert.deepEqual([...proofTokens(t, '오늘은 물을')].map(i => words[i].text), ['오늘은', '물을']);
  assert.deepEqual([...proofTokens(t, '좋아해요')].map(i => words[i].key), ['좋아해요']);
  assert.equal(proofTokens(t, '없는').size, 0);
  assert.equal(words[2].key, '좋아해요');
});

test('options shuffle but keep « On ne sait pas » last; true/false stays fixed', () => {
  const q = { options: ['A', 'B', UNKNOWN, 'C'], answer: 'B' };
  for (let i = 0; i < 50; i++) {
    const o = optionsFor(q);
    assert.equal(o.at(-1), UNKNOWN);
    assert.deepEqual([...o].sort(), [...q.options].sort());
  }
  assert.deepEqual(optionsFor({ tf: 'Faux' }), ['Vrai', 'Faux', UNKNOWN]);
});

test('texts unlock with lessons, help halves the points', () => {
  const t = { needs: ['a', 'b'] };
  assert.deepEqual(missingLessons(t, id => id === 'a'), ['b']);
  assert.deepEqual(missingLessons(t, () => true), []);
  assert.equal(pointsFor(true, false), 10);
  assert.equal(pointsFor(true, true), 5);
  assert.equal(pointsFor(false, false), 0);
});
