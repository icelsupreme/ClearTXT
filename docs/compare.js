(function () {
  "use strict";

  var fileA = document.getElementById("fileA");
  var fileB = document.getElementById("fileB");
  var gutterA = document.getElementById("gutterA");
  var gutterB = document.getElementById("gutterB");
  var highlightA = document.getElementById("highlightA");
  var highlightB = document.getElementById("highlightB");
  var countA = document.getElementById("countA");
  var countB = document.getElementById("countB");

  var importBtnA = document.getElementById("importBtnA");
  var importFileA = document.getElementById("importFileA");
  var clearBtnA = document.getElementById("clearBtnA");
  var importBtnB = document.getElementById("importBtnB");
  var importFileB = document.getElementById("importFileB");
  var clearBtnB = document.getElementById("clearBtnB");

  var diffNav = document.getElementById("diffNav");
  var diffPrevBtn = document.getElementById("diffPrevBtn");
  var diffNextBtn = document.getElementById("diffNextBtn");
  var diffNavCount = document.getElementById("diffNavCount");
  var diffSummary = document.getElementById("diffSummary");
  var diffNote = document.getElementById("diffNote");

  var reportGrid = document.getElementById("reportGrid");
  var reportKeepMarkdown = document.getElementById("reportKeepMarkdown");
  var applyCleanupToggle = document.getElementById("applyCleanupToggle");
  var fixListEl = document.getElementById("fixList");

  // The two panes' own canonical text - what was actually typed, pasted, or
  // imported. Kept separately from fileA.value/fileB.value because when
  // "Apply cleanup before comparing" is on, the boxes display the CLEANED
  // result instead (so the highlight overlay - which must be character-for-
  // character identical to what the textarea shows, same requirement as the
  // main page's own input/output highlighting - always has something real
  // to align against). Re-deriving the displayed text from these on every
  // update() means switching the toggle off is always fully reversible,
  // instead of the raw text being lost once cleanup has overwritten it.
  var rawA = "";
  var rawB = "";

  var APPLY_CLEANUP_KEY = "cleartxt-compare-applycleanup";
  var KEEP_MARKDOWN_KEY = "cleartxt-compare-keepmarkdown";

  function loadBool(key, def) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? def : raw === "true";
    } catch (e) { return def; }
  }
  function saveBool(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) { /* ignore */ }
  }

  // Hidden mirror element used to measure how many visual rows each logical
  // line wraps to - same technique (and same reasoning) as script.js's own
  // ruler for the main page's input/output boxes, duplicated here rather
  // than shared since it closes over this page's own two textareas instead
  // of a single fixed pair.
  var ruler = document.createElement("div");
  ruler.style.position = "absolute";
  ruler.style.visibility = "hidden";
  ruler.style.top = "0";
  ruler.style.left = "-9999px";
  ruler.style.height = "auto";
  document.body.appendChild(ruler);

  function countWrappedRows(ta, logicalLines) {
    var cs = getComputedStyle(ta);
    var padLeft = parseFloat(cs.paddingLeft) || 0;
    var padRight = parseFloat(cs.paddingRight) || 0;
    ruler.style.width = Math.max(0, ta.clientWidth - padLeft - padRight) + "px";
    ruler.style.padding = "0";
    ruler.style.fontFamily = cs.fontFamily;
    ruler.style.fontSize = cs.fontSize;
    ruler.style.fontWeight = cs.fontWeight;
    ruler.style.fontStyle = cs.fontStyle;
    ruler.style.letterSpacing = cs.letterSpacing;
    ruler.style.lineHeight = cs.lineHeight;

    var lineHeight = parseFloat(cs.lineHeight);
    if (!lineHeight || isNaN(lineHeight)) lineHeight = parseFloat(cs.fontSize) * 1.2;

    var frag = document.createDocumentFragment();
    var divs = new Array(logicalLines.length);
    for (var i = 0; i < logicalLines.length; i++) {
      var div = document.createElement("div");
      div.style.whiteSpace = "pre-wrap";
      div.style.wordBreak = "break-word";
      div.textContent = logicalLines[i].length ? logicalLines[i] : "​";
      frag.appendChild(div);
      divs[i] = div;
    }
    ruler.textContent = "";
    ruler.appendChild(frag);

    var counts = new Array(divs.length);
    for (var j = 0; j < divs.length; j++) {
      counts[j] = Math.max(1, Math.round(divs[j].offsetHeight / lineHeight));
    }
    return counts;
  }

  function updateGutter(ta, gutter, lineChanged) {
    var logicalLines = ta.value.length ? ta.value.split("\n") : [""];

    function numHtml(n) {
      var s = String(n + 1);
      return (lineChanged && lineChanged[n]) ? '<span class="gutter-changed">' + s + "</span>" : s;
    }

    var plain = [];
    for (var p = 0; p < logicalLines.length; p++) plain.push(numHtml(p));
    gutter.innerHTML = plain.join("\n");

    var rowCounts = countWrappedRows(ta, logicalLines);
    var out = [];
    for (var n = 0; n < rowCounts.length; n++) {
      out.push(numHtml(n));
      for (var r = 1; r < rowCounts[n]; r++) out.push("");
    }
    gutter.innerHTML = out.join("\n");
  }

  function scrollLineIntoView(ta, gutter, hl, lineNo) {
    var logicalLines = ta.value.length ? ta.value.split("\n") : [""];
    if (lineNo < 0 || lineNo >= logicalLines.length) return;

    var cs = getComputedStyle(ta);
    var lineHeight = parseFloat(cs.lineHeight);
    if (!lineHeight || isNaN(lineHeight)) lineHeight = parseFloat(cs.fontSize) * 1.2;

    var rowCounts = countWrappedRows(ta, logicalLines);
    var rowsBefore = 0;
    for (var i = 0; i < lineNo; i++) rowsBefore += rowCounts[i];

    var targetTop = rowsBefore * lineHeight;
    var targetCenter = targetTop - (ta.clientHeight / 2) + (lineHeight / 2);
    var maxScroll = Math.max(0, ta.scrollHeight - ta.clientHeight);
    ta.scrollTop = Math.max(0, Math.min(maxScroll, targetCenter));
    gutter.scrollTop = ta.scrollTop;
    hl.scrollTop = ta.scrollTop;
  }

  // Sets `ta`'s value only when it actually changed - reassigning a
  // textarea's .value to an identical string still resets its caret in some
  // browsers, which would otherwise jitter the cursor on every keystroke
  // even when nothing this function does actually needs to change anything.
  // The caret position itself is a best-effort clamp (same character
  // offset from the start, capped to the new length) rather than a true
  // "where did my edit land" tracker - cleanup can shift text anywhere in
  // the string, not just at the edit point, so this can't be exact, but it
  // keeps the cursor roughly in place instead of jumping to the very end.
  function syncPaneValue(ta, newValue) {
    if (ta.value === newValue) return;
    var pos = Math.min(ta.selectionStart, newValue.length);
    ta.value = newValue;
    try { ta.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
  }

  function markerSpan(cls, text) {
    return '<span class="' + cls + '">' + ClearTXT.escapeHtml(text) + "</span>";
  }

  // Builds one side's highlight-overlay HTML from the shared diff rows
  // (see ClearTXT.diffLines). Only rows that actually have a line on this
  // side are rendered, in row order - since every one of that side's line
  // indices appears in exactly one row, in increasing order, concatenating
  // them reproduces that side's full text exactly, line for line, keeping
  // this overlay aligned with the real textarea behind it even though File
  // A and File B are two independent documents that don't otherwise share
  // line structure.
  function buildSideHighlight(rows, side) {
    var idxKey = side === "a" ? "aIndex" : "bIndex";
    var segKey = side === "a" ? "aSegs" : "bSegs";
    var wholeClass = side === "a" ? "rm" : "cv";
    var lines = side === "a" ? lastResult.aLines : lastResult.bLines;
    var html = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var idx = row[idxKey];
      if (idx === null) continue;
      var lineText = lines[idx];

      if (row.type === "equal") {
        html.push('<div class="line">' + ClearTXT.escapeHtml(lineText) + "</div>");
        continue;
      }
      if (row.type === "modified") {
        var segs = row.charDiff[segKey];
        var inner = "";
        for (var s = 0; s < segs.length; s++) {
          inner += segs[s].changed ? markerSpan(wholeClass, segs[s].text) : ClearTXT.escapeHtml(segs[s].text);
        }
        html.push('<div class="line line-changed">' + inner + "</div>");
        continue;
      }
      // "removed" (side a) / "added" (side b): the whole line only exists
      // on this side, so it's marked changed in full.
      html.push('<div class="line line-changed">' + (lineText.length ? markerSpan(wholeClass, lineText) : "") + "</div>");
    }
    return html.join("");
  }

  // Per-line "did this line differ" flags for one side, used to tint the
  // matching gutter number - built the same "every index appears exactly
  // once" way buildSideHighlight is.
  function sideLineChangedFlags(rows, idxKey) {
    var flags = [];
    rows.forEach(function (row) {
      var idx = row[idxKey];
      if (idx === null) return;
      flags[idx] = row.type !== "equal";
    });
    return flags;
  }

  var lastResult = null;
  var lastFlagsA = null;
  var lastFlagsB = null;
  var diffNavRows = [];
  var diffNavIndex = -1;

  function renderDiffSummary(result) {
    var removed = 0, added = 0, modified = 0;
    result.rows.forEach(function (row) {
      if (row.type === "removed") removed++;
      else if (row.type === "added") added++;
      else if (row.type === "modified") modified++;
    });
    var bothEmpty = result.aLines.length === 1 && result.aLines[0] === "" &&
      result.bLines.length === 1 && result.bLines[0] === "";
    if (bothEmpty) {
      diffSummary.textContent = "";
    } else if (removed + added + modified === 0) {
      diffSummary.textContent = "(no differences)";
    } else {
      var parts = [];
      if (removed) parts.push(removed + (removed === 1 ? " line" : " lines") + " only in A");
      if (added) parts.push(added + (added === 1 ? " line" : " lines") + " only in B");
      if (modified) parts.push(modified + (modified === 1 ? " line" : " lines") + " modified");
      diffSummary.textContent = "(" + parts.join(", ") + ")";
    }

    if (result.truncated) {
      diffNote.textContent = "These files are too large for a detailed line-by-line diff, so they're shown as fully different rather than risk a false match.";
      diffNote.style.display = "";
    } else {
      diffNote.style.display = "none";
    }
  }

  function renderHighlights(result) {
    highlightA.innerHTML = buildSideHighlight(result.rows, "a");
    highlightB.innerHTML = buildSideHighlight(result.rows, "b");
    lastFlagsA = sideLineChangedFlags(result.rows, "aIndex");
    lastFlagsB = sideLineChangedFlags(result.rows, "bIndex");
    updateGutter(fileA, gutterA, lastFlagsA);
    updateGutter(fileB, gutterB, lastFlagsB);
  }

  function updateDiffNav(result) {
    diffNavRows = result.rows.filter(function (r) { return r.type !== "equal"; });
    diffNavIndex = -1;
    if (!diffNavRows.length) {
      diffNav.style.display = "none";
      return;
    }
    diffNav.style.display = "";
    diffNavCount.textContent = diffNavRows.length + (diffNavRows.length === 1 ? " difference" : " differences");
  }

  function clearCurrentDiffLine() {
    [highlightA, highlightB].forEach(function (hl) {
      var el = hl.querySelector(".line-current");
      if (el) el.classList.remove("line-current");
    });
  }

  function markCurrentDiffLine(hl, lineNo) {
    var el = hl.children[lineNo];
    if (el) el.classList.add("line-current");
  }

  // Jumps to position `idx` within diffNavRows (wrapping into range),
  // scrolling/marking whichever side(s) that row actually has a line on -
  // a pure add/remove row only exists on one side, so the other pane is
  // left where it is rather than jumping to a misleading nearby line.
  function jumpToNavIndex(idx) {
    if (!diffNavRows.length) return;
    diffNavIndex = ((idx % diffNavRows.length) + diffNavRows.length) % diffNavRows.length;
    var row = diffNavRows[diffNavIndex];

    clearCurrentDiffLine();

    if (row.aIndex !== null) {
      scrollLineIntoView(fileA, gutterA, highlightA, row.aIndex);
      markCurrentDiffLine(highlightA, row.aIndex);
    }
    if (row.bIndex !== null) {
      scrollLineIntoView(fileB, gutterB, highlightB, row.bIndex);
      markCurrentDiffLine(highlightB, row.bIndex);
    }

    diffNavCount.textContent = (diffNavIndex + 1) + " / " + diffNavRows.length;
  }

  function gotoChange(delta) {
    flushUpdate();
    if (!diffNavRows.length) return;
    jumpToNavIndex(diffNavIndex + delta);
  }

  // Lets clicking a changed line number in either gutter jump straight to
  // it, same as the main page's own gutter-click-to-jump.
  function jumpToLineOnSide(side, lineNo) {
    flushUpdate();
    var idxKey = side === "a" ? "aIndex" : "bIndex";
    var idx = diffNavRows.findIndex(function (r) { return r[idxKey] === lineNo; });
    if (idx !== -1) jumpToNavIndex(idx);
  }

  function deltaText(delta, unit) {
    var cls = delta > 0 ? "converted" : (delta < 0 ? "removed" : "");
    var sign = delta > 0 ? "+" : "";
    return '<span class="' + cls + '">' + sign + delta.toLocaleString() + " " + unit + "</span>";
  }

  function reportTile(label, big, subHtml) {
    return '<div class="reportStat"><h3>' + ClearTXT.escapeHtml(label) + '</h3>' +
      '<div class="reportBig">' + ClearTXT.escapeHtml(big) + "</div>" +
      '<div class="reportSub">' + subHtml + "</div></div>";
  }

  // Reads straight off whatever's currently displayed in the two boxes
  // (post-cleanup if that toggle is on) - doesn't need the line-level diff
  // at all, so a change to just this toggle re-renders the report alone
  // without re-running the (more expensive) line/char diff above it.
  function renderReport(aText, bText) {
    var keepMarkdown = reportKeepMarkdown.checked;
    saveBool(KEEP_MARKDOWN_KEY, keepMarkdown);

    var pct = ClearTXT.textSimilarityPercent(aText, bText, keepMarkdown);
    var diffPct = 100 - pct;
    var charsA = ClearTXT.charCount(aText, keepMarkdown);
    var charsB = ClearTXT.charCount(bText, keepMarkdown);
    var wordsA = ClearTXT.wordCount(aText, keepMarkdown);
    var wordsB = ClearTXT.wordCount(bText, keepMarkdown);

    reportGrid.innerHTML = [
      reportTile("Percentage diff", diffPct.toFixed(1) + "%", pct.toFixed(1) + "% similar"),
      reportTile("Characters", charsA.toLocaleString() + " → " + charsB.toLocaleString(), deltaText(charsB - charsA, "chars")),
      reportTile("Words", wordsA.toLocaleString() + " → " + wordsB.toLocaleString(), deltaText(wordsB - wordsA, "words"))
    ].join("");
  }

  function updateFixListEnabled(applyCleanup) {
    fixListEl.classList.toggle("fixListDisabled", !applyCleanup);
  }

  function update() {
    var opts = fixOptions.readOpts();
    fixOptions.saveOpts(opts);

    var applyCleanup = applyCleanupToggle.checked;
    saveBool(APPLY_CLEANUP_KEY, applyCleanup);
    updateFixListEnabled(applyCleanup);

    var displayA = applyCleanup ? ClearTXT.processText(rawA, opts).output : rawA;
    var displayB = applyCleanup ? ClearTXT.processText(rawB, opts).output : rawB;
    syncPaneValue(fileA, displayA);
    syncPaneValue(fileB, displayB);

    var result = ClearTXT.diffLines(displayA, displayB);
    result.rows.forEach(function (row) {
      if (row.type === "modified") {
        row.charDiff = ClearTXT.charDiffSegments(result.aLines[row.aIndex], result.bLines[row.bIndex]);
      }
    });
    lastResult = result;

    countA.textContent = Array.from(displayA).length + " chars";
    countB.textContent = Array.from(displayB).length + " chars";

    renderDiffSummary(result);
    renderHighlights(result);
    renderReport(displayA, displayB);
    updateDiffNav(result);

    gutterA.scrollTop = fileA.scrollTop;
    highlightA.scrollTop = fileA.scrollTop;
    gutterB.scrollTop = fileB.scrollTop;
    highlightB.scrollTop = fileB.scrollTop;
  }

  // Same debounce-on-input/flush-on-blur-or-nav pattern as the main page's
  // own update(), so fast typing/pasting doesn't re-run the full diff
  // pipeline (including the wrapped-row DOM measurements) on every single
  // keystroke.
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

  fileA.addEventListener("input", function () { rawA = fileA.value; scheduleUpdate(); });
  fileB.addEventListener("input", function () { rawB = fileB.value; scheduleUpdate(); });
  fileA.addEventListener("blur", flushUpdate);
  fileB.addEventListener("blur", flushUpdate);

  fileA.addEventListener("scroll", function () {
    gutterA.scrollTop = fileA.scrollTop;
    highlightA.scrollTop = fileA.scrollTop;
  });
  fileB.addEventListener("scroll", function () {
    gutterB.scrollTop = fileB.scrollTop;
    highlightB.scrollTop = fileB.scrollTop;
  });

  diffPrevBtn.addEventListener("click", function () { gotoChange(-1); });
  diffNextBtn.addEventListener("click", function () { gotoChange(1); });

  document.addEventListener("keydown", function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowDown") { e.preventDefault(); gotoChange(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); gotoChange(-1); }
  });

  function gutterClickHandler(side) {
    return function (e) {
      var el = e.target.closest(".gutter-changed");
      if (!el) return;
      jumpToLineOnSide(side, parseInt(el.textContent, 10) - 1);
    };
  }
  gutterA.addEventListener("click", gutterClickHandler("a"));
  gutterB.addEventListener("click", gutterClickHandler("b"));

  var resizeFrame = null;
  window.addEventListener("resize", function () {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(function () {
      updateGutter(fileA, gutterA, lastFlagsA);
      updateGutter(fileB, gutterB, lastFlagsB);
    });
  });

  function wireImport(btn, fileInput, ta, setRaw) {
    btn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      file.text()
        .then(function (text) {
          setRaw(text);
          update();
          ta.focus();
        })
        .catch(function () {
          ClearTXT.flashButtonLabel(btn, "Import failed");
        })
        .finally(function () {
          fileInput.value = "";
        });
    });
  }
  wireImport(importBtnA, importFileA, fileA, function (text) { rawA = text; });
  wireImport(importBtnB, importFileB, fileB, function (text) { rawB = text; });

  clearBtnA.addEventListener("click", function () { rawA = ""; update(); fileA.focus(); });
  clearBtnB.addEventListener("click", function () { rawB = ""; update(); fileB.focus(); });

  applyCleanupToggle.addEventListener("change", update);
  reportKeepMarkdown.addEventListener("change", function () {
    renderReport(fileA.value, fileB.value);
  });

  var fixOptions = ClearTXT.createFixOptionsController();

  applyCleanupToggle.checked = loadBool(APPLY_CLEANUP_KEY, true);
  reportKeepMarkdown.checked = loadBool(KEEP_MARKDOWN_KEY, true);

  fixOptions.init(update);
  update();
})();
