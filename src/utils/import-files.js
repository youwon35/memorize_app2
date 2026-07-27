import JSZip from "jszip";
import * as XLSX from "xlsx";

const SUPPORTED_IMPORT_EXTENSIONS = new Set(["txt", "csv", "xls", "xlsx", "docx"]);
const DOCX_DOCUMENT_XML_PATH = "word/document.xml";
const MAX_PARSED_SPREADSHEET_ROWS = 1001;
const MAX_DOCX_DOCUMENT_XML_BYTES = 10 * 1024 * 1024;

const normalizeCellText = (value) =>
  `${value ?? ""}`
    .replace(/\u00A0/g, " ")
    .trim();

const decodeXmlEntities = (value) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const extractDocxParagraphText = (paragraphXml) => {
  const normalizedParagraphXml = paragraphXml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:(?:br|cr)[^>]*\/>/g, "\n");
  const textChunks = Array.from(
    normalizedParagraphXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)
  ).map((match) => decodeXmlEntities(match[1]));

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

const parseSpreadsheetRows = (rows) => {
  const entries = [];
  const invalidEntryIndexes = [];

  rows.forEach((row, index) => {
    const normalizedRow = Array.isArray(row) ? row.map(normalizeCellText) : [];

    if (!normalizedRow.some(Boolean)) {
      return;
    }

    const left = normalizedRow[0] ?? "";
    const right = normalizedRow[1] ?? "";

    if (!left || !right) {
      invalidEntryIndexes.push(index + 1);
      return;
    }

    entries.push({ left, right });
  });

  return { entries, invalidEntryIndexes };
};

const readWorksheetRows = (workbook) => {
  const firstSheetName = workbook.SheetNames?.[0];

  if (!firstSheetName) {
    return [];
  }

  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }).slice(0, MAX_PARSED_SPREADSHEET_ROWS);
};

export const parseSpreadsheetPairsFromText = (text) => {
  const workbook = XLSX.read(text, {
    type: "string",
    raw: false,
    codepage: 65001,
    sheetRows: MAX_PARSED_SPREADSHEET_ROWS,
  });

  return parseSpreadsheetRows(readWorksheetRows(workbook));
};

export const parseSpreadsheetPairsFromBase64 = (base64) => {
  const workbook = XLSX.read(base64, {
    type: "base64",
    cellDates: false,
    dense: false,
    sheetRows: MAX_PARSED_SPREADSHEET_ROWS,
  });

  return parseSpreadsheetRows(readWorksheetRows(workbook));
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
