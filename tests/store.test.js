import test from 'node:test';
import assert from 'node:assert/strict';
import { load, save, importState, defaultState, KEY } from '../store.js';

const mem = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), keys: () => [...m.keys()] };
};

test('empty storage -> default state', () => {
  assert.deepEqual(load(mem()), defaultState());
});

test('save then load roundtrip', () => {
  const s = mem();
  const st = defaultState();
  st.cards.a = { due: 1 };
  save(st, s);
  assert.deepEqual(load(s), st);
});

test('corrupt data -> default state, blob kept as backup', () => {
  const s = mem();
  s.setItem(KEY, '{oops');
  assert.deepEqual(load(s), defaultState());
  assert.ok(s.keys().some(k => k.startsWith(KEY + '-corrupt-')));
});

test('import rejects invalid files', () => {
  assert.throws(() => importState('nope'));
  assert.throws(() => importState('null'));
  assert.throws(() => importState('{"cards":1}'));
});

test('import fills missing fields', () => {
  assert.equal(importState('{"cards":{}}').goal, 50);
});
