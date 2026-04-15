"use client";

import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import { HIDE_GOOGLE_DRIVE_SHEETS } from "./upload-forms-constants";
import type { UploadFormsBulkSectionProps } from "./upload-forms-bulk-types";
import UploadFormsBulkDriveBlock from "./UploadFormsBulkDriveBlock";
import UploadFormsBulkDropboxBlock from "./UploadFormsBulkDropboxBlock";
import UploadFormsBulkProgressBlock from "./UploadFormsBulkProgressBlock";
import UploadFormsBulkQueueFooter from "./UploadFormsBulkQueueFooter";

export type {
  PythonQueueDetectInfo,
  BulkUploadProgressState,
  UploadFormsBulkSectionProps,
} from "./upload-forms-bulk-types";

export default function UploadFormsBulkSection(
  props: UploadFormsBulkSectionProps,
) {
  const {
    showBulkUpload,
    setShowBulkUpload,
    handleBulkUpload,
    uploadSource,
    setUploadSource,
    driveUploadFolderId,
    setDriveUploadFolderId,
    setDriveUploadFolderName,
    setDriveBrowserContext,
    setShowDriveBrowser,
    setShowSheetsBrowser,
    dropboxPythonQueueMode,
    pythonQueueDetectInfo,
    dropboxUploadFolderPath,
    setDropboxUploadFolderPath,
    setDropboxBrowserMode,
    setDropboxBrowserContext,
    setShowDropboxBrowser,
    clearDropboxPythonQueueMode,
    skipDuplicateTitles,
    setSkipDuplicateTitles,
    dropboxThumbnailsFolderPath,
    setDropboxThumbnailsFolderPath,
    selectedDropboxCsvFile,
    setSelectedDropboxCsvFile,
    dropboxSheetNames,
    setDropboxSheetNames,
    loadingDropboxSheets,
    selectedDropboxSheetName,
    setSelectedDropboxSheetName,
    dropboxUploading,
    setDropboxUploading,
    schedulingEnabled,
    globalVideosPerDay,
    checkDuplicatesBeforeUpload,
    setCheckDuplicatesBeforeUpload,
    setSelectedJobId,
    fetchJobStatus,
    fetchQueue,
    bulkUploadProgress,
    bulkUploading,
    selectedBulkFiles,
    bulkUrls,
    debounceTimerRef,
    fetchSheets,
    availableSheets,
    setAvailableSheets,
    loadingSheets,
    spreadsheetTitle,
    setSpreadsheetTitle,
  } = props;

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📤</span>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              Upload Videos
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowBulkUpload(!showBulkUpload)}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors"
          >
            {showBulkUpload ? "Hide" : "Show"}
          </button>
        </div>

        {showBulkUpload && (
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>📤 Upload Videos:</strong>{" "}
                {HIDE_GOOGLE_DRIVE_SHEETS
                  ? "Upload multiple videos from Dropbox folders. Optionally provide CSV or XLSX files for metadata. Videos stream directly to YouTube - no disk storage needed! Uploads are processed in the background."
                  : "Upload multiple videos from Google Drive or Dropbox folders. Optionally provide Google Sheets or CSV files for metadata. Videos stream directly to YouTube - no disk storage needed! Uploads are processed in the background."}
              </p>
            </div>

            {!HIDE_GOOGLE_DRIVE_SHEETS && (
              <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
                <label className="text-sm font-semibold text-purple-900 dark:text-purple-100 block mb-3">
                  Select Upload Source:
                </label>
                <div className="flex gap-4 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="uploadSource"
                      value="drive"
                      checked={uploadSource === "drive"}
                      onChange={() => {
                        setUploadSource("drive");
                        if (typeof window !== "undefined") {
                          localStorage.setItem(
                            DASHBOARD_STORAGE.folderSource,
                            "drive",
                          );
                          localStorage.removeItem(
                            DASHBOARD_STORAGE.sheetsUploadSource,
                          );
                        }
                      }}
                      className="w-4 h-4 text-green-600"
                    />
                    <span className="text-sm text-purple-800 dark:text-purple-200">
                      📁 Google Drive
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="uploadSource"
                      value="dropbox"
                      checked={uploadSource === "dropbox"}
                      onChange={() => {
                        setUploadSource("dropbox");
                        if (typeof window !== "undefined") {
                          localStorage.setItem(
                            DASHBOARD_STORAGE.folderSource,
                            "dropbox",
                          );
                          localStorage.removeItem(
                            DASHBOARD_STORAGE.sheetsUploadSource,
                          );
                        }
                      }}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-purple-800 dark:text-purple-200">
                      📦 Dropbox
                    </span>
                  </label>
                </div>
              </div>
            )}

            <form
              onSubmit={handleBulkUpload}
              className="flex flex-col gap-5"
            >
              <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1fr_minmax(280px,360px)] lg:items-start lg:gap-6">
                <div className="flex min-w-0 flex-col gap-5">
                  <UploadFormsBulkDriveBlock
                    uploadSource={uploadSource}
                    driveUploadFolderId={driveUploadFolderId}
                    setDriveUploadFolderId={setDriveUploadFolderId}
                    setDriveUploadFolderName={setDriveUploadFolderName}
                    setDriveBrowserContext={setDriveBrowserContext}
                    setShowDriveBrowser={setShowDriveBrowser}
                    setShowSheetsBrowser={setShowSheetsBrowser}
                    debounceTimerRef={debounceTimerRef}
                    fetchSheets={fetchSheets}
                    availableSheets={availableSheets}
                    setAvailableSheets={setAvailableSheets}
                    loadingSheets={loadingSheets}
                    spreadsheetTitle={spreadsheetTitle}
                    setSpreadsheetTitle={setSpreadsheetTitle}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-5">
                  <UploadFormsBulkDropboxBlock
                    uploadSource={uploadSource}
                    dropboxPythonQueueMode={dropboxPythonQueueMode}
                    pythonQueueDetectInfo={pythonQueueDetectInfo}
                    dropboxUploadFolderPath={dropboxUploadFolderPath}
                    setDropboxUploadFolderPath={setDropboxUploadFolderPath}
                    setDropboxBrowserMode={setDropboxBrowserMode}
                    setDropboxBrowserContext={setDropboxBrowserContext}
                    setShowDropboxBrowser={setShowDropboxBrowser}
                    clearDropboxPythonQueueMode={clearDropboxPythonQueueMode}
                    skipDuplicateTitles={skipDuplicateTitles}
                    setSkipDuplicateTitles={setSkipDuplicateTitles}
                    dropboxThumbnailsFolderPath={dropboxThumbnailsFolderPath}
                    setDropboxThumbnailsFolderPath={
                      setDropboxThumbnailsFolderPath
                    }
                    selectedDropboxCsvFile={selectedDropboxCsvFile}
                    setSelectedDropboxCsvFile={setSelectedDropboxCsvFile}
                    dropboxSheetNames={dropboxSheetNames}
                    setDropboxSheetNames={setDropboxSheetNames}
                    loadingDropboxSheets={loadingDropboxSheets}
                    selectedDropboxSheetName={selectedDropboxSheetName}
                    setSelectedDropboxSheetName={setSelectedDropboxSheetName}
                    dropboxUploading={dropboxUploading}
                    setDropboxUploading={setDropboxUploading}
                    schedulingEnabled={schedulingEnabled}
                    globalVideosPerDay={globalVideosPerDay}
                    checkDuplicatesBeforeUpload={checkDuplicatesBeforeUpload}
                    setSelectedJobId={setSelectedJobId}
                    fetchJobStatus={fetchJobStatus}
                    fetchQueue={fetchQueue}
                  />
                </div>
              </div>
              <UploadFormsBulkProgressBlock
                bulkUploadProgress={bulkUploadProgress}
                bulkUploading={bulkUploading}
              />
              <UploadFormsBulkQueueFooter
                uploadSource={uploadSource}
                checkDuplicatesBeforeUpload={checkDuplicatesBeforeUpload}
                setCheckDuplicatesBeforeUpload={setCheckDuplicatesBeforeUpload}
                bulkUploading={bulkUploading}
                selectedBulkFiles={selectedBulkFiles}
                bulkUrls={bulkUrls}
              />
            </form>
          </div>
        )}
      </div>
    </>
  );
}
