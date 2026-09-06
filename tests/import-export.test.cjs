const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");
const XLSX = require("xlsx");
const JSZip = require("jszip");
function loadSource(relativePath) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(code, filename);
  return loaded.exports;
}
const {
  parseSpreadsheetPairsFromText, parseSpreadsheetPairsFromBase64, extractDocxTextFromBase64,
  getImportAssetExtension, isSupportedImportExtension,
} = loadSource("src/utils/import-files.js");
const { createCardExportRows } = loadSource("src/utils/card-export.js");
const { parseImportedPairs } = loadSource("src/utils/memory.js");
function toBase64(worksheet, bookType = "xlsx") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "cards");
  return XLSX.write(workbook, { type: "base64", bookType });
}
const samplePairs = [
  { left: "사과, apple", right: 'He said "hello"', folderId: "vocabulary" },
  { left: "first line\nsecond line", right: "줄바꿈\n정답", folderId: "vocabulary" },
  { left: "00123", right: "2024-01-01", folderId: "numbers" },
  { left: "=1+1", right: "+4412345", folderId: "numbers" },
  { left: "Front", right: "Back", folderId: "root" },
];
const cardTexts = (pairs) => pairs.map(({ left, right }) => ({ left, right }));
const exportRows = (pairs) => createCardExportRows(
  pairs, (folderId) => "Folder " + folderId,
  () => ({ attempts: 4, correct: 3, incorrect: 1, accuracy: 75, hidden: true })
);
for (const format of ["csv", "xlsx"]) {
  test("MEMORIA " + format + " export restores card contents exactly", () => {
    const worksheet = XLSX.utils.json_to_sheet(exportRows(samplePairs));
    const result = format === "csv"
      ? parseSpreadsheetPairsFromText("\uFEFF" + XLSX.utils.sheet_to_csv(worksheet))
      : parseSpreadsheetPairsFromBase64(toBase64(worksheet));
    assert.deepEqual(result.entries, cardTexts(samplePairs));
    assert.deepEqual(result.invalidEntryIndexes, []);
    assert.equal(result.isMemoriaExport, true);
    assert.equal(result.truncated, false);
    assert.equal("folderId" in result.entries[0], false);
    assert.equal("attempts" in result.entries[0], false);
  });
}
test("export retains readable statistics and optional timestamps", () => {
  const [row] = exportRows(samplePairs);
  assert.deepEqual(row, {
    No: 1, Folder: "Folder vocabulary", Front: samplePairs[0].left, Back: samplePairs[0].right,
    Attempts: 4, Correct: 3, Incorrect: 1, AccuracyPercent: 75, Hidden: "Y", CreatedAt: "", UpdatedAt: "",
  });
});
test("export columns are recognized after reordering and leading blank rows", () => {
  const result = parseSpreadsheetPairsFromText("\n BACK , NO , FRONT , FOLDER\nanswer,1,question,Root");
  assert.deepEqual(result.entries, [{ left: "question", right: "answer" }]);
  assert.equal(result.isMemoriaExport, true);
});
for (const format of ["csv", "xls", "xlsx"]) {
  test("headerless " + format + " keeps first two columns and the Front/Back card", () => {
    const rows = [["Front", "Back"], ["00123", "2024-01-01", "ignored"], ["대한민국", "한국"]];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const result = format === "csv" ? parseSpreadsheetPairsFromText(XLSX.utils.sheet_to_csv(worksheet))
      : parseSpreadsheetPairsFromBase64(toBase64(worksheet, format));
    assert.deepEqual(result.entries, rows.map(([left, right]) => ({ left, right })));
    assert.equal(result.isMemoriaExport, false);
    assert.equal(result.truncated, false);
  });
}
test("blank rows do not renumber invalid rows", () => {
  const rows = [[], ["incomplete"], [], ["valid", "answer"], ["", "missing front"]];
  for (const format of ["csv", "xlsx"]) {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const result = format === "csv" ? parseSpreadsheetPairsFromText(XLSX.utils.sheet_to_csv(worksheet))
      : parseSpreadsheetPairsFromBase64(toBase64(worksheet));
    assert.deepEqual(result.entries, [{ left: "valid", right: "answer" }]);
    assert.deepEqual(result.invalidEntryIndexes, [2, 5]);
  }
});
test("invalid export contents report original row indexes", () => {
  const result = parseSpreadsheetPairsFromText("No,Folder,Front,Back\n1,Root,,answer\n\n2,Root,question,");
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.invalidEntryIndexes, [2, 4]);
  assert.equal(result.isMemoriaExport, true);
});
for (const format of ["csv", "xls", "xlsx"]) {
  test("oversized " + format + " reports truncation", () => {
    const pairs = Array.from({ length: 1500 }, (_, index) => ({ left: "question " + index, right: "answer " + index, folderId: "root" }));
    const worksheet = XLSX.utils.json_to_sheet(exportRows(pairs));
    const result = format === "csv" ? parseSpreadsheetPairsFromText(XLSX.utils.sheet_to_csv(worksheet))
      : parseSpreadsheetPairsFromBase64(toBase64(worksheet, format));
    assert.equal(result.truncated, true);
    assert.equal(result.entries.length, 1001);
    assert.deepEqual(result.entries.slice(0, 1000), cardTexts(pairs.slice(0, 1000)));
  });
}
test("1000 exported cards with quoted newlines fit without truncation", () => {
  const pairs = Array.from({ length: 1000 }, (_, index) => ({ left: "question\n" + index, right: "answer " + index, folderId: "root" }));
  const result = parseSpreadsheetPairsFromText(XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(exportRows(pairs))));
  assert.equal(result.entries.length, 1000);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.entries, cardTexts(pairs));
});
test("data beyond a long blank prefix reports the read limit", () => {
  for (const csv of ["\n".repeat(1100) + "question,answer", "\r\n".repeat(1100) + "question,answer"]) {
    assert.equal(parseSpreadsheetPairsFromText(csv).truncated, true);
  }
  const worksheet = { A2000: { t: "s", v: "question" }, B2000: { t: "s", v: "answer" }, "!ref": "A2000:B2000" };
  assert.equal(parseSpreadsheetPairsFromBase64(toBase64(worksheet)).truncated, true);
});
test("empty CSV has no cards or invalid entries", () => {
  const result = parseSpreadsheetPairsFromText("");
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.invalidEntryIndexes, []);
  assert.equal(result.isMemoriaExport, false);
  assert.equal(result.truncated, false);
});
test("TXT blocks and invalid block reporting remain supported", () => {
  assert.deepEqual(parseImportedPairs("# comment\nquestion\nanswer\n\ninvalid\n\nsecond\nresponse"), {
    entries: [{ left: "question", right: "answer" }, { left: "second", right: "response" }], invalidEntryIndexes: [2],
  });
});
async function documentBase64(xml) {
  return new JSZip().file("word/document.xml", xml).generateAsync({ type: "base64", compression: "DEFLATE" });
}
test("DOCX line breaks, tabs and XML entities preserve card text", async () => {
  const xml = '<w:document><w:body><w:p><w:r><w:t>front &amp; &lt;x&gt; &#x1F600;</w:t><w:br/><w:t>back</w:t><w:tab/><w:t>text</w:t></w:r></w:p></w:body></w:document>';
  const text = await extractDocxTextFromBase64(await documentBase64(xml));
  assert.equal(text, "front & <x> 😀\nback\ttext");
  assert.deepEqual(parseImportedPairs(text).entries, [{ left: "front & <x> 😀", right: "back\ttext" }]);
});
test("DOCX missing its document or exceeding decompressed limit is rejected", async () => {
  const missing = await new JSZip().file("other.xml", "data").generateAsync({ type: "base64" });
  await assert.rejects(extractDocxTextFromBase64(missing), /not found/);
  await assert.rejects(extractDocxTextFromBase64(await documentBase64("x".repeat(10 * 1024 * 1024 + 1))), /safe import limit/);
});
test("extension and MIME fallbacks remain supported", () => {
  for (const extension of ["txt", "csv", "xls", "xlsx", "docx"]) {
    assert.equal(getImportAssetExtension({ name: "CARDS." + extension.toUpperCase() }), extension);
    assert.equal(isSupportedImportExtension(extension), true);
  }
  assert.equal(getImportAssetExtension({ uri: "content://cards", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "xlsx");
  assert.equal(getImportAssetExtension({ uri: "content://cards", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "docx");
  assert.equal(isSupportedImportExtension("pdf"), false);
});
