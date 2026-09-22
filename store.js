export const KEY = 'klearn-v1';

export function defaultState() {
  return { cards: {}, xp: {}, streak: 0, lastGoalDay: null, goal: 50, showRom: true, best: {} };
}

export function load(storage = globalThis.localStorage) {
  const raw = storage.getItem(KEY);
  if (!raw) return defaultState();
  try {
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    storage.setItem(`${KEY}-corrupt-${Date.now()}`, raw);
    return defaultState();
  }
}

export function save(state, storage = globalThis.localStorage) {
  storage.setItem(KEY, JSON.stringify(state));
}

export function importState(text) {
  const s = JSON.parse(text);
  if (!s || typeof s.cards !== 'object' || !s.cards) throw new Error('Fichier de progression invalide');
  return { ...defaultState(), ...s };
}
