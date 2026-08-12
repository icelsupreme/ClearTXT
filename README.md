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
- **Import, copy, or export** — load a text file straight into the input, copy the output to the clipboard, or download it as a timestamped `.txt` file.
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

### Versioning and cache-busting

There's no build step here, so the version number is kept in sync by hand in three places — bump all three together on every release:

1. `version` in `package.json`
2. the `?v=` query string on both `styles.css` and `script.js` in `index.html`
3. the `v0.x.y` badge next to the title in `index.html`'s `<header>`

The `?v=` matters functionally, not just cosmetically: without it, browsers (especially since this page is often opened directly over `file://`) can keep serving an old cached copy of `styles.css`/`script.js`, e.g. making a checkbox toggle look like it silently stopped updating the output when it's actually just running stale JS. A plain hard refresh (Ctrl/Cmd+Shift+R) works around that for one visit, but the version bump is what prevents it for everyone else. The on-page badge exists so you can tell at a glance, without opening dev tools, whether the copy you're looking at is current — compare it against the latest entry below.

## Version history

Versioned per [Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH`, tracked in `package.json`. A MAJOR bump means existing input can now produce different output, or a documented toggle/behavior was removed or renamed; MINOR adds functionality without changing what already worked; PATCH is a fix with no behavior change. The project is still pre-1.0 (`0.y.z`), and per semver's own rule for that phase, a MINOR release may still include a behavior change — those are called out explicitly below.

### 0.7.0
- **Feature:** a version badge next to the title, so you can tell at a glance whether the copy you're looking at is current. Also consolidates the previously-arbitrary `?v=` cache-busting counter to match `package.json`'s version number, so there's one number to bump per release instead of two unrelated ones.

### 0.6.0
- **Feature:** an "Import from file" button loads a text file's contents straight into the input box.

### 0.5.0
- **Feature:** an "Export to file" button downloads the output as a timestamped `.txt` file, alongside the existing "Copy output" button.

### 0.4.1
- **Fix:** cache-bust `styles.css`/`script.js` with a `?v=` query string, so browsers (especially over `file://`) can't keep serving a stale copy after an update.
- **Docs:** add this version history.

### 0.4.0
- **Feature:** visually expose invisible/zero-width characters (`ZWSP`, `BOM`, control characters, ...) as small labeled markers in the "What changed?" diff view, instead of rendering as literally nothing.
- **Tooling:** add a unit test suite (`test/`, Node's built-in test runner) covering the filtering logic, wired into CI; refactor `script.js` so its pure logic is `require()`-able from Node without a DOM.
- **Docs:** add the project README.
- **Fix:** bump `actions/checkout`/`actions/setup-node` to v5 in CI, clearing a Node 20 deprecation warning.

### 0.3.1
- **Tooling:** add ESLint and a CI workflow that lints every push and pull request.

### 0.3.0
- **Feature:** text boxes wrap long lines and are capped at a fixed height with internal scrolling, instead of scrolling horizontally / growing unbounded.
- **Feature:** four new whitespace-cleanup fixes — remove tabs, remove extra spaces (on by default), remove line breaks, remove paragraph breaks.
- **Behavior change:** the "convert dashes" fix now only touches the em dash (`—`); every other dash-like character is always preserved exactly as typed (previously several of them were converted or removed).
- **Fix:** the "What changed?" diff view groups consecutive same-type characters into one highlight instead of one per character, so highlighting stays on for much larger inputs instead of being disabled past a size limit.
- **Docs:** remove stylistic em dashes from the page's own UI copy.

### 0.2.0
- **Feature:** line numbers on both text boxes, kept aligned with wrapped/scrolled content.
- **Feature:** a "What changed?" panel with a removed/converted breakdown by category and a highlighted side-by-side diff.
- **Feature / behavior change:** the fixed character-whitelist filter becomes a configurable pipeline — six independent toggles (Unicode normalization, accent folding, smart quotes, dashes, emoji/symbols, invisible/control characters) plus an opt-in "Allow Hebrew characters" toggle. Several characters that used to be silently deleted (accents, curly quotes, dashes) are now converted instead of dropped by default. Preferences persist via `localStorage`.
- **Refactor:** split the single `index.html` file into `index.html` / `styles.css` / `script.js`.

### 0.1.0
- **Initial release:** a single-page text filter that strips input down to a printable-ASCII-plus-curated-dashes whitelist, after normalizing to Unicode NFKC (folding ligatures, full-width forms, superscripts, ...) and explicitly stripping zero-width/invisible characters. Copy/clear controls and an explanation of what's kept vs. removed.
