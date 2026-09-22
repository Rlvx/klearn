import { DAY } from './srs.js';

export function dayKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function addXp(state, n, now) {
  const k = dayKey(now);
  state.xp[k] = (state.xp[k] || 0) + n;
  if (state.xp[k] >= state.goal && state.lastGoalDay !== k) {
    state.streak = state.lastGoalDay === dayKey(now - DAY) ? state.streak + 1 : 1;
    state.lastGoalDay = k;
  }
}

export const todayXp = (state, now) => state.xp[dayKey(now)] || 0;

export function currentStreak(state, now) {
  return [dayKey(now), dayKey(now - DAY)].includes(state.lastGoalDay) ? state.streak : 0;
}
