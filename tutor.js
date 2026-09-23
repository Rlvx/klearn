import { shuffle } from './exercises.js';
import { isSyllable, romanize, transliterate } from './games.js';

// Offline tutor: finds which letter was misread, explains the confusion, and aims the next questions at weak letters.
// Letter keys: initials and vowels are the jamo itself, finals are prefixed with "_" ("_ㅇ" = ㅇ at the bottom).

const INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const VOWELS = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const FINALS = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
export const DRILL_FINALS = [...'ㄱㄴㅅㄹㅁㅂㅇ'];

// Accepted spellings. Consonants follow Revised Romanization strictly so ㅂ/ㅍ or ㄱ/ㅋ mix-ups show up.
const INITIAL_FORMS = {
  ㄱ: ['g'], ㄲ: ['kk', 'gg'], ㄴ: ['n'], ㄷ: ['d'], ㄸ: ['tt', 'dd'], ㄹ: ['r', 'l'], ㅁ: ['m'], ㅂ: ['b'], ㅃ: ['pp', 'bb'],
  ㅅ: ['s'], ㅆ: ['ss'], ㅇ: [''], ㅈ: ['j', 'dj'], ㅉ: ['jj', 'tj'], ㅊ: ['ch', 'tch'], ㅋ: ['k', 'kh'], ㅌ: ['t', 'th'], ㅍ: ['p', 'ph'], ㅎ: ['h'],
};
const VOWEL_FORMS = {
  ㅏ: ['a'], ㅐ: ['ae', 'è'], ㅑ: ['ya'], ㅒ: ['yae', 'yè'], ㅓ: ['eo'], ㅔ: ['e', 'é'], ㅕ: ['yeo'], ㅖ: ['ye', 'yé'],
  ㅗ: ['o'], ㅘ: ['wa', 'oa'], ㅙ: ['wae', 'wè'], ㅚ: ['oe', 'wé'], ㅛ: ['yo'], ㅜ: ['u', 'ou'], ㅝ: ['wo', 'weo'],
  ㅞ: ['we'], ㅟ: ['wi', 'oui'], ㅠ: ['yu', 'you'], ㅡ: ['eu'], ㅢ: ['ui', 'eui'], ㅣ: ['i'],
};
// Finals: the pronounced value first, then the letter read on its own ("hab" for 합 is fine).
const FINAL_FORMS = {
  '': [''], ㄱ: ['k', 'g'], ㄲ: ['k', 'kk'], ㄴ: ['n'], ㄷ: ['t', 'd'], ㄹ: ['l', 'r'], ㅁ: ['m'], ㅂ: ['p', 'b'], ㅅ: ['t', 's'],
  ㅆ: ['t', 'ss'], ㅇ: ['ng'], ㅈ: ['t', 'j'], ㅊ: ['t', 'ch'], ㅋ: ['k'], ㅌ: ['t'], ㅍ: ['p'], ㅎ: ['t', 'h'],
  ㄳ: ['k', 'gs'], ㄵ: ['n', 'nj'], ㄶ: ['n', 'nh'], ㄺ: ['k', 'lg'], ㄻ: ['m', 'lm'], ㄼ: ['l', 'lb'], ㄽ: ['l', 'ls'],
  ㄾ: ['l', 'lt'], ㄿ: ['p', 'lp'], ㅀ: ['l', 'lh'], ㅄ: ['p', 'bs'],
};
const FORMS = [INITIAL_FORMS, VOWEL_FORMS, FINAL_FORMS];

export const split = syl => {
  const n = syl.charCodeAt(0) - 0xac00;
  return [INITIALS[Math.floor(n / 588)], VOWELS[Math.floor((n % 588) / 28)], FINALS[n % 28]];
};
export const join = (l, v, t = '') =>
  String.fromCharCode(0xac00 + (INITIALS.indexOf(l) * 21 + VOWELS.indexOf(v)) * 28 + FINALS.indexOf(t));

export const keyOf = (slot, jamo) => (slot === 2 ? `_${jamo}` : jamo);
export const slotOf = key => (key.startsWith('_') ? 2 : VOWELS.includes(key) ? 1 : 0);
const letterOf = key => key.replace(/^_/, '');
export const romOf = (slot, jamo) => FORMS[slot][jamo]?.[0] ?? '';
export const romLabel = (slot, jamo) => (slot === 0 && jamo === 'ㅇ' ? 'muet' : romOf(slot, jamo) || '—');

