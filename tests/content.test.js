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
test('pattern nouns exist in content', () => {
  const ids = new Set(units.flatMap(u => u.lessons.flatMap(l => l.items.map(it => it.id))));
  const { patterns } = JSON.parse(readFileSync(new URL('../content/patterns.json', import.meta.url), 'utf8'));
  for (const p of patterns) {
    assert.ok(p.ko.includes('{}') && p.fr.includes('{}'), p.id);
    for (const id of p.nouns) assert.ok(ids.has(id), `${p.id}: unknown noun ${id}`);
  }
});
