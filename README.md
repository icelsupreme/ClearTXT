# ClearTXT

[![CI](https://github.com/icelsupreme/ClearTXT/actions/workflows/ci.yml/badge.svg)](https://github.com/icelsupreme/ClearTXT/actions/workflows/ci.yml)

A small, dependency-free web tool that strips text down to a clean, safe character set — paste text in, get a filtered, normalized version out, side by side with a highlighted diff of exactly what changed.

It's a single static page: no backend, no build step, no data ever leaves your browser.

## Features

- **Side-by-side filtering.** Paste or type into the input box; the cleaned result appears in the output box as you type, with live character counts.
- **Configurable fixes.** The "Fixes & explanation" drawer lists every transformation as an independent toggle, so you choose exactly what gets touched:
  - Normalize Unicode (NFKC) — folds ligatures, full-width letters, and superscripts into plain forms
  - Fold accented letters to their plain ASCII base (`é` → `e`)
  - Straighten smart quotes (`“ ” ‘ ’` → `" '`)
  - Convert em dashes to hyphens (`—` → `-`) — every other dash (en dash, hyphen, non-breaking hyphen, figure dash, horizontal bar, minus sign) is always preserved exactly as typed
  - Strip emoji & symbols
  - Strip invisible & control characters (zero-width spaces, directional marks, BOM, ...)
  - Allow Hebrew characters (off by default, since the base filter targets Latin/ASCII text)
  - Remove tabs, remove extra spaces, remove line breaks, remove paragraph breaks

  A fix that's turned off leaves its characters exactly as typed; a character only gets removed once none of the applicable fixes can convert it.
- **"What changed?" diff view.** A collapsible panel shows a per-category breakdown of what was removed vs. converted, plus a highlighted side-by-side view of the input and output.
- **Line numbers** on both text boxes, kept aligned even when lines wrap.
- **Your fix preferences persist** across visits via `localStorage`.

## Usage

This is a static page — no server or build required. Either:

- Open `index.html` directly in a browser, or
- Serve the directory locally, e.g.:

  ```sh
  python3 -m http.server 8000
  ```

  then visit `http://localhost:8000`.

## Project structure

```
index.html   markup
styles.css   styling
script.js    filtering logic + DOM wiring (dual-purpose: also require()-able for tests, see below)
test/        unit tests for the filtering logic
```

## Development

Requires Node.js (for linting and tests only — the page itself has no runtime dependencies).

```sh
npm install   # dev dependencies: eslint + test runner support
npm run lint  # ESLint
npm test      # unit tests (node:test) against the filtering logic in script.js
```

`script.js` runs as a plain browser script, but its pure text-processing functions (`processText`, `applyWhitespaceCleanup`, `buildRuns`, etc.) are also exposed via `module.exports` when loaded under Node, which is what `test/processText.test.js` exercises directly — no DOM or browser needed to run the test suite.

CI runs lint and tests on every push to `main` and on every pull request (see `.github/workflows/ci.yml`), plus a non-blocking `npm audit` check.

### Cache-busting

`index.html` loads `styles.css` and `script.js` with a `?v=N` query string. There's no build step or asset hashing here, so bump that version number whenever either file changes — otherwise browsers (especially since this page is often opened directly over `file://`) can keep serving an old cached copy, e.g. making a checkbox toggle look like it silently stopped updating the output when it's actually just running stale JS. A plain hard refresh (Ctrl/Cmd+Shift+R) works around it for one visit, but the version bump is what prevents it for everyone else.
