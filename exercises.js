export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickExercise(item, unitId, rand = Math.random, hasVoice = true) {
  const types = ['flashcard', 'recognize', 'type'];
  if (unitId !== 'hangul') types.push('reverse');
  if (hasVoice) types.push('listen');
  if (item.tiles) types.push('build');
  if (unitId === 'phrases' && hasVoice) types.push('shadow');
  return types[Math.floor(rand() * types.length)];
}

export function buildQuestion(type, item, pool, rand = Math.random) {
  const q = { type, item };
  if (type === 'recognize' || type === 'reverse' || type === 'listen') {
    const key = type === 'recognize' ? 'fr' : 'ko';
    const picked = [];
    for (const p of shuffle(pool, rand)) {
      if (picked.length === 3) break;
      if (p[key] === item[key]) continue;
      if (type === 'listen' && (p.say || p.ko) === (item.say || item.ko)) continue;
      if (!picked.some(x => x[key] === p[key])) picked.push(p);
    }
    q.choices = shuffle([item, ...picked], rand);
  }
  if (type === 'build') q.tiles = shuffle(item.tiles, rand);
  if (type === 'flashcard') q.front = rand() < 0.5 ? 'ko' : 'fr';
  return q;
}

export const normalize = s => s.normalize('NFC').replace(/[\s.,!?~'"…]/g, '');
export const checkTyped = (input, item) => normalize(input) === normalize(item.ko);
export const checkTiles = (order, item) => order.join(' ') === item.tiles.join(' ');
