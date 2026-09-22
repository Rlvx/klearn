# klearn

Offline PWA to learn Korean (Hangul, survival phrases, vocabulary) with SM-2 spaced repetition.

- Run locally: `python3 -m http.server 8000`
- Tests: `node --test`
- Regenerate icons: `node tools/icons.mjs`
- Deploy: push to `main` (GitHub Pages). **Bump `CACHE` in `sw.js` on every deploy.**
- Add content: append items to `content/*.json` with new unique `id`s (never reuse or rename an id: progress is keyed on it).

## Before the flight (phone checklist)

- Open the deployed URL once online in Chrome, then ⋮ → Install app; launch it from the home screen once.
- Install offline Korean voice: Settings → Text-to-speech → Google → Install voice data → Korean (a voice can be listed but silent offline if its data is not downloaded).
- Add the Korean keyboard: Gboard → Languages → Korean, 2-Beolsik layout (the "type" exercises need it).
- Turn on airplane mode, relaunch the app, tap "Tester la voix" in Réglages, run one full session.
- Export progress now and then (Réglages → Exporter) as a backup.
