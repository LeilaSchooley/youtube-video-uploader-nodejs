import { Readable } from "stream";
import csvParser from "csv-parser";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx") as typeof import("xlsx");

export const KNOWN_VIDEO_NAME_COLUMNS = [
  "video_name",
  "videoname",
  "video name",
  "filename",
  "file_name",
  "file name",
  "name",
  "video",
  "file",
];

export type SpreadsheetRow = Record<string, unknown>;

export function getVideoNameFromRow(row: SpreadsheetRow): string | undefined {
  for (const col of KNOWN_VIDEO_NAME_COLUMNS) {
    if (row[col] !== undefined) {
      const s =
        typeof row[col] === "string"
          ? row[col].trim()
          : String(row[col] ?? "").trim();
      if (s) return s;
    }
  }
  for (const key of Object.keys(row)) {
    const lower = key.toLowerCase().trim();
    if (
      lower.includes("video") ||
      lower.includes("file") ||
      lower === "name"
    ) {
      const s =
        typeof row[key] === "string"
          ? row[key].trim()
          : String(row[key] ?? "").trim();
      if (s) return s;
    }
  }
  return undefined;
}

export async function parseSpreadsheetBuffer(
  fileBuffer: Buffer,
  fileLabel: string,
  sheetName?: string,
): Promise<{ rows: SpreadsheetRow[]; videoNameColumn: string | null }> {
  const ext = fileLabel.toLowerCase().split(".").pop() || "";
  let rows: SpreadsheetRow[] = [];

  if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetNameToUse =
      sheetName && workbook.SheetNames.includes(sheetName)
        ? sheetName
        : workbook.SheetNames[0];
    if (!sheetNameToUse) {
      throw new Error("No sheets found in workbook");
    }
    const sheet = workbook.Sheets[sheetNameToUse];
    rows = XLSX.utils.sheet_to_json(sheet) as SpreadsheetRow[];
  } else {
    await new Promise<void>((resolve, reject) => {
      Readable.from(fileBuffer)
        .pipe(csvParser())
        .on("data", (row: SpreadsheetRow) => {
          rows.push(row);
        })
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err));
    });
  }

  let videoNameColumn: string | null = null;
  if (rows.length > 0) {
    const columnNames = Object.keys(rows[0]);
    for (const col of columnNames) {
      const lower = col.toLowerCase().trim();
      if (KNOWN_VIDEO_NAME_COLUMNS.includes(lower)) {
        videoNameColumn = col;
        break;
      }
    }
    if (!videoNameColumn) {
      for (const col of columnNames) {
        const lower = col.toLowerCase().trim();
        if (
          lower.includes("video") ||
          lower.includes("file") ||
          lower === "name"
        ) {
          videoNameColumn = col;
          break;
        }
      }
    }
  }

  return { rows, videoNameColumn };
}

export function buildCsvMetadataMap(
  rows: SpreadsheetRow[],
  getName: (row: SpreadsheetRow) => string | undefined = getVideoNameFromRow,
): Map<string, SpreadsheetRow> {
  const map = new Map<string, SpreadsheetRow>();
  for (const row of rows) {
    const videoName = getName(row)?.toLowerCase();
    if (videoName) map.set(videoName, row);
  }
  return map;
}

export function matchCsvMetadata(
  map: Map<string, SpreadsheetRow>,
  videoName: string,
): SpreadsheetRow | undefined {
  if (!videoName || map.size === 0) return undefined;
  const normalizedName = videoName.toLowerCase().trim();
  const nameWithoutExt = normalizedName.replace(/\.[^/.]+$/, "");
  if (map.has(normalizedName)) return map.get(normalizedName);
  if (map.has(nameWithoutExt)) return map.get(nameWithoutExt);
  for (const [csvVideoName, metadata] of Array.from(map.entries())) {
    if (
      csvVideoName.includes(normalizedName) ||
      normalizedName.includes(csvVideoName)
    ) {
      return metadata;
    }
  }
  return undefined;
}
