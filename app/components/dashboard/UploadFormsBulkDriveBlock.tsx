"use client";

import { useAppToast } from "@/app/app-toast-context";
import { HIDE_GOOGLE_DRIVE_SHEETS } from "./upload-forms-constants";
import type { UploadFormsBulkSectionProps } from "./upload-forms-bulk-types";
import UploadFormsBulkDriveCsvSection from "./UploadFormsBulkDriveCsvSection";
import UploadFormsBulkDriveFolderSection from "./UploadFormsBulkDriveFolderSection";
import UploadFormsBulkDriveSheetsSection from "./UploadFormsBulkDriveSheetsSection";

type Props = Pick<
  UploadFormsBulkSectionProps,
  | "uploadSource"
  | "driveUploadFolderId"
  | "setDriveUploadFolderId"
  | "setDriveUploadFolderName"
  | "setDriveBrowserContext"
  | "setShowDriveBrowser"
  | "setShowSheetsBrowser"
  | "debounceTimerRef"
  | "fetchSheets"
  | "availableSheets"
  | "setAvailableSheets"
  | "loadingSheets"
  | "spreadsheetTitle"
  | "setSpreadsheetTitle"
>;

export default function UploadFormsBulkDriveBlock(props: Props) {
  const showAppToast = useAppToast();
  const {
    uploadSource,
    driveUploadFolderId,
    setDriveUploadFolderId,
    setDriveUploadFolderName,
    setDriveBrowserContext,
    setShowDriveBrowser,
    setShowSheetsBrowser,
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
      {!HIDE_GOOGLE_DRIVE_SHEETS && uploadSource === "drive" && (
        <>
          <UploadFormsBulkDriveFolderSection
            driveUploadFolderId={driveUploadFolderId}
            setDriveUploadFolderId={setDriveUploadFolderId}
            setDriveUploadFolderName={setDriveUploadFolderName}
            setDriveBrowserContext={setDriveBrowserContext}
            setShowDriveBrowser={setShowDriveBrowser}
            showAppToast={showAppToast}
          />
          <UploadFormsBulkDriveSheetsSection
            setShowSheetsBrowser={setShowSheetsBrowser}
            debounceTimerRef={debounceTimerRef}
            fetchSheets={fetchSheets}
            availableSheets={availableSheets}
            setAvailableSheets={setAvailableSheets}
            loadingSheets={loadingSheets}
            spreadsheetTitle={spreadsheetTitle}
            setSpreadsheetTitle={setSpreadsheetTitle}
          />
          <UploadFormsBulkDriveCsvSection />
        </>
      )}
    </>
  );
}
