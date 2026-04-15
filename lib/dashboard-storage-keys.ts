/**
 * Client localStorage keys for the dashboard upload / queue UI.
 * Schedule keys stay in {@link ./global-upload-schedule}.
 */
export const DASHBOARD_STORAGE = {
  darkMode: "darkMode",
  showSingleUpload: "showSingleUpload",
  showBulkUpload: "showBulkUpload",
  checkDuplicatesBeforeUpload: "checkDuplicatesBeforeUpload",
  driveUploadFolderId: "driveUploadFolderId",
  driveUploadFolderName: "driveUploadFolderName",
  sheetsDriveFolderId: "sheetsDriveFolderId",
  sheetsDriveFolderName: "sheetsDriveFolderName",
  sheetsSpreadsheetUrl: "sheetsSpreadsheetUrl",
  sheetsDropboxFolderPath: "sheetsDropboxFolderPath",
  csvSource: "csvSource",
  folderSource: "folderSource",
  sheetsUploadSource: "sheetsUploadSource",
  selectedDropboxCsvFile: "selectedDropboxCsvFile",
  dropboxSpreadsheetFile: "dropboxSpreadsheetFile",
  dropboxUploadFolderPath: "dropboxUploadFolderPath",
  dropboxThumbnailsFolderPath: "dropboxThumbnailsFolderPath",
  dropboxRecursive: "dropboxRecursive",
  dropboxPostAction: "dropboxPostAction",
  dropboxPrivacy: "dropboxPrivacy",
  dropboxCompletedFolder: "dropboxCompletedFolder",
  selectedDropboxSheetName: "selectedDropboxSheetName",
  dropboxSkipDuplicateTitles: "dropboxSkipDuplicateTitles",
  hasDropboxAuth: "hasDropboxAuth",
  /** Queue tab strip: manual vs queue-driven worker mode */
  uploadQueueWorkerMode: "dashboardUploadSourceMode",
} as const;