const norm = s => s.normalize('NFC').toLowerCase().replace(/[^a-zèé]/g, '');

// Reads a romanization back into letters, choosing the reading closest to the expected syllable.
export function decode(input, syl) {
  const s = norm(input);
  const want = split(syl);
  let best = null;
  for (const [l, lf] of Object.entries(INITIAL_FORMS)) for (const a of lf) {
    if (!s.startsWith(a)) continue;
    for (const [v, vf] of Object.entries(VOWEL_FORMS)) for (const b of vf) {
      if (!s.startsWith(b, a.length)) continue;
      const rest = s.slice(a.length + b.length);
      for (const [t, tf] of Object.entries(FINAL_FORMS)) {
        if (!tf.includes(rest)) continue;
        const got = [l, v, t];
        const cost = got.reduce((c, x, i) => c + (x !== want[i]), 0);
        if (!best || cost < best.cost) best = { cost, got };
      }
    }
  }
  if (!best) return { ok: false, got: null, diffs: [] };
  const diffs = [0, 1, 2].filter(i => best.got[i] !== want[i]).map(i => ({ slot: i, want: want[i], got: best.got[i] }));
  return { ok: diffs.length === 0, got: best.got, diffs };
}

// --- tips ---
const LETTER_TIPS = {
  ㄱ: 'ㄱ : un coin tourné vers la gauche → g (k en fin de syllabe).',
  ㄲ: 'ㄲ = ㄱ doublé → kk tendu : gorge serrée, sans souffle.',
  ㄴ: 'ㄴ : un simple coin, comme un L → n.',
  ㄷ: 'ㄷ = ㄴ avec un couvercle → d.',
  ㄸ: 'ㄸ = ㄷ doublé → tt tendu.',
  ㄹ: 'ㄹ zigzague comme un serpent → r entre voyelles, l en fin de syllabe.',
  ㅁ: 'ㅁ : une boîte fermée, comme une bouche close → m.',
  ㅂ: 'ㅂ : un petit bac avec deux oreilles → b (p en fin de syllabe).',
  ㅃ: 'ㅃ = ㅂ doublé → pp tendu.',
  ㅅ: 'ㅅ : une petite tente → s (devant ㅣ ça fait « chi » : 시).',
  ㅆ: 'ㅆ = ㅅ doublé → ss appuyé.',
  ㅇ: 'ㅇ : muet en début de syllabe, il sert juste de support. En bas, il se lit ng.',
  ㅈ: 'ㅈ = ㅅ avec un trait dessus → j (« dj »).',
  ㅉ: 'ㅉ = ㅈ doublé → jj tendu (« tj »).',
  ㅊ: 'ㅊ = ㅈ avec un petit chapeau → ch soufflé (« tch »).',
  ㅋ: 'ㅋ = ㄱ avec un trait en plus : le trait ajoute du souffle → k.',
  ㅌ: 'ㅌ = ㄷ avec une barre en plus : le trait ajoute du souffle → t.',
  ㅍ: 'ㅍ ressemble à π → p, très soufflé.',
  ㅎ: 'ㅎ = ㅇ avec un chapeau → h, qui s\'entend comme un soupir.',
  ㅏ: 'ㅏ : le petit trait part vers l\'extérieur → a.',
  ㅐ: 'ㅐ = ㅏ + ㅣ → è (ae).',
  ㅑ: 'ㅑ = ㅏ avec deux petits traits → ya.',
  ㅒ: 'ㅒ = ㅐ avec deux petits traits → yè (yae).',
  ㅓ: 'ㅓ : le petit trait revient vers la consonne → eo, un o ouvert comme dans « bol ».',
  ㅔ: 'ㅔ = ㅓ + ㅣ → é (e). Même son que ㅐ aujourd\'hui.',
  ㅕ: 'ㅕ = ㅓ avec deux petits traits → yeo.',
  ㅖ: 'ㅖ = ㅔ avec deux petits traits → yé (ye).',
  ㅗ: 'ㅗ : le petit trait est en haut → o (« haut »).',
  ㅘ: 'ㅘ = ㅗ + ㅏ : lis les deux à la suite, o + a → wa.',
  ㅙ: 'ㅙ = ㅗ + ㅐ → wè (wae).',
  ㅚ: 'ㅚ = ㅗ + ㅣ, mais se prononce wé (oe).',
  ㅛ: 'ㅛ = ㅗ avec deux petits traits → yo.',
  ㅜ: 'ㅜ : le petit trait est en dessous → ou (« dessous »), écrit u.',
  ㅝ: 'ㅝ = ㅜ + ㅓ : ou + eo → wo.',
  ㅞ: 'ㅞ = ㅜ + ㅔ → wé (we).',
  ㅟ: 'ㅟ = ㅜ + ㅣ → « oui » (wi).',
  ㅠ: 'ㅠ = ㅜ avec deux petits traits → « you » (yu).',
  ㅡ: 'ㅡ : un trait plat, lèvres étirées → eu.',
  ㅢ: 'ㅢ = ㅡ + ㅣ → eu-i (ui).',
  ㅣ: 'ㅣ : un trait debout → i.',
};
const FINALS_TIP = 'En bas de la syllabe : ㄱ → k, ㄴ → n, ㄹ → l, ㅁ → m, ㅂ → p, ㅇ → ng, et ㅅ ㄷ ㅈ ㅊ ㅌ ㅎ → t.';

