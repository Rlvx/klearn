export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Typing or ordering Korean only once every letter of the item has been learned; buttons before that.
export function pickExercise(item, unitId, rand = Math.random, hasVoice = true, readable = true) {
  const types = readable ? ['flashcard', 'recognize', 'type'] : ['recognize'];
  if (unitId !== 'hangul') types.push('reverse');
  if (hasVoice) types.push('listen');
  if (item.tiles && readable) types.push('build');
  if (item.gap && readable) types.push('gap', 'gap');
  if ((unitId === 'phrases' || unitId === 'grammar') && hasVoice) types.push('shadow');
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
  if (type === 'gap') {
    const { before, answer } = item.gap;
    q.prompt = item.ko.replace(before + answer, `${before} ___`);
    q.options = shuffle(item.gap.options, rand);
    q.why = particleWhy(before, answer);
  }
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

// Letters a learner must know to read a word: initial, vowel, and each consonant of the final.
export function lettersOf(ko) {
  const out = new Set();
  for (const ch of ko.normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (c < 0xac00 || c > 0xd7a3) continue;
    const i = c - 0xac00;
    out.add(LEAD[Math.floor(i / 588)]);
    out.add(VOWEL[Math.floor((i % 588) / 28)]);
    const t = TAIL[i % 28];
    if (t) for (const x of CLUSTERS[t] ?? t) out.add(x);
  }
  return [...out];
}
export const canRead = (ko, known) => lettersOf(ko).every(j => known.has(j));

// Particles that change with the last letter of the word: [after a vowel, after a consonant].
const PARTICLES = [['예요', '이에요'], ['는', '은'], ['를', '을'], ['가', '이'], ['와', '과'], ['로', '으로']];

const lastFinal = word => {
  const c = word.normalize('NFC').codePointAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 ? TAIL[(c - 0xac00) % 28] : null;
};

// The form the rule asks for, or null when the particle doesn't alternate.
export function expectedParticle(before, options) {
  const pair = PARTICLES.find(p => options.includes(p[0]) && options.includes(p[1]));
  const t = lastFinal(before);
  if (!pair || t === null) return null;
  if (pair[0] === '로' && t === 'ㄹ') return '로'; // 로 after ㄹ too
  return t ? pair[1] : pair[0];
}

export function particleWhy(before, answer) {
  const t = lastFinal(before);
  if (t === null || !PARTICLES.some(p => p.includes(answer))) return '';
  const last = [...before].pop();
  if (answer === '로' && t === 'ㄹ') return `${before} finit par ㄹ : exception, on met 로.`;
  return t
    ? `${before} finit par une consonne (${last} → ${t} en bas) : on met ${answer}.`
    : `${before} finit par une voyelle (${last}) : on met ${answer}.`;
}
