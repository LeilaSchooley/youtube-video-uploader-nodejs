"use client";

import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";

type Props = {
  dropboxPythonQueueMode: boolean;
  hasDropboxAuth: boolean | null;
  dropboxAuthLoading: boolean;
  dropboxThumbnailsFolderPath: string;
  setDropboxThumbnailsFolderPath: (v: string) => void;
  setDropboxBrowserMode: (v: "folder" | "file") => void;
  setDropboxBrowserContext: (v: "bulk" | "sheets-folder" | "sheets-file" | "thumbnails-folder") => void;
  setShowDropboxBrowser: (v: boolean) => void;
  selectedDropboxCsvFile: string;
  setSelectedDropboxCsvFile: (v: string) => void;
  dropboxSheetNames: Array<{ title: string; sheetId: number }>;
  setDropboxSheetNames: (v: Array<{ title: string; sheetId: number }>) => void;
  loadingDropboxSheets: boolean;
  selectedDropboxSheetName: string;
  setSelectedDropboxSheetName: (v: string) => void;
};

export default function UploadFormsBulkDropboxMetadataSection(props: Props) {
  if (props.dropboxPythonQueueMode) return null;
  const disabledClass = props.hasDropboxAuth !== true ? "opacity-50 pointer-events-none" : "";
  return (
    <>
      <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-700 rounded-lg">
        <div className="flex items-start gap-2 mb-3">
          <span className="text-xl">🖼️</span>
          <div className="flex-1">
            <strong className="text-violet-900 dark:text-violet-100 block mb-1">Thumbnails folder (optional)</strong>
            <p className="text-sm text-violet-800 dark:text-violet-200 mb-3">Pick a Dropbox folder with thumbnail images matched to video filenames.</p>
            <div className={disabledClass}>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="dropboxThumbnailsFolderPath"
                  name="dropboxThumbnailsFolderPath"
                  placeholder="/Thumbnails or leave empty"
                  value={props.dropboxThumbnailsFolderPath}
                  onChange={(e) => {
                    props.setDropboxThumbnailsFolderPath(e.target.value);
                    if (typeof window !== "undefined") {
                      if (e.target.value) localStorage.setItem(DASHBOARD_STORAGE.dropboxThumbnailsFolderPath, e.target.value);
                      else localStorage.removeItem(DASHBOARD_STORAGE.dropboxThumbnailsFolderPath);
                    }
                  }}
                  className="input-field flex-1 font-mono text-sm"
                />
                <button type="button" onClick={() => { props.setDropboxBrowserMode("folder"); props.setDropboxBrowserContext("thumbnails-folder"); props.setShowDropboxBrowser(true); }} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg transition-colors" disabled={props.hasDropboxAuth !== true}>📂 Browse</button>
                {props.dropboxThumbnailsFolderPath && <button type="button" onClick={() => { props.setDropboxThumbnailsFolderPath(""); if (typeof window !== "undefined") localStorage.removeItem(DASHBOARD_STORAGE.dropboxThumbnailsFolderPath); }} className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Clear">✕</button>}
              </div>
              {props.dropboxThumbnailsFolderPath && <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">✓ Thumbnails folder: <strong>{props.dropboxThumbnailsFolderPath}</strong></p>}
            </div>
          </div>
        </div>
      </div>
      <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
        <div className="flex items-start gap-2 mb-3">
          <span className="text-xl">📄</span>
          <div className="flex-1">
            <strong className="text-orange-900 dark:text-orange-100 block mb-1">CSV/XLSX File for Metadata (Optional)</strong>
            <p className="text-sm text-orange-800 dark:text-orange-200 mb-3">Optionally provide a CSV or XLSX file from Dropbox with video metadata.</p>
            <div className={disabledClass}>
              <label htmlFor="dropboxMetadataCsvFile" className="label text-sm">📄 CSV/XLSX File from Dropbox</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="dropboxMetadataCsvFile"
                  name="dropboxMetadataCsvFile"
                  placeholder="/path/to/file.csv or /path/to/file.xlsx"
                  value={props.selectedDropboxCsvFile}
                  onChange={(e) => {
                    props.setSelectedDropboxCsvFile(e.target.value);
                    if (typeof window !== "undefined") {
                      if (e.target.value) localStorage.setItem(DASHBOARD_STORAGE.selectedDropboxCsvFile, e.target.value);
                      else localStorage.removeItem(DASHBOARD_STORAGE.selectedDropboxCsvFile);
                    }
                  }}
                  className="input-field flex-1 font-mono text-sm"
                />
                <button type="button" onClick={() => { props.setDropboxBrowserMode("file"); props.setDropboxBrowserContext("sheets-file"); props.setShowDropboxBrowser(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors" disabled={props.hasDropboxAuth !== true}>📂 Browse</button>
                {props.selectedDropboxCsvFile && <button type="button" onClick={() => { props.setSelectedDropboxCsvFile(""); props.setDropboxSheetNames([]); props.setSelectedDropboxSheetName(""); if (typeof window !== "undefined") { localStorage.removeItem(DASHBOARD_STORAGE.selectedDropboxCsvFile); localStorage.removeItem(DASHBOARD_STORAGE.selectedDropboxSheetName);} }} className="px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Clear">✕</button>}
              </div>
              {props.selectedDropboxCsvFile && <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">✓ Selected: <strong>{props.selectedDropboxCsvFile}</strong></p>}
              {props.selectedDropboxCsvFile && (props.dropboxSheetNames.length > 0 || props.loadingDropboxSheets) && (
                <div className="mt-3">
                  <label htmlFor="dropboxSheetName" className="label text-sm">📑 Sheet (for XLSX)</label>
                  <select id="dropboxSheetName" name="dropboxSheetName" value={props.selectedDropboxSheetName} onChange={(e) => { props.setSelectedDropboxSheetName(e.target.value); if (typeof window !== "undefined") localStorage.setItem(DASHBOARD_STORAGE.selectedDropboxSheetName, e.target.value); }} disabled={props.loadingDropboxSheets} className="input-field w-full max-w-xs">
                    {props.loadingDropboxSheets ? <option value="">Loading sheets…</option> : props.dropboxSheetNames.map((s) => <option key={s.title} value={s.title}>{s.title}</option>)}
                  </select>
                </div>
              )}
            </div>
            {props.hasDropboxAuth !== true && <p className="mt-2 text-xs text-orange-800 dark:text-orange-200">{props.dropboxAuthLoading || props.hasDropboxAuth === null ? "Checking Dropbox…" : "Connect Dropbox in the header to enable Browse for this section."}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