const pairKey = (a, b) => [a, b].sort().join('');
const PAIRS = {
  [pairKey('ㅂ', 'ㅍ')]: 'ㅂ ressemble à un petit bac → b. ㅍ ressemble à π → p, très soufflé. À l\'oreille ㅂ tire vers le p, mais il s\'écrit b.',
  [pairKey('ㄴ', 'ㄹ')]: 'ㄴ est un simple coin → n. ㄹ zigzague comme un serpent → r/l.',
  [pairKey('ㅍ', 'ㅌ')]: 'ㅍ ressemble à π → p. ㅌ, c\'est ㄷ avec une barre en plus → t.',
  [pairKey('ㅁ', 'ㅂ')]: 'ㅁ est une boîte fermée → m. ㅂ a deux oreilles qui dépassent en haut → b.',
  [pairKey('ㄴ', 'ㄷ')]: 'ㄷ, c\'est ㄴ avec un couvercle → d. Sans couvercle, ㄴ → n.',
  [pairKey('ㄷ', 'ㄹ')]: 'ㄷ a trois traits → d. ㄹ zigzague en plus → r/l.',
  [pairKey('ㅅ', 'ㅈ')]: 'ㅈ, c\'est ㅅ avec un trait dessus → j. La tente seule, ㅅ → s.',
  [pairKey('ㅈ', 'ㅊ')]: 'ㅊ, c\'est ㅈ avec un petit chapeau : le chapeau ajoute du souffle → ch.',
  [pairKey('ㅇ', 'ㅎ')]: want => (want === 'ㅎ'
    ? 'ㅎ, c\'est ㅇ avec un chapeau : il se prononce h, comme un soupir. En français le h est muet, pas en coréen.'
    : 'ㅇ en début de syllabe est muet : pas de h ici.'),
  [pairKey('ㅐ', 'ㅔ')]: 'ㅐ et ㅔ se prononcent presque pareil aujourd\'hui (è/é). À l\'écrit : ㅐ = ㅏ + ㅣ (ae), ㅔ = ㅓ + ㅣ (e).',
  [pairKey('ㅒ', 'ㅖ')]: 'ㅒ et ㅖ se prononcent presque pareil. À l\'écrit : ㅒ = ㅑ + ㅣ (yae), ㅖ = ㅕ + ㅣ (ye).',
};
const SERIES = [['ㄱ', 'ㅋ', 'ㄲ'], ['ㄷ', 'ㅌ', 'ㄸ'], ['ㅂ', 'ㅍ', 'ㅃ'], ['ㅈ', 'ㅊ', 'ㅉ'], ['ㅅ', null, 'ㅆ']];
const Y_BASE = { ㅑ: 'ㅏ', ㅕ: 'ㅓ', ㅛ: 'ㅗ', ㅠ: 'ㅜ', ㅒ: 'ㅐ', ㅖ: 'ㅔ' };
const VERTICAL = new Set([...'ㅏㅐㅓㅔㅣ']);
const HORIZONTAL = new Set([...'ㅗㅜㅡ']);
const COMPOUND = new Set([...'ㅘㅙㅚㅝㅞㅟㅢ']);

