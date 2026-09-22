import { shuffle } from './exercises.js';

export const lessonDone = (lesson, cards) => lesson.items.every(it => cards[it.id]);
export const lessonUnlocked = (unit, i, cards) => i === 0 || lessonDone(unit.lessons[i - 1], cards);

const quiz = (ids, rand) => shuffle(ids, rand).map(id => ({ kind: 'quiz', id }));
const intro = ids => ids.map(id => ({ kind: 'intro', id }));

// Unseen items from the first incomplete lesson of each unit, in unit order.
function nextNewIds(units, cards, n) {
  const out = [];
  for (const unit of units) {
    const lesson = unit.lessons.find(l => !lessonDone(l, cards));
    if (!lesson) continue;
    for (const it of lesson.items) if (!cards[it.id] && out.length < n) out.push(it.id);
  }
  return out;
}

export function buildSession(units, cards, now, newLimit = 5, max = 20, rand = Math.random) {
  const known = new Set(units.flatMap(u => u.lessons.flatMap(l => l.items.map(it => it.id))));
  const fresh = nextNewIds(units, cards, newLimit);
  const due = Object.keys(cards)
    .filter(id => known.has(id) && cards[id].due <= now)
    .sort((a, b) => cards[a].due - cards[b].due)
    .slice(0, max - fresh.length);
  return [...intro(fresh), ...due.map(id => ({ kind: 'quiz', id })), ...quiz(fresh, rand)];
}

export function lessonSession(lesson, cards, rand = Math.random) {
  const fresh = lesson.items.filter(it => !cards[it.id]).map(it => it.id);
  return fresh.length ? [...intro(fresh), ...quiz(fresh, rand)] : quiz(lesson.items.map(it => it.id), rand);
}

// Flashcard-only review of already-seen items, most overdue first.
export function cardSession(ids, cards, max = 20, rand = Math.random) {
  const seen = ids.filter(id => cards[id]).sort((a, b) => cards[a].due - cards[b].due).slice(0, max);
  return shuffle(seen, rand).map(id => ({ kind: 'card', id }));
}
