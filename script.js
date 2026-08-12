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
    tab: "tabs",
    linebreak: "line breaks",
    paragraph: "paragraph breaks",
    space: "extra spaces"
  };

  function isControl(cp) {
    return (cp <= 0x1F && cp !== 0x09 && cp !== 0x0A && cp !== 0x0D) || cp === 0x7F;
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

  // Builds the highlight-overlay HTML for the INPUT box. This sits in a
  // layer directly behind the live, editable textarea: its text is fully
  // transparent (see CSS), so only the background/ring effects on the
  // rm/cv/iv spans show through, appearing to highlight the real text
  // above it. That only works if this HTML has EXACTLY the same
  // characters, in the same order, as the textarea's own raw value — so
  // this builds off `rawText` (not the NFKC-normalized `changes[i].ch`)
  // and groups consecutive rm/cv runs into single spans (perf: fewer DOM
  // nodes), while invisible characters always get their own span since
  // each needs its own tooltip. `changes` must be `rawText`'s own
  // per-character pipeline result — if normalization changed the
  // character count (rare: mainly typographic ligatures), the 1:1
  // assumption breaks and this returns null; the caller falls back to no
  // overlay for that render rather than show misaligned highlights.
  function inputHighlightHtml(rawText, changes, maxChars) {
    var rawChars = [...rawText];
    var n = rawChars.length;
    if (n !== changes.length) return null;
    var budget = maxChars == null ? n : Math.min(maxChars, n);

    var html = [];
    var i = 0;
    while (i < budget) {
      var c = changes[i];
      if (c.category === "invisible") {
        var info = invisibleInfo(rawChars[i].codePointAt(0));
        var cls = "iv" + (c.type === "removed" ? " rm" : "");
        var title = info.name + (c.type === "removed" ? " (removed)" : " (kept)");
        html.push(markerSpan(cls, rawChars[i], title));
        i++;
        continue;
      }
      if (c.type === "kept") {
        html.push(escapeHtml(rawChars[i]));
        i++;
        continue;
      }
      var type = c.type;
      var j = i;
      var buf = "";
      while (j < budget && changes[j].type === type && changes[j].category !== "invisible") {
        buf += rawChars[j];
        j++;
      }
      html.push(markerSpan(type === "removed" ? "rm" : "cv", buf));
      i = j;
    }
    if (i < n) html.push(escapeHtml(rawChars.slice(i).join("")));
    return html.join("");
  }

  // Same idea for the OUTPUT box. Output only ever contains non-removed
  // segments, and output.value is always exactly their replacements
  // joined together, so this is inherently 1:1 aligned (no null case).
  function outputHighlightHtml(changes, maxChars) {
    var kept = [];
    for (var k = 0; k < changes.length; k++) {
      if (changes[k].type !== "removed") kept.push(changes[k]);
    }
    var n = kept.length;
    var budget = maxChars == null ? n : Math.min(maxChars, n);

    var html = [];
    var i = 0;
    while (i < budget) {
      var c = kept[i];
      if (c.category === "invisible") {
        var info = invisibleInfo(c.replacement.codePointAt(0));
        html.push(markerSpan("iv", c.replacement, info.name + " (kept)"));
        i++;
        continue;
      }
      if (c.type === "kept") {
        html.push(escapeHtml(c.replacement));
        i++;
        continue;
      }
      var j = i;
      var buf = "";
      while (j < budget && kept[j].type === "converted" && kept[j].category !== "invisible") {
        buf += kept[j].replacement;
        j++;
      }
      html.push(markerSpan("cv", buf));
      i = j;
    }
    if (i < n) {
      var rest = "";
      for (var m = i; m < n; m++) rest += kept[m].replacement;
      html.push(escapeHtml(rest));
    }
    return html.join("");
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
  var importBtn = document.getElementById("importBtn");
  var importFile = document.getElementById("importFile");
  var copyBtn = document.getElementById("copyBtn");
  var exportBtn = document.getElementById("exportBtn");
  var clearBtn = document.getElementById("clearBtn");

  var diffSummary = document.getElementById("diffSummary");
  var diffCounts = document.getElementById("diffCounts");
  var diffNote = document.getElementById("diffNote");

  var optNormalize = document.getElementById("optNormalize");
  var optFoldAccents = document.getElementById("optFoldAccents");
  var optStraightenQuotes = document.getElementById("optStraightenQuotes");
  var optConvertDashes = document.getElementById("optConvertDashes");
  var optDashTarget = document.getElementById("optDashTarget");
  var optStripEmoji = document.getElementById("optStripEmoji");
  var optStripInvisible = document.getElementById("optStripInvisible");
  var optAllowHebrew = document.getElementById("optAllowHebrew");
  var optRemoveLineBreaks = document.getElementById("optRemoveLineBreaks");
  var optRemoveParagraphBreaks = document.getElementById("optRemoveParagraphBreaks");
  var optRemoveExtraSpaces = document.getElementById("optRemoveExtraSpaces");
  var optRemoveTabs = document.getElementById("optRemoveTabs");
  var optEls = [
    optNormalize, optFoldAccents, optStraightenQuotes, optConvertDashes, optDashTarget, optStripEmoji, optStripInvisible, optAllowHebrew,
    optRemoveLineBreaks, optRemoveParagraphBreaks, optRemoveExtraSpaces, optRemoveTabs
  ];

  var OPTS_KEY = "cleartxt-opts";

  function readOpts() {
    return {
      normalize: optNormalize.checked,
      foldAccents: optFoldAccents.checked,
      straightenQuotes: optStraightenQuotes.checked,
      convertDashes: optConvertDashes.checked,
      dashTarget: optDashTarget.value,
      stripEmoji: optStripEmoji.checked,
      stripInvisible: optStripInvisible.checked,
      allowHebrew: optAllowHebrew.checked,
      removeLineBreaks: optRemoveLineBreaks.checked,
      removeParagraphBreaks: optRemoveParagraphBreaks.checked,
      removeExtraSpaces: optRemoveExtraSpaces.checked,
      removeTabs: optRemoveTabs.checked
    };
  }

  function saveOpts(opts) {
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch (e) { /* ignore */ }
  }

  function applySavedOpts() {
    try {
      var raw = localStorage.getItem(OPTS_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      optNormalize.checked = saved.normalize !== false;
      optFoldAccents.checked = saved.foldAccents !== false;
      optStraightenQuotes.checked = saved.straightenQuotes !== false;
      optConvertDashes.checked = saved.convertDashes !== false;
      optDashTarget.value = saved.dashTarget === "–" ? "–" : "-";
      optStripEmoji.checked = saved.stripEmoji !== false;
      optStripInvisible.checked = saved.stripInvisible !== false;
      optAllowHebrew.checked = saved.allowHebrew === true;
      optRemoveLineBreaks.checked = saved.removeLineBreaks === true;
      optRemoveParagraphBreaks.checked = saved.removeParagraphBreaks === true;
      optRemoveExtraSpaces.checked = saved.removeExtraSpaces !== false;
      optRemoveTabs.checked = saved.removeTabs === true;
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

  function updateGutter(ta, gutter) {
    var logicalLines = ta.value.length ? ta.value.split("\n") : [""];

    if (logicalLines.length > WRAP_MEASURE_LIMIT) {
      var arr = [];
      for (var i = 1; i <= logicalLines.length; i++) arr.push(i);
      gutter.textContent = arr.join("\n");
      return;
    }

    var rowCounts = countWrappedRows(ta, logicalLines);
    var out = [];
    for (var n = 0; n < rowCounts.length; n++) {
      out.push(String(n + 1));
      for (var r = 1; r < rowCounts[n]; r++) out.push("");
    }
    gutter.textContent = out.join("\n");
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

    if (inLen === 0) {
      stats.innerHTML = "";
    } else if (removedCount === 0 && convertedCount === 0) {
      stats.innerHTML = "Nothing changed - text is already clean";
    } else {
      var parts = [];
      if (removedCount) parts.push('<span class="removed">' + removedCount + "</span> removed");
      if (convertedCount) parts.push('<span class="converted">' + convertedCount + "</span> converted");
      stats.innerHTML = parts.join(" &middot; ");
    }

    renderDiff(src, result);
    updateGutter(input, inGutter);
    updateGutter(output, outGutter);
  }

  input.addEventListener("input", update);
  input.addEventListener("scroll", function () {
    inGutter.scrollTop = input.scrollTop;
    inHighlight.scrollTop = input.scrollTop;
  });
  output.addEventListener("scroll", function () {
    outGutter.scrollTop = output.scrollTop;
    outHighlight.scrollTop = output.scrollTop;
  });

  // Wrapped row counts depend on the textarea's width, which changes on
  // viewport resize (the grid collapses to one column below 760px) — keep
  // the gutters in sync without spamming layout during the resize.
  var resizeFrame = null;
  window.addEventListener("resize", function () {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(function () {
      updateGutter(input, inGutter);
      updateGutter(output, outGutter);
    });
  });

  optEls.forEach(function (el) { el.addEventListener("change", update); });

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
        // No toast/notification system to surface a read failure through;
        // the input is simply left as it was.
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
  update();
})(typeof window !== "undefined" ? window : this);
