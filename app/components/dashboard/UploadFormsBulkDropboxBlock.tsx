"use client";

import { useAppToast } from "@/app/app-toast-context";
import { HIDE_GOOGLE_DRIVE_SHEETS } from "./upload-forms-constants";
import type { UploadFormsBulkSectionProps } from "./upload-forms-bulk-types";
import { useDropboxAuth } from "./DropboxAuthContext";
import UploadFormsBulkDropboxFolderSection from "./UploadFormsBulkDropboxFolderSection";
import UploadFormsBulkDropboxMetadataSection from "./UploadFormsBulkDropboxMetadataSection";
import UploadFormsBulkDropboxSubmitSection from "./UploadFormsBulkDropboxSubmitSection";

type Props = Pick<
  UploadFormsBulkSectionProps,
  | "uploadSource"
  | "dropboxPythonQueueMode"
  | "pythonQueueDetectInfo"
  | "dropboxUploadFolderPath"
  | "setDropboxUploadFolderPath"
  | "setDropboxBrowserMode"
  | "setDropboxBrowserContext"
  | "setShowDropboxBrowser"
  | "clearDropboxPythonQueueMode"
  | "skipDuplicateTitles"
  | "setSkipDuplicateTitles"
  | "dropboxThumbnailsFolderPath"
  | "setDropboxThumbnailsFolderPath"
  | "selectedDropboxCsvFile"
  | "setSelectedDropboxCsvFile"
  | "dropboxSheetNames"
  | "setDropboxSheetNames"
  | "loadingDropboxSheets"
  | "selectedDropboxSheetName"
  | "setSelectedDropboxSheetName"
  | "dropboxUploading"
  | "setDropboxUploading"
  | "schedulingEnabled"
  | "globalVideosPerDay"
  | "checkDuplicatesBeforeUpload"
  | "setSelectedJobId"
  | "fetchJobStatus"
  | "fetchQueue"
>;

export default function UploadFormsBulkDropboxBlock(props: Props) {
  const showAppToast = useAppToast();
  const { hasDropboxAuth, dropboxAuthLoading, connectDropbox } =
    useDropboxAuth();
  const {
    uploadSource,
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
    setSelectedJobId,
    fetchJobStatus,
    fetchQueue,
  } = props;

  if (!(uploadSource === "dropbox" || HIDE_GOOGLE_DRIVE_SHEETS)) return null;
  return (
    <>
      <UploadFormsBulkDropboxFolderSection
        hasDropboxAuth={hasDropboxAuth}
        dropboxAuthLoading={dropboxAuthLoading}
        connectDropbox={connectDropbox}
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
      />
      <UploadFormsBulkDropboxMetadataSection
        dropboxPythonQueueMode={dropboxPythonQueueMode}
        hasDropboxAuth={hasDropboxAuth}
        dropboxAuthLoading={dropboxAuthLoading}
        dropboxThumbnailsFolderPath={dropboxThumbnailsFolderPath}
        setDropboxThumbnailsFolderPath={setDropboxThumbnailsFolderPath}
        setDropboxBrowserMode={setDropboxBrowserMode}
        setDropboxBrowserContext={setDropboxBrowserContext}
        setShowDropboxBrowser={setShowDropboxBrowser}
        selectedDropboxCsvFile={selectedDropboxCsvFile}
        setSelectedDropboxCsvFile={setSelectedDropboxCsvFile}
        dropboxSheetNames={dropboxSheetNames}
        setDropboxSheetNames={setDropboxSheetNames}
        loadingDropboxSheets={loadingDropboxSheets}
        selectedDropboxSheetName={selectedDropboxSheetName}
        setSelectedDropboxSheetName={setSelectedDropboxSheetName}
      />
      <UploadFormsBulkDropboxSubmitSection
        dropboxPythonQueueMode={dropboxPythonQueueMode}
        clearDropboxPythonQueueMode={clearDropboxPythonQueueMode}
        showAppToast={showAppToast}
        dropboxUploadFolderPath={dropboxUploadFolderPath}
        hasDropboxAuth={hasDropboxAuth}
        dropboxUploading={dropboxUploading}
        setDropboxUploading={setDropboxUploading}
        schedulingEnabled={schedulingEnabled}
        globalVideosPerDay={globalVideosPerDay}
        selectedDropboxCsvFile={selectedDropboxCsvFile}
        selectedDropboxSheetName={selectedDropboxSheetName}
        dropboxThumbnailsFolderPath={dropboxThumbnailsFolderPath}
        checkDuplicatesBeforeUpload={checkDuplicatesBeforeUpload}
        setDropboxUploadFolderPath={setDropboxUploadFolderPath}
        setSelectedDropboxCsvFile={setSelectedDropboxCsvFile}
        setSelectedDropboxSheetName={setSelectedDropboxSheetName}
        setDropboxThumbnailsFolderPath={setDropboxThumbnailsFolderPath}
        setSelectedJobId={setSelectedJobId}
        fetchJobStatus={fetchJobStatus}
        fetchQueue={fetchQueue}
      />
    </>
  );
}
