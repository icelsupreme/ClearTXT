"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ClearTXT = require("../docs/script.js");

// Mirrors the checkbox defaults in index.html.
const DEFAULT_OPTS = {
  normalize: true,
  foldAccents: true,
  straightenQuotes: true,
  convertDashes: true,
  dashTarget: "-",
  stripEmoji: true,
  stripCurrency: true,
  stripInvisible: true,
  stripHebrew: true,
  stripArabic: true,
  stripCyrillic: true,
  removeLineBreaks: false,
  removeParagraphBreaks: false,
  removeExtraSpaces: true,
  removeTabs: false
};

function opts(overrides) {
  return Object.assign({}, DEFAULT_OPTS, overrides || {});
}

function run(text, overrides) {
  return ClearTXT.processText(text, opts(overrides)).output;
}

test("plain ASCII passes through unchanged", () => {
  assert.equal(run("Hello, World! 123 + - * / = < > %"), "Hello, World! 123 + - * / = < > %");
});

test("NFKC normalization folds ligatures and full-width letters", () => {
  assert.equal(run("ﬁle", { removeExtraSpaces: false }), "file");
  assert.equal(run("ＡＢＣ"), "ABC");
});

test("NFKC normalization can be turned off", () => {
  // "ﬁ" (the "fi" ligature) has no plain-ASCII base once accent
  // folding also can't decompose it, so with normalize off it's dropped
  // by emoji/symbol stripping instead of being expanded to "fi".
  assert.equal(run("ﬁle", { normalize: false }), "le");
});

test("accented letters fold to their plain ASCII base", () => {
  assert.equal(run("café résumé naïve"), "cafe resume naive");
});

test("accented letters are removed (not folded) when folding is off and emoji stripping is on", () => {
  assert.equal(run("café", { foldAccents: false }), "caf");
});

test("accented letters are kept as-is when folding and emoji stripping are both off", () => {
  assert.equal(run("café", { foldAccents: false, stripEmoji: false }), "café");
});

test("smart quotes straighten to plain ASCII quotes", () => {
  assert.equal(run("“Hello” and ‘world’"), '"Hello" and \'world\'');
});

test("smart quotes are removed when straightening is off and emoji stripping is on", () => {
  assert.equal(run("“Hi”", { straightenQuotes: false }), "Hi");
});

test("only the em dash converts to a hyphen", () => {
  assert.equal(run("em—dash"), "em-dash");
});

test("en dash, hyphen variants and minus sign are always preserved, regardless of the toggle", () => {
  // Note: the non-breaking hyphen (U+2011) has a "noBreak" compatibility
  // decomposition to the plain hyphen (U+2010) under NFKC, so it folds
  // during normalization itself — independent of, and before, the dash
  // toggle ever runs. With normalization off, it survives untouched.
  const text = "en–dash hy‐phen nb‑hyphen fig‒dash bar―bar minus−sign";
  const normalized = "en–dash hy‐phen nb‐hyphen fig‒dash bar―bar minus−sign";
  assert.equal(run(text), normalized);
  assert.equal(run(text, { convertDashes: false }), normalized);
  assert.equal(run(text, { normalize: false }), text);
});

test("em dash is removed (not converted) when the toggle is off and emoji stripping is on", () => {
  assert.equal(run("em—dash", { convertDashes: false }), "emdash");
});

test("em dash converts to an en dash when dashTarget is set to en dash", () => {
  assert.equal(run("em—dash", { dashTarget: "–" }), "em–dash");
});

test("an invalid dashTarget falls back to a hyphen", () => {
  assert.equal(run("em—dash", { dashTarget: "not-a-real-option" }), "em-dash");
  assert.equal(run("em—dash", { dashTarget: undefined }), "em-dash");
});

test("Hebrew is stripped by default and preserved when \"strip Hebrew characters\" is off", () => {
  // The word is removed and the two spaces that used to sandwich it
  // become adjacent, so the default-on "remove extra spaces" collapses
  // them to one.
  assert.equal(run("hello שלום world"), "hello world");
  assert.equal(run("hello שלום world", { removeExtraSpaces: false }), "hello  world");
  assert.equal(run("hello שלום world", { stripHebrew: false }), "hello שלום world");
});

