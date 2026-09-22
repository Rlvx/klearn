# klearn

Offline PWA to learn Korean (Hangul, survival phrases, vocabulary) with SM-2 spaced repetition.

- Run locally: `python3 -m http.server 8000`
- Tests: `node --test`
- Regenerate icons: `node tools/icons.mjs`
- Deploy: push to `main` (GitHub Pages). **Bump `CACHE` in `sw.js` on every deploy.**
- Add content: append items to `content/*.json` with new unique `id`s (never reuse or rename an id: progress is keyed on it).
