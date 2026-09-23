import { isSyllable } from './games.js';
import { split, join, romOf } from './tutor.js';

// The learner's own words, stored in state.custom and reviewed like any other card.

const FINAL_PARTS = { ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ' };
const NASAL = { k: 'ng', p: 'm', t: 'n' };
const sound = t => romOf(2, t); // pronounced value of a final: k, n, t, l, m, p, ng

// Revised Romanization of a word as it is said: liaison, nasalization and ㄴ/ㄹ → ll.
export function autoRom(ko) {
  return ko.normalize('NFC').split(/\s+/).filter(Boolean).map(word => {
    const chars = [...word];
    const parts = chars.map(ch => (isSyllable(ch) ? split(ch) : null));
    let out = '';
    chars.forEach((ch, i) => {
      const p = parts[i];
      if (!p) { out += ch; return; }
      let [l, v, t] = p;
      const next = parts[i + 1];
      let lead = romOf(0, l);
      if (i > 0 && parts[i - 1]?.moved) lead = parts[i - 1].moved;
      else if (i > 0 && parts[i - 1]?.leadAs) lead = parts[i - 1].leadAs;
      let tail = t ? sound(t) : '';
      if (t && next) {
        const [nl] = next;
        const [keep, move] = FINAL_PARTS[t] ? [...FINAL_PARTS[t]] : [null, t];
        if (nl === 'ㅇ' && t !== 'ㅇ') {
          // Liaison: the final slides onto the next vowel (ㅎ goes silent).
          tail = keep ? sound(keep) : '';
          p.moved = move === 'ㅎ' ? '' : move === 'ㅆ' ? 'ss' : romOf(0, move);
        } else if ((nl === 'ㄴ' || nl === 'ㅁ') && NASAL[tail]) {
          tail = NASAL[tail];
        } else if ((t === 'ㄴ' && nl === 'ㄹ') || (t === 'ㄹ' && nl === 'ㄴ')) {
          tail = 'l';
          p.leadAs = 'l';
        } else if (nl === 'ㄹ' && tail !== 'l') {
          p.leadAs = 'n';
        }
      }
      out += lead + romOf(1, v) + tail;
    });
    return out;
  }).join(' ');
}

export function makeCustom(ko, fr, note = '', now = Date.now()) {
  const clean = ko.normalize('NFC').trim().replace(/\s+/g, ' ');
  return { id: `my-${now.toString(36)}`, ko: clean, rom: autoRom(clean), fr: fr.trim(), ...(note.trim() ? { note: note.trim() } : {}) };
}

export const hasHangul = s => [...s].some(isSyllable);

const PARTICLES = ['에서', '으로', '은', '는', '이', '가', '을', '를', '에', '의', '도', '로', '와', '과'];
const bare = w => w.replace(/[^가-힣]/g, '');

// Every word the app already teaches, alone or inside a phrase.
export function knownWords(items) {
  const set = new Set();
  for (const it of items) {
    set.add(bare(it.ko));
    for (const w of it.ko.split(/\s+/)) if (bare(w)) set.add(bare(w));
  }
  return set;
}

// A word counts as known when it, or the word without a trailing particle, is already taught.
export function isKnown(word, known) {
  if (known.has(word)) return true;
  const p = PARTICLES.find(x => word.endsWith(x) && word.length > x.length);
  return !!p && known.has(word.slice(0, -p.length));
}

// Hangul words found in OCR text, in reading order, split into new and already known.
export function wordsFromText(text, known) {
  const seen = new Set();
  const fresh = [];
  const old = [];
  for (const w of text.normalize('NFC').match(/[가-힣]+/g) ?? []) {
    if (seen.has(w)) continue;
    seen.add(w);
    (isKnown(w, known) ? old : fresh).push(w);
  }
  return { fresh, old };
}

export const findExisting = (ko, items) => {
  const b = bare(ko);
  return items.find(it => bare(it.ko) === b) ?? null;
};

export const translateUrl = ko => `https://translate.google.com/?sl=ko&tl=fr&text=${encodeURIComponent(ko)}&op=translate`;

// Syllables reuse the tutor's jamo helpers; exported for the tests.
export { join };
