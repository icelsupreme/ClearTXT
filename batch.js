(function () {
  "use strict";

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

  function downloadEntry(entry) {
    if (!entry.result) return;
    var blob = new Blob([entry.result.output], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
    if (e.target.closest(".downloadOneBtn")) downloadEntry(entry);
    else if (e.target.closest(".removeOneBtn")) removeEntry(id);
  });

  downloadAllBtn.addEventListener("click", function () {
    // Sequential downloads, not a single zip: keeps this page dependency-
    // free like the rest of the app, at the cost of the browser treating
    // each as its own download (it may prompt to allow multiple downloads
    // the first time, for more than a handful of files at once).
    files.forEach(function (entry) { if (entry.result) downloadEntry(entry); });
  });

  clearAllBtn.addEventListener("click", function () {
    files = [];
    render();
  });

  var fixOptions = ClearTXT.createFixOptionsController();
  fixOptions.init(reprocessAll);
  render();
})();
