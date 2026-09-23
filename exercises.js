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
  return q;
}

// Jamo comparés à plat : un clavier coréen ne fusionne ㅗ + ㅏ en ㅘ que dans une
// syllabe, donc on décompose tout avant de comparer (ㅘ === ㅗㅏ, 와 === ㅇㅗㅏ).
const LEAD = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const VOWEL = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const TAIL = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

const CLUSTERS = {
  'ㅘ': 'ㅗㅏ', 'ㅙ': 'ㅗㅐ', 'ㅚ': 'ㅗㅣ', 'ㅝ': 'ㅜㅓ', 'ㅞ': 'ㅜㅔ', 'ㅟ': 'ㅜㅣ', 'ㅢ': 'ㅡㅣ',
  'ㄳ': 'ㄱㅅ', 'ㄵ': 'ㄴㅈ', 'ㄶ': 'ㄴㅎ', 'ㄺ': 'ㄹㄱ', 'ㄻ': 'ㄹㅁ', 'ㄼ': 'ㄹㅂ',
  'ㄽ': 'ㄹㅅ', 'ㄾ': 'ㄹㅌ', 'ㄿ': 'ㄹㅍ', 'ㅀ': 'ㄹㅎ', 'ㅄ': 'ㅂㅅ'
};
const CLUSTER_RE = new RegExp(`[${Object.keys(CLUSTERS).join('')}]`, 'g');

const toJamo = ch => {
  const c = ch.codePointAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) {
    const i = c - 0xac00;
    return LEAD[Math.floor(i / 588)] + VOWEL[Math.floor((i % 588) / 28)] + TAIL[i % 28];
  }
  if (c >= 0x1100 && c <= 0x1112) return LEAD[c - 0x1100];
  if (c >= 0x1161 && c <= 0x1175) return VOWEL[c - 0x1161];
  if (c >= 0x11a8 && c <= 0x11c2) return TAIL[c - 0x11a7];
  return ch;
};

export const normalize = s => [...s.normalize('NFC').replace(/[\s.,!?~'"…]/g, '')]
  .map(toJamo).join('').replace(CLUSTER_RE, m => CLUSTERS[m]);
export const checkTyped = (input, item) => normalize(input) === normalize(item.ko);
export const checkTiles = (order, item) => order.join(' ') === item.tiles.join(' ');
