# Changelog

All notable changes to ClearTXT, versioned per [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`, tracked in `package.json`). A MAJOR bump means existing input can now produce different output, or a documented toggle/behavior was removed or renamed; MINOR adds functionality without changing what already worked; PATCH is a fix or docs change with no behavior change. Releases before 1.0.0 were pre-1.0 (`0.y.z`), and per semver's own rule for that phase, a MINOR release there could still include a behavior change - those are called out explicitly below.

### 1.9.1
- **Security fix:** an exported/downloaded/zipped file's own filename could carry a Unicode Format-category or bidi-control character straight through, unsanitized - most seriously a right-to-left override (U+202E), the classic "invoice[RLO]txt.exe" trick that visually disguises an executable's real extension as a harmless one (a documented real-world malware-delivery technique). Two separate gaps, both now closed:
  - **Single-file Export**: `slugForFilename` (which derives the downloaded filename from the cleaned output's first line) only stripped characters illegal in filenames (`/ \ : * ? " < > |` and C0 controls) - it didn't strip the same Unicode Format-category characters `isFormatChar`/"Strip invisible & control characters" already catches in the text itself. If that toggle was off and one of those characters landed in the output's first line, it would end up baked directly into the exported `.txt` file's actual name. Now stripped unconditionally, regardless of that toggle - a filename is a different context from the text in the boxes (a real OS-level name in Save dialogs and file listings), not scrollable text with room for a labeled marker, so this isn't governed by the "off leaves characters untouched" toggle model the rest of the app uses.
  - **Batch mode**: `safeEntryName` (used for the per-file Download button's filename and every entry's name inside "Download changed"'s `.zip`) sanitized a dropped-in file's own `name` against path traversal and control characters, but never against these Format-category characters either - meaning a file dropped in with such a character already in its name (trivial via drag-and-drop, which unlike a real OS file picker imposes no restrictions on `.name` at all) carried it straight through to both the downloaded file's name and this app's own file-list display. Now stripped the same way, and the batch file list's display name is derived from the same sanitized value used for actual downloads, so what you see in the list can never visually diverge from what you actually get.

### 1.9.0
- **Behavior change (batch mode):** "Download all" is now "Download changed" - the generated `.zip` now only includes files the current fixes actually changed, skipping any that were already clean. Renamed and re-tooltipped to make this explicit rather than a silent behavior change; disabled (like every other action button here) when there's nothing to download.
- **Feature (batch mode):** a new "Remove unchanged" button clears already-clean files out of the list in one click, leaving files still being read/processed and files that failed to read untouched - only removes an entry once it's been fully processed *and* found to have no changes. Disabled when there's nothing to remove.

### 1.8.0
- **Feature:** a new `docs/sitemap.xml` listing all four pages (index, batch, changelog, documentation), so search engines can discover and prioritize them without relying on crawling links alone.
- **Fix:** moved `robots.txt` from the repo root into `docs/` - GitHub Pages serves this site from `docs/` only, so a root-level `robots.txt` was never actually reachable at the live site's URL (it 404'd) despite being present in the repo. Also added a `Sitemap:` directive pointing at the new `sitemap.xml`.

### 1.7.0
- **Feature:** a proper social sharing card (`docs/social-card.png`, 1200x900, built from the header's own broom-sparkles icon) wired into `og:image`/`twitter:image` on every page, so links posted on social media, Slack, iMessage, etc. now show a real preview image instead of no image at all. `twitter:card` changed from `summary` to `summary_large_image` to match. Every page's `meta description`/`og:description`/`twitter:description` now also ends with "Made by Aviv M. Icel."

### 1.6.0
- **Docs:** a new [documentation.html](docs/documentation.html) page, linked from every page's footer, explaining what ClearTXT actively defends against and how: hidden/invisible characters (zero-width characters, "Trojan Source" bidirectional overrides, Unicode Tag/variation-selector smuggling, plain control characters), look-alike (homoglyph) mixed-script characters, and script confusion (Hebrew/Arabic/Cyrillic) - each section names the toggle that governs it. Also includes a "what this page doesn't cover" section stating plainly that ClearTXT cleans characters, not meaning, and isn't a comprehensive security scanner. Written for a general reader, not a repeat of CHANGELOG.md's changelog-style technical detail - describes the current, steady-state behavior of each protection rather than the history of how it was added.

### 1.5.0
- **Security feature:** a new "Strip look-alike characters" toggle, on by default, detecting the classic homoglyph/confusable-character spoofing technique used to disguise a fake domain or brand name as the real one - e.g. `gοοgle.com` with Greek omicrons standing in for the Latin `o`s, or `pаypal.com` with a Cyrillic `а` standing in for the Latin `a`. Rather than maintaining a hand-curated table of which specific characters "look like" which Latin letters (Unicode's own confusables data runs to thousands of entries, disproportionate for this app and a maintenance burden that would only ever be partially complete), this works the way browsers already defend against IDN homograph attacks: it tokenizes text into "words" (runs of letters/marks/digits) and flags any word that mixes a Latin letter with a letter from any other script - the character(s) from the minority script are what get removed (or highlighted, kept, if the toggle is off), not the whole word. A word written entirely in another script (an actual Greek or Russian sentence) is left alone; only script-mixing *within* a single word is flagged, since a legitimate word in one language never does that. This check runs ahead of the script-specific toggles ("Strip Hebrew/Arabic/Cyrillic characters"), so turning one of those off to preserve genuine text in that script doesn't also let a character from that same script slip through when it's hiding inside an otherwise-Latin spoofed word - the two are independent. Invisible/format characters (already handled by "Strip invisible & control characters") are treated as transparent during word-tokenization specifically so a zero-width character deliberately inserted between the two halves of a spoofed word can't be used to dodge detection by splitting it into two "words." Lives in the "Symbols & invisible characters" group, after "Strip invisible & control characters." Trade-off worth calling out: because this flags *any* non-Latin script mixed mid-word regardless of whether it's visually confusable, it can also catch legitimate but rare cases like scientific notation mixing a Greek letter into an equation with no separating space (e.g. `2πr`) - turn the toggle off if that's a problem for your text.

### 1.4.0
- **Feature:** a new "Strip Arabic characters" toggle, on by default, removing Arabic letters, diacritics and Arabic-Indic digits - across the main Arabic block plus the Supplement/Extended-A/Extended-B blocks (covering Persian, Urdu and other Arabic-script languages) and the Presentation Forms-A/B blocks (contextual/ligature glyph variants) - the same way "Strip Hebrew characters" and "Strip Cyrillic characters" already handle their scripts. Previously Arabic had no dedicated handling - it fell through to the generic "Strip emoji & symbols" toggle, so turning that off to preserve some other symbol also happened to preserve Arabic text as a side effect. It's checked independently now, matching Hebrew/Cyrillic, so that specific non-default combination (fixes left at their defaults except "Strip emoji & symbols" turned off) now strips Arabic text where it previously didn't - turn off the new toggle too to get that back. Lives in the "Languages & scripts" group, between Hebrew and Cyrillic.
- Added [Noto Sans Arabic](https://fonts.google.com/noto/specimen/Noto+Sans+Arabic) to the Google Fonts request and both font stacks (`--font-sans`/`--font-mono`), same pattern as Noto Sans Hebrew, so Arabic text renders in a proper Arabic-script typeface rather than a fallback/tofu when kept (toggle off, or elsewhere in the pipeline).

### 1.3.2
- **Security fix:** "Strip invisible & control characters" recognized invisible characters via a hand-maintained list, which a systematic scan against Unicode's own "Format" (Cf) general category showed was missing 53 codepoints - including two that fell all the way through to the generic "Strip emoji & symbols" toggle instead of the invisible-character one: the **soft hyphen** (U+00AD, invisible in most rendering, common in text copied from word processors/PDFs) and the **Arabic letter mark** (U+061C, the same bidi-direction-hinting family as the left/right-to-left marks already handled, just easy to overlook since it doesn't look like its siblings). That miscategorization meant turning off "Strip emoji & symbols" specifically (e.g. to preserve some other legitimate symbol) silently let both survive - the Arabic letter mark being the more serious miss, since it's a bidi-trickery character in the same "Trojan Source" family already defended against for its siblings. Also now catches deprecated format controls (U+206A-U+206F) and interlinear annotation marks (U+FFF9-U+FFFB, a second, less-known "attach hidden text to visible text" channel similar in spirit to the variation-selector smuggling channel already covered). Replaced the hand-maintained list with a direct test against the Cf category itself, so this is complete today and stays complete as Unicode adds more such characters in the future, with no maintenance needed here. The soft hyphen is common enough that this does change default-configuration output for text that contains one (previously passed through untouched, now stripped like any other invisible character) - everything else here only affects the same narrow non-default-toggle-combination class of case the Hebrew/Cyrillic normalization fixes in 1.2.1 did.

### 1.3.1
- **Docs:** the public [changelog.html](docs/changelog.html) page was missing an entry for 1.3.0 itself (the page that added it) - added.
- **Reorg:** moved the deployed site (`index.html`, `batch.html`, `changelog.html`, every `.css`/`.js` file, `favicon.svg`) into a new `docs/` folder, separating it from project housekeeping (README, this file, `package.json`, `test/`, CI config) that stays at the repo root. `docs/` isn't documentation here - it's one of only two folder names GitHub Pages' "Deploy from a branch" source can publish directly (the other being the repo root itself), so the move needed no new build step or deploy workflow, just flipping the Pages source folder setting from "/ (root)" to "/docs" once. Updated every path reference accordingly: `eslint.config.js`'s per-file rules, `test/processText.test.js`'s `require()`, and this project's own docs.

### 1.3.0
- **Feature:** a new [changelog.html](docs/changelog.html) page - a condensed, user-facing "what's new," grouped by release, distinct from this file's full technical detail (which it links out to). Linked from every page's footer.
- **Feature:** a "Share" button in every page's footer that copies the current page's URL to the clipboard, next to the existing "Made by ..." credit line.
- **Cleanup:** removed `.claude/skills/ui-ux-pro-max/` (a Claude Code skill's own data files - CSVs, Python scripts, reference docs) from version control - it was never part of this project's own source, just accidentally committed alongside it. Added `.claude/` to `.gitignore` to keep it from happening again.
- **Docs:** fixed a stray raw `<code>` HTML tag and an unintended italic in the 1.2.1 entry below, which should have used this file's usual backtick/plain-text style throughout.

### 1.2.1
- **Fix:** the "Letterlike Symbols" mathematical alef/bet/gimel/dalet (`ℵ ℶ ℷ ℸ` - used e.g. for aleph-null, ℵ₀, in set theory) are NFKC-compatibility equivalents of the actual Hebrew letters they're shaped after, so "Normalize Unicode" was silently turning ℵ into Hebrew א before the pipeline ever saw it - and with "Strip Hebrew characters" also at its default (on), that ℵ then vanished entirely with no trace. Worse, turning "Strip Hebrew characters" off to try to prevent that instead preserved it disguised as an actual Hebrew letter, not as itself. These four are now protected from that specific normalization, so they're governed by "Strip emoji & symbols" like any other math symbol - never silently miscategorized as Hebrew. Found during a deep-search audit of the pipeline (also checked Cyrillic and its own normalization edge cases; those already resolve correctly and needed no change).
- **Docs:** trimmed every Fixes panel explanation, on both pages - cut repeated boilerplate (each row no longer restates "...instead of deleting them," since the panel's own intro paragraph already says any fix that's off leaves its characters alone) and tightened redundant phrasing throughout, without dropping the examples or the behavior notes that actually matter.

### 1.2.0
- **Feature:** a new "Strip Cyrillic characters" toggle, on by default, removing Cyrillic letters and combining marks (Russian, Ukrainian, Bulgarian, Serbian, ... plus a few historic/minority-language extended blocks) the same way "Strip Hebrew characters" already handles Hebrew. Previously Cyrillic had no dedicated handling - it fell through to the generic "Strip emoji & symbols" toggle, so turning that off to preserve some other symbol also happened to preserve Cyrillic text as a side effect. It's checked independently now, matching how Hebrew already works, so that specific non-default combination (fixes left at their defaults except "Strip emoji & symbols" turned off) now strips Cyrillic text where it previously didn't - turn off the new toggle too to get that back.
- **Feature (UI rework):** "Fold accented letters," "Strip Hebrew characters," and the new Cyrillic toggle now live in their own "Languages & scripts" group, instead of accent-folding sitting under "Typography & normalization" and Hebrew sitting under the symbols group. The symbols group is renamed "Symbols & invisible characters" now that no script-specific toggle lives there. Purely a grouping/toggle-organization change - every fix's own behavior, and the default value of every existing toggle, is unchanged.

### 1.1.4
- **Fix:** a code review of the 1.1.3 "Downloaded!" feedback found three bugs in the flash-label pattern:
  - Clicking the same Download button twice within the 1200ms feedback window could leave it permanently stuck showing "Downloaded!" - the second click's timer captured the first click's flash text as its own "original" to revert to, then overwrote the first timer's correct revert when it fired later. Fixed by tracking the button's true original label (and its pending timer) on the element itself, so a second click resets the timer instead of stacking a conflicting one.
  - The same pattern was duplicated verbatim between `script.js` and `batch.js` instead of shared - consolidated into one implementation, exported on `ClearTXT` and used by both pages.
  - Batch mode's `render()` rebuilt every row's DOM from scratch on every call, silently cutting a "Downloaded!" flash short if a different file finished loading (or a fix got toggled) while it was still showing. Fixed by only replacing a row's DOM when that row's own underlying data actually changed, leaving unrelated rows' live state (including an in-flight flash) untouched.
  - Fixing the first two surfaced a real regression along the way: the consolidated `flashButtonLabel`'s `BUTTON_FEEDBACK_MS` assignment was placed after `script.js`'s single-file-page-only early return, so on batch.html it silently stayed `undefined` forever - `setTimeout` with an `undefined` delay fires almost immediately (defaults to 0ms), so every batch-mode flash was reverting within milliseconds instead of holding for 1.2s. Moved the assignment before that early return so it always runs.

### 1.1.3
- **Fix (accessibility, batch mode):** the per-row Download/Remove buttons had shrunk to 36px, below the 44x44px minimum touch-target size every other button on the page has kept since 0.15.0 - restored.
- **Fix (batch mode):** the per-file and "Download all" buttons now flash "Downloaded!" briefly after a click, the same transient-feedback pattern the single-file page's Copy/Export buttons already use - previously a click gave no acknowledgement at all.

### 1.1.2
- **Security (batch mode):** a dropped file's name was written straight into the generated `.zip`'s entry name and into the single-file `download` attribute, with no path sanitization. A real OS file picker can't produce a name containing `/` or `..`, but a `File` object handed to the page via drag-and-drop has no such restriction (e.g. one built by another page's script), so a maliciously-named "file" (`../../../../etc/whatever`) could zip-slip its way outside the intended folder when a less-careful unzip tool extracts the downloaded archive. Fixed by reducing a file's name to a plain, control-character-free basename wherever it's used as an actual path component; the raw name is still shown as-is in the file list (already safely HTML-escaped there). The same sanitizer also caps the name at 255 characters - the ZIP format's "file name length" field is 16-bit (max 65535 bytes) and silently wraps rather than erroring on overflow, so an (equally synthetic) ~70,000-character name could otherwise write a length that doesn't match the name bytes actually present, corrupting the archive.

### 1.1.1
- **Fix (batch mode):** "Download all" now bundles every cleaned file into a single `.zip` and triggers one Save dialog, instead of one browser download per file (which the browser could treat as suspicious and block past a handful of files). Implemented as a small hand-written, uncompressed ZIP writer - no library added, keeping the app dependency-free. Individual per-file "Download" buttons are unchanged.

### 1.1.0
- **Feature:** a new batch mode ([batch.html](docs/batch.html)) cleans multiple files at once - drag files in or pick them, each is filtered live with the same fixes as the single-file page and downloaded under its original filename (individually or all at once). Fix preferences are shared with the single-file page via the same `localStorage` key.
- **Refactor:** the "Fixes & explanation" panel's toggle/group/localStorage wiring, previously inline in `script.js`, is now a shared `createFixOptionsController` factory (also exported on `ClearTXT`) so both pages drive their own copy of the same panel without duplicating that logic. `script.js` now also no-ops the single-file page's own wiring when loaded on a page without its input/output boxes (i.e. batch.html), so it's safe to load there for the shared pure functions and the controller alone.

### 1.0.2
- **Docs:** significantly trimmed README.md, which had grown past 200 lines after many rounds of feature work. Moved the full version history here to CHANGELOG.md, and condensed the README's Features/Fonts/Versioning sections down to concise, user-facing summaries.

### 1.0.1
- **Fix:** on a large paste, the gutter's line numbers could drift out of alignment with their actual rows, worse the further down the document - two compounding bugs. First, the hidden element used to measure how many rows a wrapped line takes never had its own `line-height` set, so it silently inherited the page's default (1.5) instead of the textarea's own (1.55), undercounting wrapped rows by that ~3% margin - individual lines still mostly rounded to the right answer, but the error accumulated enough over many wrapped lines to eventually cross a rounding boundary. Second, that same measurement read the textarea's available width *before* the gutter's own width had settled to fit its new (often wider, e.g. 4-digit) line numbers, so a large paste in one shot could measure against a stale, pre-update width. Both are now fixed: the measurement's `line-height` matches the textarea's exactly, and the gutter is given a first pass at its final width before anything is measured against it.
- **Feature:** the favicon and header logo are now Lucide's "broom-sparkles" instead of the "Clear" button's trash-can icon - a better fit for the app's own identity (sweeping away the mess) than for a specific button action.

### 1.0.0
- **Milestone:** version bumped to 1.0.0 to mark the project going public, now that it's hosted at [icelsupreme.github.io/ClearTXT](https://icelsupreme.github.io/ClearTXT/). No behavior change - see "Versioning and cache-busting" in the README for what 1.0.0 means for future releases.
- **Feature:** a proper page title (`ClearTXT - Clean, Safe Text Filter`), a meta description, and Open Graph/Twitter Card tags, so links to the page show a real title and description when shared on social media instead of the browser's generic fallback.
- **Feature:** a favicon (the same trash-can icon as the "Clear" button, on a dark rounded-square badge) for the browser tab, and the same icon inline next to "ClearTXT" in the page header.

### 0.19.0
- **Feature (UI polish):** every button now has a matching [Lucide](https://lucide.dev) icon (import/clear/copy/export/previous/next/restore defaults), embedded as inline SVG - no icon font or added dependency. Buttons also get a subtle shadow, a real hover state (background tint, not just a border-color change), and a small press-down effect on click; the input/output boxes and the collapsible panels get a subtle drop shadow too, for a bit more depth against the flat background.
- **Fix:** the transient button labels ("Copied!", "Exported!", "Import failed") now only replace the button's text, not its icon - they used to overwrite the whole button's content via `textContent`, which would have silently deleted the new icons the first time any of those fired.

### 0.18.0
- **Feature (fonts):** the page now loads Noto Sans, Noto Sans Mono, and Noto Sans Hebrew from Google Fonts, instead of each OS/browser's own default font stack - previously nothing was explicitly set for most controls (buttons, the em dash `<select>`, the version badge), so they rendered in whatever the browser's own UI font happened to be, on top of the input/output boxes' monospace stack already varying between platforms. See the README's "Fonts" section for the self-hosting alternative if you'd rather avoid the external request.
- **Fix:** the inline `<code>` examples throughout the Fixes panel (`é`, `± × ÷`, `א–ת`, ...) rendered in the browser's default monospace font, not the same one used by the input/output boxes - now consistent.

### 0.17.3
- **Behavior change (naming consistency):** "Allow Hebrew characters" is renamed to "Strip Hebrew characters" and its checkbox is inverted, for the same reason "Keep currency symbols" was renamed in 0.16.0 - every other fix toggle uses "checked = the action happens," and this was the other one phrased the opposite way. The resulting filtering behavior for any given combination of settings is unchanged - only the checkbox's own default state flipped (from unchecked to checked) to match.

### 0.17.2
- **Docs:** added an MIT `LICENSE` file, plus `license`/`author` fields in `package.json`. Added License and Author sections to the README, and a small "Made by ..." credit line (linking to GitHub and Bluesky) at the bottom of the page itself.

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
