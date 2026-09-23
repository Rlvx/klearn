import { shuffle } from './exercises.js';

// Hangul syllable = 0xAC00 + (initial * 21 + vowel) * 28 + final
const INITIAL = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const VOWEL = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const FINAL = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
const R_INITIAL = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const R_VOWEL = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const R_FINAL = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
// Jamo typed as two keys on a 2-beolsik keyboard.
const SPLIT = {
  ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ',
  ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ',
};
const KEYS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛㅜㅠㅡㅣ'];

export const isSyllable = ch => ch >= '가' && ch <= '힣';
const parts = ch => {
  const n = ch.charCodeAt(0) - 0xac00;
  return [Math.floor(n / 588), Math.floor((n % 588) / 28), n % 28];
};
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

export function keystrokes(text) {
  const out = [];
  for (const ch of text.normalize('NFC')) {
    if (!isSyllable(ch)) continue;
    const [i, v, f] = parts(ch);
    for (const jamo of [INITIAL[i], VOWEL[v], FINAL[f]]) out.push(...(SPLIT[jamo] ?? jamo));
  }
  return out;
}

export function romanize(syllable) {
  const [i, v, f] = parts(syllable);
  return R_INITIAL[i] + R_VOWEL[v] + R_FINAL[f];
}

export function syllablePool(units) {
  const set = new Set();
  for (const u of units) for (const l of u.lessons) for (const it of l.items) for (const ch of it.ko) if (isSyllable(ch)) set.add(ch);
  return [...set];
}

export function assembleRound(pool, rand = Math.random) {
  const syllable = pick(pool, rand);
  const keys = keystrokes(syllable);
  const decoys = shuffle(KEYS.filter(k => !keys.includes(k)), rand).slice(0, 3);
  return { syllable, keys, rom: romanize(syllable), tiles: shuffle([...keys, ...decoys], rand) };
}

// Words to type: the ones already seen; while there are few, add the Hangul reading lessons.
export function typingPool(items, cards, min = 12) {
  const typable = items.filter(it => [...it.ko].some(isSyllable));
  const seen = typable.filter(it => cards[it.id]);
  if (seen.length >= min) return seen;
  return [...seen, ...typable.filter(it => !cards[it.id] && /^hg-[sw]-/.test(it.id))];
}

export function blankRound(patterns, byId, rand = Math.random) {
  const p = pick(patterns, rand);
  const noun = byId[pick(p.nouns, rand)];
  return { noun, prompt: p.ko.replace('{}', '___'), fr: p.fr.replace('{}', noun.fr), full: p.ko.replace('{}', noun.ko) };
}

// Letter-by-letter spelling, one Latin form per Hangul spelling: 감사합니다 → gam·sa·hab·ni·da.
// (The usual romanization follows pronunciation, so « gamsahamnida » could be spelled several ways.)
const L_FINAL = ['', 'g', 'kk', 'gs', 'n', 'nj', 'nh', 'd', 'l', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h'];
export function transliterate(text) {
  return text.normalize('NFC').split(/\s+/)
    .map(w => [...w].filter(isSyllable).map(ch => { const [i, v, f] = parts(ch); return R_INITIAL[i] + R_VOWEL[v] + L_FINAL[f]; }).join('·'))
    .filter(Boolean).join(' ');
}

const latin = s => s.normalize('NFC').toLowerCase().replace(/[^a-z]/g, '');
// Accepts how it's said (item.rom and any extra form) as well as letter by letter, with or without separators.
export function romMatches(input, item, extra = []) {
  const got = latin(input);
  if (!got) return false;
  const bySyllable = [...item.ko.normalize('NFC')].filter(isSyllable).map(romanize).join('');
  return [item.rom ?? '', transliterate(item.ko), bySyllable, ...extra].some(r => latin(r) === got);
}

// Words to read or write, whatever their meaning: Hangul only, 1 to 6 syllables, each spelling once.
const syllableCount = it => [...it.ko].filter(isSyllable).length;
export function readingPool(items) {
  const seen = new Set();
  return items.filter(it => {
    const n = syllableCount(it);
    const key = it.ko.replace(/[\s?!.,~]/g, '');
    if (!n || n > 6 || !/^[가-힣\s?!.,~]+$/.test(it.ko) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Words get longer as the player chains right answers: len and len - 1 syllables.
export function pickByLength(pool, len, rand = Math.random, avoid = null) {
  const others = pool.filter(it => it !== avoid);
  const fit = others.filter(it => syllableCount(it) <= len && syllableCount(it) >= Math.max(1, len - 1));
  return pick(fit.length ? fit : others, rand);
}

// --- Contre la montre ---
// The clock starts at `start` seconds. A right answer earns seconds that scale with how hard it was:
// keystrokes for writing (each key is work), syllables for reading. Hints halve the gain, misses cost `penalty`.
export const CLOCK = { start: 30, max: 60, penalty: 3 };
const PER_UNIT = { assemble: 1, copy: 0.6, write: 0.8, listen: 1, blank: 1, read: 1.5 };

export function timeBonus(kind, ko, hinted = false) {
  const units = kind === 'read' ? [...ko].filter(isSyllable).length : keystrokes(ko).length;
  const secs = Math.ceil(1 + units * PER_UNIT[kind]);
  return hinted ? Math.ceil(secs / 2) : secs;
}

export const addTime = (left, secs) => Math.max(0, Math.min(CLOCK.max, left + secs));

// Records are kept per mode: best score against the clock, best streak in endless practice.
export const bestKey = (id, mode) => `${id}:${mode === 'timed' ? 'timed' : 'run'}`;
