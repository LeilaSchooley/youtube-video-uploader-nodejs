"use client";

import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";

type Props = {
  hasGoogleDriveAuth: boolean | null;
  driveAuthLoading: boolean;
  driveThumbnailsFolderId: string;
  setDriveThumbnailsFolderId: (v: string) => void;
  driveThumbnailsFolderName: string;
  setDriveThumbnailsFolderName: (v: string) => void;
  setDriveBrowserContext: (
    ctx: "drive" | "sheets" | "metadata-csv" | "thumbnails",
  ) => void;
  setDriveBrowserMode: (mode: "folder" | "file") => void;
  setShowDriveBrowser: (v: boolean) => void;
  selectedDriveCsvFileId: string;
  selectedDriveCsvFileName: string;
  setSelectedDriveCsvFileId: (v: string) => void;
  setSelectedDriveCsvFileName: (v: string) => void;
  driveSheetNames: Array<{ title: string; sheetId: number }>;
  loadingDriveSheets: boolean;
  selectedDriveSheetName: string;
  setSelectedDriveSheetName: (v: string) => void;
};

export default function UploadFormsBulkDriveMetadataSection(props: Props) {
  const disabledClass =
    props.hasGoogleDriveAuth !== true ? "opacity-50 pointer-events-none" : "";

  return (
    <>
      <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-700 rounded-lg">
        <div className="flex items-start gap-2 mb-3">
          <span className="text-xl">🖼️</span>
          <div className="flex-1">
            <strong className="text-violet-900 dark:text-violet-100 block mb-1">
              Thumbnails folder (optional)
            </strong>
            <p className="text-sm text-violet-800 dark:text-violet-200 mb-3">
              Pick a Drive folder with thumbnail images matched by video filename.
            </p>
            <div className={disabledClass}>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="driveThumbnailsFolderId"
                  placeholder="Folder ID or Browse"
                  value={props.driveThumbnailsFolderId}
                  onChange={(e) => {
                    props.setDriveThumbnailsFolderId(e.target.value);
                    if (!e.target.value) props.setDriveThumbnailsFolderName("");
                  }}
                  className="input-field flex-1 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    props.setDriveBrowserContext("thumbnails");
                    props.setDriveBrowserMode("folder");
                    props.setShowDriveBrowser(true);
                  }}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg"
                  disabled={props.hasGoogleDriveAuth !== true}
                >
                  📂 Browse
                </button>
              </div>
              {props.driveThumbnailsFolderName && (
                <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                  ✓ {props.driveThumbnailsFolderName}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
        <div className="flex items-start gap-2 mb-3">
          <span className="text-xl">📄</span>
          <div className="flex-1">
            <strong className="text-orange-900 dark:text-orange-100 block mb-1">
              CSV/XLSX for metadata (optional)
            </strong>
            <p className="text-sm text-orange-800 dark:text-orange-200 mb-3">
              Select a spreadsheet from Drive to match rows to videos by{" "}
              <code className="text-xs">video_name</code>.
            </p>
            <div className={disabledClass}>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="File ID or Browse"
                  value={
                    props.selectedDriveCsvFileName ||
                    props.selectedDriveCsvFileId
                  }
                  readOnly
                  className="input-field flex-1 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    props.setDriveBrowserContext("metadata-csv");
                    props.setDriveBrowserMode("file");
                    props.setShowDriveBrowser(true);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
                  disabled={props.hasGoogleDriveAuth !== true}
                >
                  📂 Browse
                </button>
                {props.selectedDriveCsvFileId && (
                  <button
                    type="button"
                    onClick={() => {
                      props.setSelectedDriveCsvFileId("");
                      props.setSelectedDriveCsvFileName("");
                      props.setSelectedDriveSheetName("");
                      if (typeof window !== "undefined") {
                        localStorage.removeItem(
                          DASHBOARD_STORAGE.selectedDriveCsvFileId,
                        );
                        localStorage.removeItem(
                          DASHBOARD_STORAGE.selectedDriveCsvFileName,
                        );
                      }
                    }}
                    className="px-3 py-2 text-red-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              {props.selectedDriveCsvFileId &&
                (props.driveSheetNames.length > 0 ||
                  props.loadingDriveSheets) && (
                  <div className="mt-3">
                    <label className="label text-sm">Sheet (XLSX)</label>
                    <select
                      value={props.selectedDriveSheetName}
                      onChange={(e) => {
                        props.setSelectedDriveSheetName(e.target.value);
                        if (typeof window !== "undefined") {
                          localStorage.setItem(
                            DASHBOARD_STORAGE.driveMetadataSheetName,
                            e.target.value,
                          );
                        }
                      }}
                      disabled={props.loadingDriveSheets}
                      className="input-field w-full max-w-xs"
                    >
                      {props.loadingDriveSheets ? (
                        <option value="">Loading…</option>
                      ) : (
                        props.driveSheetNames.map((s) => (
                          <option key={s.title} value={s.title}>
                            {s.title}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