function vowelTip(want, got) {
  const [bw, bg] = [Y_BASE[want] ?? want, Y_BASE[got] ?? got];
  if (COMPOUND.has(want)) return LETTER_TIPS[want];
  if (bw === bg) {
    return `Deux petits traits = un « y » devant : ㅏ→ㅑ, ㅓ→ㅕ, ㅗ→ㅛ, ㅜ→ㅠ. Ici ${want === bw ? 'il n\'y a qu\'un trait' : 'il y en a deux'} : ${want} = ${romOf(1, want)}.`;
  }
  if (VERTICAL.has(bw) && HORIZONTAL.has(bg) || HORIZONTAL.has(bw) && VERTICAL.has(bg)) {
    return `Regarde où est la voyelle : ㅏ ㅓ ㅣ se mettent à droite de la consonne, ㅗ ㅜ ㅡ en dessous. Ici elle est ${VERTICAL.has(bw) ? 'à droite' : 'en dessous'} : c'est ${want} = ${romOf(1, want)}.`;
  }
  const pair = pairKey(bw, bg);
  if (pair === pairKey('ㅏ', 'ㅓ')) return 'Le petit trait de ㅏ part vers l\'extérieur → a. Celui de ㅓ revient vers la consonne → eo, un o ouvert comme dans « bol ».';
  if (pair === pairKey('ㅗ', 'ㅜ')) return 'Trait en haut = o (« haut »). Trait en dessous = ou (« dessous »).';
  if (bw === 'ㅡ' || bg === 'ㅡ') return 'ㅡ est un trait plat sans petit trait → eu. ㅗ a un petit trait en haut (o), ㅜ en dessous (ou).';
  return PAIRS[pair] ?? LETTER_TIPS[want];
}

function consonantTip(want, got) {
  const pair = PAIRS[pairKey(want, got)];
  if (pair) return typeof pair === 'function' ? pair(want) : pair;
  const series = SERIES.find(s => s.includes(want) && s.includes(got));
  if (series) {
    const [plain, puff, tense] = series;
    return puff
      ? `Trois versions du même son : ${plain} = ${romOf(0, plain)} (simple), ${puff} = ${romOf(0, puff)} (un trait en plus = souffle), ${tense} = ${romOf(0, tense)} (doublé = tendu, sans souffle).`
      : `${tense} = ${plain} doublé : un ${romOf(0, plain)} tendu, appuyé (${romOf(0, tense)}).`;
  }
  return LETTER_TIPS[want];
}

export function letterTip(key) {
  const slot = slotOf(key);
  const j = letterOf(key);
  if (slot !== 2) return LETTER_TIPS[j];
  return j === 'ㅇ' ? 'ㅇ en bas de la syllabe se lit ng : 강 = gang.' : FINALS_TIP;
}

export function tipFor(slot, want, got) {
  if (slot === 1) return vowelTip(want, got);
  if (slot === 0) return consonantTip(want, got);
  if (!want) return 'Pas de consonne en bas ici : la syllabe s\'arrête sur la voyelle.';
  if (!got) return `Tu as oublié la consonne du bas : ${want} → ${romOf(2, want)}.`;
  if (want === 'ㅇ') return letterTip('_ㅇ');
  const pair = PAIRS[pairKey(want, got)];
  return pair ? (typeof pair === 'function' ? pair(want) : pair) : FINALS_TIP;
}

// --- words ---
export function spell(syl) {
  return split(syl).map((j, slot) => ({ slot, jamo: j, rom: romLabel(slot, j) })).filter(p => p.slot !== 2 || p.jamo);
}

export function checkWord(input, item) {
  const syls = [...item.ko].filter(isSyllable);
  const parts = input.split(/[\s.\-·,/]+/).filter(Boolean);
  const said = norm(input) === norm(item.rom ?? '');
  if (parts.length === syls.length) {
    const res = syls.map((syl, i) => ({ syl, ...decode(parts[i], syl) }));
    if (res.every(r => r.ok) || !said) return { ok: res.every(r => r.ok), res };
  }
  return { ok: said, res: syls.map(syl => ({ syl, ok: said, got: null, diffs: [] })), unsplit: !said };
}

