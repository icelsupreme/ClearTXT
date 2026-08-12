(function (root) {
  "use strict";

  var ZERO_WIDTH = new Set([
    0x200B, 0x200C, 0x200D, 0x200E, 0x200F,
    0x2028, 0x2029, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
    // Bidi "isolate" controls (U+2066-U+2069): newer siblings of the
    // U+202A-U+202E embedding/override controls above, and the ones
    // behind the "Trojan Source" technique (CVE-2021-42574) for making
    // text/code display in an order different from how it actually reads.
    0x2066, 0x2067, 0x2068, 0x2069,
    0x2060, 0x2061, 0x2062, 0x2063, 0x2064,
    0xFEFF
  ]);

  // Unicode Tag characters (U+E0000-U+E007F): originally for obsolete
  // language tagging, but zero-width and freely combinable, they're the
  // basis of "ASCII smuggling" - hiding arbitrary invisible text (including
  // prompt-injection payloads) inside otherwise normal-looking text.
  // Variation Selectors Supplement (U+E0100-U+E01EF): deprecated, no
  // legitimate modern use, and has also been used as a steganographic
  // channel. Both are ranges rather than a fixed set of code points, so
  // they're checked separately from ZERO_WIDTH; the *standard* variation
  // selectors (U+FE00-U+FE0F) are deliberately excluded here since those
  // are legitimately used to select an emoji's presentation.
  var HIDDEN_PAYLOAD_RANGES = [[0xE0000, 0xE007F], [0xE0100, 0xE01EF]];

  function isHiddenPayloadRange(cp) {
    for (var i = 0; i < HIDDEN_PAYLOAD_RANGES.length; i++) {
      var r = HIDDEN_PAYLOAD_RANGES[i];
      if (cp >= r[0] && cp <= r[1]) return true;
    }
    return false;
  }

  var QUOTE_MAP = new Map([
    [0x2018, "'"], [0x2019, "'"], [0x201A, ","], [0x201B, "'"],
    [0x201C, '"'], [0x201D, '"'], [0x201E, '"'], [0x201F, '"'],
    [0x2039, "<"], [0x203A, ">"]
  ]);

  // Only the em dash is ever converted. Every other dash-like character
  // (en dash, hyphen, non-breaking hyphen, figure dash, horizontal bar,
  // minus sign) is always preserved exactly as typed.
  var EM_DASH = 0x2014;
  var PRESERVED_DASHES = new Set([0x2010, 0x2011, 0x2012, 0x2013, 0x2015, 0x2212]);
  // What "Convert em dashes" is allowed to turn an em dash into.
  var DASH_TARGETS = new Set(["-", "–"]);

  // Hebrew letters, points (niqqud/cantillation) and punctuation, plus the
  // presentation-forms block (ligatures like "ﭏ" and pointed letters).
  var HEBREW_RANGES = [[0x0590, 0x05FF], [0xFB1D, 0xFB4F]];

  // Short label + human name for zero-width/formatting characters that
  // have no visible glyph of their own, so the diff view can show
  // something in their place instead of literally nothing.
  var INVISIBLE_NAMES = {
    0x200B: { label: "ZWSP", name: "zero-width space" },
    0x200C: { label: "ZWNJ", name: "zero-width non-joiner" },
    0x200D: { label: "ZWJ", name: "zero-width joiner" },
    0x200E: { label: "LRM", name: "left-to-right mark" },
    0x200F: { label: "RLM", name: "right-to-left mark" },
    0x2028: { label: "LS", name: "line separator" },
    0x2029: { label: "PS", name: "paragraph separator" },
    0x202A: { label: "LRE", name: "left-to-right embedding" },
    0x202B: { label: "RLE", name: "right-to-left embedding" },
    0x202C: { label: "PDF", name: "pop directional formatting" },
    0x202D: { label: "LRO", name: "left-to-right override" },
    0x202E: { label: "RLO", name: "right-to-left override" },
    0x2060: { label: "WJ", name: "word joiner" },
    0x2061: { label: "FA", name: "function application" },
    0x2062: { label: "IT", name: "invisible times" },
    0x2063: { label: "IS", name: "invisible separator" },
    0x2064: { label: "IP", name: "invisible plus" },
    0x2066: { label: "LRI", name: "left-to-right isolate" },
    0x2067: { label: "RLI", name: "right-to-left isolate" },
    0x2068: { label: "FSI", name: "first strong isolate" },
    0x2069: { label: "PDI", name: "pop directional isolate" },
    0xFEFF: { label: "BOM", name: "byte order mark" }
  };

  // Standard short names for the C0 control characters (index = code point).
  var CONTROL_NAMES = [
    "NUL", "SOH", "STX", "ETX", "EOT", "ENQ", "ACK", "BEL", "BS", "HT", "LF", "VT", "FF", "CR", "SO", "SI",
    "DLE", "DC1", "DC2", "DC3", "DC4", "NAK", "SYN", "ETB", "CAN", "EM", "SUB", "ESC", "FS", "GS", "RS", "US"
  ];

  function hex4(cp) {
    return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
  }

  // Returns a visible one-or-few-character label and a human-readable name
  // for a zero-width/control code point, used to substitute something
  // visible for it in the diff view. C0 controls use their standard
  // Unicode "control picture" glyph (U+2400-U+2421); the named zero-width
  // characters use a short abbreviation; anything else falls back to its
  // code point.
  function invisibleInfo(cp) {
    var special = INVISIBLE_NAMES[cp];
    if (special) return { label: special.label, name: special.name + " (" + hex4(cp) + ")" };
    if (cp <= 0x1F) return { label: String.fromCodePoint(0x2400 + cp), name: (CONTROL_NAMES[cp] || "control character") + " (" + hex4(cp) + ")" };
    if (cp === 0x7F) return { label: "␡", name: "DEL (" + hex4(cp) + ")" };
    if (cp >= 0xE0000 && cp <= 0xE007F) return { label: "TAG", name: "Unicode tag character - can carry invisible hidden text (" + hex4(cp) + ")" };
    if (cp >= 0xE0100 && cp <= 0xE01EF) return { label: "VS", name: "variation selector supplement, no legitimate modern use (" + hex4(cp) + ")" };
    return { label: hex4(cp), name: hex4(cp) };
  }

  var CAT_LABEL = {
    invisible: "invisible/control",
    symbol: "emoji/symbols",
    dash: "dashes",
    accent: "accents",
    quote: "quotes",
    hebrew: "Hebrew",
    currency: "currency symbols",
    tab: "tabs",
    linebreak: "line breaks",
    paragraph: "paragraph breaks",
    space: "extra spaces"
  };

  function isControl(cp) {
    return (cp <= 0x1F && cp !== 0x09 && cp !== 0x0A && cp !== 0x0D) || cp === 0x7F;
  }

  // Unicode's own "Currency Symbol" general category (Sc) - covers €, £,
  // ¥, ₹, ₩, ₽, ¢, ... The ASCII dollar sign ($) never reaches this check;
  // it's already handled by the plain-ASCII passthrough above.
  var CURRENCY_RE = /\p{Sc}/u;
  function isCurrencySymbol(ch) {
    return CURRENCY_RE.test(ch);
  }

  function isHebrew(cp) {
    for (var i = 0; i < HEBREW_RANGES.length; i++) {
      var r = HEBREW_RANGES[i];
      if (cp >= r[0] && cp <= r[1]) return true;
    }
    return false;
  }

  // Tries to fold a single character down to a plain-ASCII equivalent by
  // decomposing it (NFD) and stripping combining marks, e.g. é -> e.
  // Returns null when the character has no plain-ASCII base (CJK, emoji…).
  function foldAccent(ch) {
    var d = ch.normalize ? ch.normalize("NFD").replace(/\p{Mn}/gu, "") : ch;
    if (!d.length || d === ch) return null;
    for (var c of d) {
      var cp = c.codePointAt(0);
      if (cp < 0x20 || cp > 0x7E) return null;
    }
    return d;
  }

  // Runs the configurable pipeline over `text` and returns both the
  // filtered output and a per-character change log used to render the
  // before/after diff and the removed/converted summary. The output string
  // is derived from `changes` at the end (see applyWhitespaceCleanup),
  // rather than built inline, since the whitespace pass can retroactively
  // turn an already-"kept" character into "removed"/"converted".
  function processText(text, opts) {
    var src = (opts.normalize && text.normalize) ? text.normalize("NFKC") : text;
    var changes = [];

    for (var ch of src) {
      var cp = ch.codePointAt(0);

      if (ZERO_WIDTH.has(cp) || isControl(cp) || isHiddenPayloadRange(cp)) {
        if (opts.stripInvisible) {
          changes.push({ ch: ch, type: "removed", category: "invisible", replacement: "" });
        } else {
          changes.push({ ch: ch, type: "kept", category: "invisible", replacement: ch });
        }
        continue;
      }
      if (cp === 0x09 || cp === 0x0A || cp === 0x0D) {
        changes.push({ ch: ch, type: "kept", category: "whitespace", replacement: ch });
        continue;
      }
      if (cp >= 0x20 && cp <= 0x7E) {
        changes.push({ ch: ch, type: "kept", category: "ascii", replacement: ch });
        continue;
      }

      if (isHebrew(cp)) {
        if (opts.allowHebrew) {
          changes.push({ ch: ch, type: "kept", category: "hebrew", replacement: ch });
        } else {
          changes.push({ ch: ch, type: "removed", category: "hebrew", replacement: "" });
        }
        continue;
      }

      if (opts.straightenQuotes && QUOTE_MAP.has(cp)) {
        var rq = QUOTE_MAP.get(cp);
        changes.push({ ch: ch, type: "converted", category: "quote", replacement: rq });
        continue;
      }

      if (PRESERVED_DASHES.has(cp)) {
        changes.push({ ch: ch, type: "kept", category: "dash", replacement: ch });
        continue;
      }
      if (cp === EM_DASH && opts.convertDashes) {
        var target = DASH_TARGETS.has(opts.dashTarget) ? opts.dashTarget : "-";
        changes.push({ ch: ch, type: "converted", category: "dash", replacement: target });
        continue;
      }

      if (opts.foldAccents) {
        var folded = foldAccent(ch);
        if (folded !== null) {
          changes.push({ ch: ch, type: "converted", category: "accent", replacement: folded });
          continue;
        }
      }

      // A currency symbol would otherwise fall into the generic
      // emoji/symbol bucket below - stripped only when BOTH toggles agree
      // to strip it: the general "Strip emoji & symbols" switch, and this
      // category's own toggle (checked = stripped, same "checked = the
      // action happens" convention every other fix toggle uses).
      if (isCurrencySymbol(ch)) {
        var stripThisCurrency = opts.stripCurrency && opts.stripEmoji;
        changes.push({ ch: ch, type: stripThisCurrency ? "removed" : "kept", category: "currency", replacement: stripThisCurrency ? "" : ch });
        continue;
      }

      if (opts.stripEmoji) {
        changes.push({ ch: ch, type: "removed", category: "symbol", replacement: "" });
      } else {
        changes.push({ ch: ch, type: "kept", category: "symbol", replacement: ch });
      }
    }

    applyWhitespaceCleanup(changes, opts);

    var out = "";
    for (var i = 0; i < changes.length; i++) {
      if (changes[i].type !== "removed") out += changes[i].replacement;
    }

    return { output: out, changes: changes, normalizedInput: src };
  }

  // Second pass over the per-character results, handling the whitespace
  // toggles that need surrounding context (a run of newlines, a run of
  // spaces) rather than a single-character decision. Mutates `changes` in
  // place; segments already marked "removed" by the first pass contribute
  // nothing and are skipped. Browsers normalize textarea line endings to a
  // single "\n" (no "\r\n"/"\r"), so only "\n" needs to be handled here.
  function applyWhitespaceCleanup(changes, opts) {
    var n = changes.length;

    // A run of one "\n" is a line break within a paragraph; a run of two or
    // more is a blank-line paragraph break. Each is governed independently.
    var i = 0;
    while (i < n) {
      var seg = changes[i];
      if (seg.type !== "removed" && seg.replacement === "\n") {
        var start = i;
        var j = i;
        while (j < n && changes[j].type !== "removed" && changes[j].replacement === "\n") j++;
        if (j - start === 1) {
          if (opts.removeLineBreaks) {
            changes[start].type = "converted";
            changes[start].category = "linebreak";
            changes[start].replacement = " ";
          }
        } else if (opts.removeParagraphBreaks) {
          changes[start].type = "converted";
          changes[start].category = "paragraph";
          changes[start].replacement = " ";
          for (var k = start + 1; k < j; k++) {
            changes[k].type = "removed";
            changes[k].category = "paragraph";
            changes[k].replacement = "";
          }
        }
        i = j;
      } else {
        i++;
      }
    }

    if (opts.removeTabs) {
      for (var t = 0; t < n; t++) {
        var s = changes[t];
        if (s.type !== "removed" && s.replacement === "\t") {
          s.type = "converted";
          s.category = "tab";
          s.replacement = " ";
        }
      }
    }

    // Collapse consecutive spaces using the final surviving character
    // stream, so line-break/paragraph-break/tab conversions above (which
    // can themselves introduce or expose adjacent spaces) are accounted
    // for. Segments already removed contribute nothing and are skipped
    // without resetting the "last char was a space" state.
    if (opts.removeExtraSpaces) {
      var lastWasSpace = false;
      for (var m = 0; m < n; m++) {
        var seg2 = changes[m];
        if (seg2.type === "removed") continue;
        if (seg2.replacement === " ") {
          if (lastWasSpace) {
            seg2.type = "removed";
            seg2.category = "space";
            seg2.replacement = "";
            continue;
          }
          lastWasSpace = true;
        } else {
          lastWasSpace = false;
        }
      }
    }
  }

  function summarizeChanges(changes) {
    var removed = {}, converted = {};
    changes.forEach(function (c) {
      if (c.type === "removed") removed[c.category] = (removed[c.category] || 0) + 1;
      else if (c.type === "converted") converted[c.category] = (converted[c.category] || 0) + 1;
    });
    return { removed: removed, converted: converted };
  }

  function formatCatCounts(obj) {
    var keys = Object.keys(obj);
    if (!keys.length) return "";
    return keys.map(function (k) { return obj[k] + " " + (CAT_LABEL[k] || k); }).join(", ");
  }

  // Escapes for both HTML text-content and (double- or single-quoted)
  // attribute-value contexts uniformly, since this is used for both (see
  // markerSpan's title="..."). Nothing currently reaching the attribute
  // context can contain a quote character - invisibleInfo() only ever
  // returns hardcoded strings or safely hex-formatted code points - but
  // escaping defensively here means that stays true even if this function
  // gets reused for less-constrained text later.
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function markerSpan(cls, text, title) {
    var esc = escapeHtml(text);
    var t = title ? ' title="' + escapeHtml(title) + '"' : "";
    return '<span class="' + cls + '"' + t + ">" + esc + "</span>";
  }

  // Shared by inputHighlightHtml/outputHighlightHtml: walks a sequence of
  // displayed characters (`chars`) paired 1:1 with their change-log entry
  // (`entries`) and produces per-logical-line HTML - each line wrapped in
  // its own <div class="line">, tagged "line-changed" when it contains
  // any removed/converted/invisible character, GitHub-diff style, so the
  // whole row gets a background tint in addition to the precise rm/cv/iv
  // spans within it. Consecutive same-type rm/cv characters within a line
  // are grouped into one span (perf: fewer DOM nodes); invisible
  // characters always get their own span, since each needs its own
  // tooltip. Stops classifying past `budget` but still emits the
  // remaining lines as plain (unhighlighted) text, so line/row structure
  // - and therefore scroll alignment - holds for the whole document
  // regardless of the budget.
  function buildLineHighlightHtml(chars, entries, budget) {
    var n = chars.length;
    var lineHtml = [];
    var lineChanged = false;

    function flushLine() {
      var cls = "line" + (lineChanged ? " line-changed" : "");
      var html = '<div class="' + cls + '">' + lineHtml.join("") + "</div>";
      lineHtml = [];
      lineChanged = false;
      return html;
    }

    var out = [];
    var i = 0;
    while (i < budget) {
      var c = entries[i];
      if (chars[i] === "\n") {
        if (c.type !== "kept") lineChanged = true;
        out.push(flushLine());
        i++;
        continue;
      }
      if (c.category === "invisible") {
        var info = invisibleInfo(chars[i].codePointAt(0));
        var cls = "iv" + (c.type === "removed" ? " rm" : "");
        var title = info.name + (c.type === "removed" ? " (removed)" : " (kept)");
        lineHtml.push(markerSpan(cls, chars[i], title));
        lineChanged = true;
        i++;
        continue;
      }
      if (c.type === "kept") {
        lineHtml.push(escapeHtml(chars[i]));
        i++;
        continue;
      }
      var type = c.type;
      var j = i;
      var buf = "";
      while (j < budget && entries[j].type === type && entries[j].category !== "invisible" && chars[j] !== "\n") {
        buf += chars[j];
        j++;
      }
      lineHtml.push(markerSpan(type === "removed" ? "rm" : "cv", buf));
      lineChanged = true;
      i = j;
    }

    if (i < n) {
      // Past the highlighting budget: still split on "\n" so every
      // remaining line gets its own (unhighlighted) row, rather than
      // dumping the whole rest of the document into the current line.
      var restLines = chars.slice(i).join("").split("\n");
      lineHtml.push(escapeHtml(restLines[0]));
      out.push(flushLine());
      for (var k = 1; k < restLines.length; k++) {
        out.push('<div class="line">' + escapeHtml(restLines[k]) + "</div>");
      }
    } else {
      out.push(flushLine());
    }

    return out.join("");
  }

  // Builds the highlight-overlay HTML for the INPUT box. This sits in a
  // layer directly behind the live, editable textarea: its text is fully
  // transparent (see CSS), so only the background/ring effects on the
  // rm/cv/iv spans (and the whole-row line-changed tint) show through,
  // appearing to highlight the real text above it. That only works if
  // this HTML has EXACTLY the same characters, in the same order, as the
  // textarea's own raw value — so this builds off `rawText` (not the
  // NFKC-normalized `changes[i].ch`). `changes` must be `rawText`'s own
  // per-character pipeline result — if normalization changed the
  // character count (rare: mainly typographic ligatures), the 1:1
  // assumption breaks and this returns null; the caller falls back to no
  // overlay for that render rather than show misaligned highlights.
  function inputHighlightHtml(rawText, changes, maxChars) {
    var rawChars = [...rawText];
    if (rawChars.length !== changes.length) return null;
    var budget = maxChars == null ? rawChars.length : Math.min(maxChars, rawChars.length);
    return buildLineHighlightHtml(rawChars, changes, budget);
  }

  // Shared by outputHighlightHtml/outputLineChanged: output only ever
  // contains non-removed segments, and output.value is always exactly
  // their replacements joined together, so filtering `changes` down to
  // those (paired with their own replacement character) is inherently
  // 1:1 aligned with the output textarea's value - no null case needed,
  // unlike the input side.
  function outputCharsAndEntries(changes) {
    var entries = [];
    var chars = [];
    for (var k = 0; k < changes.length; k++) {
      if (changes[k].type !== "removed") {
        entries.push(changes[k]);
        chars.push(changes[k].replacement);
      }
    }
    return { chars: chars, entries: entries };
  }

  // Same idea for the OUTPUT box.
  function outputHighlightHtml(changes, maxChars) {
    var ce = outputCharsAndEntries(changes);
    var budget = maxChars == null ? ce.chars.length : Math.min(maxChars, ce.chars.length);
    return buildLineHighlightHtml(ce.chars, ce.entries, budget);
  }

  // Per-logical-line "did this line change" flags (one per line the text
  // splits into on "\n"), covering the FULL text with no truncation
  // budget - unlike the highlight HTML builders, this is cheap enough
  // (one pass, no DOM) to always run over everything, and is used to tint
  // the corresponding gutter line numbers alongside the highlighted row.
  function lineChangedFlags(chars, entries) {
    var flags = [];
    var changed = false;
    for (var i = 0; i < chars.length; i++) {
      if (chars[i] === "\n") {
        flags.push(changed);
        changed = false;
        continue;
      }
      if (entries[i].type !== "kept") changed = true;
    }
    flags.push(changed);
    return flags;
  }

  // Line-changed flags for the INPUT box's gutter. Returns null under the
  // same rare normalization-length-mismatch condition inputHighlightHtml
  // does, since it relies on the same 1:1 alignment with rawText.
  function inputLineChanged(rawText, changes) {
    var rawChars = [...rawText];
    if (rawChars.length !== changes.length) return null;
    return lineChangedFlags(rawChars, changes);
  }

  // Line-changed flags for the OUTPUT box's gutter.
  function outputLineChanged(changes) {
    var ce = outputCharsAndEntries(changes);
    return lineChangedFlags(ce.chars, ce.entries);
  }

  // Max length of the first-line-derived slug used in the exported
  // filename, before the timestamp suffix is appended.
  var EXPORT_SLUG_MAX = 50;

  // Turns the first line of `text` into a short, filesystem-safe slug for
  // use in the exported filename: strips characters that are illegal (or
  // just awkward) in a filename on common OSes, collapses whitespace to
  // hyphens, and truncates. Returns "" if there's nothing usable (empty
  // text, or a first line that's entirely unsafe/whitespace characters).
  function slugForFilename(text) {
    var firstLine = (text.split("\n")[0] || "");
    return firstLine
      // eslint-disable-next-line no-control-regex -- intentionally stripping control chars too
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, EXPORT_SLUG_MAX)
      .replace(/-+$/, "");
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  // Builds the exported filename from the output's first line plus a
  // timestamp, e.g. "cleartxt-hello-world-20260812-104015.txt", falling
  // back to a generic name when the first line yields no usable slug.
  function exportFilename(text, now) {
    var d = now || new Date();
    var stamp = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      "-" + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
    var slug = slugForFilename(text);
    return "cleartxt-" + (slug || "output") + "-" + stamp + ".txt";
  }

  // Character budget for the highlighted view. Runs already keep the DOM
  // node count far below this in normal text; this cap only guards against
  // pathological inputs (huge blocks that alternate kept/removed/converted
  // every character) and truncates gracefully rather than dropping
  // highlighting entirely.
  var MAX_DIFF_CHARS = 20000;

  // Turns a line-changed flags array (from inputLineChanged/outputLineChanged)
  // into the plain list of changed line numbers - the sequence the
  // prev/next diff-navigation buttons step through. Null in, empty list
  // out, so callers don't need their own guard for the normalization-
  // mismatch case.
  function changedLineNumbers(flags) {
    if (!flags) return [];
    var out = [];
    for (var i = 0; i < flags.length; i++) {
      if (flags[i]) out.push(i);
    }
    return out;
  }

  // Everything above this point is pure text-processing logic with no DOM
  // dependency, exported below for unit testing (see test/). Everything
  // below wires that logic up to the actual page and only runs in a
  // browser, where `document` exists.
  var ClearTXT = {
    processText: processText,
    applyWhitespaceCleanup: applyWhitespaceCleanup,
    summarizeChanges: summarizeChanges,
    formatCatCounts: formatCatCounts,
    inputHighlightHtml: inputHighlightHtml,
    outputHighlightHtml: outputHighlightHtml,
    inputLineChanged: inputLineChanged,
    outputLineChanged: outputLineChanged,
    changedLineNumbers: changedLineNumbers,
    escapeHtml: escapeHtml,
    invisibleInfo: invisibleInfo,
    isHiddenPayloadRange: isHiddenPayloadRange,
    isHebrew: isHebrew,
    foldAccent: foldAccent,
    slugForFilename: slugForFilename,
    exportFilename: exportFilename
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ClearTXT;
  } else {
    root.ClearTXT = ClearTXT;
  }

  if (typeof document === "undefined") return;

  var input = document.getElementById("input");
  var output = document.getElementById("output");
  var inGutter = document.getElementById("inGutter");
  var outGutter = document.getElementById("outGutter");
  var inHighlight = document.getElementById("inHighlight");
  var outHighlight = document.getElementById("outHighlight");
  var inCount = document.getElementById("inCount");
  var outCount = document.getElementById("outCount");
  var stats = document.getElementById("stats");
  var stickyFooter = document.getElementById("stickyFooter");
  var stickyFooterCounts = document.getElementById("stickyFooterCounts");
  var importBtn = document.getElementById("importBtn");
  var importFile = document.getElementById("importFile");
  var copyBtn = document.getElementById("copyBtn");
  var exportBtn = document.getElementById("exportBtn");
  var clearBtn = document.getElementById("clearBtn");

  var diffSummary = document.getElementById("diffSummary");
  var diffCounts = document.getElementById("diffCounts");
  var diffNote = document.getElementById("diffNote");
  var diffNav = document.getElementById("diffNav");
  var diffPrevBtn = document.getElementById("diffPrevBtn");
  var diffNextBtn = document.getElementById("diffNextBtn");
  var diffNavCount = document.getElementById("diffNavCount");

  // [DOM id, opts key, default value, fix-group] for every plain-checkbox
  // fix toggle. Adding a new checkbox-backed fix only needs a new row
  // here, instead of touching a separate element declaration, optEls
  // entry, readOpts field, and applySavedOpts field individually. The
  // group is a pure UI-grouping label (drives the "select whole group"
  // header checkboxes below) - it's never read from or written to opts/
  // localStorage.
  var FIX_TOGGLES = [
    ["optNormalize", "normalize", true, "typography"],
    ["optFoldAccents", "foldAccents", true, "typography"],
    ["optStraightenQuotes", "straightenQuotes", true, "typography"],
    ["optConvertDashes", "convertDashes", true, "typography"],
    ["optStripEmoji", "stripEmoji", true, "symbols"],
    ["optStripCurrency", "stripCurrency", true, "symbols"],
    ["optStripInvisible", "stripInvisible", true, "symbols"],
    ["optAllowHebrew", "allowHebrew", false, "symbols"],
    ["optRemoveTabs", "removeTabs", false, "whitespace"],
    ["optRemoveExtraSpaces", "removeExtraSpaces", true, "whitespace"],
    ["optRemoveLineBreaks", "removeLineBreaks", false, "whitespace"],
    ["optRemoveParagraphBreaks", "removeParagraphBreaks", false, "whitespace"]
  ].map(function (t) {
    return { el: document.getElementById(t[0]), key: t[1], def: t[2], group: t[3] };
  });

  // Group names in display order, matching the fixGroup sections in the
  // markup - drives both the "select whole group" header wiring below and
  // its indeterminate/checked state.
  var FIX_GROUPS = ["typography", "symbols", "whitespace"];

  function groupToggles(group) {
    return FIX_TOGGLES.filter(function (t) { return t.group === group; });
  }

  // Syncs one group's header checkbox to reflect its members: checked when
  // all are on, unchecked when none are, indeterminate (the native
  // "partially selected" dash) otherwise - same convention as "select all"
  // checkboxes in file managers/mail clients.
  function updateGroupHeader(group) {
    var header = document.getElementById("groupToggle-" + group);
    if (!header) return;
    var toggles = groupToggles(group);
    var onCount = toggles.filter(function (t) { return t.el.checked; }).length;
    header.checked = onCount === toggles.length;
    header.indeterminate = onCount > 0 && onCount < toggles.length;
    // The indeterminate IDL property is visual-only - screen readers don't
    // reliably announce it without an explicit ARIA state alongside it.
    header.setAttribute("aria-checked", header.indeterminate ? "mixed" : String(header.checked));
  }

  function updateAllGroupHeaders() {
    FIX_GROUPS.forEach(updateGroupHeader);
  }

  // The one non-checkbox fix option (a <select>), handled alongside
  // FIX_TOGGLES but separately since it reads/writes .value, not .checked.
  var optConvertDashes = document.getElementById("optConvertDashes");
  var optDashTarget = document.getElementById("optDashTarget");

  var optEls = FIX_TOGGLES.map(function (t) { return t.el; }).concat([optDashTarget]);

  var OPTS_KEY = "cleartxt-opts";

  function readOpts() {
    var opts = { dashTarget: optDashTarget.value };
    FIX_TOGGLES.forEach(function (t) { opts[t.key] = t.el.checked; });
    return opts;
  }

  function saveOpts(opts) {
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch (e) { /* ignore */ }
  }

  function applySavedOpts() {
    try {
      var raw = localStorage.getItem(OPTS_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      // Same "on unless explicitly saved off" / "off unless explicitly
      // saved on" logic as before per option, just table-driven now.
      FIX_TOGGLES.forEach(function (t) {
        t.el.checked = t.def ? saved[t.key] !== false : saved[t.key] === true;
      });
      optDashTarget.value = saved.dashTarget === "–" ? "–" : "-";
    } catch (e) { /* ignore malformed storage */ }
  }

  // Hidden mirror element used to measure how many visual rows each
  // logical line wraps to, so the gutter can show a blank instead of a
  // number on continuation rows and stay aligned with wrapped text.
  var ruler = document.createElement("div");
  ruler.style.position = "absolute";
  ruler.style.visibility = "hidden";
  ruler.style.top = "0";
  ruler.style.left = "-9999px";
  ruler.style.height = "auto";
  ruler.style.whiteSpace = "pre-wrap";
  ruler.style.wordBreak = "break-word";
  ruler.style.boxSizing = "border-box";
  document.body.appendChild(ruler);

  function countWrappedRows(ta, logicalLines) {
    var cs = getComputedStyle(ta);
    // Measure against the textarea's content-box width (no padding on the
    // ruler itself), otherwise the ruler's own padding inflates scrollHeight
    // and every line — even ones that fit on one row — looks wrapped.
    var padLeft = parseFloat(cs.paddingLeft) || 0;
    var padRight = parseFloat(cs.paddingRight) || 0;
    ruler.style.width = Math.max(0, ta.clientWidth - padLeft - padRight) + "px";
    ruler.style.padding = "0";
    ruler.style.fontFamily = cs.fontFamily;
    ruler.style.fontSize = cs.fontSize;
    ruler.style.fontWeight = cs.fontWeight;
    ruler.style.fontStyle = cs.fontStyle;
    ruler.style.letterSpacing = cs.letterSpacing;

    var lineHeight = parseFloat(cs.lineHeight);
    if (!lineHeight || isNaN(lineHeight)) lineHeight = parseFloat(cs.fontSize) * 1.2;

    var counts = [];
    for (var i = 0; i < logicalLines.length; i++) {
      ruler.textContent = logicalLines[i].length ? logicalLines[i] : "​";
      counts.push(Math.max(1, Math.round(ruler.scrollHeight / lineHeight)));
    }
    return counts;
  }

  // Perf guard: measuring every logical line is O(n) DOM reflows, so skip
  // wrap-aware numbering past this size and fall back to plain numbering.
  var WRAP_MEASURE_LIMIT = 500;

  // `lineChanged` is the per-line boolean array from inputLineChanged/
  // outputLineChanged (or null, e.g. the normalization-mismatch case) -
  // when a line is flagged, its number is wrapped so CSS can tint it the
  // same way as its highlighted row, tying the gutter to the diff overlay.
  function updateGutter(ta, gutter, lineChanged) {
    var logicalLines = ta.value.length ? ta.value.split("\n") : [""];

    function numHtml(n) {
      var s = String(n + 1);
      return (lineChanged && lineChanged[n]) ? '<span class="gutter-changed">' + s + "</span>" : s;
    }

    if (logicalLines.length > WRAP_MEASURE_LIMIT) {
      var arr = [];
      for (var i = 0; i < logicalLines.length; i++) arr.push(numHtml(i));
      gutter.innerHTML = arr.join("\n");
      return;
    }

    var rowCounts = countWrappedRows(ta, logicalLines);
    var out = [];
    for (var n = 0; n < rowCounts.length; n++) {
      out.push(numHtml(n));
      for (var r = 1; r < rowCounts[n]; r++) out.push("");
    }
    gutter.innerHTML = out.join("\n");
  }

  // Scrolls `ta` (and its paired gutter/highlight layer, which must always
  // track the textarea's own scrollTop) so logical line `lineNo` is
  // centered in the viewport. Reuses countWrappedRows so a wrapped line's
  // true visual row offset is accounted for, same as the gutter numbering.
  function scrollLineIntoView(ta, gutter, hl, lineNo) {
    var logicalLines = ta.value.length ? ta.value.split("\n") : [""];
    if (lineNo < 0 || lineNo >= logicalLines.length) return;

    var cs = getComputedStyle(ta);
    var lineHeight = parseFloat(cs.lineHeight);
    if (!lineHeight || isNaN(lineHeight)) lineHeight = parseFloat(cs.fontSize) * 1.2;

    var rowCounts = logicalLines.length > WRAP_MEASURE_LIMIT
      ? logicalLines.map(function () { return 1; })
      : countWrappedRows(ta, logicalLines);

    var rowsBefore = 0;
    for (var i = 0; i < lineNo; i++) rowsBefore += rowCounts[i];

    var targetTop = rowsBefore * lineHeight;
    var targetCenter = targetTop - (ta.clientHeight / 2) + (lineHeight / 2);
    var maxScroll = Math.max(0, ta.scrollHeight - ta.clientHeight);
    ta.scrollTop = Math.max(0, Math.min(maxScroll, targetCenter));
    gutter.scrollTop = ta.scrollTop;
    hl.scrollTop = ta.scrollTop;
  }

  // Marks/clears which single line (across both boxes) the diff-navigation
  // buttons last jumped to, so it's visually distinguishable from the
  // other (merely changed) highlighted lines currently in view.
  function clearCurrentDiffLine() {
    [inHighlight, outHighlight].forEach(function (hl) {
      var el = hl.querySelector(".line-current");
      if (el) el.classList.remove("line-current");
    });
  }

  function markCurrentDiffLine(hl, lineNo) {
    var el = hl.children[lineNo];
    if (el) el.classList.add("line-current");
  }

  // The changed-line numbers the prev/next buttons currently step through
  // (derived from the input's own line-changed flags - see updateDiffNav),
  // and the index within that list gotoChange last jumped to.
  var diffNavLines = [];
  var diffNavIndex = -1;

  // Re-derives diffNavLines from the latest render and resets diffNavIndex,
  // since a fresh render invalidates any previous position (line numbers
  // may have shifted, and the old highlight DOM nodes are already gone).
  function updateDiffNav() {
    diffNavLines = changedLineNumbers(lastInLineChanged || lastOutLineChanged);
    diffNavIndex = -1;
    if (diffNavLines.length === 0) {
      diffNav.style.display = "none";
      return;
    }
    diffNav.style.display = "";
    diffNavCount.textContent = diffNavLines.length + (diffNavLines.length === 1 ? " changed line" : " changed lines");
  }

  // Jumps straight to position `idx` within diffNavLines (wrapping into
  // range), scrolling/marking both boxes. The same logical line number is
  // used for both - correct whenever input/output share line structure,
  // which holds unless a line/paragraph-break-removal fix is on; when the
  // output has fewer lines it's clamped to the last one instead of
  // resolving misleadingly to the wrong line. Shared by gotoChange
  // (sequential prev/next) and clicking a changed line number directly in
  // either gutter.
  function jumpToNavIndex(idx) {
    if (!diffNavLines.length) return;
    diffNavIndex = ((idx % diffNavLines.length) + diffNavLines.length) % diffNavLines.length;
    var lineNo = diffNavLines[diffNavIndex];

    clearCurrentDiffLine();

    scrollLineIntoView(input, inGutter, inHighlight, lineNo);
    markCurrentDiffLine(inHighlight, lineNo);

    var outLineCount = output.value.length ? output.value.split("\n").length : 1;
    var outLineNo = Math.min(lineNo, outLineCount - 1);
    scrollLineIntoView(output, outGutter, outHighlight, outLineNo);
    markCurrentDiffLine(outHighlight, outLineNo);

    diffNavCount.textContent = (diffNavIndex + 1) + " / " + diffNavLines.length;
  }

  // Jumps to the next (delta 1) or previous (delta -1) changed line,
  // wrapping around at either end. Flushes any pending debounced update
  // first, so a nav click right after fast typing steps through the
  // current text's changes rather than a stale, about-to-be-replaced list.
  function gotoChange(delta) {
    flushUpdate();
    if (!diffNavLines.length) return;
    jumpToNavIndex(diffNavIndex + delta);
  }

  // Lets clicking a changed line number directly in either gutter jump
  // straight to it, instead of only being reachable by stepping through
  // Previous/Next. `lineNo` is 0-based; a raw line number not currently in
  // diffNavLines (e.g. clicked in the output gutter when the two boxes'
  // line counts have diverged) is silently ignored.
  function jumpToLine(lineNo) {
    flushUpdate();
    var idx = diffNavLines.indexOf(lineNo);
    if (idx !== -1) jumpToNavIndex(idx);
  }

  // Renders the removed/converted summary, and the highlight overlays that
  // sit behind the actual input/output textareas (see inputHighlightHtml /
  // outputHighlightHtml). `rawInput` is the input textarea's own raw
  // value - required (rather than reusing result.normalizedInput) so the
  // overlay's characters line up 1:1 with what the textarea itself shows.
  function renderDiff(rawInput, result) {
    var changes = result.changes;
    var sums = summarizeChanges(changes);
    var removedTotal = Object.keys(sums.removed).reduce(function (a, k) { return a + sums.removed[k]; }, 0);
    var convertedTotal = Object.keys(sums.converted).reduce(function (a, k) { return a + sums.converted[k]; }, 0);

    if (!changes.length) {
      diffSummary.textContent = "";
    } else if (removedTotal === 0 && convertedTotal === 0) {
      diffSummary.textContent = "(no changes)";
    } else {
      diffSummary.textContent = "(" + removedTotal + " removed, " + convertedTotal + " converted)";
    }

    var lines = [];
    var removedLine = formatCatCounts(sums.removed);
    var convertedLine = formatCatCounts(sums.converted);
    if (removedLine) lines.push("Removed - " + removedLine);
    if (convertedLine) lines.push("Converted - " + convertedLine);
    diffCounts.textContent = lines.join("   ·   ");

    if (!changes.length) {
      inHighlight.innerHTML = "";
      outHighlight.innerHTML = "";
      diffNote.style.display = "none";
      return;
    }

    var inputOverlay = inputHighlightHtml(rawInput, changes, MAX_DIFF_CHARS);
    inHighlight.innerHTML = inputOverlay === null ? "" : inputOverlay;
    outHighlight.innerHTML = outputHighlightHtml(changes, MAX_DIFF_CHARS);

    if (changes.length > MAX_DIFF_CHARS) {
      diffNote.textContent = "Detailed highlighting covers the first " + MAX_DIFF_CHARS.toLocaleString() + " of " + changes.length.toLocaleString() + " characters, for performance (the counts above cover the full text).";
      diffNote.style.display = "";
    } else if (inputOverlay === null) {
      diffNote.textContent = "Inline highlighting isn't available for this input (Unicode normalization changed its length) - the counts above are still accurate.";
      diffNote.style.display = "";
    } else {
      diffNote.style.display = "none";
    }
  }

  // Last-computed gutter line-changed flags, re-used by the resize handler
  // below so it can re-run updateGutter (for wrap-count changes) without
  // re-running the whole text pipeline just to recolor the same lines.
  var lastInLineChanged = null;
  var lastOutLineChanged = null;

  // The input handler is debounced (see scheduleUpdate below) so fast
  // typing/pasting doesn't re-run the full pipeline - including the
  // wrapped-row DOM measurements behind gutter/nav positioning - on every
  // single keystroke. Anything that reads the result right after a
  // keystroke (nav clicks, blurring the input) calls flushUpdate first so
  // it never acts on stale data.
  var UPDATE_DEBOUNCE_MS = 80;
  var updateDebounceTimer = null;

  function scheduleUpdate() {
    if (updateDebounceTimer) clearTimeout(updateDebounceTimer);
    updateDebounceTimer = setTimeout(function () {
      updateDebounceTimer = null;
      update();
    }, UPDATE_DEBOUNCE_MS);
  }

  function flushUpdate() {
    if (!updateDebounceTimer) return;
    clearTimeout(updateDebounceTimer);
    updateDebounceTimer = null;
    update();
  }

  function update() {
    var opts = readOpts();
    saveOpts(opts);

    var src = input.value;
    var result = processText(src, opts);
    output.value = result.output;

    var inLen = [...src].length;
    var outLen = [...result.output].length;
    inCount.textContent = inLen + " chars";
    outCount.textContent = outLen + " chars";

    var removedCount = 0, convertedCount = 0;
    result.changes.forEach(function (c) {
      if (c.type === "removed") removedCount++;
      else if (c.type === "converted") convertedCount++;
    });

    var statsHtml;
    if (inLen === 0) {
      statsHtml = "";
    } else if (removedCount === 0 && convertedCount === 0) {
      statsHtml = "Nothing changed - text is already clean";
    } else {
      var parts = [];
      if (removedCount) parts.push('<span class="removed">' + removedCount + "</span> removed");
      if (convertedCount) parts.push('<span class="converted">' + convertedCount + "</span> converted");
      statsHtml = parts.join(" &middot; ");
    }
    stats.innerHTML = statsHtml;
    // Sticky footer mirrors the same counts for visibility while scrolled
    // down configuring fixes, far below the toolbar `stats` normally lives
    // in - hidden entirely (rather than shown empty) when there's no input.
    stickyFooterCounts.innerHTML = statsHtml;
    stickyFooter.style.display = inLen === 0 ? "none" : "";

    renderDiff(src, result);
    lastInLineChanged = inputLineChanged(src, result.changes);
    lastOutLineChanged = outputLineChanged(result.changes);
    updateGutter(input, inGutter, lastInLineChanged);
    updateGutter(output, outGutter, lastOutLineChanged);
    updateDiffNav();

    // Rebuilding the gutter/highlight content above doesn't move their own
    // scrollTop, but it also doesn't account for the real textarea having
    // scrolled on its own since the last sync (e.g. the browser jumping to
    // show the caret after a paste, or after scheduleUpdate's debounce
    // delay let a 'scroll' event slip by unhandled) - resync explicitly so
    // the overlay never ends up showing a different position than the
    // actual text.
    inGutter.scrollTop = input.scrollTop;
    inHighlight.scrollTop = input.scrollTop;
    outGutter.scrollTop = output.scrollTop;
    outHighlight.scrollTop = output.scrollTop;
  }

  input.addEventListener("input", scheduleUpdate);
  input.addEventListener("blur", flushUpdate);
  input.addEventListener("scroll", function () {
    inGutter.scrollTop = input.scrollTop;
    inHighlight.scrollTop = input.scrollTop;
  });
  output.addEventListener("scroll", function () {
    outGutter.scrollTop = output.scrollTop;
    outHighlight.scrollTop = output.scrollTop;
  });

  diffPrevBtn.addEventListener("click", function () { gotoChange(-1); });
  diffNextBtn.addEventListener("click", function () { gotoChange(1); });

  // Alt+Down/Alt+Up step through changes from anywhere on the page,
  // mirroring the buttons - matches the "next/previous change" shortcut
  // convention used by VS Code's diff editor and similar tools. Neither
  // combination has a standard browser binding, but preventDefault guards
  // against any that do.
  document.addEventListener("keydown", function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowDown") { e.preventDefault(); gotoChange(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); gotoChange(-1); }
  });

  // Clicking a changed line number in either gutter jumps straight to it.
  // Only .gutter-changed spans are targets; clicks elsewhere in the gutter
  // (unchanged numbers, blank continuation rows) are ignored.
  function gutterClickHandler(e) {
    var el = e.target.closest(".gutter-changed");
    if (!el) return;
    jumpToLine(parseInt(el.textContent, 10) - 1);
  }
  inGutter.addEventListener("click", gutterClickHandler);
  outGutter.addEventListener("click", gutterClickHandler);

  // Wrapped row counts depend on the textarea's width, which changes on
  // viewport resize (the grid collapses to one column below 760px) — keep
  // the gutters in sync without spamming layout during the resize.
  var resizeFrame = null;
  window.addEventListener("resize", function () {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(function () {
      updateGutter(input, inGutter, lastInLineChanged);
      updateGutter(output, outGutter, lastOutLineChanged);
    });
  });

  optEls.forEach(function (el) {
    el.addEventListener("change", function () {
      updateAllGroupHeaders();
      update();
    });
  });

  // Clicking a group's header checkbox sets every fix in that group to
  // match it (all on, or all off) - the header itself never ends up
  // indeterminate from its own click, only from an individual toggle
  // inside the group changing independently afterward.
  FIX_GROUPS.forEach(function (group) {
    var header = document.getElementById("groupToggle-" + group);
    header.addEventListener("change", function () {
      var checked = header.checked;
      groupToggles(group).forEach(function (t) { t.el.checked = checked; });
      header.indeterminate = false;
      syncDashTargetEnabled();
      update();
    });
  });

  function syncDashTargetEnabled() {
    optDashTarget.disabled = !optConvertDashes.checked;
  }
  optConvertDashes.addEventListener("change", syncDashTargetEnabled);

  importBtn.addEventListener("click", function () {
    importFile.click();
  });

  importFile.addEventListener("change", function () {
    var file = importFile.files && importFile.files[0];
    if (!file) return;
    file.text()
      .then(function (text) {
        input.value = text;
        update();
        input.focus();
      })
      .catch(function () {
        // Same transient-label feedback pattern as copyBtn/exportBtn below,
        // so a failed read isn't a silent no-op - the input is left as it
        // was, but the user finds out the import didn't happen.
        var old = importBtn.textContent;
        importBtn.textContent = "Import failed";
        setTimeout(function () { importBtn.textContent = old; }, 1500);
      })
      .finally(function () {
        // Reset so choosing the same file again still fires "change".
        importFile.value = "";
      });
  });

  copyBtn.addEventListener("click", function () {
    output.select();
    navigator.clipboard && navigator.clipboard.writeText(output.value);
    var old = copyBtn.textContent;
    copyBtn.textContent = "Copied!";
    setTimeout(function () { copyBtn.textContent = old; }, 1200);
  });

  exportBtn.addEventListener("click", function () {
    if (!output.value.length) return;
    var blob = new Blob([output.value], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = exportFilename(output.value);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    var old = exportBtn.textContent;
    exportBtn.textContent = "Exported!";
    setTimeout(function () { exportBtn.textContent = old; }, 1200);
  });

  clearBtn.addEventListener("click", function () {
    input.value = "";
    update();
    input.focus();
  });

  applySavedOpts();
  syncDashTargetEnabled();
  updateAllGroupHeaders();
  update();
})(typeof window !== "undefined" ? window : this);