test("the Letterlike Symbols math alef/bet/gimel/dalet (e.g. aleph-null, ℵ₀) are never silently folded into actual Hebrew letters by NFKC normalization, regardless of the Hebrew/emoji toggles", () => {
  // Before the fix: normalize turned ℵ into Hebrew א before the pipeline
  // ever saw it, so with stripHebrew on (default) it vanished with no
  // trace, and with stripHebrew off it survived disguised as an actual
  // Hebrew letter instead of itself.
  assert.equal(run("ℵ"), ""); // still removed by default, but as a generic symbol now
  assert.equal(run("ℵ", { stripEmoji: false }), "ℵ"); // governed by the symbol toggle, not Hebrew
  assert.equal(run("ℵ", { stripHebrew: false }), ""); // NOT preserved disguised as א
  assert.equal(ClearTXT.processText("ℵ", opts()).changes[0].category, "symbol");
});

test("Arabic is stripped by default and preserved when \"strip Arabic characters\" is off", () => {
  assert.equal(run("hello مرحبا world"), "hello world");
  assert.equal(run("hello مرحبا world", { removeExtraSpaces: false }), "hello  world");
  assert.equal(run("hello مرحبا world", { stripArabic: false }), "hello مرحبا world");
});

test("Arabic stripping is independent of \"strip emoji & symbols\", governed only by its own toggle", () => {
  assert.equal(run("مرحبا", { stripEmoji: false }), "");
  assert.equal(run("مرحبا", { stripEmoji: false, stripArabic: false }), "مرحبا");
});

test("Cyrillic is stripped by default and preserved when \"strip Cyrillic characters\" is off", () => {
  assert.equal(run("hello привет world"), "hello world");
  assert.equal(run("hello привет world", { removeExtraSpaces: false }), "hello  world");
  assert.equal(run("hello привет world", { stripCyrillic: false }), "hello привет world");
});

test("Cyrillic stripping is independent of \"strip emoji & symbols\" - previously Cyrillic only fell through the generic symbol strip", () => {
  assert.equal(run("привет", { stripEmoji: false }), "");
  assert.equal(run("привет", { stripEmoji: false, stripCyrillic: false }), "привет");
});

test("emoji and symbols are stripped by default and kept when the toggle is off", () => {
  assert.equal(run("a😀b ±"), "ab ");
  assert.equal(run("a😀b ±", { stripEmoji: false }), "a😀b ±");
});

test("currency symbols are stripped along with other symbols by default, kept when \"strip currency symbols\" is off, and the ASCII dollar sign is always kept regardless", () => {
  assert.equal(run("a€£¥b"), "ab");
  assert.equal(run("a€£¥b", { stripCurrency: false }), "a€£¥b");
  // Turning off general symbol-stripping keeps currency too, even with stripCurrency still on -
  // both toggles have to agree to strip it.
  assert.equal(run("a€b", { stripEmoji: false, stripCurrency: true }), "a€b");
  assert.equal(run("a$b"), "a$b");
});

test("zero-width characters are stripped by default and kept when the toggle is off", () => {
  assert.equal(run("a​b"), "ab");
  assert.equal(run("a​b", { stripInvisible: false }), "a​b");
});

test("bidi isolate controls (Trojan Source vector) are stripped by default and kept when the toggle is off", () => {
  const isolates = String.fromCodePoint(0x2066, 0x2067, 0x2068, 0x2069);
  assert.equal(run("a" + isolates + "b"), "ab");
  assert.equal(run("a" + isolates + "b", { stripInvisible: false }), "a" + isolates + "b");
});

test("Unicode tag characters (ASCII-smuggling vector) are stripped by default and kept when the toggle is off", () => {
  const tag = String.fromCodePoint(0xe0068, 0xe0069); // TAG h, TAG i
  assert.equal(run("a" + tag + "b"), "ab");
  assert.equal(run("a" + tag + "b", { stripInvisible: false }), "a" + tag + "b");
});

test("soft hyphen and Arabic letter mark are categorized as invisible (governed by \"strip invisible\"), not as a generic symbol - a codepoint-based Unicode Format (Cf) category scan found both previously fell through to the generic symbol strip instead", () => {
  assert.equal(run("hyphen­ated"), "hyphenated");
  assert.equal(run("hyphen­ated", { stripInvisible: false }), "hyphen­ated");
  // Previously governed by stripEmoji instead of stripInvisible - would
  // have survived here before the fix, unlike its LRM/RLM sibling marks.
  assert.equal(run("hyphen­ated", { stripEmoji: false }), "hyphenated");

  assert.equal(run("a؜b"), "ab");
  assert.equal(run("a؜b", { stripInvisible: false }), "a؜b");
  assert.equal(run("a؜b", { stripEmoji: false }), "ab");
});

