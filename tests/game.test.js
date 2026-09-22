import test from 'node:test';
import assert from 'node:assert/strict';
import { addXp, currentStreak, todayXp } from '../game.js';
import { defaultState } from '../store.js';
import { DAY } from '../srs.js';

const NOW = new Date(2026, 8, 23, 12).getTime();

test('xp accumulates per day', () => {
  const s = defaultState();
  addXp(s, 10, NOW);
  addXp(s, 20, NOW);
  assert.equal(todayXp(s, NOW), 30);
  assert.equal(todayXp(s, NOW + DAY), 0);
});

test('streak starts once the goal is reached, counted once per day', () => {
  const s = defaultState();
  addXp(s, 40, NOW);
  assert.equal(currentStreak(s, NOW), 0);
  addXp(s, 10, NOW);
  assert.equal(currentStreak(s, NOW), 1);
  addXp(s, 50, NOW);
  assert.equal(s.streak, 1);
});

test('streak continues next day and resets after a gap', () => {
  const s = defaultState();
  addXp(s, 50, NOW);
  addXp(s, 50, NOW + DAY);
  assert.equal(currentStreak(s, NOW + DAY), 2);
  assert.equal(currentStreak(s, NOW + 3 * DAY), 0);
  addXp(s, 50, NOW + 3 * DAY);
  assert.equal(s.streak, 1);
});
