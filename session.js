import { shuffle } from './exercises.js';

export const lessonDone = (lesson, cards) => lesson.items.every(it => cards[it.id]);
export const lessonUnlocked = (unit, i, cards) => i === 0 || lessonDone(unit.lessons[i - 1], cards);

const quiz = (ids, rand) => shuffle(ids, rand).map(id => ({ kind: 'quiz', id }));
const intro = ids => ids.map(id => ({ kind: 'intro', id }));

const rule = lesson => (lesson.rule ? [{ kind: 'rule', lesson: lesson.id }] : []);

// Unseen items from the first incomplete lesson of each unit, in unit order.
// A lesson with a rule shows it before its very first new item.
function nextNew(units, cards, n) {
  const ids = [];
  const rules = [];
  for (const unit of units) {
    const lesson = unit.lessons.find(l => !lessonDone(l, cards));
    if (!lesson) continue;
    const before = ids.length;
    for (const it of lesson.items) if (!cards[it.id] && ids.length < n) ids.push(it.id);
    if (ids.length > before && !lesson.items.some(it => cards[it.id])) rules.push(...rule(lesson));
  }
  return { ids, rules };
}

export function buildSession(units, cards, now, newLimit = 5, max = 20, rand = Math.random) {
  const known = new Set(units.flatMap(u => u.lessons.flatMap(l => l.items.map(it => it.id))));
  const { ids: fresh, rules } = nextNew(units, cards, newLimit);
  const due = Object.keys(cards)
    .filter(id => known.has(id) && cards[id].due <= now)
    .sort((a, b) => cards[a].due - cards[b].due)
    .slice(0, max - fresh.length);
  return [...rules, ...intro(fresh), ...due.map(id => ({ kind: 'quiz', id })), ...quiz(fresh, rand)];
}

export function lessonSession(lesson, cards, rand = Math.random) {
  const fresh = lesson.items.filter(it => !cards[it.id]).map(it => it.id);
  return [...rule(lesson), ...(fresh.length ? [...intro(fresh), ...quiz(fresh, rand)] : quiz(lesson.items.map(it => it.id), rand))];
}

// Flashcard-only review of already-seen items, most overdue first.
export function cardSession(ids, cards, max = 20, rand = Math.random) {
  const seen = ids.filter(id => cards[id]).sort((a, b) => cards[a].due - cards[b].due).slice(0, max);
  return shuffle(seen, rand).map(id => ({ kind: 'card', id }));
}
