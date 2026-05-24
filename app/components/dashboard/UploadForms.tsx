"use client";

import { useEffect, useState } from "react";
import UploadFormsBrowserOverlays from "./UploadFormsBrowserOverlays";
import UploadFormsBulkSection from "./UploadFormsBulkSection";
import UploadFormsSingleVideoCard from "./UploadFormsSingleVideoCard";
import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";
import { HIDE_GOOGLE_DRIVE_SHEETS } from "./upload-forms-constants";
import { useAppToast } from "@/app/app-toast-context";
import { useDropboxAuth } from "./DropboxAuthContext";
import { useGoogleDriveAuth } from "./GoogleDriveAuthContext";
import { useDropboxQueueSource } from "@/app/dashboard/hooks/useDropboxQueueSource";
import { useDriveQueueSource } from "@/app/dashboard/hooks/useDriveQueueSource";
import { useSheetsMetadata } from "@/app/dashboard/hooks/useSheetsMetadata";
import { useDropboxSheetNames } from "./useDropboxSheetNames";
import { useDriveSheetNames } from "./useDriveSheetNames";
import {
  createSheetSelectHandler,
  createSheetsDriveFolderSelectHandler,
} from "./upload-forms-handlers";
import type { UploadFormsProps } from "./upload-forms-types";