test("isFormatChar matches Unicode's Format (Cf) general category plus the line/paragraph separators, and nothing else", () => {
  assert.equal(ClearTXT.isFormatChar(0x00AD), true); // soft hyphen
  assert.equal(ClearTXT.isFormatChar(0x061C), true); // Arabic letter mark
  assert.equal(ClearTXT.isFormatChar(0x2028), true); // line separator (Zl, not Cf, included explicitly)
  assert.equal(ClearTXT.isFormatChar(0x200B), true); // zero-width space
  assert.equal(ClearTXT.isFormatChar(0x0041), false); // A
  assert.equal(ClearTXT.isFormatChar(0x1F600), false); // 😀
});

test("deprecated variation selector supplement is stripped by default and kept when the toggle is off", () => {
  const vs = String.fromCodePoint(0xe0100);
  assert.equal(run("a" + vs + "b"), "ab");
  assert.equal(run("a" + vs + "b", { stripInvisible: false }), "a" + vs + "b");
});

test("standard variation selectors (legitimate emoji presentation) are unaffected by the invisible-character ranges", () => {
  assert.equal(ClearTXT.isHiddenPayloadRange(0xfe0f), false); // VS16, emoji presentation selector
});

test("remove tabs converts each tab to a single space", () => {
  assert.equal(run("a\tb\t\tc", { removeTabs: true, removeExtraSpaces: false }), "a b  c");
});

test("tabs are left alone by default", () => {
  assert.equal(run("a\tb"), "a\tb");
});

test("remove extra spaces collapses runs of spaces (on by default)", () => {
  assert.equal(run("a    b   c"), "a b c");
});

test("extra spaces are left alone when the toggle is off", () => {
  assert.equal(run("a    b", { removeExtraSpaces: false }), "a    b");
});

test("remove line breaks joins a single wrapped line into a space, leaving paragraph breaks alone", () => {
  assert.equal(run("foo\nbar\n\nbaz", { removeLineBreaks: true }), "foo bar\n\nbaz");
});

test("remove paragraph breaks collapses a blank line into a space, leaving single line breaks alone", () => {
  assert.equal(run("foo\nbar\n\nbaz", { removeParagraphBreaks: true }), "foo\nbar baz");
});

test("line breaks and paragraph breaks off by default", () => {
  assert.equal(run("foo\nbar\n\nbaz"), "foo\nbar\n\nbaz");
});

test("all whitespace fixes combine correctly on a multi-paragraph document", () => {
  const doc = "Title\n\nThis is   a wrapped\nline with a\ttab and\n\nAnother paragraph   here.";
  const out = run(doc, {
    removeLineBreaks: true,
    removeParagraphBreaks: true,
    removeExtraSpaces: true,
    removeTabs: true
  });
  assert.equal(out, "Title This is a wrapped line with a tab and Another paragraph here.");
});

test("extra-space collapsing accounts for spaces newly exposed by a removed character", () => {
  // The emoji sits between two real spaces; once it's stripped, those two
  // spaces become adjacent in the actual output and should collapse.
  assert.equal(run("hello 😀 world"), "hello world");
});

test("inputHighlightHtml wraps a single line in a <div class=\"line\">, tagged line-changed since it contains a change", () => {
  const raw = "ab😀😀cd";
  const { changes } = ClearTXT.processText(raw, opts());
  assert.equal(
    ClearTXT.inputHighlightHtml(raw, changes),
    '<div class="line line-changed">ab<span class="rm">😀😀</span>cd</div>'
  );
});

test("inputHighlightHtml only tags the lines that actually contain a change (GitHub-diff-style row highlighting)", () => {
  const raw = "clean line\ncafé line\nanother clean line";
  const { changes } = ClearTXT.processText(raw, opts());
  assert.equal(
    ClearTXT.inputHighlightHtml(raw, changes),
    '<div class="line">clean line</div>' +
    '<div class="line line-changed">caf<span class="cv">é</span> line</div>' +
    '<div class="line">another clean line</div>'
  );
});

test("inputHighlightHtml gives a blank line its own (empty) line div instead of collapsing it away", () => {
  const raw = "a\n\nb";
  const { changes } = ClearTXT.processText(raw, opts());
  assert.equal(
    ClearTXT.inputHighlightHtml(raw, changes),
    '<div class="line">a</div><div class="line"></div><div class="line">b</div>'
  );
});

