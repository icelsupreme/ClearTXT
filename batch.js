(function () {
  "use strict";

  // Minimal ZIP writer (no compression - the "stored" method) so "Download
  // all" can trigger a single Save dialog instead of one per file. Kept
  // hand-written rather than pulling in a library, matching the rest of
  // the app's zero-dependency approach; correctness over file size, since
  // the inputs here are plain text.
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(n) {
    var b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, n, true);
    return b;
  }

  function u32(n) {
    var b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return b;
  }

  function concatBytes(parts) {
    var total = 0;
    for (var i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total);
    var offset = 0;
    for (var j = 0; j < parts.length; j++) {
      out.set(parts[j], offset);
      offset += parts[j].length;
    }
    return out;
  }

  // MS-DOS date/time format used by the ZIP local/central headers - not
  // worth the file's real mtime (browsers don't expose it reliably anyway
  // for File objects read via .text()), so every entry just gets "now".
  function dosDateTime(date) {
    var time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1F);
    var day = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
    return { time: time, date: day };
  }

  // Fixed values from the ZIP file format spec (PKWARE APPNOTE.TXT), named
  // here instead of left as inline hex/magic numbers in buildZip below.
  var ZIP_LOCAL_FILE_HEADER_SIG = 0x04034b50;
  var ZIP_CENTRAL_DIR_HEADER_SIG = 0x02014b50;
  var ZIP_END_OF_CENTRAL_DIR_SIG = 0x06054b50;
  var ZIP_VERSION = 20;              // "version needed to extract" / "version made by" - 2.0, covers everything this writer uses
  var ZIP_FLAG_UTF8_NAME = 0x0800;   // general purpose bit 11: file name is UTF-8
  var ZIP_METHOD_STORED = 0;         // compression method: none (stored as-is)

  // Builds a single valid, uncompressed ZIP archive from `entries`
  // ([{ name, data: Uint8Array }]) and returns it as a Uint8Array.
  function buildZip(entries) {
    var dt = dosDateTime(new Date());
    var localAndData = [];
    var centralParts = [];
    var offset = 0;

    entries.forEach(function (entry) {
      var nameBytes = new TextEncoder().encode(entry.name);
      var data = entry.data;
      var crc = crc32(data);
      var localOffset = offset;

      var local = concatBytes([
        u32(ZIP_LOCAL_FILE_HEADER_SIG), u16(ZIP_VERSION), u16(ZIP_FLAG_UTF8_NAME), u16(ZIP_METHOD_STORED),
        u16(dt.time), u16(dt.date), u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), nameBytes
      ]);
      localAndData.push(local, data);
      offset += local.length + data.length;

      centralParts.push(concatBytes([
        u32(ZIP_CENTRAL_DIR_HEADER_SIG), u16(ZIP_VERSION), u16(ZIP_VERSION), u16(ZIP_FLAG_UTF8_NAME), u16(ZIP_METHOD_STORED),
        u16(dt.time), u16(dt.date), u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(localOffset), nameBytes
      ]));
    });

    var centralDir = concatBytes(centralParts);
    var end = concatBytes([
      u32(ZIP_END_OF_CENTRAL_DIR_SIG), u16(0), u16(0), u16(entries.length), u16(entries.length),
      u32(centralDir.length), u32(offset), u16(0)
    ]);

    return concatBytes(localAndData.concat([centralDir, end]));
  }

  function timestamp(d) {
    function pad2(n) { return n < 10 ? "0" + n : "" + n; }
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      "-" + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }

  var dropzone = document.getElementById("dropzone");
  var chooseFilesBtn = document.getElementById("chooseFilesBtn");
  var filesInput = document.getElementById("filesInput");
  var batchPanel = document.getElementById("batchPanel");
  var batchList = document.getElementById("batchList");
  var batchSummary = document.getElementById("batchSummary");
  var downloadAllBtn = document.getElementById("downloadAllBtn");
  var clearAllBtn = document.getElementById("clearAllBtn");

  // One entry per added file: { id, name, size, rawText, result, status }.
  // `result` is the latest processText() output (null until read/processed
  // succeeds); `status` is "ready" or "error" (an unreadable file, e.g.
  // picked mid-move/delete on disk). `rawText` is kept (not just the
  // filtered result) so toggling a fix re-cleans every file already added,
  // the same way editing the input box live re-filters on the main page.
  var files = [];
  var nextId = 1;

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    var units = ["KB", "MB", "GB"];
    var val = bytes;
    for (var i = 0; i < units.length; i++) {
      val /= 1024;
      if (val < 1024 || i === units.length - 1) return val.toFixed(val < 10 ? 1 : 0) + " " + units[i];
    }
  }

  function reprocessEntry(entry, opts) {
    if (entry.status === "error") return;
    entry.result = ClearTXT.processText(entry.rawText, opts);
  }

  function reprocessAll() {
    var opts = fixOptions.readOpts();
    fixOptions.saveOpts(opts);
    files.forEach(function (entry) { reprocessEntry(entry, opts); });
    render();
  }

  function addFiles(fileList) {
    var opts = fixOptions.readOpts();
    Array.prototype.forEach.call(fileList, function (file) {
      var entry = { id: nextId++, name: file.name, size: file.size, rawText: "", result: null, status: "ready" };
      files.push(entry);
      file.text()
        .then(function (text) {
          entry.rawText = text;
          reprocessEntry(entry, opts);
          render();
        })
        .catch(function () {
          entry.status = "error";
          render();
        });
    });
    render();
  }

  function removeEntry(id) {
    files = files.filter(function (f) { return f.id !== id; });
    render();
  }

  // Filesystem-safe basename for wherever a file's name is used as an
  // actual path component - a zip entry name, or the `download` attribute
  // (browsers sanitize the latter themselves, but this doesn't rely on
  // that either). A real OS file picker can't produce "/" or ".." in a
  // name, but a File object handed to the page via drag-and-drop has no
  // such restriction (e.g. one built by another page's script and dropped
  // in), so a name can't be trusted to already be a safe path component -
  // without this, a maliciously-named "file" could zip-slip its way
  // outside the intended folder when a less careful unzip tool extracts
  // the downloaded archive. Display elsewhere still uses the raw name
  // (already HTML-escaped there) - only this path-writing boundary needs
  // the sanitized version.
  // Comfortably under both common filesystem path-component limits and
  // the ZIP format's 16-bit "file name length" field (65535 BYTES) - a
  // character-count cap this small can't get anywhere near that field
  // overflowing even at 4 bytes/char, which a plain .slice() can't
  // otherwise guarantee since it truncates by UTF-16 code unit, not by
  // the resulting name's UTF-8 byte length. Without this, a synthetic
  // File (see the comment above) with a ~70000-character `.name` would
  // silently wrap that 16-bit field (DataView's setUint16 wraps rather
  // than throwing on overflow), writing a length that doesn't match the
  // name bytes actually present - a malformed archive that could confuse
  // less careful unzip parsers.
  var ENTRY_NAME_MAX_LENGTH = 255;

  function safeEntryName(name) {
    var base = name.split(/[\\/]/).pop() || "";
    // eslint-disable-next-line no-control-regex -- intentionally stripping control chars
    base = base.replace(/[\x00-\x1F]/g, "").slice(0, ENTRY_NAME_MAX_LENGTH);
    if (base === "" || base === "." || base === "..") base = "file";
    return base;
  }

  // Same transient-label pattern as script.js's Copy/Export buttons
  // ("Copied!"/"Exported!") - without this, clicking Download gave no
  // acknowledgement at all that anything happened.
  var BUTTON_FEEDBACK_MS = 1200;

  function flashButtonLabel(btn, text) {
    if (!btn) return;
    var label = btn.querySelector(".btnLabel") || btn;
    var old = label.textContent;
    label.textContent = text;
    setTimeout(function () { label.textContent = old; }, BUTTON_FEEDBACK_MS);
  }

  function downloadEntry(entry, btn) {
    if (!entry.result) return;
    var blob = new Blob([entry.result.output], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = safeEntryName(entry.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flashButtonLabel(btn, "Downloaded!");
  }

  function escapeHtml(s) { return ClearTXT.escapeHtml(s); }

  function rowStatsHtml(entry) {
    if (entry.status === "error") return '<span class="error">Couldn\'t read this file</span>';
    if (!entry.result) return "Reading…";
    var inLen = [...entry.rawText].length;
    var outLen = [...entry.result.output].length;
    var removed = 0, converted = 0;
    entry.result.changes.forEach(function (c) {
      if (c.type === "removed") removed++;
      else if (c.type === "converted") converted++;
    });
    var bits = [inLen + " → " + outLen + " chars"];
    if (removed || converted) {
      var parts = [];
      if (removed) parts.push('<span class="removed">' + removed + "</span> removed");
      if (converted) parts.push('<span class="converted">' + converted + "</span> converted");
      bits.push(parts.join(" · "));
    } else {
      bits.push("no changes");
    }
    return bits.join(" · ");
  }

  function render() {
    batchPanel.style.display = files.length ? "" : "none";
    dropzone.style.display = files.length ? "none" : "";

    var readyCount = files.filter(function (f) { return f.result; }).length;
    var errorCount = files.filter(function (f) { return f.status === "error"; }).length;
    var summaryBits = [files.length + (files.length === 1 ? " file" : " files")];
    if (errorCount) summaryBits.push(errorCount + " failed to read");
    batchSummary.textContent = summaryBits.join(" · ");
    downloadAllBtn.disabled = readyCount === 0;

    batchList.innerHTML = files.map(function (entry) {
      return '<div class="batchRow" data-id="' + entry.id + '">' +
        '<div class="batchRowInfo">' +
        '<div class="batchRowName" title="' + escapeHtml(entry.name) + '">' + escapeHtml(entry.name) + " &middot; " + humanSize(entry.size) + "</div>" +
        '<div class="batchRowStats">' + rowStatsHtml(entry) + "</div>" +
        "</div>" +
        '<div class="batchRowActions">' +
        '<button class="downloadOneBtn" ' + (entry.result ? "" : "disabled") + '><svg class="btnIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg><span class="btnLabel">Download</span></button>' +
        '<button class="removeOneBtn iconOnly" aria-label="Remove ' + escapeHtml(entry.name) + '" title="Remove"><svg class="btnIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>' +
        "</div>" +
        "</div>";
    }).join("");
  }

  chooseFilesBtn.addEventListener("click", function () { filesInput.click(); });

  filesInput.addEventListener("change", function () {
    if (filesInput.files.length) addFiles(filesInput.files);
    filesInput.value = "";
  });

  ["dragover", "dragenter"].forEach(function (evt) {
    dropzone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "dragend"].forEach(function (evt) {
    dropzone.addEventListener(evt, function () { dropzone.classList.remove("dragover"); });
  });
  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // Delegated: rows are rebuilt wholesale on every render(), so listeners
  // are attached once on the container instead of per-row.
  batchList.addEventListener("click", function (e) {
    var row = e.target.closest(".batchRow");
    if (!row) return;
    var id = Number(row.dataset.id);
    var entry = files.find(function (f) { return f.id === id; });
    if (!entry) return;
    var downloadBtn = e.target.closest(".downloadOneBtn");
    if (downloadBtn) downloadEntry(entry, downloadBtn);
    else if (e.target.closest(".removeOneBtn")) removeEntry(id);
  });

  downloadAllBtn.addEventListener("click", function () {
    var ready = files.filter(function (f) { return f.result; });
    if (!ready.length) return;
    var encoder = new TextEncoder();
    var zipBytes = buildZip(ready.map(function (entry) {
      return { name: safeEntryName(entry.name), data: encoder.encode(entry.result.output) };
    }));
    var blob = new Blob([zipBytes], { type: "application/zip" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "cleartxt-batch-" + timestamp(new Date()) + ".zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flashButtonLabel(downloadAllBtn, "Downloaded!");
  });

  clearAllBtn.addEventListener("click", function () {
    files = [];
    render();
  });

  var fixOptions = ClearTXT.createFixOptionsController();
  fixOptions.init(reprocessAll);
  render();
})();