export default function UploadForms(props: UploadFormsProps) {
  const {
    showSingleUpload,
    toggleSingleUpload,
    handleSingleUpload,
    selectedVideoFile,
    setSelectedVideoFile,
    fileInputRef,
    uploading,
    showBulkUpload,
    setShowBulkUpload,
    handleBulkUpload,
    selectedBulkFiles,
    bulkUploading,
    bulkUploadProgress,
    bulkUrls,
    checkDuplicatesBeforeUpload,
    setCheckDuplicatesBeforeUpload,
    setSelectedJobId,
    fetchJobStatus,
    fetchQueue,
    schedulingEnabled = false,
    globalVideosPerDay = "",
    openDropboxQueuePickerNonce = 0,
    openDriveQueuePickerNonce = 0,
    singleUploadClearKey = 0,
  } = props;
  const showAppToast = useAppToast();
  const [showDriveBrowser, setShowDriveBrowser] = useState(false);
  const [showDropboxBrowser, setShowDropboxBrowser] = useState(false);
  const [dropboxBrowserMode, setDropboxBrowserMode] = useState<"folder" | "file">("folder");
  const [dropboxBrowserContext, setDropboxBrowserContext] = useState<
    "bulk" | "sheets-folder" | "sheets-file" | "thumbnails-folder" | "single-video"
  >("bulk");
  const [singleDropboxVideoPath, setSingleDropboxVideoPath] = useState("");
  const [singleDropboxVideoName, setSingleDropboxVideoName] = useState("");
  const [singleDriveVideoId, setSingleDriveVideoId] = useState("");
  const [singleDriveVideoName, setSingleDriveVideoName] = useState("");
  const [dropboxThumbnailsFolderPath, setDropboxThumbnailsFolderPath] = useState<string>("");
  const [showSheetsBrowser, setShowSheetsBrowser] = useState(false);
  const [, setSelectedDropboxFile] = useState<string>("");
  const [selectedDropboxCsvFile, setSelectedDropboxCsvFile] = useState<string>("");
  const [dropboxSheetNames, setDropboxSheetNames] = useState<Array<{ title: string; sheetId: number }>>([]);
  const [selectedDropboxSheetName, setSelectedDropboxSheetName] = useState<string>("");
  const [loadingDropboxSheets, setLoadingDropboxSheets] = useState(false);
  const [showSheetPreview, setShowSheetPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedDriveFolderId, setSelectedDriveFolderId] = useState<string>("");
  const [selectedDriveFolderName, setSelectedDriveFolderName] = useState<string>("");
  const [selectedDropboxFolderPath, setSelectedDropboxFolderPath] = useState<string>("");
  const { hasDropboxAuth } = useDropboxAuth();
  const [uploadSource, setUploadSource] = useState<"drive" | "dropbox">(HIDE_GOOGLE_DRIVE_SHEETS ? "dropbox" : "drive");
  const [dropboxUploadFolderPath, setDropboxUploadFolderPath] = useState<string>("");
  const [driveUploadFolderId, setDriveUploadFolderId] = useState<string>("");
  const [driveUploadFolderName, setDriveUploadFolderName] = useState<string>("");
  const [driveBrowserContext, setDriveBrowserContext] = useState<
    "drive" | "sheets" | "metadata-csv" | "thumbnails" | "single-video"
  >("drive");
  const [driveBrowserMode, setDriveBrowserMode] = useState<"folder" | "file">(
    "folder",
  );
  const [selectedDriveCsvFileId, setSelectedDriveCsvFileId] = useState("");
  const [selectedDriveCsvFileName, setSelectedDriveCsvFileName] = useState("");
  const [driveThumbnailsFolderId, setDriveThumbnailsFolderId] = useState("");
  const [driveThumbnailsFolderName, setDriveThumbnailsFolderName] =
    useState("");
  const [driveSheetNames, setDriveSheetNames] = useState<
    Array<{ title: string; sheetId: number }>
  >([]);
  const [loadingDriveSheets, setLoadingDriveSheets] = useState(false);
  const [selectedDriveMetadataSheetName, setSelectedDriveMetadataSheetName] =
    useState("");
  const [driveSpreadsheetUrl, setDriveSpreadsheetUrl] = useState("");
  const [driveUploading, setDriveUploading] = useState(false);
  const [dropboxUploading, setDropboxUploading] = useState<boolean>(false);
  const [skipDuplicateTitles, setSkipDuplicateTitles] = useState<boolean>(true);

  const {
    availableSheets,
    setAvailableSheets,
    loadingSheets,
    spreadsheetTitle,
    setSpreadsheetTitle,
    fetchSheets,
    debounceTimerRef,
  } = useSheetsMetadata();

  const {
    dropboxPythonQueueMode,
    pythonQueueDetectInfo,
    handleBulkDropboxFolderSelected,
    clearDropboxPythonQueueMode,
  } = useDropboxQueueSource({
    setDropboxUploadFolderPath,
    setShowDropboxBrowser,
    hasDropboxAuth,
  });

  const { hasGoogleDriveAuth } = useGoogleDriveAuth();
  const {
    drivePythonQueueMode,
    pythonQueueDetectInfo: drivePythonQueueDetectInfo,
    handleBulkDriveFolderSelected,
    clearDrivePythonQueueMode,
  } = useDriveQueueSource({
    setDriveUploadFolderId,
    setDriveUploadFolderName,
    setShowDriveBrowser,
    hasGoogleDriveAuth,
  });

  useEffect(() => {
    if (!openDropboxQueuePickerNonce) return;
    setDropboxBrowserMode("folder");
    setDropboxBrowserContext("bulk");
    setUploadSource("dropbox");
    setShowBulkUpload(true);
    setShowDropboxBrowser(true);
  }, [openDropboxQueuePickerNonce, setShowBulkUpload]);

  useEffect(() => {
    if (!openDriveQueuePickerNonce) return;
    setDriveBrowserMode("folder");
    setDriveBrowserContext("drive");
    setUploadSource("drive");
    setShowBulkUpload(true);
    setShowDriveBrowser(true);
  }, [openDriveQueuePickerNonce, setShowBulkUpload]);

  const handleSheetsDriveFolderSelect = createSheetsDriveFolderSelectHandler({
    setSelectedDriveFolderId,
    setSelectedDriveFolderName,
    showToast: (message) => showAppToast({ message, type: "success" }),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedDriveUploadFolderId = localStorage.getItem(DASHBOARD_STORAGE.driveUploadFolderId);
    const savedDriveUploadFolderName = localStorage.getItem(DASHBOARD_STORAGE.driveUploadFolderName);
    const savedSheetsDriveFolderId = localStorage.getItem(DASHBOARD_STORAGE.sheetsDriveFolderId);
    const savedSheetsDriveFolderName = localStorage.getItem(DASHBOARD_STORAGE.sheetsDriveFolderName);
    const savedDropboxUploadFolderPath = localStorage.getItem(DASHBOARD_STORAGE.dropboxUploadFolderPath);
    const savedDropboxThumbnailsFolderPath = localStorage.getItem(DASHBOARD_STORAGE.dropboxThumbnailsFolderPath);
    const savedDropboxCsvFile = localStorage.getItem(DASHBOARD_STORAGE.selectedDropboxCsvFile);
    const savedDropboxSheet = localStorage.getItem(DASHBOARD_STORAGE.selectedDropboxSheetName);
    const savedFolderSource = localStorage.getItem(DASHBOARD_STORAGE.folderSource);
    const savedSkipDuplicateTitles = localStorage.getItem(DASHBOARD_STORAGE.dropboxSkipDuplicateTitles);
    const savedDriveCsvId = localStorage.getItem(DASHBOARD_STORAGE.selectedDriveCsvFileId);
    const savedDriveCsvName = localStorage.getItem(DASHBOARD_STORAGE.selectedDriveCsvFileName);
    const savedDriveThumbsId = localStorage.getItem(DASHBOARD_STORAGE.driveThumbnailsFolderId);
    const savedDriveMetaSheet = localStorage.getItem(DASHBOARD_STORAGE.driveMetadataSheetName);
    const savedSheetsUrl = localStorage.getItem(DASHBOARD_STORAGE.sheetsSpreadsheetUrl);
    if (savedDriveUploadFolderId) setDriveUploadFolderId(savedDriveUploadFolderId);
    if (savedDriveUploadFolderName) setDriveUploadFolderName(savedDriveUploadFolderName);
    if (savedSheetsDriveFolderId) setSelectedDriveFolderId(savedSheetsDriveFolderId);
    if (savedSheetsDriveFolderName) setSelectedDriveFolderName(savedSheetsDriveFolderName);
    if (savedDropboxUploadFolderPath) setDropboxUploadFolderPath(savedDropboxUploadFolderPath);
    if (savedDropboxThumbnailsFolderPath) setDropboxThumbnailsFolderPath(savedDropboxThumbnailsFolderPath);
    if (savedDropboxCsvFile) setSelectedDropboxCsvFile(savedDropboxCsvFile);
    if (savedDropboxSheet) setSelectedDropboxSheetName(savedDropboxSheet);
    if (savedDriveCsvId) setSelectedDriveCsvFileId(savedDriveCsvId);
    if (savedDriveCsvName) setSelectedDriveCsvFileName(savedDriveCsvName);
    if (savedDriveThumbsId) setDriveThumbnailsFolderId(savedDriveThumbsId);
    if (savedDriveMetaSheet) setSelectedDriveMetadataSheetName(savedDriveMetaSheet);
    if (savedSheetsUrl) setDriveSpreadsheetUrl(savedSheetsUrl);
    if (!HIDE_GOOGLE_DRIVE_SHEETS && (savedFolderSource === "drive" || savedFolderSource === "dropbox")) setUploadSource(savedFolderSource);
    if (savedSkipDuplicateTitles !== null) setSkipDuplicateTitles(savedSkipDuplicateTitles === "true");
  }, []);

  useDropboxSheetNames({
    selectedDropboxCsvFile,
    setDropboxSheetNames,
    setSelectedDropboxSheetName,
    setLoadingDropboxSheets,
  });

  useDriveSheetNames({
    selectedDriveCsvFileId,
    setDriveSheetNames,
    setSelectedDriveSheetName: setSelectedDriveMetadataSheetName,
    setLoadingDriveSheets,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (driveUploadFolderId) localStorage.setItem(DASHBOARD_STORAGE.driveUploadFolderId, driveUploadFolderId);
    else localStorage.removeItem(DASHBOARD_STORAGE.driveUploadFolderId);
  }, [driveUploadFolderId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (driveUploadFolderName) localStorage.setItem(DASHBOARD_STORAGE.driveUploadFolderName, driveUploadFolderName);
    else localStorage.removeItem(DASHBOARD_STORAGE.driveUploadFolderName);
  }, [driveUploadFolderName]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedDriveFolderId) localStorage.setItem(DASHBOARD_STORAGE.sheetsDriveFolderId, selectedDriveFolderId);
    if (selectedDriveFolderName) localStorage.setItem(DASHBOARD_STORAGE.sheetsDriveFolderName, selectedDriveFolderName);
    if (selectedDropboxFolderPath) localStorage.setItem(DASHBOARD_STORAGE.sheetsDropboxFolderPath, selectedDropboxFolderPath);
    localStorage.setItem(DASHBOARD_STORAGE.folderSource, uploadSource);
  }, [selectedDriveFolderId, selectedDriveFolderName, selectedDropboxFolderPath, uploadSource]);

  const handleSheetSelect = createSheetSelectHandler({
    fetchSheets,
    setDriveSpreadsheetUrl,
    showToast: (message) => showAppToast({ message, type: "success" }),
  });

  return (
    <>
      <UploadFormsBrowserOverlays
        showDriveBrowser={showDriveBrowser}
        setShowDriveBrowser={setShowDriveBrowser}
        driveBrowserContext={driveBrowserContext}
        driveBrowserMode={driveBrowserMode}
        handleSheetsDriveFolderSelect={handleSheetsDriveFolderSelect}
        handleDriveFolderSelect={handleBulkDriveFolderSelected}
        setSelectedDriveCsvFileId={setSelectedDriveCsvFileId}
        setSelectedDriveCsvFileName={setSelectedDriveCsvFileName}
        setDriveThumbnailsFolderId={setDriveThumbnailsFolderId}
        setDriveThumbnailsFolderName={setDriveThumbnailsFolderName}
        setSingleDropboxVideoPath={setSingleDropboxVideoPath}
        setSingleDropboxVideoName={setSingleDropboxVideoName}
        setSingleDriveVideoId={setSingleDriveVideoId}
        setSingleDriveVideoName={setSingleDriveVideoName}
        showDropboxBrowser={showDropboxBrowser}
        setShowDropboxBrowser={setShowDropboxBrowser}
        dropboxBrowserMode={dropboxBrowserMode}
        dropboxBrowserContext={dropboxBrowserContext}
        handleBulkDropboxFolderSelected={handleBulkDropboxFolderSelected}
        setSelectedDropboxFolderPath={setSelectedDropboxFolderPath}
        setDropboxThumbnailsFolderPath={setDropboxThumbnailsFolderPath}
        setDropboxUploadFolderPath={setDropboxUploadFolderPath}
        setSelectedDropboxCsvFile={setSelectedDropboxCsvFile}
        setSelectedDropboxFile={setSelectedDropboxFile}
        showSheetsBrowser={showSheetsBrowser}
        setShowSheetsBrowser={setShowSheetsBrowser}
        handleSheetSelect={handleSheetSelect}
        showSheetPreview={showSheetPreview}
        previewData={previewData}
        onCloseSheetPreview={() => {
          setShowSheetPreview(false);
          setPreviewData(null);
        }}
      />
      <UploadFormsSingleVideoCard
        showSingleUpload={showSingleUpload}
        toggleSingleUpload={toggleSingleUpload}
        handleSingleUpload={handleSingleUpload}
        selectedVideoFile={selectedVideoFile}
        setSelectedVideoFile={setSelectedVideoFile}
        fileInputRef={fileInputRef}
        uploading={uploading}
        singleUploadClearKey={singleUploadClearKey}
        onBrowseDropboxVideo={() => {
          setDropboxBrowserMode("file");
          setDropboxBrowserContext("single-video");
          setShowDropboxBrowser(true);
        }}
        onBrowseDriveVideo={() => {
          setDriveBrowserMode("file");
          setDriveBrowserContext("single-video");
          setShowDriveBrowser(true);
        }}
        dropboxVideoPath={singleDropboxVideoPath}
        dropboxVideoName={singleDropboxVideoName}
        setDropboxVideoPath={setSingleDropboxVideoPath}
        setDropboxVideoName={setSingleDropboxVideoName}
        driveVideoId={singleDriveVideoId}
        driveVideoName={singleDriveVideoName}
        setDriveVideoId={setSingleDriveVideoId}
        setDriveVideoName={setSingleDriveVideoName}
      />
      <UploadFormsBulkSection
        showBulkUpload={showBulkUpload}
        setShowBulkUpload={setShowBulkUpload}
        handleBulkUpload={handleBulkUpload}
        uploadSource={uploadSource}
        setUploadSource={setUploadSource}
        driveUploadFolderId={driveUploadFolderId}
        setDriveUploadFolderId={setDriveUploadFolderId}
        setDriveUploadFolderName={setDriveUploadFolderName}
        setDriveBrowserContext={setDriveBrowserContext}
        setDriveBrowserMode={setDriveBrowserMode}
        setShowDriveBrowser={setShowDriveBrowser}
        setShowSheetsBrowser={setShowSheetsBrowser}
        dropboxPythonQueueMode={dropboxPythonQueueMode}
        pythonQueueDetectInfo={pythonQueueDetectInfo}
        dropboxUploadFolderPath={dropboxUploadFolderPath}
        setDropboxUploadFolderPath={setDropboxUploadFolderPath}
        setDropboxBrowserMode={setDropboxBrowserMode}
        setDropboxBrowserContext={setDropboxBrowserContext}
        setShowDropboxBrowser={setShowDropboxBrowser}
        clearDropboxPythonQueueMode={clearDropboxPythonQueueMode}
        drivePythonQueueMode={drivePythonQueueMode}
        drivePythonQueueDetectInfo={drivePythonQueueDetectInfo}
        clearDrivePythonQueueMode={clearDrivePythonQueueMode}
        skipDuplicateTitles={skipDuplicateTitles}
        setSkipDuplicateTitles={setSkipDuplicateTitles}
        dropboxThumbnailsFolderPath={dropboxThumbnailsFolderPath}
        setDropboxThumbnailsFolderPath={setDropboxThumbnailsFolderPath}
        selectedDropboxCsvFile={selectedDropboxCsvFile}
        setSelectedDropboxCsvFile={setSelectedDropboxCsvFile}
        dropboxSheetNames={dropboxSheetNames}
        setDropboxSheetNames={setDropboxSheetNames}
        loadingDropboxSheets={loadingDropboxSheets}
        selectedDropboxSheetName={selectedDropboxSheetName}
        setSelectedDropboxSheetName={setSelectedDropboxSheetName}
        dropboxUploading={dropboxUploading}
        setDropboxUploading={setDropboxUploading}
        driveUploading={driveUploading}
        setDriveUploading={setDriveUploading}
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
        selectedDriveMetadataSheetName={selectedDriveMetadataSheetName}
        setSelectedDriveMetadataSheetName={setSelectedDriveMetadataSheetName}
        driveSpreadsheetUrl={driveSpreadsheetUrl}
        setDriveSpreadsheetUrl={setDriveSpreadsheetUrl}
        selectedDriveFolderId={selectedDriveFolderId}
        schedulingEnabled={schedulingEnabled}
        globalVideosPerDay={globalVideosPerDay}
        checkDuplicatesBeforeUpload={checkDuplicatesBeforeUpload}
        setCheckDuplicatesBeforeUpload={setCheckDuplicatesBeforeUpload}
        setSelectedJobId={setSelectedJobId}
        fetchJobStatus={fetchJobStatus}
        fetchQueue={fetchQueue}
        bulkUploadProgress={bulkUploadProgress}
        bulkUploading={bulkUploading}
        selectedBulkFiles={selectedBulkFiles}
        bulkUrls={bulkUrls}
        debounceTimerRef={debounceTimerRef}
        fetchSheets={fetchSheets}
        availableSheets={availableSheets}
        setAvailableSheets={setAvailableSheets}
        loadingSheets={loadingSheets}
        spreadsheetTitle={spreadsheetTitle}
        setSpreadsheetTitle={setSpreadsheetTitle}
      />
    </>
  );
}
