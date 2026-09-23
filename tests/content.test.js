import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expectedParticle } from '../exercises.js';

const units = ['hangul', 'phrases', 'vocab', 'grammar'].map(u =>
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
test('pattern nouns exist in content', () => {
  const ids = new Set(units.flatMap(u => u.lessons.flatMap(l => l.items.map(it => it.id))));
  const { patterns } = JSON.parse(readFileSync(new URL('../content/patterns.json', import.meta.url), 'utf8'));
  for (const p of patterns) {
    assert.ok(p.ko.includes('{}') && p.fr.includes('{}'), p.id);
    for (const id of p.nouns) assert.ok(ids.has(id), `${p.id}: unknown noun ${id}`);
  }
});

test('grammar lessons have a rule, and every gap follows it', () => {
  const grammar = units.find(u => u.id === 'grammar');
  for (const l of grammar.lessons) {
    assert.ok(l.rule?.text?.length, `${l.id}: rule`);
    for (const f of l.rule.forms ?? []) assert.equal(f.length, 3, l.id);
    for (const it of l.items) {
      if (!it.gap) continue;
      const { before, answer, options } = it.gap;
      assert.ok(it.ko.includes(before + answer), `${it.id}: ${before}${answer} not in ${it.ko}`);
      assert.ok(options.includes(answer), it.id);
      assert.equal(expectedParticle(before, options), answer, `${it.id}: ${before} + ${answer}`);
    }
  }
});

test('every file the app loads is cached for offline use', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (const f of [...units.map(u => u.id), 'patterns', 'reading']) assert.ok(sw.includes(`content/${f}.json`), f);
});

test('every module of the app is precached', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  for (const [, file] of html.matchAll(/from '\.\/([\w-]+\.js)'/g)) assert.ok(sw.includes(`'${file}'`), file);
});
