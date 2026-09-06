import JSZip from "jszip";
import * as XLSX from "xlsx";

const SUPPORTED_IMPORT_EXTENSIONS = new Set(["txt", "csv", "xls", "xlsx", "docx"]);
const DOCX_DOCUMENT_XML_PATH = "word/document.xml";
// One export header and one extra card allow the preview to report the limit.
const MAX_PARSED_SPREADSHEET_ROWS = 1002;
const MAX_DOCX_DOCUMENT_XML_BYTES = 10 * 1024 * 1024;

const normalizeCellText = (value) =>
  `${value ?? ""}`
    .replace(/\u00A0/g, " ")
    .trim();

const decodeXmlEntities = (value) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (entity, name) => {
    if (name.startsWith("#")) {
      const codePoint = name[1].toLowerCase() === "x"
        ? parseInt(name.slice(2), 16)
        : parseInt(name.slice(1), 10);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    }
    return { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" }[name.toLowerCase()];
  });

const extractDocxParagraphText = (paragraphXml) => {
  const textChunks = Array.from(
    paragraphXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)
  ).map((match) => match[2] ? (match[2] === "tab" ? "\t" : "\n") : decodeXmlEntities(match[1]));
  return textChunks.join("").replace(/\u00A0/g, " ").trim();
};

export const getImportAssetExtension = (asset = {}) => {
  const primarySource = `${asset.name ?? asset.uri ?? ""}`.toLowerCase();
  const matchedExtension = primarySource.match(/\.([a-z0-9]+)(?:$|[?#])/);

  if (matchedExtension?.[1]) {
    return matchedExtension[1];
  }

  const mimeType = `${asset.mimeType ?? ""}`.toLowerCase();

  if (mimeType.includes("csv")) {
    return "csv";
  }

  if (mimeType.includes("spreadsheetml")) {
    return "xlsx";
  }

  if (mimeType.includes("ms-excel")) {
    return "xls";
  }

  if (mimeType.includes("wordprocessingml")) {
    return "docx";
  }

  if (mimeType.startsWith("text/")) {
    return "txt";
  }

  return "";
};

export const isSupportedImportExtension = (extension) =>
  SUPPORTED_IMPORT_EXTENSIONS.has((extension || "").toLowerCase());

const getExportColumns = (firstRow) => {
  if (!firstRow) return null;
  const columns = new Map();
  firstRow.cells.forEach((value, column) => {
    const name = value.toLowerCase();
    if (["no", "folder", "front", "back"].includes(name)) {
      columns.set(name, columns.has(name) ? -1 : column);
    }
  });
  // Distinguish an export header from a real two-column Front/Back card.
  return ["no", "folder", "front", "back"].every((name) => columns.get(name) >= 0)
    ? { left: columns.get("front"), right: columns.get("back") }
    : null;
};

const parseSpreadsheetRows = (rows) => {
  const entries = [];
  const invalidEntryIndexes = [];
  const exportColumns = getExportColumns(rows[0]);
  const columns = exportColumns ?? { left: 0, right: 1 };
  rows.forEach((row, index) => {
    if (exportColumns && index === 0) return;
    const left = row.cells.get(columns.left) ?? "";
    const right = row.cells.get(columns.right) ?? "";
    if (!left || !right) {
      invalidEntryIndexes.push(row.index);
      return;
    }
    entries.push({ left, right });
  });
  return { entries, invalidEntryIndexes, isMemoriaExport: Boolean(exportColumns) };
};

const readWorksheet = (workbook) => {
  const firstSheetName = workbook.SheetNames?.[0];
  const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
  const rows = new Map();
  if (!worksheet) return { rows: [], truncated: false };
  // Traverse populated cells rather than expanding a large, mostly empty sheet range.
  Object.keys(worksheet).forEach((address) => {
    if (!/^[A-Z]+[1-9]\d*$/.test(address)) return;
    const { r: rowIndex, c: columnIndex } = XLSX.utils.decode_cell(address);
    if (rowIndex >= MAX_PARSED_SPREADSHEET_ROWS) return;
    const value = normalizeCellText(XLSX.utils.format_cell(worksheet[address]));
    if (!value) return;
    if (!rows.has(rowIndex)) rows.set(rowIndex, { index: rowIndex + 1, cells: new Map() });
    rows.get(rowIndex).cells.set(columnIndex, value);
  });
  const fullRange = worksheet["!fullref"] ?? worksheet["!ref"];
  const truncated = Boolean(fullRange && XLSX.utils.decode_range(fullRange).e.r >= MAX_PARSED_SPREADSHEET_ROWS);
  return { rows: Array.from(rows.values()).sort((a, b) => a.index - b.index), truncated };
};

const exceedsCsvRowLimit = (text) => {
  let quoted = false;
  let rowCount = 0;
  // SheetJS does not provide !fullref for CSV; ignore quoted newlines.
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === "\n" || character === "\r")) {
      rowCount += 1;
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      if (rowCount >= MAX_PARSED_SPREADSHEET_ROWS && index < text.length - 1) return true;
    }
  }
  return false;
};

export const parseSpreadsheetPairsFromText = (text) => {
  const workbook = XLSX.read(text, {
    type: "string", raw: true, codepage: 65001, dense: false,
    sheetRows: MAX_PARSED_SPREADSHEET_ROWS,
  });
  const { rows, truncated } = readWorksheet(workbook);
  return { ...parseSpreadsheetRows(rows), truncated: truncated || exceedsCsvRowLimit(text) };
};

export const parseSpreadsheetPairsFromBase64 = (base64) => {
  const workbook = XLSX.read(base64, {
    type: "base64", cellDates: false, dense: false,
    sheetRows: MAX_PARSED_SPREADSHEET_ROWS,
  });
  const { rows, truncated } = readWorksheet(workbook);
  return { ...parseSpreadsheetRows(rows), truncated };
};

export const extractDocxTextFromBase64 = async (base64) => {
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const documentFile = zip.file(DOCX_DOCUMENT_XML_PATH);

  if (!documentFile) {
    throw new Error("DOCX document.xml not found.");
  }

  const uncompressedSize = Number(documentFile?._data?.uncompressedSize ?? 0);

  if (Number.isFinite(uncompressedSize) && uncompressedSize > MAX_DOCX_DOCUMENT_XML_BYTES) {
    throw new Error("DOCX document.xml exceeds the safe import limit.");
  }

  const documentXml = await documentFile.async("string");

  if (documentXml.length > MAX_DOCX_DOCUMENT_XML_BYTES) {
    throw new Error("DOCX document.xml exceeds the safe import limit.");
  }

  const paragraphs = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];

  if (!paragraphs.length) {
    return "";
  }

  return paragraphs.map(extractDocxParagraphText).join("\n");
};
