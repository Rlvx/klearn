import { shuffle } from './exercises.js';

// Reading comprehension: a short text, questions in French about its meaning, a tap-to-translate glossary.

export const UNKNOWN = 'On ne sait pas';
export const TF = ['Vrai', 'Faux', UNKNOWN];

export const bareToken = w => w.replace(/[.,!?…~"«»]/g, '');
export const fullText = text => text.lines.map(l => l.ko).join('\n');
export const answerOf = q => q.tf ?? q.answer;

// Words with their position in the full text, so a proof can be highlighted word by word.
export function tokenize(text) {
  let offset = 0;
  let index = 0;
  return text.lines.map(line => {
    const tokens = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(line.ko))) {
      tokens.push({ i: index++, text: m[0], key: bareToken(m[0]), start: offset + m.index, end: offset + m.index + m[0].length });
    }
    offset += line.ko.length + 1;
    return { who: line.who, tokens };
  });
}

export function proofTokens(text, proof) {
  const at = proof ? fullText(text).indexOf(proof) : -1;
  if (at < 0) return new Set();
  const end = at + proof.length;
  return new Set(tokenize(text).flatMap(l => l.tokens).filter(t => t.start < end && t.end > at).map(t => t.i));
}

// Answers are shuffled, but « On ne sait pas » always stays last where people look for it.
export function optionsFor(q, rand = Math.random) {
  if (q.tf) return TF;
  const rest = shuffle(q.options.filter(o => o !== UNKNOWN), rand);
  return q.options.includes(UNKNOWN) ? [...rest, UNKNOWN] : rest;
}

// Lessons still to finish before the text only uses known words.
export const missingLessons = (text, isDone) => text.needs.filter(id => !isDone(id));

export const pointsFor = (ok, helped) => (ok ? (helped ? 5 : 10) : 0);
