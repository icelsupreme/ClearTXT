# ClearTXT

[![CI](https://github.com/icelsupreme/ClearTXT/actions/workflows/ci.yml/badge.svg)](https://github.com/icelsupreme/ClearTXT/actions/workflows/ci.yml)

A small, dependency-free web tool that strips text down to a clean, safe character set - paste text in, get a filtered, normalized version out, side by side with a highlighted diff of exactly what changed.

It's a single static page: no backend, no build step, no data ever leaves your browser.

## Features

- **Side-by-side filtering.** Paste or type into the input box; the cleaned result appears in the output box as you type, with live character counts.
- **Inline highlighting.** Removed and converted characters are highlighted directly inside the input and output boxes themselves (no separate/duplicate diff view to keep in sync) - red for removed, blue for converted, a thin ring for invisible/control characters (which have no width of their own to highlight). Any line containing a change also gets a full-row tint, GitHub-diff style, with its line number bolded and colored in the gutter, so changed lines are easy to spot at a glance even before reading the character-level marks. "Previous change" / "Next change" buttons (or Alt+Down / Alt+Up, or clicking a changed line number directly) step through the changed lines one at a time, scrolling and centering each one (in both boxes at once) with a stronger highlight than the rest. A collapsible "What changed?" panel below has the removed/converted counts by category, and a sticky footer keeps the input/output character counts, removed/converted counts, and a Markdown-aware word count all visible even while you're scrolled down configuring fixes.
- **Configurable fixes.** The "Fixes & explanation" drawer lists every transformation as an independent toggle, organized into three groups - each with its own checkbox to turn every fix in that group on or off at once (showing indeterminate when the group is a mix of on/off) - plus a "Restore defaults" button that resets every fix and the em dash target back to its default in one click:
  - **Typography & normalization:** Normalize Unicode (NFKC, folds ligatures/full-width letters/superscripts into plain forms), fold accented letters to their plain ASCII base (`é` -> `e`), straighten smart quotes (`“ ” ‘ ’` -> `" '`), convert em dashes to a hyphen or an en dash (`—` -> `-` or `–`, your choice) - every other dash (en dash, hyphen, non-breaking hyphen, figure dash, horizontal bar, minus sign) is always preserved exactly as typed
  - **Symbols, scripts & invisible characters:** strip emoji & symbols, strip currency symbols (`€ £ ¥ ₹ ₩ ₽ ¢` …) - a separate toggle from the one above, so you can keep currency symbols while still stripping other symbols; the ASCII dollar sign `$` is always kept regardless - strip invisible & control characters (zero-width spaces, directional marks and isolates including the ones behind the "Trojan Source" bidi-spoofing technique, control characters, Unicode tag characters used to hide invisible payloads, deprecated variation selectors), allow Hebrew characters (off by default, since the base filter targets Latin/ASCII text)
  - **Whitespace cleanup:** remove tabs, remove extra spaces, remove line breaks, remove paragraph breaks

  A fix that's turned off leaves its characters exactly as typed; a character only gets removed once none of the applicable fixes can convert it.
- **Line numbers** on both text boxes, kept aligned even when lines wrap.
- **Import, copy, or export** - load any text file (plain text or source code) straight into the input, copy the output to the clipboard, or download it as a `.txt` file named after the output's first line.
- **Your fix preferences persist** across visits via `localStorage`.

## Usage

This is a static page - no server or build required. Either:

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

Requires Node.js (for linting and tests only - the page itself has no runtime dependencies).

```sh
npm install   # dev dependencies: eslint + test runner support
npm run lint  # ESLint
npm test      # unit tests (node:test) against the filtering logic in script.js
```

`script.js` runs as a plain browser script, but its pure text-processing functions (`processText`, `applyWhitespaceCleanup`, `buildRuns`, etc.) are also exposed via `module.exports` when loaded under Node, which is what `test/processText.test.js` exercises directly - no DOM or browser needed to run the test suite.

CI runs lint and tests on every push to `main` and on every pull request (see `.github/workflows/ci.yml`), plus a non-blocking `npm audit` check.

### Versioning and cache-busting

There's no build step here, so the version number is kept in sync by hand in three places - bump all three together on every release:

1. `version` in `package.json`
2. the `?v=` query string on both `styles.css` and `script.js` in `index.html`
3. the `v0.x.y` badge next to the title in `index.html`'s `<header>`

The `?v=` matters functionally, not just cosmetically: without it, browsers (especially since this page is often opened directly over `file://`) can keep serving an old cached copy of `styles.css`/`script.js`, e.g. making a checkbox toggle look like it silently stopped updating the output when it's actually just running stale JS. A plain hard refresh (Ctrl/Cmd+Shift+R) works around that for one visit, but the version bump is what prevents it for everyone else. The on-page badge exists so you can tell at a glance, without opening dev tools, whether the copy you're looking at is current - compare it against the latest entry below.

## Version history

Versioned per [Semantic Versioning](https://semver.org/) - `MAJOR.MINOR.PATCH`, tracked in `package.json`. A MAJOR bump means existing input can now produce different output, or a documented toggle/behavior was removed or renamed; MINOR adds functionality without changing what already worked; PATCH is a fix with no behavior change. The project is still pre-1.0 (`0.y.z`), and per semver's own rule for that phase, a MINOR release may still include a behavior change - those are called out explicitly below.

### 0.17.1
- **Refactor:** the copy/export/import-failure button feedback ("Copied!", "Exported!", "Import failed") shared the same set-label-then-revert logic three times over, with two different, undocumented timeout values (1200ms and 1500ms) split across them for no particular reason. Extracted into one `flashButtonLabel` helper backed by a single named constant - all three now revert after the same 1200ms.

### 0.17.0
- **Feature:** the sticky footer now shows the input/output character counts (before -> after) and a word count, alongside the existing removed/converted counts. The word count strips common Markdown syntax first (headings, emphasis, links, images, code spans/blocks, block quotes, lists, horizontal rules, table pipes) so formatting characters don't inflate it - it's not a full CommonMark parser, just the syntax people actually type by hand.
- **Feature:** a "Restore defaults" button in the "Fixes & explanation" drawer resets every fix toggle and the em dash target back to its default in one click, without needing to flip each one back by hand.

### 0.16.0
- **Behavior change (naming consistency):** "Keep currency symbols" is renamed to "Strip currency symbols" and its checkbox is inverted to match every other fix toggle's convention (checked = the action happens), instead of being the one toggle phrased the opposite way. The resulting filtering behavior for any given combination of settings is unchanged - only the checkbox's own default state flipped (from unchecked to checked) to match, since "checked" now means the opposite of what it used to.

### 0.15.0
- **Accessibility:** the focus indicator on the input/output boxes is now a visible ring around the whole box, not just a 1px border-color change - the previous version was too subtle to rely on for keyboard navigation.
- **Accessibility:** every button on the page now meets the 44x44px minimum touch-target size (previously as low as ~28px for the diff-nav buttons).
- **Accessibility:** the group toggle checkboxes in the Fixes panel now expose their "indeterminate" (mixed on/off) state to screen readers via `aria-checked="mixed"`, not just visually.
- **Fix (mobile):** the input/output boxes' font size is now 16px below 760px viewport width, instead of ~15px - under 16px, iOS Safari auto-zooms the whole page when a text box is focused.
- **Fix:** a failed file import (e.g. an unreadable file) now shows "Import failed" on the button briefly, instead of failing silently with no feedback at all.

### 0.14.0
- **Feature (UI rework):** the 12 fix toggles in the "Fixes & explanation" drawer are now organized into three groups - Typography & normalization, Symbols/scripts/invisible characters, and Whitespace cleanup - each with its own header checkbox that turns every fix in that group on or off at once, showing the standard "indeterminate" dash when the group is a mix of on/off. Purely a UI grouping layer - saved preferences, defaults, and every fix's own behavior are unchanged.

### 0.13.0
- **Feature:** Alt+Down / Alt+Up step through changed lines from anywhere on the page, same as the Previous/Next change buttons.
- **Feature:** clicking a changed line number directly in either gutter jumps straight to it, instead of only being reachable by stepping through Previous/Next.
- **Feature:** a sticky footer mirrors the removed/converted counts at the bottom of the viewport, so they stay visible while you're scrolled down toggling fixes far below the boxes themselves.
- **Feature:** a new "Keep currency symbols" toggle carves currency symbols (`€ £ ¥ ₹ ₩ ₽ ¢` …) out of "Strip emoji & symbols" so they can be preserved independently - off by default. The ASCII dollar sign (`$`) was always kept regardless and still is.
- **Accessibility:** the removed/converted counts and the diff-navigation position are now `aria-live` regions, so a screen reader announces them as they update.
- **Performance:** typing/pasting no longer re-runs the full filtering pipeline (including the wrapped-row measurements behind the gutter and diff navigation) on every single keystroke - it's now debounced by 80ms, flushed immediately by anything that needs current results right away (the nav buttons, leaving the input box).
- **Fix:** the highlight overlay and gutter could end up showing a different scroll position than the actual text after typing or pasting - they weren't resynced to the textarea's own scroll position after being rebuilt, only after an explicit scroll. Most visible with content taller than the box, right after a paste.

### 0.12.0
- **Feature:** "Previous change" / "Next change" buttons below the input/output boxes step through the changed lines one at a time - each click scrolls both boxes to center that line and marks it with a stronger highlight than the surrounding changed lines, so it's clear which one is current. Wraps around at either end; hidden entirely when there's nothing to navigate.

### 0.11.0
- **Feature (UI):** the row tint from a changed line now extends to its line number in the gutter (bolded, accent-colored), tying the two together so a changed line is unmistakable at a glance even without scanning the text itself.
- **Feature (UI):** increased the contrast of the diff highlighting across the board - the row tint, the removed/converted character marks, and the row's left-edge indicator bar are all noticeably more visible than before.

### 0.10.0
- **Feature (UI):** a line containing any removed/converted/invisible character now gets a subtle full-row background tint in the input and output boxes, in addition to the existing precise per-character marks - matching how GitHub and other diff tools highlight changed lines. Blank and wrapped lines are handled correctly: a blank changed line still gets a visible row, and a wrapped line's tint spans all of its wrapped visual rows.
- **Refactor:** `inputHighlightHtml` and `outputHighlightHtml` now share one internal line-building function instead of duplicating the same character-grouping logic twice.
- **Refactor:** the per-checkbox-fix wiring (element lookup, `readOpts`, `applySavedOpts`) is now table-driven from a single list of `[element id, options key, default value]` triples, instead of one hand-written variable/field per fix.
- **Cleanup:** removed two unused CSS rules left over from earlier UI iterations (`.stats b`, `details ul`) that no longer matched anything in the page.

### 0.9.0
- **Feature (UI rework):** removed/converted highlighting now shows directly inside the actual input and output boxes, instead of a separate "What changed?" panel with its own duplicate pair of read-only panes. Implemented as a transparent highlight layer positioned exactly behind each live textarea (character-for-character aligned with its raw text), so typing, clicking, and scrolling all keep working normally. The "What changed?" panel is now just the removed/converted counts and a legend.
- **Feature:** the "Convert em dashes" fix now lets you choose the conversion target - a hyphen (`-`, the previous/default behavior) or an en dash (`–`) - via a dropdown next to the toggle.
- **Security:** "Strip invisible & control characters" now also catches: the bidi *isolate* controls (U+2066-U+2069, the newer siblings of the embedding/override controls it already covered, and the ones behind the "Trojan Source" bidi-spoofing technique); Unicode Tag characters (U+E0000-U+E007F, the basis of "ASCII smuggling" - hiding invisible payloads, including prompt-injection text, inside normal-looking text); and the deprecated Variation Selectors Supplement (U+E0100-U+E01EF, no legitimate modern use and also seen used steganographically). The standard variation selectors (U+FE00-U+FE0F, used to select an emoji's presentation) are deliberately left alone.
- **Feature:** broadened the file import picker's filter to include source code and config files (`.py`, `.js`, `.java`, `.go`, `.yaml`, `.env`, ...) in addition to plain text - these were always readable (they're plain text under the hood), the picker just wasn't surfacing them by default.
- **Fix:** `escapeHtml` now also escapes quote characters, not just `&`/`<`/`>` - hardening for the attribute-value context (`title="..."`) introduced by the new invisible-character markers, even though nothing currently reachable through that path contains a quote.

### 0.8.1
- **Docs:** run the README's own prose through the same default fixes ClearTXT applies to pasted text, and fix what they flagged - mainly decorative em dashes and `→` arrows in the prose, converted to plain hyphens/`->`. Left untouched: characters that are the actual subject of a sentence (e.g. the `é` in "folds accented letters ... `é` -> `e`"), and all markdown structure (list indentation, code block contents, headers).

### 0.8.0
- **Feature:** each text box gets its own toolbar directly underneath it - Import/Clear under the input, Copy/Export under the output - instead of one shared row mixing input- and output-related actions together.
- **Feature:** the exported filename is now derived from the output's first line (sanitized and truncated to 50 characters), e.g. `cleartxt-My-Document-Title-20260812-105541.txt`, instead of always being `cleartxt-output-<timestamp>.txt`.
- **Fix (consistency):** the "Copy output" button no longer has a different (blue/"primary") style from the other three buttons for no particular reason - all four now look the same.

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
- **Feature:** four new whitespace-cleanup fixes - remove tabs, remove extra spaces (on by default), remove line breaks, remove paragraph breaks.
- **Behavior change:** the "convert dashes" fix now only touches the em dash (`—`); every other dash-like character is always preserved exactly as typed (previously several of them were converted or removed).
- **Fix:** the "What changed?" diff view groups consecutive same-type characters into one highlight instead of one per character, so highlighting stays on for much larger inputs instead of being disabled past a size limit.
- **Docs:** remove stylistic em dashes from the page's own UI copy.

### 0.2.0
- **Feature:** line numbers on both text boxes, kept aligned with wrapped/scrolled content.
- **Feature:** a "What changed?" panel with a removed/converted breakdown by category and a highlighted side-by-side diff.
- **Feature / behavior change:** the fixed character-whitelist filter becomes a configurable pipeline - six independent toggles (Unicode normalization, accent folding, smart quotes, dashes, emoji/symbols, invisible/control characters) plus an opt-in "Allow Hebrew characters" toggle. Several characters that used to be silently deleted (accents, curly quotes, dashes) are now converted instead of dropped by default. Preferences persist via `localStorage`.
- **Refactor:** split the single `index.html` file into `index.html` / `styles.css` / `script.js`.

### 0.1.0
- **Initial release:** a single-page text filter that strips input down to a printable-ASCII-plus-curated-dashes whitelist, after normalizing to Unicode NFKC (folding ligatures, full-width forms, superscripts, ...) and explicitly stripping zero-width/invisible characters. Copy/clear controls and an explanation of what's kept vs. removed.
