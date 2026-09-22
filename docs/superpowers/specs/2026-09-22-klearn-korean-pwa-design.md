# klearn — Korean learning PWA — Design

Date: 2026-09-22
Status: approved in brainstorming, pending spec review

## Context

The user flies to Korea tomorrow for 3 weeks, starting from zero. Goals: read Hangul, type Korean in messaging apps, understand and speak survival phrases. Handwriting is out of scope. Spaced-repetition flashcards work well for the user. The app must be gamified and **must work fully offline** (plane). Device: Android (no iOS constraints).

Hard deadline: a usable, installed, offline-capable version tonight. Content can be extended during the trip via online updates.

## Approach

Vanilla HTML/CSS/JS PWA, no framework, no build step.

- Content in static JSON files.
- Progress in `localStorage`, with JSON export/import for backup.
- Service worker precaches every asset (HTML, JS, CSS, JSON, font, icons) — cache-first; a new cache version replaces the old one on the next online load, progress untouched.
- Hosted on GitHub Pages (HTTPS required for the service worker).
- Audio: browser `speechSynthesis` with `lang="ko-KR"`, relying on the Android Google TTS Korean voice pack installed offline. If no Korean voice is available, audio buttons are hidden and a one-time notice explains how to install the voice pack.
- No bundled font: Android ships Noto Sans CJK, so Hangul renders offline with the system font stack.

Rejected: React/Vite (too much tooling for tonight), Anki-only (no custom exercises/gamification; kept as the user's personal backup).

## Content model

One JSON file per unit in `content/`. Every learnable item:

```json
{ "id": "hg-c-01", "ko": "ㄱ", "rom": "g/k", "fr": "g / k", "note": "g en début de mot, k en finale" }
```

- `id` — stable unique key, used by SRS state. Never reused.
- `ko` — Korean text (jamo, word or sentence).
- `rom` — Revised Romanization; shown as a hint, hideable in settings.
- `fr` — French meaning or sound.
- `note` — optional tip.
- `tiles` — optional, for sentences: ordered word chunks used by the sentence-building exercise. `tiles.join(' ')` must equal `ko`.
- `say` — optional text passed to TTS instead of `ko` (jamo alone are read by their name, so ㄱ says "가").

Units are split into lessons (5–10 items each). A lesson unlocks when the previous lesson has every item seen at least once.

### Unit 1 — Hangul
Lessons: 14 basic consonants (split in 2–3 lessons), 10 basic vowels, syllable blocks, double consonants, compound vowels, batchim (final consonants), then reading loanwords (커피, 택시, 호텔, 버스, 콜라…).

### Unit 2 — Survival phrases (~60)
Greetings, thanks/sorry, yes/no, "how much", "where is", "I'd like…", restaurant, transport, hotel, allergies, emergencies. Polite -요 form.

### Unit 3 — Vocabulary (~150 at launch, target 300+ during trip)
Sino-Korean numbers (prices), native numbers (counting, age), food, places, transport, basic verbs.

### Field mode (no quiz)
The lessons of the phrases unit are the situations (essentials, restaurant & café, shopping, getting around, hotel, health & emergencies…), so field mode lists those lessons. Each phrase shows big Korean text + French + play button — to show the screen or play it to someone.

## Exercises

Each exercise takes an item and returns correct/incorrect.

| Exercise | Units | Mechanic |
|---|---|---|
| Recognize | Hangul, vocab, phrases | Korean shown → pick French/sound among 4 |
| Listen & pick | all | audio plays → pick the Korean among 4 |
| Reverse | vocab, phrases | French shown → pick Korean among 4 |
| Type it | all | French (+ optional audio) → type Korean with the phone's Korean keyboard; compared after NFC normalization, ignoring all spaces and punctuation |
| Build sentence | phrases | tap shuffled `tiles` in order |
| Shadowing | phrases | audio plays, user repeats aloud, self-rates Again/Good |
| Flashcard | all | front Korean or French (random), flip, grade Again/Hard/Good/Easy |

Distractors for multiple choice are drawn from the same unit. Listen and shadowing exercises are skipped when no Korean voice is available. Romanization is never shown in Hangul-unit quiz prompts (it would give the answer away); it is shown on intro cards, flashcard backs and feedback.

## Spaced repetition

SM-2 per item, stored as `{ ease, interval, due, reps, lapses }` keyed by item `id`.

- New item: first seen in a lesson (intro card: Korean + romanization + French + audio), then enters the review queue due today.
- Flashcard review: 4 buttons Again/Hard/Good/Easy.
- Exercise answer: correct = Good, incorrect = Again.
- Home session = up to 5 new items (from the first incomplete lesson of each unit, Hangul first) + due reviews oldest first, capped at 20 quiz questions. A wrong answer re-queues the item once at the end of the session.
- Unit map: tapping a lesson teaches its unseen items, or quizzes the whole lesson once all are seen.

## Gamification

- XP per correct answer (+10), combo multiplier after 5 in a row.
- Daily goal (default 50 XP, adjustable).
- Streak of days with goal met.
- Lesson map per unit showing locked / in progress / done.
- Android vibration on correct/wrong (`navigator.vibrate`).
- Card-flip and success animations in CSS.

## Screens

1. **Home** — streak, today's XP vs goal, "Start session" button, units list with progress.
2. **Unit map** — lessons as a path, tap to learn new or practice.
3. **Session** — one exercise at a time, progress bar, combo counter, end-of-session summary.
4. **Field mode** — situations list → phrases.
5. **Settings** — daily goal, show romanization, export/import progress, audio test.

Mobile-first, full-screen standalone display, dark and light theme following the system.

## Files

```
index.html          app shell
style.css
app.js              screens + navigation (DOM only)
srs.js              SM-2 scheduling (pure)
game.js             XP, daily goal, streak (pure)
exercises.js        exercise choice, question building, answer checking (pure)
session.js          session queues, lesson unlock (pure)
store.js            localStorage load/save/import
sw.js               service worker
manifest.webmanifest
content/{hangul,phrases,vocab}.json
icons/              generated by tools/icons.mjs
tests/*.test.js     node --test
```

## Error handling

- Corrupt or missing `localStorage` data: start fresh, keep the corrupt blob under a backup key, never crash.
- Import: validate JSON shape before replacing progress; on failure show an error and keep current data.
- Item ids present in progress but absent from content: ignored (content may be edited).

## Testing

- `node --test` runs unit tests on the pure modules and a content well-formedness check (unique ids, required fields, tiles match).
- Manual: install on Android, enable airplane mode, reload, run a full session including audio.

## Deployment

GitHub Pages from the `main` branch root. Before the flight the user must: open the URL online, install the app to the home screen, launch it once, then check it works in airplane mode.

## Out of scope

Speech recognition, accounts and sync, handwriting, iOS support.