test("inputLineChanged flags exactly the lines that contain a change, matching inputHighlightHtml's line-changed tags", () => {
  const raw = "clean line\ncafé line\nanother clean line";
  const { changes } = ClearTXT.processText(raw, opts());
  assert.deepEqual(ClearTXT.inputLineChanged(raw, changes), [false, true, false]);
});

test("inputLineChanged flags a blank changed-adjacent line correctly and returns null on normalization length mismatch", () => {
  const raw = "a\n\nb";
  const { changes } = ClearTXT.processText(raw, opts());
  assert.deepEqual(ClearTXT.inputLineChanged(raw, changes), [false, false, false]);

  const ligature = "ﬁle";
  const { changes: ligChanges } = ClearTXT.processText(ligature, opts());
  assert.equal(ClearTXT.inputLineChanged(ligature, ligChanges), null);
});

test("outputLineChanged flags lines in the OUTPUT text, which can differ from the input's line-changed flags", () => {
  const { changes } = ClearTXT.processText("café line\nclean line", opts());
  assert.deepEqual(ClearTXT.outputLineChanged(changes), [true, false]);
});

test("changedLineNumbers extracts the indices of true flags, in order, and returns [] for null", () => {
  assert.deepEqual(ClearTXT.changedLineNumbers([false, true, false, true, true]), [1, 3, 4]);
  assert.deepEqual(ClearTXT.changedLineNumbers([false, false]), []);
  assert.deepEqual(ClearTXT.changedLineNumbers(null), []);
});

test("summarizeChanges and formatCatCounts report accurate per-category totals", () => {
  const { changes } = ClearTXT.processText("café “world” 😀", opts());
  const sums = ClearTXT.summarizeChanges(changes);
  assert.equal(ClearTXT.formatCatCounts(sums.converted), "1 accents, 2 quotes");
  assert.equal(ClearTXT.formatCatCounts(sums.removed), "1 emoji/symbols");
});

test("formatCatCounts labels the currency category distinctly from generic emoji/symbols", () => {
  const { changes } = ClearTXT.processText("a€b", opts());
  const sums = ClearTXT.summarizeChanges(changes);
  assert.equal(ClearTXT.formatCatCounts(sums.removed), "1 currency symbols");
});

test("isHebrew recognizes the Hebrew block and presentation forms, and nothing else", () => {
  assert.equal(ClearTXT.isHebrew(0x05d0), true); // א
  assert.equal(ClearTXT.isHebrew(0xfb1d), true);
  assert.equal(ClearTXT.isHebrew(0x0041), false); // A
});

test("isArabic recognizes the main Arabic block, supplement/extended blocks, and presentation forms, and nothing else", () => {
  assert.equal(ClearTXT.isArabic(0x0627), true); // ا
  assert.equal(ClearTXT.isArabic(0x0750), true); // Arabic Supplement
  assert.equal(ClearTXT.isArabic(0x0870), true); // Arabic Extended-B
  assert.equal(ClearTXT.isArabic(0x08A0), true); // Arabic Extended-A
  assert.equal(ClearTXT.isArabic(0xFB50), true); // Arabic Presentation Forms-A
  assert.equal(ClearTXT.isArabic(0xFE70), true); // Arabic Presentation Forms-B
  assert.equal(ClearTXT.isArabic(0x0041), false); // A
  assert.equal(ClearTXT.isArabic(0x05d0), false); // Hebrew א
  // U+FEFF is numerically inside the Presentation Forms-B range, but
  // processText's per-character loop classifies it as the BOM (invisible)
  // before this check ever runs - isArabic in isolation still reports it
  // as part of the range it's numerically in, since resolving that
  // overlap is processText's job, not this range check's.
  assert.equal(ClearTXT.isArabic(0xFEFF), true);
});

test("isCyrillic recognizes the main Cyrillic block, supplement, and extended blocks, and nothing else", () => {
  assert.equal(ClearTXT.isCyrillic(0x043f), true); // п
  assert.equal(ClearTXT.isCyrillic(0x0500), true); // Cyrillic Supplement
  assert.equal(ClearTXT.isCyrillic(0x2de0), true); // Cyrillic Extended-A
  assert.equal(ClearTXT.isCyrillic(0xa640), true); // Cyrillic Extended-B
  assert.equal(ClearTXT.isCyrillic(0x1c80), true); // Cyrillic Extended-C
  assert.equal(ClearTXT.isCyrillic(0x0041), false); // A
  assert.equal(ClearTXT.isCyrillic(0x05d0), false); // Hebrew א
});