const NASAL_NEXT = new Set(['ㄴ', 'ㅁ']);
export function soundChanges(ko) {
  const out = new Set();
  const syls = [...ko];
  for (let i = 0; i + 1 < syls.length; i++) {
    if (!isSyllable(syls[i]) || !isSyllable(syls[i + 1])) continue;
    const t = split(syls[i])[2];
    const l = split(syls[i + 1])[0];
    const at = `${syls[i]}${syls[i + 1]}`;
    if (!t) continue;
    if (NASAL_NEXT.has(l) && 'ㅂㅍㅄ'.includes(t)) out.add(`${at} : ㅂ devant ㄴ ou ㅁ se prononce m (합니다 → hamnida).`);
    else if (NASAL_NEXT.has(l) && 'ㄱㅋㄲㄺ'.includes(t)) out.add(`${at} : ㄱ devant ㄴ ou ㅁ se prononce ng (한국말 → hangungmal).`);
    else if (NASAL_NEXT.has(l) && 'ㄷㅅㅆㅈㅊㅌ'.includes(t)) out.add(`${at} : ㅅ, ㄷ, ㅈ… devant ㄴ ou ㅁ se prononcent n (있는 → inneun).`);
    else if (t === 'ㄴ' && l === 'ㄹ' || t === 'ㄹ' && l === 'ㄴ') out.add(`${at} : ㄴ et ㄹ côte à côte donnent ll (설날 → seollal).`);
    else if (l === 'ㅇ' && t !== 'ㅇ' && t !== 'ㅎ') out.add(`${at} : liaison, la consonne du bas glisse sur la syllabe suivante (한국어 → hangugeo).`);
  }
  return [...out];
}

// --- what the learner knows and where it hurts ---
export function letterKeyOfItem(item) {
  if (item.id.startsWith('hg-b-') && isSyllable(item.ko)) return keyOf(2, split(item.ko)[2]);
  if ([...item.ko].length === 1 && (INITIAL_FORMS[item.ko] || VOWEL_FORMS[item.ko])) return item.ko;
  return null;
}

export function knownLetters(hangulItems, cards) {
  const all = hangulItems.map(it => [letterKeyOfItem(it), it]).filter(([k]) => k);
  const seen = all.filter(([, it]) => cards[it.id]).map(([k]) => k);
  const by = slot => seen.filter(k => slotOf(k) === slot);
  if (by(0).length >= 4 && by(1).length >= 3) return { 0: by(0), 1: by(1), 2: by(2) };
  // New learner: start from the first consonants and simple vowels.
  const basics = all.map(([k]) => k);
  return { 0: basics.filter(k => slotOf(k) === 0).slice(0, 14), 1: [...'ㅏㅓㅗㅜㅡㅣ'], 2: [] };
}

export function scores(tutor, cards, hangulItems, known) {
  const seed = {};
  for (const it of hangulItems) {
    const k = letterKeyOfItem(it);
    const c = cards[it.id];
    if (k && c) seed[k] = Math.max(0, c.lapses * 0.8 - c.reps * 0.4);
  }
  const out = {};
  for (const k of [...known[0], ...known[1], ...known[2]]) {
    const s = tutor.letters[k] ?? { seen: 0, miss: 0, streak: 0 };
    const w = 0.3 + (seed[k] ?? 0) / (1 + s.seen / 3) + (4 * (s.miss + 0.5)) / (s.seen + 2);
    out[k] = s.streak >= 3 ? w / 2 : w;
  }
  return out;
}

const FRAGILE = 2;

export function difficulties(tutor, weights, n = 4) {
  return Object.entries(weights)
    .filter(([, w]) => w >= FRAGILE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, score]) => {
      const slot = slotOf(key);
      const j = letterOf(key);
      const stats = tutor.letters[key] ?? { seen: 0, miss: 0 };
      const top = Object.entries(tutor.confusions)
        .filter(([c]) => c.startsWith(`${key}>`))
        .sort((a, b) => b[1] - a[1])[0];
      const got = top ? letterOf(top[0].split('>')[1]) : null;
      return {
        key, slot, jamo: j, rom: romLabel(slot, j), score, ...stats,
        got, times: top?.[1] ?? 0,
        tip: top ? tipFor(slot, j, got) : letterTip(key),
      };
    });
}

export function advice(weights, nextLesson) {
  const weak = Object.values(weights).filter(w => w >= FRAGILE).length;
  if (weak >= 6) return `Tu as ${weak} lettres encore fragiles : consolide-les ici avant d'ouvrir de nouvelles leçons. Une séance courte par jour vaut mieux qu'une longue.`;
  if (weak > 0) return `Plus que ${weak} lettre${weak > 1 ? 's' : ''} à fixer. Encore une ou deux séances et tu es solide.`;
  return nextLesson ? `Tes lettres tiennent bien ! Tu es prêt·e pour « ${nextLesson} ».` : 'Tes lettres tiennent bien ! Continue les révisions du jour pour les garder.';
}

