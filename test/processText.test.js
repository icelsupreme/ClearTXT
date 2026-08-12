"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ClearTXT = require("../script.js");

// Mirrors the checkbox defaults in index.html.
const DEFAULT_OPTS = {
  normalize: true,
  foldAccents: true,
  straightenQuotes: true,
  convertDashes: true,
  stripEmoji: true,
  stripInvisible: true,
  allowHebrew: false,
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

test("Hebrew is stripped by default and preserved when allowed", () => {
  // The word is removed and the two spaces that used to sandwich it
  // become adjacent, so the default-on "remove extra spaces" collapses
  // them to one.
  assert.equal(run("hello שלום world"), "hello world");
  assert.equal(run("hello שלום world", { removeExtraSpaces: false }), "hello  world");
  assert.equal(run("hello שלום world", { allowHebrew: true }), "hello שלום world");
});

test("emoji and symbols are stripped by default and kept when the toggle is off", () => {
  assert.equal(run("a😀b ±"), "ab ");
  assert.equal(run("a😀b ±", { stripEmoji: false }), "a😀b ±");
});

test("zero-width characters are stripped by default and kept when the toggle is off", () => {
  assert.equal(run("a​b"), "ab");
  assert.equal(run("a​b", { stripInvisible: false }), "a​b");
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

test("buildRuns groups consecutive same-type characters into a single run", () => {
  const { changes } = ClearTXT.processText("ab😀😀cd", opts());
  const runs = ClearTXT.buildRuns(changes);
  const kinds = runs.map((r) => r.type + ":" + r.count);
  assert.deepEqual(kinds, ["kept:2", "removed:2", "kept:2"]);
});

test("summarizeChanges and formatCatCounts report accurate per-category totals", () => {
  const { changes } = ClearTXT.processText("café “world” 😀", opts());
  const sums = ClearTXT.summarizeChanges(changes);
  assert.equal(ClearTXT.formatCatCounts(sums.converted), "1 accents, 2 quotes");
  assert.equal(ClearTXT.formatCatCounts(sums.removed), "1 emoji/symbols");
});

test("isHebrew recognizes the Hebrew block and presentation forms, and nothing else", () => {
  assert.equal(ClearTXT.isHebrew(0x05d0), true); // א
  assert.equal(ClearTXT.isHebrew(0xfb1d), true);
  assert.equal(ClearTXT.isHebrew(0x0041), false); // A
});

test("foldAccent returns null for characters with no plain-ASCII base", () => {
  assert.equal(ClearTXT.foldAccent("é"), "e"); // é
  assert.equal(ClearTXT.foldAccent("😀"), null); // emoji
  assert.equal(ClearTXT.foldAccent("中"), null); // CJK
});
