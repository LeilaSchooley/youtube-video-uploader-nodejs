"use client";

import { useAppToast } from "@/app/app-toast-context";
import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import type { ComponentProps } from "react";
import DriveBrowser from "./DriveBrowser";
import DropboxBrowser from "./DropboxBrowser";
import SheetsBrowser from "./SheetsBrowser";
import SheetPreview from "./SheetPreview";

type SheetPreviewData = ComponentProps<typeof SheetPreview>["previewData"];

export interface UploadFormsBrowserOverlaysProps {
  showDriveBrowser: boolean;
  setShowDriveBrowser: (open: boolean) => void;
  driveBrowserContext:
    | "drive"
    | "sheets"
    | "metadata-csv"
    | "thumbnails"
    | "single-video";
  driveBrowserMode: "folder" | "file";
  handleSheetsDriveFolderSelect: (
    folderId: string,
    folderName: string,
  ) => void;
  handleDriveFolderSelect: (folderId: string, folderName: string) => void;
  setSelectedDriveCsvFileId: (id: string) => void;
  setSelectedDriveCsvFileName: (name: string) => void;
  setDriveThumbnailsFolderId: (id: string) => void;
  setDriveThumbnailsFolderName: (name: string) => void;
  setSingleDropboxVideoPath: (path: string) => void;
  setSingleDropboxVideoName: (name: string) => void;
  setSingleDriveVideoId: (id: string) => void;
  setSingleDriveVideoName: (name: string) => void;

  showDropboxBrowser: boolean;
  setShowDropboxBrowser: (open: boolean) => void;
  dropboxBrowserMode: "folder" | "file";
  dropboxBrowserContext:
    | "bulk"
    | "sheets-folder"
    | "sheets-file"
    | "thumbnails-folder"
    | "single-video";
  handleBulkDropboxFolderSelected: (
    folderPath: string,
    folderName: string,
  ) => void | Promise<void>;
  setSelectedDropboxFolderPath: (path: string) => void;
  setDropboxThumbnailsFolderPath: (path: string) => void;
  setDropboxUploadFolderPath: (path: string) => void;
  setSelectedDropboxCsvFile: (path: string) => void;
  setSelectedDropboxFile: (path: string) => void;

  showSheetsBrowser: boolean;
  setShowSheetsBrowser: (open: boolean) => void;
  handleSheetSelect: (
    spreadsheetId: string,
    spreadsheetName: string,
  ) => Promise<void>;

  showSheetPreview: boolean;
  previewData: SheetPreviewData | null;
  onCloseSheetPreview: () => void;
}