export function record(tutor, marks, now = Date.now()) {
  for (const { key, ok, got } of marks) {
    const s = (tutor.letters[key] ??= { seen: 0, miss: 0, streak: 0 });
    s.seen++;
    s.last = now;
    if (ok) s.streak++;
    else {
      s.miss++;
      s.streak = 0;
      if (got != null) tutor.confusions[`${key}>${got}`] = (tutor.confusions[`${key}>${got}`] ?? 0) + 1;
    }
  }
}

// Every letter of the target syllable counts as seen; misread ones as missed.
export function marksFor(syl, diffs) {
  return split(syl).flatMap((j, slot) => {
    if (slot === 2 && !j) return [];
    const d = diffs.find(x => x.slot === slot);
    return [{ key: keyOf(slot, j), ok: !d, got: d ? keyOf(slot, d.got) : undefined }];
  });
}

// --- questions ---
const pickWeighted = (entries, rand) => {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [k, w] of entries) if ((r -= w) <= 0) return k;
  return entries[entries.length - 1][0];
};

const GROUPS = [
  'ㅏㅓㅗㅜ', 'ㅑㅕㅛㅠ', 'ㅓㅕ', 'ㅗㅛ', 'ㅏㅑ', 'ㅜㅠ', 'ㅗㅜㅡ', 'ㅐㅔ', 'ㅒㅖ', 'ㅐㅒ', 'ㅔㅖ', 'ㅘㅝㅙㅞㅚㅟㅢ', 'ㅡㅣ',
  'ㄱㅋㄲ', 'ㄷㅌㄸ', 'ㅂㅍㅃ', 'ㅈㅊㅉ', 'ㅅㅆ', 'ㄴㄹㄷ', 'ㅁㅂ', 'ㅍㅌ', 'ㅇㅎ', 'ㅅㅈ',
].map(g => [...g]);
const SAME_SOUND = new Set([pairKey('ㅐ', 'ㅔ'), pairKey('ㅒ', 'ㅖ'), pairKey('ㅙ', 'ㅚ'), pairKey('ㅙ', 'ㅞ'), pairKey('ㅚ', 'ㅞ')]);

export function confusables(slot, j) {
  if (slot === 2) return ['', ...DRILL_FINALS].filter(x => x !== j);
  return [...new Set(GROUPS.filter(g => g.includes(j)).flat())].filter(x => x !== j);
}

// Keep drills to syllables a beginner meets: finals only after simple vowels, rare vowels only with usual consonants.
const SIMPLE = new Set([...'ㅏㅐㅓㅔㅗㅜㅡㅣ']);
export function plausible(l, v, t = '') {
  if (t && !SIMPLE.has(v)) return false;
  if (COMPOUND.has(v) && !'ㄱㄲㄴㄷㅁㅂㅅㅇㅈㅎ'.includes(l)) return false;
  if (v === 'ㅢ') return 'ㅇㅎ'.includes(l);
  if (v === 'ㅒ') return l === 'ㅇ';
  if (v === 'ㅖ') return 'ㅇㄱㅎㄹ'.includes(l);
  return true;
}

export function makeSyllable(focus, weights, known, rand = Math.random) {
  const slot = slotOf(focus);
  const f = letterOf(focus);
  const other = s => pickWeighted(known[s].map(k => [letterOf(k), weights[k] ?? 1]), rand);
  const finals = known[2].map(letterOf).filter(x => DRILL_FINALS.includes(x));
  for (let i = 0; i < 40; i++) {
    const l = slot === 0 ? f : other(0);
    const v = slot === 1 ? f : other(1);
    const t = slot === 2 ? f : finals.length && rand() < 0.2 ? finals[Math.floor(rand() * finals.length)] : '';
    if (plausible(l, v, t)) return join(l, v, t);
  }
  return slot === 0 ? join(f, 'ㅏ') : slot === 1 ? join('ㅇ', f) : join('ㄱ', 'ㅏ', f);
}

