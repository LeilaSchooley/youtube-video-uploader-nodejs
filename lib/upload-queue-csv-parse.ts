import { Readable } from "stream";
import csvParser from "csv-parser";
import type { CSVRow } from "@/lib/upload-queue-types";

export async function parseUploadQueueCsvOrXlsx(
  csvFile: File,
  dropboxSheetName: string | undefined,
): Promise<{ ok: true; rows: CSVRow[] } | { ok: false; error: string }> {
  const csvData: CSVRow[] = [];
  const bytes = await csvFile.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const fileName = (csvFile.name || "").toLowerCase();

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require("xlsx") as typeof import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetNameToUse =
        dropboxSheetName && workbook.SheetNames.includes(dropboxSheetName)
          ? dropboxSheetName
          : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetNameToUse];
      const rows = XLSX.utils.sheet_to_json(worksheet);
      rows.forEach((row: unknown) => csvData.push(row as CSVRow));
      console.log(
        `[UPLOAD-QUEUE] XLSX parsed: ${csvData.length} rows from sheet "${sheetNameToUse}"`,
      );
    } catch (parseError: unknown) {
      const pe = parseError as { message?: string };
      return {
        ok: false,
        error: `XLSX parsing failed: ${pe?.message}`,
      };
    }
  } else {
    const csvStream = Readable.from(buffer);
    try {
      await new Promise<void>((resolve, reject) => {
        csvStream
          .pipe(csvParser())
          .on("data", (row: CSVRow) => {
            csvData.push(row);
          })
          .on("end", () => {
            console.log(`[UPLOAD-QUEUE] CSV parsed: ${csvData.length} rows`);
            resolve();
          })
          .on("error", (err: Error) => {
            reject(new Error(`Failed to parse CSV: ${err.message}`));
          });
      });
    } catch (parseError: unknown) {
      const pe = parseError as { message?: string };
      return {
        ok: false,
        error: `CSV parsing failed: ${pe?.message}`,
      };
    }
  }

  if (csvData.length === 0) {
    return { ok: false, error: "CSV file is empty" };
  }

  return { ok: true, rows: csvData };
}