export default function UploadFormsBrowserOverlays({
  showDriveBrowser,
  setShowDriveBrowser,
  driveBrowserContext,
  driveBrowserMode,
  handleSheetsDriveFolderSelect,
  handleDriveFolderSelect,
  setSelectedDriveCsvFileId,
  setSelectedDriveCsvFileName,
  setDriveThumbnailsFolderId,
  setDriveThumbnailsFolderName,
  setSingleDropboxVideoPath,
  setSingleDropboxVideoName,
  setSingleDriveVideoId,
  setSingleDriveVideoName,
  showDropboxBrowser,
  setShowDropboxBrowser,
  dropboxBrowserMode,
  dropboxBrowserContext,
  handleBulkDropboxFolderSelected,
  setSelectedDropboxFolderPath,
  setDropboxThumbnailsFolderPath,
  setDropboxUploadFolderPath,
  setSelectedDropboxCsvFile,
  setSelectedDropboxFile,
  showSheetsBrowser,
  setShowSheetsBrowser,
  handleSheetSelect,
  showSheetPreview,
  previewData,
  onCloseSheetPreview,
}: UploadFormsBrowserOverlaysProps) {
  const showAppToast = useAppToast();
  return (
    <>
      {showDriveBrowser && (
        <DriveBrowser
          mode={driveBrowserMode}
          fileFilter={
            driveBrowserContext === "metadata-csv" ? "spreadsheet" : "video"
          }
          onSelectFolder={(folderId, folderName) => {
            if (driveBrowserContext === "sheets") {
              handleSheetsDriveFolderSelect(folderId, folderName);
            } else if (driveBrowserContext === "thumbnails") {
              setDriveThumbnailsFolderId(folderId);
              setDriveThumbnailsFolderName(folderName);
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  DASHBOARD_STORAGE.driveThumbnailsFolderId,
                  folderId,
                );
              }
              showAppToast({
                message: `Thumbnails folder: ${folderName}`,
                type: "success",
              });
            } else {
              handleDriveFolderSelect(folderId, folderName);
            }
            setShowDriveBrowser(false);
          }}
          onSelectFile={(fileId, fileName) => {
            if (driveBrowserContext === "metadata-csv") {
              setSelectedDriveCsvFileId(fileId);
              setSelectedDriveCsvFileName(fileName);
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  DASHBOARD_STORAGE.selectedDriveCsvFileId,
                  fileId,
                );
                localStorage.setItem(
                  DASHBOARD_STORAGE.selectedDriveCsvFileName,
                  fileName,
                );
              }
              showAppToast({
                message: `Metadata file: ${fileName}`,
                type: "success",
              });
              setShowDriveBrowser(false);
              return;
            }
            if (driveBrowserContext === "single-video") {
              setSingleDriveVideoId(fileId);
              setSingleDriveVideoName(fileName);
              showAppToast({
                message: `Video: ${fileName}`,
                type: "success",
              });
              setShowDriveBrowser(false);
            }
          }}
          onClose={() => setShowDriveBrowser(false)}
        />
      )}

      {showDropboxBrowser && (
        <DropboxBrowser
          mode={dropboxBrowserMode}
          fileFilter={
            dropboxBrowserMode === "file" &&
            dropboxBrowserContext === "sheets-file"
              ? "spreadsheet"
              : "video"
          }
          onSelectFolder={(folderPath, folderName) => {
            if (dropboxBrowserContext === "sheets-folder") {
              setSelectedDropboxFolderPath(folderPath);
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  DASHBOARD_STORAGE.sheetsDropboxFolderPath,
                  folderPath,
                );
              }
              showAppToast({
                message: `Selected folder: ${folderName}`,
                type: "success",
              });
              setShowDropboxBrowser(false);
              return;
            }
            if (dropboxBrowserContext === "thumbnails-folder") {
              setDropboxThumbnailsFolderPath(folderPath);
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  DASHBOARD_STORAGE.dropboxThumbnailsFolderPath,
                  folderPath,
                );
              }
              showAppToast({
                message: `Selected folder: ${folderName}`,
                type: "success",
              });
              setShowDropboxBrowser(false);
              return;
            }
            if (dropboxBrowserContext === "bulk") {
              void handleBulkDropboxFolderSelected(folderPath, folderName);
              return;
            }
            setDropboxUploadFolderPath(folderPath);
            if (typeof window !== "undefined") {
              localStorage.setItem(
                DASHBOARD_STORAGE.dropboxUploadFolderPath,
                folderPath,
              );
            }
            showAppToast({
              message: `Selected folder: ${folderName}`,
              type: "success",
            });
            setShowDropboxBrowser(false);
          }}
          onSelectFile={(filePath, fileName) => {
            if (dropboxBrowserContext === "sheets-file") {
              setSelectedDropboxCsvFile(filePath);
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  DASHBOARD_STORAGE.selectedDropboxCsvFile,
                  filePath,
                );
              }
            } else if (dropboxBrowserContext === "single-video") {
              setSingleDropboxVideoPath(filePath);
              setSingleDropboxVideoName(fileName);
            } else {
              setSelectedDropboxFile(filePath);
              if (typeof window !== "undefined") {
                localStorage.setItem(
                  DASHBOARD_STORAGE.dropboxSpreadsheetFile,
                  filePath,
                );
              }
            }
            showAppToast({
              message: `Selected file: ${fileName}`,
              type: "success",
            });
            setShowDropboxBrowser(false);
          }}
          onClose={() => setShowDropboxBrowser(false)}
        />
      )}

      {showSheetsBrowser && (
        <SheetsBrowser
          onSelectSheet={handleSheetSelect}
          onClose={() => setShowSheetsBrowser(false)}
        />
      )}

      {showSheetPreview && previewData && (
        <SheetPreview previewData={previewData} onClose={onCloseSheetPreview} />
      )}
    </>
  );
}