test("foldAccent returns null for characters with no plain-ASCII base", () => {
  assert.equal(ClearTXT.foldAccent("é"), "e"); // é
  assert.equal(ClearTXT.foldAccent("😀"), null); // emoji
  assert.equal(ClearTXT.foldAccent("中"), null); // CJK
});

test("invisibleInfo labels named zero-width characters and C0 controls distinctly", () => {
  assert.equal(ClearTXT.invisibleInfo(0x200b).label, "ZWSP");
  assert.ok(ClearTXT.invisibleInfo(0x200b).name.includes("zero-width space"));
  assert.equal(ClearTXT.invisibleInfo(0xfeff).label, "BOM");
  assert.equal(ClearTXT.invisibleInfo(0x0007).label, "␇"); // control picture for BEL
  assert.ok(ClearTXT.invisibleInfo(0x0007).name.includes("BEL"));
  assert.equal(ClearTXT.invisibleInfo(0x007f).label, "␡"); // DEL picture
  assert.equal(ClearTXT.invisibleInfo(0x1234).label, "U+1234"); // unmapped fallback
});

test("inputHighlightHtml never merges an invisible character into a surrounding run, and renders it with its actual (invisible) character for width alignment", () => {
  const raw = "a​b";
  const kept = ClearTXT.processText(raw, opts({ stripInvisible: false }));
  assert.equal(
    ClearTXT.inputHighlightHtml(raw, kept.changes),
    '<div class="line line-changed">a<span class="iv" title="zero-width space (U+200B) (kept)">​</span>b</div>'
  );

  const removed = ClearTXT.processText(raw, opts({ stripInvisible: true }));
  assert.equal(
    ClearTXT.inputHighlightHtml(raw, removed.changes),
    '<div class="line line-changed">a<span class="iv rm" title="zero-width space (U+200B) (removed)">​</span>b</div>'
  );
});

test("inputHighlightHtml escapes HTML-significant characters in both plain and highlighted text", () => {
  const plain = ClearTXT.processText("a<b>c", opts());
  assert.equal(ClearTXT.inputHighlightHtml("a<b>c", plain.changes), '<div class="line">a&lt;b&gt;c</div>');

  // The overlay shows the RAW (pre-conversion) character under a "cv"
  // highlight - the actual replacement only appears in the output box.
  const converted = ClearTXT.processText("<em—dash>", opts());
  assert.equal(
    ClearTXT.inputHighlightHtml("<em—dash>", converted.changes),
    '<div class="line line-changed">&lt;em<span class="cv">—</span>dash&gt;</div>'
  );
});

test("outputHighlightHtml escapes quote characters, not just angle brackets and ampersand", () => {
  // Guards against attribute-context injection through a title="..."
  // built from escaped text - nothing currently reaches that path with
  // a quote in it, but the escaping itself must hold up regardless.
  const html = ClearTXT.escapeHtml('a&b<c>d"e\'f');
  assert.equal(html, "a&amp;b&lt;c&gt;d&quot;e&#39;f");
});

test("inputHighlightHtml returns null when normalization changes the character count, rather than misaligned highlights", () => {
  // "ﬁ" (the "fi" ligature) expands to 2 characters under NFKC, so the
  // normalized text is longer than the raw text - the 1:1 alignment this
  // needs no longer holds.
  const raw = "ﬁle";
  const { changes } = ClearTXT.processText(raw, opts());
  assert.notEqual([...raw].length, changes.length);
  assert.equal(ClearTXT.inputHighlightHtml(raw, changes), null);
});

test("inputHighlightHtml stops detailed highlighting at the character budget but still renders the rest as plain, aligned text", () => {
  const raw = "a😀b😀c";
  const { changes } = ClearTXT.processText(raw, opts());
  // Budget covers only the first emoji; the second is past it and shows
  // as plain (unhighlighted) text instead of also being marked removed.
  assert.equal(
    ClearTXT.inputHighlightHtml(raw, changes, 2),
    '<div class="line line-changed">a<span class="rm">😀</span>b😀c</div>'
  );
});

