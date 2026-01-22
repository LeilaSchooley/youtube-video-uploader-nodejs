import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

/**
 * Get Google Sheets client
 */
export function getSheetsClient(auth: OAuth2Client) {
  return google.sheets({ version: "v4", auth });
}

/**
 * Extract spreadsheet ID from Google Sheets URL
 * Supports formats:
 * - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
 * - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0
 * - SPREADSHEET_ID (direct ID)
 */
export function extractSpreadsheetId(urlOrId: string): string | null {
  // If it's already just an ID (alphanumeric, dashes, underscores)
  if (/^[a-zA-Z0-9_-]+$/.test(urlOrId)) {
    return urlOrId;
  }

  // Try to extract from URL
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

/**
 * Read data from a Google Sheet
 * @param spreadsheetId - The spreadsheet ID
 * @param range - The range to read (e.g., "Sheet1!A1:Z1000" or "Sheet1")
 * @param auth - OAuth2 client
 */
export async function readSheetData(
  spreadsheetId: string,
  range: string,
  auth: OAuth2Client
): Promise<Array<Record<string, string>>> {
  const sheets = getSheetsClient(auth);

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }

    // First row is headers
    const headers = rows[0].map((h: any) => String(h || "").trim().toLowerCase());
    
    // Convert rows to objects
    const data: Array<Record<string, string>> = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowObj: Record<string, string> = {};
      
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (header) {
          rowObj[header] = String(row[j] || "").trim();
        }
      }
      
      // Only add row if it has at least one non-empty value
      if (Object.values(rowObj).some(v => v.length > 0)) {
        data.push(rowObj);
      }
    }

    return data;
  } catch (error: any) {
    console.error(`[SHEETS] Error reading sheet:`, error?.message);
    throw new Error(`Failed to read Google Sheet: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Get spreadsheet metadata
 */
export async function getSpreadsheetMetadata(
  spreadsheetId: string,
  auth: OAuth2Client
): Promise<{
  title: string;
  sheets: Array<{ title: string; sheetId: number }>;
}> {
  const sheets = getSheetsClient(auth);

  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    return {
      title: response.data.properties?.title || "Untitled",
      sheets: (response.data.sheets || []).map((sheet: any) => ({
        title: sheet.properties?.title || "Sheet1",
        sheetId: sheet.properties?.sheetId || 0,
      })),
    };
  } catch (error: any) {
    console.error(`[SHEETS] Error getting metadata:`, error?.message);
    throw new Error(`Failed to get spreadsheet metadata: ${error?.message || "Unknown error"}`);
  }
}
