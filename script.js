(function () {
  "use strict";

  var ZERO_WIDTH = new Set([
    0x200B, 0x200C, 0x200D, 0x200E, 0x200F,
    0x2028, 0x2029, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
    0x2060, 0x2061, 0x2062, 0x2063, 0x2064,
    0xFEFF
  ]);

  var QUOTE_MAP = new Map([
    [0x2018, "'"], [0x2019, "'"], [0x201A, ","], [0x201B, "'"],
    [0x201C, '"'], [0x201D, '"'], [0x201E, '"'], [0x201F, '"'],
    [0x2039, "<"], [0x203A, ">"]
  ]);

  // All dash-like code points that "convert dashes" will turn into "-".
  var DASH_SET = new Set([0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212]);
  // Subset kept as-is (legacy behavior) when "convert dashes" is off.
  var CURATED_DASHES = new Set([0x2010, 0x2011, 0x2013]);

  // Hebrew letters, points (niqqud/cantillation) and punctuation, plus the
  // presentation-forms block (ligatures like "ﭏ" and pointed letters).
  var HEBREW_RANGES = [[0x0590, 0x05FF], [0xFB1D, 0xFB4F]];

  var CAT_LABEL = {
    invisible: "invisible/control",
    symbol: "emoji/symbols",
    dash: "dashes",
    accent: "accents",
    quote: "quotes",
    hebrew: "Hebrew"
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
  // before/after diff and the removed/converted summary.
  function processText(text, opts) {
    var src = (opts.normalize && text.normalize) ? text.normalize("NFKC") : text;
    var out = "";
    var changes = [];

    for (var ch of src) {
      var cp = ch.codePointAt(0);

      if (ZERO_WIDTH.has(cp) || isControl(cp)) {
        if (opts.stripInvisible) {
          changes.push({ ch: ch, type: "removed", category: "invisible", replacement: "" });
        } else {
          out += ch;
          changes.push({ ch: ch, type: "kept", category: "invisible", replacement: ch });
        }
        continue;
      }
      if (cp === 0x09 || cp === 0x0A || cp === 0x0D) {
        out += ch;
        changes.push({ ch: ch, type: "kept", category: "whitespace", replacement: ch });
        continue;
      }
      if (cp >= 0x20 && cp <= 0x7E) {
        out += ch;
        changes.push({ ch: ch, type: "kept", category: "ascii", replacement: ch });
        continue;
      }

      if (isHebrew(cp)) {
        if (opts.allowHebrew) {
          out += ch;
          changes.push({ ch: ch, type: "kept", category: "hebrew", replacement: ch });
        } else {
          changes.push({ ch: ch, type: "removed", category: "hebrew", replacement: "" });
        }
        continue;
      }

      if (opts.straightenQuotes && QUOTE_MAP.has(cp)) {
        var rq = QUOTE_MAP.get(cp);
        out += rq;
        changes.push({ ch: ch, type: "converted", category: "quote", replacement: rq });
        continue;
      }

      if (DASH_SET.has(cp)) {
        if (opts.convertDashes) {
          out += "-";
          changes.push({ ch: ch, type: "converted", category: "dash", replacement: "-" });
        } else if (CURATED_DASHES.has(cp)) {
          out += ch;
          changes.push({ ch: ch, type: "kept", category: "dash", replacement: ch });
        } else {
          changes.push({ ch: ch, type: "removed", category: "dash", replacement: "" });
        }
        continue;
      }

      if (opts.foldAccents) {
        var folded = foldAccent(ch);
        if (folded !== null) {
          out += folded;
          changes.push({ ch: ch, type: "converted", category: "accent", replacement: folded });
          continue;
        }
      }

      if (opts.stripEmoji) {
        changes.push({ ch: ch, type: "removed", category: "symbol", replacement: "" });
      } else {
        out += ch;
        changes.push({ ch: ch, type: "kept", category: "symbol", replacement: ch });
      }
    }

    return { output: out, changes: changes, normalizedInput: src };
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

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  var input = document.getElementById("input");
  var output = document.getElementById("output");
  var inGutter = document.getElementById("inGutter");
  var outGutter = document.getElementById("outGutter");
  var inCount = document.getElementById("inCount");
  var outCount = document.getElementById("outCount");
  var stats = document.getElementById("stats");
  var copyBtn = document.getElementById("copyBtn");
  var clearBtn = document.getElementById("clearBtn");

  var diffSummary = document.getElementById("diffSummary");
  var diffCounts = document.getElementById("diffCounts");
  var diffBefore = document.getElementById("diffBefore");
  var diffAfter = document.getElementById("diffAfter");
  var diffNote = document.getElementById("diffNote");

  var optNormalize = document.getElementById("optNormalize");
  var optFoldAccents = document.getElementById("optFoldAccents");
  var optStraightenQuotes = document.getElementById("optStraightenQuotes");
  var optConvertDashes = document.getElementById("optConvertDashes");
  var optStripEmoji = document.getElementById("optStripEmoji");
  var optStripInvisible = document.getElementById("optStripInvisible");
  var optAllowHebrew = document.getElementById("optAllowHebrew");
  var optEls = [optNormalize, optFoldAccents, optStraightenQuotes, optConvertDashes, optStripEmoji, optStripInvisible, optAllowHebrew];

  var OPTS_KEY = "cleartxt-opts";

  function readOpts() {
    return {
      normalize: optNormalize.checked,
      foldAccents: optFoldAccents.checked,
      straightenQuotes: optStraightenQuotes.checked,
      convertDashes: optConvertDashes.checked,
      stripEmoji: optStripEmoji.checked,
      stripInvisible: optStripInvisible.checked,
      allowHebrew: optAllowHebrew.checked
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
      optStripEmoji.checked = saved.stripEmoji !== false;
      optStripInvisible.checked = saved.stripInvisible !== false;
      optAllowHebrew.checked = saved.allowHebrew === true;
    } catch (e) { /* ignore malformed storage */ }
  }

  function updateGutter(ta, gutter) {
    var lines = ta.value.length ? ta.value.split("\n").length : 1;
    var arr = [];
    for (var i = 1; i <= lines; i++) arr.push(i);
    gutter.textContent = arr.join("\n");
  }

  function renderDiff(result) {
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
    if (removedLine) lines.push("Removed — " + removedLine);
    if (convertedLine) lines.push("Converted — " + convertedLine);
    diffCounts.textContent = lines.join("   ·   ");

    if (!changes.length) {
      diffBefore.textContent = "";
      diffAfter.textContent = "";
      diffNote.style.display = "none";
      return;
    }

    if (changes.length > 4000) {
      diffBefore.textContent = result.normalizedInput;
      diffAfter.textContent = result.output;
      diffNote.textContent = "Text is long — highlighting is disabled above, showing plain text instead.";
      diffNote.style.display = "";
      return;
    }

    diffNote.style.display = "none";
    var html = [];
    for (var i = 0; i < changes.length; i++) {
      var c = changes[i];
      var esc = escapeHtml(c.ch);
      if (c.type === "removed") {
        html.push('<span class="rm" title="removed">' + esc + "</span>");
      } else if (c.type === "converted") {
        html.push('<span class="cv" title="→ ' + escapeHtml(c.replacement) + '">' + esc + "</span>");
      } else {
        html.push(esc);
      }
    }
    diffBefore.innerHTML = html.join("");
    diffAfter.textContent = result.output;
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
      stats.innerHTML = "Nothing changed — text is already clean";
    } else {
      var parts = [];
      if (removedCount) parts.push('<span class="removed">' + removedCount + "</span> removed");
      if (convertedCount) parts.push('<span class="converted">' + convertedCount + "</span> converted");
      stats.innerHTML = parts.join(" &middot; ");
    }

    renderDiff(result);
    updateGutter(input, inGutter);
    updateGutter(output, outGutter);
  }

  input.addEventListener("input", update);
  input.addEventListener("scroll", function () { inGutter.scrollTop = input.scrollTop; });
  output.addEventListener("scroll", function () { outGutter.scrollTop = output.scrollTop; });

  optEls.forEach(function (el) { el.addEventListener("change", update); });

  copyBtn.addEventListener("click", function () {
    output.select();
    navigator.clipboard && navigator.clipboard.writeText(output.value);
    var old = copyBtn.textContent;
    copyBtn.textContent = "Copied!";
    setTimeout(function () { copyBtn.textContent = old; }, 1200);
  });

  clearBtn.addEventListener("click", function () {
    input.value = "";
    update();
    input.focus();
  });

  applySavedOpts();
  update();
})();
