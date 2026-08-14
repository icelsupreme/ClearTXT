# ClearTXT

[![CI](https://github.com/icelsupreme/ClearTXT/actions/workflows/ci.yml/badge.svg)](https://github.com/icelsupreme/ClearTXT/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A small, dependency-free web tool that strips text down to a clean, safe character set - paste text in, get a filtered, normalized version out, side by side with a highlighted diff of exactly what changed.

It's a single static page: no backend, no build step, and none of your text ever leaves your browser. (The page does load its fonts from Google Fonts over the network - see [Fonts](#fonts) below if you'd rather it made zero external requests at all.)

## Features

- **Side-by-side filtering.** Paste or type into the input box; the cleaned result appears in the output box as you type, with live character counts.
- **Inline highlighting.** Removed and converted characters are marked directly inside the input/output boxes (red for removed, blue for converted, a ring for invisible characters), and any changed line gets a full-row tint with its gutter number bolded, GitHub-diff style. "Previous"/"Next" buttons (or Alt+Down/Alt+Up, or clicking a changed line number) step through the changes. A sticky footer keeps character/word counts and removed/converted totals visible while you're scrolled down.
- **Configurable fixes.** The "Fixes & explanation" drawer lists every transformation as an independent toggle, grouped into **Typography & normalization** (Unicode normalization, smart quotes, em dash conversion), **Languages & scripts** (accent folding, Hebrew, Arabic, Cyrillic), **Symbols & invisible characters** (emoji/symbols, currency symbols, invisible/control characters, mixed-script look-alike characters, unsafe Markdown link protocols), and **Whitespace cleanup** (tabs, extra spaces, line breaks, paragraph breaks) - each group can be toggled at once, and "Restore defaults" resets everything in one click. A fix that's off leaves its characters untouched.
- **Line numbers** on both text boxes, kept aligned even when lines wrap.
- **Import, copy, or export** - load any text file (plain text or source code) straight into the input, copy the output to the clipboard, or download it as a `.txt` file named after the output's first line.
- **Your fix preferences persist** across visits via `localStorage`.
- **Batch mode** ([batch.html](docs/batch.html)) cleans multiple files at once - drag files in (or pick them), each is filtered with the same fixes and downloaded under its original filename. Fix preferences are shared with the single-file page.
- **Compare mode** ([compare.html](docs/compare.html)) diffs two files against each other in the same two-box editor layout, with removed/added/changed lines highlighted down to the exact changed *words* within a line (punctuation and whitespace stay individually diffable too - only two different words are treated as a single atomic unit, so two unrelated words that happen to share a letter or two never show up as a confusing partial match), Previous/Next-difference navigation, and a report panel with a percentage-diff figure plus character and word counts (and their difference) for each file - with a toggle to include or exclude Markdown syntax from those numbers, and Copy/Download buttons for the report itself. An "Apply cleanup before comparing" toggle runs both files through the same fixes (preferences shared with the other two pages) before diffing, or compares them exactly as imported.

## Fonts

The page loads [Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans), [Noto Sans Mono](https://fonts.google.com/noto/specimen/Noto+Sans+Mono), [Noto Sans Hebrew](https://fonts.google.com/noto/specimen/Noto+Sans+Hebrew), and [Noto Sans Arabic](https://fonts.google.com/noto/specimen/Noto+Sans+Arabic) from Google Fonts, for consistent rendering across browsers/OSes - including Hebrew and Arabic text, which fall back to their own family per-character automatically. This is the only network request the page makes on its own.

For a copy that makes zero external requests: download the four families' `.woff2` files, add `@font-face` rules pointing at them in `docs/styles.css`, and remove the Google Fonts `<link>` tags from every page in `docs/` - the existing `--font-sans`/`--font-mono` stacks in `docs/styles.css` already reference the right family names and don't need to change.

## Icons

Button icons are [Lucide](https://lucide.dev) (ISC License), embedded directly as inline `<svg>` markup in each page's own HTML - no icon font, no JS runtime, no extra network request. `stroke="currentColor"` is what lets them pick up each button's own text color automatically, including on hover.

## Usage

This is a static page - no server or build required. Either:

- Open `docs/index.html` directly in a browser, or
- Serve the directory locally, e.g.:

  ```sh
  cd docs && python3 -m http.server 8000
  ```

  then visit `http://localhost:8000`.

## Project structure

The site itself lives in `docs/` - not because it's documentation, but because that's one of only two folder names ([along with repo root](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)) GitHub Pages' "Deploy from a branch" source can publish directly, with no build step or extra workflow needed. Everything else here is project housekeeping, not part of the deployed site.

```
docs/
  index.html          markup for the single-file page
  batch.html          markup for the batch (multi-file) page
  compare.html        markup for the compare (two-file diff) page
  changelog.html      a condensed, user-facing "what's new," linked from every page's footer
  documentation.html  what ClearTXT defends against and how, linked from every page's footer
  styles.css          shared styling
  batch.css           styling specific to the batch page
  compare.css         styling specific to the compare page
  changelog.css       styling specific to the changelog page
  documentation.css   styling specific to the documentation page
  script.js           filtering/diffing logic + single-file page's DOM wiring (dual-purpose: also require()-able for tests, see below)
  batch.js            batch page's DOM wiring, built on script.js's shared logic
  compare.js          compare page's DOM wiring, built on script.js's shared logic
  favicon.svg         browser tab icon, also embedded inline as the header's logo icon
  social-card.png     social sharing preview image (og:image/twitter:image), built from favicon.svg's icon
  sitemap.xml         lists every page for search engine crawlers
  robots.txt          crawler allow/deny rules; points crawlers at sitemap.xml above
test/             unit tests for the filtering logic
CHANGELOG.md      full version history
```

## Development

Requires Node.js (for linting and tests only - the page itself has no runtime dependencies).

```sh
npm install   # dev dependencies: eslint + test runner support
npm run lint  # ESLint
npm test      # unit tests (node:test) against the filtering logic in docs/script.js
```

`docs/script.js` runs as a plain browser script, but its pure text-processing functions (`processText`, `applyWhitespaceCleanup`, `inputHighlightHtml`, etc.) are also exposed via `module.exports` when loaded under Node, which is what `test/processText.test.js` exercises directly - no DOM or browser needed to run the test suite.

CI runs lint and tests on every push to `main` and on every pull request (see `.github/workflows/ci.yml`), plus a non-blocking `npm audit` check.

### Versioning and cache-busting

There's no build step here, so the version number is kept in sync by hand in three places - bump all three together on every release:

1. `version` in `package.json`
2. the `?v=` query string on every `.css`/`.js`/`.svg` reference across `docs/index.html`, `docs/batch.html`, `docs/compare.html`, `docs/changelog.html`, and `docs/documentation.html`
3. the version badge next to the title in each page's `<header>`

The `?v=` matters functionally, not just cosmetically: without it, browsers (especially since this page is often opened directly over `file://`) can keep serving a stale cached copy of `styles.css`/`script.js` after an update. The on-page badge exists so you can tell at a glance whether the copy you're looking at is current.

## Version history

Versioned per [Semantic Versioning](https://semver.org/) - `MAJOR.MINOR.PATCH`. See [CHANGELOG.md](CHANGELOG.md) for the full, entry-by-entry release history, including the semver conventions this project follows.

## License

[MIT](LICENSE)

## Author

Aviv M. Icel - [GitHub](https://github.com/icelsupreme) - [Bluesky](https://bsky.app/profile/icel.me)