export function pickFocus(weights, rand = Math.random, avoid = null) {
  const entries = Object.entries(weights).filter(([k]) => k !== avoid).map(([k, w]) => [k, w * w]);
  return pickWeighted(entries.length ? entries : Object.entries(weights), rand);
}

// Four syllables differing only in the focus letter, so a wrong pick names the confusion.
export function choicesFor(syl, focus, known, listen = false, rand = Math.random) {
  const slot = slotOf(focus);
  const parts = split(syl);
  const pool = confusables(slot, parts[slot]);
  const knownSet = new Set(known[slot].map(letterOf));
  const letters = slot === 1 ? VOWELS : slot === 0 ? INITIALS : [];
  const ordered = [...shuffle(pool.filter(x => knownSet.has(x) || slot === 2), rand), ...shuffle(pool, rand), ...shuffle(letters, rand)];
  const out = [{ syl, rom: romanize(syl) }];
  for (const strict of [true, false]) {
    for (const x of ordered) {
      if (out.length === 4) break;
      if (listen && SAME_SOUND.has(pairKey(x, parts[slot]))) continue;
      const p = [...parts];
      p[slot] = x;
      if (strict && !plausible(...p)) continue;
      const s = join(...p);
      const r = romanize(s);
      if (!out.some(c => c.syl === s || c.rom === r)) out.push({ syl: s, rom: r });
    }
  }
  return shuffle(out, rand);
}

export function tilesFor(syl, rand = Math.random) {
  const letters = split(syl).filter((j, slot) => slot !== 2 || j);
  const decoys = [];
  letters.forEach((j, slot) => {
    const d = shuffle(confusables(slot, j).filter(x => x && !letters.includes(x) && !decoys.includes(x)), rand)[0];
    if (d) decoys.push(d);
  });
  return { letters, tiles: shuffle([...letters, ...decoys], rand) };
}

// A varied session: warm-up with choices, typed reading, tiles, listening and whole words.
export function planTypes(hasWords, hasVoice) {
  const plan = ['pickRom', 'read', 'build', 'pickKo', 'word', 'read', hasVoice ? 'listen' : 'pickRom', 'read', 'build', 'word', hasVoice ? 'listen' : 'pickKo', 'read'];
  return plan.map(t => (t === 'word' && !hasWords ? 'read' : t));
}

export function wordPool(items, cards, hangulItems, min = 6) {
  const ok = it => { const n = [...it.ko].filter(isSyllable).length; return n >= 2 && n <= 6; };
  const seen = items.filter(it => cards[it.id] && ok(it));
  if (seen.length >= min) return seen;
  return [...seen, ...hangulItems.filter(it => it.id.startsWith('hg-w-') && !cards[it.id] && ok(it))];
}

export function pickWord(pool, weights, rand = Math.random) {
  const w = it => {
    const keys = [...it.ko].filter(isSyllable).flatMap(s => split(s).map((j, slot) => (j ? keyOf(slot, j) : null)).filter(Boolean));
    return keys.reduce((s, k) => s + (weights[k] ?? 0.5), 0) / keys.length;
  };
  return pickWeighted(pool.map(it => [it, w(it) ** 2]), rand);
}

// Reading a whole word: the right letter-by-letter spelling and three that differ by one confusable letter.
// Each wrong option carries the swap it makes, so a wrong pick names the confusion.
export function wordChoices(ko, rand = Math.random) {
  const chars = [...ko.normalize('NFC')];
  const at = chars.map((c, i) => (isSyllable(c) ? i : -1)).filter(i => i >= 0);
  const out = [{ text: transliterate(ko), diff: null }];
  for (const strict of [true, false]) {
    for (let tries = 0; out.length < 4 && tries < 80; tries++) {
      const i = at[Math.floor(rand() * at.length)];
      const p = split(chars[i]);
      const slots = p[2] ? [0, 1, 2] : [0, 1];
      const slot = slots[Math.floor(rand() * slots.length)];
      const alts = confusables(slot, p[slot]);
      const x = alts[Math.floor(rand() * alts.length)];
      const q = [...p];
      q[slot] = x;
      if (x === undefined || (strict && !plausible(...q))) continue;
      const swapped = [...chars];
      swapped[i] = join(...q);
      const text = transliterate(swapped.join(''));
      if (!out.some(o => o.text === text)) out.push({ text, diff: { slot, want: p[slot], got: x } });
    }
  }
  return shuffle(out, rand);
}
