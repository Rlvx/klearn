# klearn

Offline PWA for learning Korean, used by a French speaker who is in Korea right now. It is vanilla JS: no framework, no dependencies, no build step. It is served by GitHub Pages from the root of `main`: https://rlvx.github.io/klearn/

The user usually writes from their phone and asks for more content, for example "add market vocabulary". The job is not done until the update is live on `main`.

## Adding content

- Units are `content/hangul.json`, `content/phrases.json`, `content/vocab.json` and `content/grammar.json`. A unit contains `lessons`, each with an `id`, a `title`, an optional `icon`, and `items` (at least 4 per lesson).
- Each item has the form `{ "id", "ko", "rom", "fr", "note"?, "tiles"?, "say"? }`:
  - `rom` uses Revised Romanization.
  - `fr` is the French meaning.
  - `tiles` is only for phrases, and `tiles.join(' ')` must equal `ko`.
- Ids must be new and unique. Never rename, reuse or delete an existing id, because the user's progress on the phone is keyed on it. Add new lessons at the end of a unit so existing progress keeps its order.
- In `grammar.json`, each lesson has a `rule` (`text`: short paragraphs, optional `forms`: `[form, when, example]` rows) shown before practice. An item can have a `gap` (`before`, `answer`, `options`) for the « Complète » exercise; the tests check that alternating particles (예요/이에요, 는/은, 를/을…) follow the vowel/consonant rule.
- The learner's own words live in `state.custom` (ids `my-…`), not in `content/`.
- In `phrases.json`, each lesson is a situation (restaurant, métro…) and also appears in the "Sur le terrain" mode.
- Double-check the Korean spelling, the romanization and the French meaning. The user is a beginner and will trust them.

## Shipping

1. Run `node --test`. Every test must pass; the suite includes a content well-formedness check.
2. Bump `CACHE` in `sw.js` (`klearn-vN` → `klearn-vN+1`). Every deploy that changes any file needs this, otherwise the phone keeps the old version.
3. If you add a new file that the app loads, also add it to `ASSETS` in `sw.js`.
4. Commit and get the change onto `main`. Either push to `main`, or open a PR and tell the user to merge it. Then tell the user: "Open the app once with a connection, then close it and open it again to get the update."
