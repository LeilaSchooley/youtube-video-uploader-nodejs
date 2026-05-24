"use client";

import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";

type Props = {
  setShowSheetsBrowser: (show: boolean) => void;
  debounceTimerRef: { current: ReturnType<typeof setTimeout> | null };
  fetchSheets: (urlOrId: string) => Promise<void>;
  availableSheets: Array<{ title: string; sheetId: number }>;
  setAvailableSheets: (sheets: Array<{ title: string; sheetId: number }>) => void;
  loadingSheets: boolean;
  spreadsheetTitle: string;
  setSpreadsheetTitle: (title: string) => void;
  driveSpreadsheetUrl: string;
  setDriveSpreadsheetUrl: (url: string) => void;
};

export default function UploadFormsBulkDriveSheetsSection({
  setShowSheetsBrowser,
  debounceTimerRef,
  fetchSheets,
  availableSheets,
  setAvailableSheets,
  loadingSheets,
  spreadsheetTitle,
  setSpreadsheetTitle,
  driveSpreadsheetUrl,
  setDriveSpreadsheetUrl,
}: Props) {
  return (
    <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl">📊</span>
        <div className="flex-1">
          <strong className="text-indigo-900 dark:text-indigo-100 block mb-1">Google Sheets for Metadata (Optional)</strong>
          <p className="text-sm text-indigo-800 dark:text-indigo-200 mb-3">Optionally provide a Google Sheet with video metadata. The sheet should have columns like youtube_title, youtube_description, video_url, drive_file_id, etc.</p>
          <div>
            <label htmlFor="driveSpreadsheetUrl" className="label text-sm">📊 Google Sheets URL or ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                id="driveSpreadsheetUrl"
                name="driveSpreadsheetUrl"
                placeholder="https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit"
                value={driveSpreadsheetUrl}
                className="input-field font-mono text-sm flex-1"
                onChange={(e) => {
                  const url = e.target.value.trim();
                  setDriveSpreadsheetUrl(url);
                  if (typeof window !== "undefined") {
                    if (url) localStorage.setItem(DASHBOARD_STORAGE.sheetsSpreadsheetUrl, url);
                    else localStorage.removeItem(DASHBOARD_STORAGE.sheetsSpreadsheetUrl);
                  }
                  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                  if (url) debounceTimerRef.current = setTimeout(() => void fetchSheets(url), 800);
                  else {
                    setAvailableSheets([]);
                    setSpreadsheetTitle("");
                  }
                }}
              />
              <button type="button" onClick={() => setShowSheetsBrowser(true)} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"><span>📂</span><span>Browse</span></button>
              <button
                type="button"
                onClick={() => {
                  if (driveSpreadsheetUrl.trim()) void fetchSheets(driveSpreadsheetUrl.trim());
                }}
                disabled={loadingSheets}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingSheets ? "⏳" : "🔍"}
              </button>
            </div>
            {spreadsheetTitle && <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Found: <strong>{spreadsheetTitle}</strong></p>}
            {availableSheets.length > 0 && (
              <div className="mt-2">
                <label htmlFor="driveSheetNameSelect" className="text-xs block mb-1">Select Sheet:</label>
                <select id="driveSheetNameSelect" name="driveSheetName" className="input-field text-sm">
                  <option value="">Select a sheet...</option>
                  {availableSheets.map((sheet) => <option key={sheet.sheetId} value={sheet.title}>{sheet.title}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
