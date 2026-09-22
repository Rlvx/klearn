export const DAY = 86_400_000;
const MIN = 60_000;
const round2 = x => Math.round(x * 100) / 100;

export function newCard(now) {
  return { ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0 };
}

// grade: 0 Again, 1 Hard, 2 Good, 3 Easy
export function review(card, grade, now) {
  if (grade === 0) {
    return { ease: Math.max(1.3, round2(card.ease - 0.2)), interval: 0, due: now + 10 * MIN, reps: 0, lapses: card.lapses + 1 };
  }
  let { ease, interval, reps } = card;
  if (grade === 1) {
    interval = Math.max(1, Math.round(interval * 1.2));
    ease -= 0.15;
  } else if (grade === 2) {
    interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease);
  } else {
    interval = reps === 0 ? 4 : Math.round(Math.max(interval, 1) * ease * 1.3);
    ease += 0.15;
  }
  return { ease: Math.max(1.3, round2(ease)), interval, due: now + interval * DAY, reps: reps + 1, lapses: card.lapses };
}
