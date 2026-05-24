import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";

export function createDriveFolderSelectHandler(opts: {
  setDriveUploadFolderId: (id: string) => void;
  setDriveUploadFolderName: (name: string) => void;
  showToast: (msg: string) => void;
}) {
  return (folderId: string, folderName: string) => {
    const input = document.getElementById("driveFolderId") as HTMLInputElement;
    if (input) input.value = folderId;
    opts.setDriveUploadFolderId(folderId);
    opts.setDriveUploadFolderName(folderName);
    if (typeof window !== "undefined") {
      localStorage.setItem(DASHBOARD_STORAGE.driveUploadFolderId, folderId);
      localStorage.setItem(DASHBOARD_STORAGE.driveUploadFolderName, folderName);
    }
    opts.showToast(`Selected folder: ${folderName}`);
  };
}

export function createSheetsDriveFolderSelectHandler(opts: {
  setSelectedDriveFolderId: (id: string) => void;
  setSelectedDriveFolderName: (name: string) => void;
  showToast: (msg: string) => void;
}) {
  return (folderId: string, folderName: string) => {
    opts.setSelectedDriveFolderId(folderId);
    opts.setSelectedDriveFolderName(folderName);
    if (typeof window !== "undefined") {
      localStorage.setItem(DASHBOARD_STORAGE.sheetsDriveFolderId, folderId);
      localStorage.setItem(DASHBOARD_STORAGE.sheetsDriveFolderName, folderName);
    }
    opts.showToast(`Selected Drive folder for matching: ${folderName}`);
  };
}

export function createSheetSelectHandler(opts: {
  fetchSheets: (spreadsheetId: string) => Promise<void>;
  showToast: (msg: string) => void;
  setDriveSpreadsheetUrl?: (url: string) => void;
}) {
  return async (spreadsheetId: string, spreadsheetName: string) => {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    opts.setDriveSpreadsheetUrl?.(url);
    const input =
      (document.getElementById("driveSpreadsheetUrl") as HTMLInputElement) ||
      (document.getElementById("spreadsheetUrl") as HTMLInputElement);
    if (input) input.value = url;
    if (typeof window !== "undefined") {
      localStorage.setItem(DASHBOARD_STORAGE.sheetsSpreadsheetUrl, url);
    }
    await opts.fetchSheets(url);
    opts.showToast(`Selected sheet: ${spreadsheetName}`);
  };
}
