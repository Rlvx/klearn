import test from 'node:test';
import assert from 'node:assert/strict';
import { newCard, review, DAY } from '../srs.js';

const NOW = 1_700_000_000_000;

test('new card is due now', () => {
  const c = newCard(NOW);
  assert.equal(c.due, NOW);
  assert.equal(c.reps, 0);
});

test('good on new card -> 1 day', () => {
  const c = review(newCard(NOW), 2, NOW);
  assert.equal(c.interval, 1);
  assert.equal(c.due, NOW + DAY);
  assert.equal(c.reps, 1);
});

test('good twice -> 3 days, then grows by ease', () => {
  let c = review(newCard(NOW), 2, NOW);
  c = review(c, 2, NOW);
  assert.equal(c.interval, 3);
  c = review(c, 2, NOW);
  assert.equal(c.interval, 8);
});

test('again resets, lowers ease, due in 10 min', () => {
  let c = review(review(newCard(NOW), 2, NOW), 2, NOW);
  c = review(c, 0, NOW);
  assert.equal(c.reps, 0);
  assert.equal(c.lapses, 1);
  assert.equal(c.ease, 2.3);
  assert.equal(c.due, NOW + 10 * 60_000);
});

test('ease never below 1.3', () => {
  let c = newCard(NOW);
  for (let i = 0; i < 20; i++) c = review(c, 0, NOW);
  assert.equal(c.ease, 1.3);
});

test('easy on new card -> 4 days, ease up', () => {
  const c = review(newCard(NOW), 3, NOW);
  assert.equal(c.interval, 4);
  assert.equal(c.ease, 2.65);
});

test('hard on new card -> 1 day, ease down', () => {
  const c = review(newCard(NOW), 1, NOW);
  assert.equal(c.interval, 1);
  assert.equal(c.ease, 2.35);
});
