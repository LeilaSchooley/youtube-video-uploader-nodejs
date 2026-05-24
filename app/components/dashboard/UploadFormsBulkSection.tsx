"use client";

import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import { HIDE_GOOGLE_DRIVE_SHEETS } from "./upload-forms-constants";
import type { UploadFormsBulkSectionProps } from "./upload-forms-bulk-types";
import UploadFormsBulkDriveBlock from "./UploadFormsBulkDriveBlock";
import UploadFormsBulkDropboxBlock from "./UploadFormsBulkDropboxBlock";
import UploadFormsBulkProgressBlock from "./UploadFormsBulkProgressBlock";
import UploadFormsBulkQueueFooter from "./UploadFormsBulkQueueFooter";
import AiAssistSnippetPanel from "@/app/components/dashboard/AiAssistSnippetPanel";

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
    setDriveBrowserMode,
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
    drivePythonQueueMode,
    drivePythonQueueDetectInfo,
    clearDrivePythonQueueMode,
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
    driveUploading,
    setDriveUploading,
    selectedDriveCsvFileId,
    selectedDriveCsvFileName,
    setSelectedDriveCsvFileId,
    setSelectedDriveCsvFileName,
    driveThumbnailsFolderId,
    setDriveThumbnailsFolderId,
    driveThumbnailsFolderName,
    setDriveThumbnailsFolderName,
    driveSheetNames,
    loadingDriveSheets,
    selectedDriveMetadataSheetName,
    setSelectedDriveMetadataSheetName,
    driveSpreadsheetUrl,
    setDriveSpreadsheetUrl,
    selectedDriveFolderId,
  } = props;

  const showDriveBulkColumn =
    !HIDE_GOOGLE_DRIVE_SHEETS && uploadSource === "drive";

  return (
    <div className="card min-w-0 max-w-full">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-3xl" aria-hidden>
            📤
          </span>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white sm:text-2xl">
              Upload Videos
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowBulkUpload(!showBulkUpload)}
          className="shrink-0 self-start rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-800 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 sm:self-auto"
          >
            {showBulkUpload ? "Hide" : "Show"}
          </button>
        </div>

        {showBulkUpload && (
        <div className="min-h-0 max-h-[min(72dvh,calc(100dvh-12rem))] space-y-4 overflow-x-hidden overflow-y-auto overscroll-y-contain pr-0.5 [-webkit-overflow-scrolling:touch] sm:max-h-[min(75dvh,calc(100dvh-10rem))]">
          <div className="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:border-blue-700 dark:from-blue-900/20 dark:to-indigo-900/20">
            <p className="text-pretty text-sm leading-relaxed text-blue-900 dark:text-blue-100">
              <span className="font-semibold text-blue-950 dark:text-blue-50">
                How it works.
              </span>{" "}
                {HIDE_GOOGLE_DRIVE_SHEETS
                ? "Upload multiple videos from Dropbox folders. Optionally add CSV or XLSX for metadata. Files stream to YouTube; uploads run in the background."
                : "Upload from Google Drive or Dropbox folders. Optionally add Google Sheets or CSV for metadata. Files stream to YouTube; uploads run in the background."}
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
              className="flex min-w-0 flex-col gap-5"
            >
                        <div
                          className={
                  showDriveBulkColumn
                    ? "flex min-w-0 flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[1fr_minmax(0,28rem)]"
                    : "flex min-w-0 flex-col gap-5"
                }
              >
                {showDriveBulkColumn && (
                  <div className="flex min-w-0 flex-col gap-5">
                    <UploadFormsBulkDriveBlock
                      uploadSource={uploadSource}
                      driveUploadFolderId={driveUploadFolderId}
                      setDriveUploadFolderId={setDriveUploadFolderId}
                      setDriveUploadFolderName={setDriveUploadFolderName}
                      setDriveBrowserContext={setDriveBrowserContext}
                      setDriveBrowserMode={setDriveBrowserMode}
                      setShowDriveBrowser={setShowDriveBrowser}
                      setShowSheetsBrowser={setShowSheetsBrowser}
                      debounceTimerRef={debounceTimerRef}
                      fetchSheets={fetchSheets}
                      availableSheets={availableSheets}
                      setAvailableSheets={setAvailableSheets}
                      loadingSheets={loadingSheets}
                      spreadsheetTitle={spreadsheetTitle}
                      setSpreadsheetTitle={setSpreadsheetTitle}
                      skipDuplicateTitles={skipDuplicateTitles}
                      driveUploading={driveUploading}
                      setDriveUploading={setDriveUploading}
                      schedulingEnabled={schedulingEnabled}
                      globalVideosPerDay={globalVideosPerDay}
                      setSelectedJobId={setSelectedJobId}
                      fetchJobStatus={fetchJobStatus}
                      fetchQueue={fetchQueue}
                      selectedDriveFolderId={selectedDriveFolderId}
                      selectedDriveCsvFileId={selectedDriveCsvFileId}
                      selectedDriveCsvFileName={selectedDriveCsvFileName}
                      setSelectedDriveCsvFileId={setSelectedDriveCsvFileId}
                      setSelectedDriveCsvFileName={setSelectedDriveCsvFileName}
                      driveThumbnailsFolderId={driveThumbnailsFolderId}
                      setDriveThumbnailsFolderId={setDriveThumbnailsFolderId}
                      driveThumbnailsFolderName={driveThumbnailsFolderName}
                      setDriveThumbnailsFolderName={setDriveThumbnailsFolderName}
                      driveSheetNames={driveSheetNames}
                      loadingDriveSheets={loadingDriveSheets}
                      selectedDriveMetadataSheetName={
                        selectedDriveMetadataSheetName
                      }
                      setSelectedDriveMetadataSheetName={
                        setSelectedDriveMetadataSheetName
                      }
                      driveSpreadsheetUrl={driveSpreadsheetUrl}
                      setDriveSpreadsheetUrl={setDriveSpreadsheetUrl}
                      drivePythonQueueMode={drivePythonQueueMode}
                      drivePythonQueueDetectInfo={drivePythonQueueDetectInfo}
                      clearDrivePythonQueueMode={clearDrivePythonQueueMode}
                    />
                  </div>
                )}
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
              <AiAssistSnippetPanel
                variant="standalone"
                heading="Metadata prep (Sheets / CSV / manifests)"
              />
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
  );
}
