"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import BrowserLoadingSkeleton from "./BrowserLoadingSkeleton";
import {
  isSpreadsheetFileName,
  isVideoFileName,
} from "./file-type-utils";
import { useGoogleDrivePicker } from "./useGoogleDrivePicker";
import { parseDriveIdFromInput } from "@/lib/drive-ids";

interface DriveItem {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface DriveFolder {
  id: string;
  name: string;
  modifiedTime?: string;
}

type DriveFileFilter = "video" | "spreadsheet" | "any";

interface DriveBrowserProps {
  onSelectFolder?: (folderId: string, folderName: string) => void;
  onSelectFile?: (fileId: string, fileName: string) => void;
  onClose: () => void;
  mode?: "folder" | "file";
  fileFilter?: DriveFileFilter;
}

export default function DriveBrowser({
  onSelectFolder,
  onSelectFile,
  onClose,
  mode = "folder",
  fileFilter = "video",
}: DriveBrowserProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>("root");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderHistory, setFolderHistory] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFile, setSelectedFile] = useState<DriveItem | null>(null);
  const [hasMetadataScope, setHasMetadataScope] = useState<boolean | null>(null);
  const [pasteInput, setPasteInput] = useState("");
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const { openPicker, opening: pickerOpening, error: pickerError } =
    useGoogleDrivePicker();

  const loadFolder = async (folderId: string | null) => {
    setLoading(true);
    setError(null);
    
    try {
      const url = folderId === null || folderId === "root" 
        ? "/api/browse-drive?folderId=root"
        : `/api/browse-drive?folderId=${encodeURIComponent(folderId)}`;
      
      const response = await fetch(url, { credentials: "include" });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to load folder");
      }
      
      setFolders(data.folders || []);
      setFiles(data.files || []);
      setCurrentFolder(data.currentFolder || null);
      if (typeof data.hasMetadataScope === "boolean") {
        setHasMetadataScope(data.hasMetadataScope);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load Drive folder");
      console.error("[DRIVE-BROWSER] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFolder(currentFolderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  const handleFolderClick = (folderId: string) => {
    // Add current folder to history before navigating (if not root and exists)
    if (currentFolder && currentFolder.id && currentFolder.id !== "root") {
      setFolderHistory(prev => [...prev, currentFolder]);
    }
    setCurrentFolderId(folderId);
  };

  const handleBack = () => {
    if (folderHistory.length > 0) {
      const previousFolder = folderHistory[folderHistory.length - 1];
      const newHistory = folderHistory.slice(0, -1);
      setFolderHistory(newHistory);
      setCurrentFolderId(previousFolder.id === "root" ? "root" : previousFolder.id);
    } else {
      setCurrentFolderId("root");
    }
  };

  const handleSelectFolder = () => {
    if (currentFolder && onSelectFolder) {
      onSelectFolder(
        currentFolder.id === "root" ? "root" : currentFolder.id,
        currentFolder.name,
      );
      onClose();
    }
  };

  const handleSelectFile = () => {
    if (selectedFile && onSelectFile) {
      onSelectFile(selectedFile.id, selectedFile.name);
      onClose();
    }
  };

  const handlePickerPick = async () => {
    const picked = await openPicker(mode === "folder" ? "folder" : "file", (doc) => {
      if (mode === "folder" && onSelectFolder) {
        onSelectFolder(doc.id, doc.name);
        onClose();
      } else if (mode === "file" && onSelectFile) {
        onSelectFile(doc.id, doc.name);
        onClose();
      }
    });
    if (picked && mode === "file") {
      setSelectedFile({ id: "", name: "" });
    }
  };

  const handlePasteSubmit = async () => {
    const fileId = parseDriveIdFromInput(pasteInput);
    if (!fileId) {
      setPasteError("Paste a valid Drive link or file ID");
      return;
    }
    setPasteLoading(true);
    setPasteError(null);
    try {
      const res = await fetch(
        `/api/drive-file-meta?fileId=${encodeURIComponent(fileId)}`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not access that file");
      }
      const file = data.file as DriveItem;
      if (mode === "file" && onSelectFile) {
        onSelectFile(file.id, file.name);
        onClose();
      } else if (mode === "folder" && onSelectFolder) {
        onSelectFolder(file.id, file.name);
        onClose();
      }
    } catch (err: unknown) {
      setPasteError(err instanceof Error ? err.message : String(err));
    } finally {
      setPasteLoading(false);
    }
  };

  const fileMatchesFilter = (name: string, mimeType?: string): boolean => {
    if (fileFilter === "any") return true;
    if (fileFilter === "spreadsheet") return isSpreadsheetFileName(name);
    return isVideoFileName(name) || !!mimeType?.includes("video/");
  };

  const visibleFiles = files.filter((file) =>
    fileMatchesFilter(file.name, file.mimeType),
  );
  const isEmptyFolder =
    !loading && !error && folders.length === 0 && visibleFiles.length === 0;

  const formatSize = (size?: string): string => {
    if (!size) return "";
    const bytes = parseInt(size);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return "";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return "";
    }
  };

  const isVideoFile = (mimeType?: string): boolean => {
    return mimeType?.includes("video/") || false;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              disabled={currentFolderId === "root" || currentFolderId === null || folderHistory.length === 0}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {currentFolder?.name || "My Drive"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
          >
            ✕ Close
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <BrowserLoadingSkeleton rows={8} />}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                type="button"
                onClick={() => void loadFolder(currentFolderId)}
              >
                Try again
              </Button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Folders */}
              {folders.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    📁 Folders ({folders.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => handleFolderClick(folder.id)}
                        className="p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg border border-gray-200 dark:border-gray-600 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">📁</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {folder.name}
                            </p>
                            {folder.modifiedTime && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {formatDate(folder.modifiedTime)}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Files */}
              {files.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    📄 Files ({files.length})
                  </h3>
                  <div className="space-y-1">
                    {files
                      .filter((file) => fileMatchesFilter(file.name, file.mimeType))
                      .map((file) => (
                      <button
                        type="button"
                        key={file.id}
                        disabled={mode !== "file"}
                        onClick={() => mode === "file" && setSelectedFile(file)}
                        className={`p-2 rounded border w-full text-left transition-colors ${
                          mode === "file" && selectedFile?.id === file.id
                            ? "bg-green-100 dark:bg-green-900/40 border-green-500"
                            : isVideoFile(file.mimeType)
                              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                              : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                        } ${mode === "file" ? "hover:opacity-90" : "cursor-default"}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {isVideoFile(file.mimeType) ? "🎥" : "📄"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">
                              {file.name}
                            </p>
                            <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                              {file.size && <span>{formatSize(file.size)}</span>}
                              {file.modifiedTime && <span>{formatDate(file.modifiedTime)}</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isEmptyFolder && (
                <div className="max-w-lg mx-auto py-6 space-y-4 text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {hasMetadataScope === false ? (
                      <>
                        This is not a missing folder — your token only has{" "}
                        <strong>per-app file</strong> access (
                        <code className="text-xs">drive.file</code>
                        ), so the app cannot browse all of My Drive until you
                        reconnect. In the header, disconnect{" "}
                        <strong>Google Drive</strong>, connect again, and accept{" "}
                        <strong>see file names and types</strong> (
                        <code className="text-xs">drive.metadata.readonly</code>
                        ). Or use Google Picker / paste a link below (no
                        folder browse needed).
                      </>
                    ) : (
                      <>
                        No folders or matching files here. Try another folder,
                        use Google Picker, or paste a file link.
                      </>
                    )}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button
                      type="button"
                      onClick={() => void handlePickerPick()}
                      disabled={pickerOpening}
                    >
                      {pickerOpening ? "Opening picker…" : "Open Google Picker"}
                    </Button>
                  </div>
                  {(pickerError || pasteError) && (
                    <p className="text-xs text-destructive">{pickerError || pasteError}</p>
                  )}
                  <div className="text-left space-y-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block">
                      Or paste a Drive link / file ID
                    </label>
                    <input
                      type="text"
                      value={pasteInput}
                      onChange={(e) => setPasteInput(e.target.value)}
                      placeholder="https://drive.google.com/file/d/…"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pasteLoading || !pasteInput.trim()}
                      onClick={() => void handlePasteSubmit()}
                    >
                      {pasteLoading ? "Checking…" : "Use this file"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {mode === "file" ? (
              selectedFile ? (
                <span>
                  Selected file: <strong>{selectedFile.name}</strong>
                </span>
              ) : (
                <span className="text-gray-500">No file selected</span>
              )
            ) : currentFolder ? (
              <span>
                Selected folder: <strong>{currentFolder.name}</strong>
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => void handlePickerPick()}
              disabled={pickerOpening}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50 text-sm"
            >
              Google Picker
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded transition-colors"
            >
              Cancel
            </button>
            {mode === "file" ? (
              <button
                onClick={handleSelectFile}
                disabled={!selectedFile}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Select This File
              </button>
            ) : (
              <button
                onClick={handleSelectFolder}
                disabled={!currentFolder}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Select This Folder
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