test("outputHighlightHtml substitutes a visible marker for invisible characters that survive filtering", () => {
  const { changes } = ClearTXT.processText("a​b", opts({ stripInvisible: false }));
  const html = ClearTXT.outputHighlightHtml(changes, 1000);
  assert.equal(html, '<div class="line line-changed">a<span class="iv" title="zero-width space (U+200B) (kept)">​</span>b</div>');
});

test("outputHighlightHtml never shows a marker for a stripped invisible character (it isn't in the output at all)", () => {
  const { changes } = ClearTXT.processText("a​b", opts({ stripInvisible: true }));
  const html = ClearTXT.outputHighlightHtml(changes, 1000);
  assert.equal(html, '<div class="line">ab</div>');
});

test("slugForFilename uses the first line, turns whitespace into hyphens", () => {
  assert.equal(ClearTXT.slugForFilename("Hello World\nsecond line"), "Hello-World");
});

test("slugForFilename strips characters illegal in filenames", () => {
  assert.equal(ClearTXT.slugForFilename('a/b\\c:d*e?f"g<h>i|j'), "abcdefghij");
});

test("slugForFilename truncates long first lines and trims a trailing hyphen left by truncation", () => {
  const longLine = "word ".repeat(20); // 100 chars, well past the 50-char cap
  const slug = ClearTXT.slugForFilename(longLine);
  assert.ok(slug.length <= 50);
  assert.ok(!slug.endsWith("-"));
});

test("slugForFilename returns empty for blank/unsafe-only first lines", () => {
  assert.equal(ClearTXT.slugForFilename(""), "");
  assert.equal(ClearTXT.slugForFilename("   \n more text"), "");
  assert.equal(ClearTXT.slugForFilename("///\n more text"), "");
});

test("exportFilename builds \"cleartxt-<slug>-<timestamp>.txt\" from the first line", () => {
  const now = new Date(2026, 0, 5, 9, 3, 7); // Jan 5 2026, 09:03:07 local
  assert.equal(
    ClearTXT.exportFilename("Hello World\nrest", now),
    "cleartxt-Hello-World-20260105-090307.txt"
  );
});

test("exportFilename falls back to a generic name when there's no usable slug", () => {
  const now = new Date(2026, 0, 5, 9, 3, 7);
  assert.equal(ClearTXT.exportFilename("", now), "cleartxt-output-20260105-090307.txt");
});

test("stripMarkdown strips headings, emphasis, links, images, code, quotes, lists, rules, and table syntax down to plain text", () => {
  assert.equal(ClearTXT.stripMarkdown("# Heading One\nSome **bold** and *italic* text."), "Heading One\nSome bold and italic text.");
  assert.equal(ClearTXT.stripMarkdown("- item one\n- item two\n1. numbered item"), "item one\nitem two\nnumbered item");
  assert.equal(ClearTXT.stripMarkdown("> a quoted line\nnormal line"), "a quoted line\nnormal line");
  assert.equal(ClearTXT.stripMarkdown("[a link](https://example.com) and ![an image](pic.png)"), "a link and an image");
  assert.equal(ClearTXT.stripMarkdown("```\ncode block line\nanother line\n```"), "\ncode block line\nanother line\n");
  assert.equal(ClearTXT.stripMarkdown("inline `code` here"), "inline code here");
  assert.equal(ClearTXT.stripMarkdown("---\nafter rule"), "\nafter rule");
  assert.equal(ClearTXT.stripMarkdown("| a | b |\n| - | - |\n| 1 | 2 |"), "  a   b  \n\n  1   2  ");
  assert.equal(ClearTXT.stripMarkdown("~~strikethrough~~ text"), "strikethrough text");
  assert.equal(ClearTXT.stripMarkdown("plain text with no markdown at all here"), "plain text with no markdown at all here");
});

test("wordCount counts words after stripping Markdown syntax, and handles empty/whitespace-only text", () => {
  assert.equal(ClearTXT.wordCount("# Heading One\nSome **bold** and *italic* text."), 7);
  assert.equal(ClearTXT.wordCount("- item one\n- item two\n1. numbered item"), 6);
  assert.equal(ClearTXT.wordCount("| a | b |\n| - | - |\n| 1 | 2 |"), 4);
  assert.equal(ClearTXT.wordCount("plain text with no markdown at all here"), 8);
  assert.equal(ClearTXT.wordCount(""), 0);
  assert.equal(ClearTXT.wordCount("   \n\t  "), 0);
});
