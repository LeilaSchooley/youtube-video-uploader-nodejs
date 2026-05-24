"use client";

import { useAppToast } from "@/app/app-toast-context";
import { HIDE_GOOGLE_DRIVE_SHEETS } from "./upload-forms-constants";
import type { UploadFormsBulkSectionProps } from "./upload-forms-bulk-types";
import { useGoogleDriveAuth } from "./GoogleDriveAuthContext";
import UploadFormsBulkDriveFolderSection from "./UploadFormsBulkDriveFolderSection";
import UploadFormsBulkDriveMetadataSection from "./UploadFormsBulkDriveMetadataSection";
import UploadFormsBulkDriveSheetsSection from "./UploadFormsBulkDriveSheetsSection";
import UploadFormsBulkDriveSubmitSection from "./UploadFormsBulkDriveSubmitSection";

type Props = Pick<
  UploadFormsBulkSectionProps,
  | "uploadSource"
  | "driveUploadFolderId"
  | "setDriveUploadFolderId"
  | "setDriveUploadFolderName"
  | "setDriveBrowserContext"
  | "setDriveBrowserMode"
  | "setShowDriveBrowser"
  | "setShowSheetsBrowser"
  | "debounceTimerRef"
  | "fetchSheets"
  | "availableSheets"
  | "setAvailableSheets"
  | "loadingSheets"
  | "spreadsheetTitle"
  | "setSpreadsheetTitle"
  | "skipDuplicateTitles"
  | "driveUploading"
  | "setDriveUploading"
  | "schedulingEnabled"
  | "globalVideosPerDay"
  | "setSelectedJobId"
  | "fetchJobStatus"
  | "fetchQueue"
  | "selectedDriveFolderId"
  | "selectedDriveCsvFileId"
  | "selectedDriveCsvFileName"
  | "setSelectedDriveCsvFileId"
  | "setSelectedDriveCsvFileName"
  | "driveThumbnailsFolderId"
  | "setDriveThumbnailsFolderId"
  | "driveThumbnailsFolderName"
  | "setDriveThumbnailsFolderName"
  | "driveSheetNames"
  | "loadingDriveSheets"
  | "selectedDriveMetadataSheetName"
  | "setSelectedDriveMetadataSheetName"
  | "driveSpreadsheetUrl"
  | "setDriveSpreadsheetUrl"
  | "drivePythonQueueMode"
  | "drivePythonQueueDetectInfo"
  | "clearDrivePythonQueueMode"
>;

export default function UploadFormsBulkDriveBlock(props: Props) {
  const showAppToast = useAppToast();
  const {
    hasGoogleDriveAuth,
    driveAuthLoading,
    connectGoogleDrive,
  } = useGoogleDriveAuth();

  const {
    uploadSource,
    driveUploadFolderId,
    setDriveUploadFolderId,
    setDriveUploadFolderName,
    setDriveBrowserContext,
    setDriveBrowserMode,
    setShowDriveBrowser,
    setShowSheetsBrowser,
    debounceTimerRef,
    fetchSheets,
    availableSheets,
    setAvailableSheets,
    loadingSheets,
    spreadsheetTitle,
    setSpreadsheetTitle,
    skipDuplicateTitles,
    driveUploading,
    setDriveUploading,
    schedulingEnabled,
    globalVideosPerDay,
    setSelectedJobId,
    fetchJobStatus,
    fetchQueue,
    selectedDriveFolderId,
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
    drivePythonQueueMode,
    drivePythonQueueDetectInfo,
    clearDrivePythonQueueMode,
  } = props;

  if (!(uploadSource === "drive" || HIDE_GOOGLE_DRIVE_SHEETS)) return null;

  return (
    <>
      <UploadFormsBulkDriveFolderSection
        driveUploadFolderId={driveUploadFolderId}
        setDriveUploadFolderId={setDriveUploadFolderId}
        setDriveUploadFolderName={setDriveUploadFolderName}
        setDriveBrowserContext={setDriveBrowserContext}
        setDriveBrowserMode={setDriveBrowserMode}
        setShowDriveBrowser={setShowDriveBrowser}
        hasGoogleDriveAuth={hasGoogleDriveAuth}
        driveAuthLoading={driveAuthLoading}
        connectGoogleDrive={connectGoogleDrive}
        drivePythonQueueMode={drivePythonQueueMode}
        drivePythonQueueDetectInfo={drivePythonQueueDetectInfo}
        clearDrivePythonQueueMode={clearDrivePythonQueueMode}
      />
      <UploadFormsBulkDriveMetadataSection
        hasGoogleDriveAuth={hasGoogleDriveAuth}
        driveAuthLoading={driveAuthLoading}
        driveThumbnailsFolderId={driveThumbnailsFolderId}
        setDriveThumbnailsFolderId={setDriveThumbnailsFolderId}
        driveThumbnailsFolderName={driveThumbnailsFolderName}
        setDriveThumbnailsFolderName={setDriveThumbnailsFolderName}
        setDriveBrowserContext={setDriveBrowserContext}
        setDriveBrowserMode={setDriveBrowserMode}
        setShowDriveBrowser={setShowDriveBrowser}
        selectedDriveCsvFileId={selectedDriveCsvFileId}
        selectedDriveCsvFileName={selectedDriveCsvFileName}
        setSelectedDriveCsvFileId={setSelectedDriveCsvFileId}
        setSelectedDriveCsvFileName={setSelectedDriveCsvFileName}
        driveSheetNames={driveSheetNames}
        loadingDriveSheets={loadingDriveSheets}
        selectedDriveSheetName={selectedDriveMetadataSheetName}
        setSelectedDriveSheetName={setSelectedDriveMetadataSheetName}
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
        driveSpreadsheetUrl={driveSpreadsheetUrl}
        setDriveSpreadsheetUrl={setDriveSpreadsheetUrl}
      />
      <UploadFormsBulkDriveSubmitSection
        drivePythonQueueMode={drivePythonQueueMode}
        clearDrivePythonQueueMode={clearDrivePythonQueueMode}
        showAppToast={showAppToast}
        driveUploadFolderId={driveUploadFolderId}
        hasGoogleDriveAuth={hasGoogleDriveAuth}
        driveUploading={driveUploading}
        setDriveUploading={setDriveUploading}
        schedulingEnabled={schedulingEnabled}
        globalVideosPerDay={globalVideosPerDay}
        selectedDriveCsvFileId={selectedDriveCsvFileId}
        selectedDriveCsvFileName={selectedDriveCsvFileName}
        selectedDriveSheetName={selectedDriveMetadataSheetName}
        driveThumbnailsFolderId={driveThumbnailsFolderId}
        skipDuplicateTitles={skipDuplicateTitles}
        driveSpreadsheetUrl={driveSpreadsheetUrl}
        selectedDriveFolderIdForSheets={selectedDriveFolderId}
        setSelectedJobId={setSelectedJobId}
        fetchJobStatus={fetchJobStatus}
        fetchQueue={fetchQueue}
      />
    </>
  );
}
