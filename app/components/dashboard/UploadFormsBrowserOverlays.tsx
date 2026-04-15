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
  driveBrowserContext: "drive" | "sheets";
  handleSheetsDriveFolderSelect: (
    folderId: string,
    folderName: string,
  ) => void;
  handleDriveFolderSelect: (folderId: string, folderName: string) => void;

  showDropboxBrowser: boolean;
  setShowDropboxBrowser: (open: boolean) => void;
  dropboxBrowserMode: "folder" | "file";
  dropboxBrowserContext:
    | "bulk"
    | "sheets-folder"
    | "sheets-file"
    | "thumbnails-folder";
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
  handleSheetsDriveFolderSelect,
  handleDriveFolderSelect,
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
          onSelectFolder={(folderId, folderName) => {
            if (driveBrowserContext === "sheets") {
              handleSheetsDriveFolderSelect(folderId, folderName);
            } else {
              handleDriveFolderSelect(folderId, folderName);
            }
            setShowDriveBrowser(false);
          }}
          onClose={() => setShowDriveBrowser(false)}
        />
      )}

      {showDropboxBrowser && (
        <DropboxBrowser
          mode={dropboxBrowserMode}
          fileFilter={dropboxBrowserMode === "file" ? "spreadsheet" : "video"}
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
