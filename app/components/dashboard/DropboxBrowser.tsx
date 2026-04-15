"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import BrowserLoadingSkeleton from "./BrowserLoadingSkeleton";

interface DropboxItem {
  id: string;
  name: string;
  size?: number;
  modifiedTime?: string;
}

interface DropboxFolder {
  id: string;
  name: string;
  modifiedTime?: string;
}

type BrowserMode = "folder" | "file";
type FileFilter = "video" | "spreadsheet" | "all";

interface DropboxBrowserProps {
  onSelectFolder?: (folderPath: string, folderName: string) => void;
  onSelectFile?: (filePath: string, fileName: string) => void;
  onClose: () => void;
  mode?: BrowserMode; // "folder" to select folders, "file" to select files
  fileFilter?: FileFilter; // Which file types to show/highlight
}

export default function DropboxBrowser({
  onSelectFolder,
  onSelectFile,
  onClose,
  mode = "folder",
  fileFilter = "video",
}: DropboxBrowserProps) {
  const [currentFolderPath, setCurrentFolderPath] = useState<string>("/");
  const [folders, setFolders] = useState<DropboxFolder[]>([]);
  const [files, setFiles] = useState<DropboxItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderHistory, setFolderHistory] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedFile, setSelectedFile] = useState<DropboxItem | null>(null);

  const loadFolder = async (folderPath: string) => {
    setLoading(true);
    setError(null);

    try {
      const url = `/api/browse-dropbox?folderPath=${encodeURIComponent(folderPath)}`;

      const response = await fetch(url, { credentials: "include" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load folder");
      }

      setFolders(data.folders || []);
      setFiles(data.files || []);
      setCurrentFolder(data.currentFolder || null);
    } catch (err: any) {
      setError(err.message || "Failed to load Dropbox folder");
      console.error("[DROPBOX-BROWSER] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFolder(currentFolderPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderPath]);

  const handleFolderClick = (folderPath: string) => {
    // Add current folder to history before navigating so Back works (including from root)
    if (currentFolder) {
      setFolderHistory((prev) => [...prev, currentFolder]);
    }
    setCurrentFolderPath(folderPath);
  };

  const handleBack = () => {
    if (folderHistory.length > 0) {
      const previousFolder = folderHistory[folderHistory.length - 1];
      const newHistory = folderHistory.slice(0, -1);
      setFolderHistory(newHistory);
      setCurrentFolderPath(previousFolder.id === "/" ? "/" : previousFolder.id);
    } else {
      setCurrentFolderPath("/");
    }
  };

  const handleSelectFolder = () => {
    if (currentFolder && onSelectFolder) {
      onSelectFolder(currentFolder.id, currentFolder.name);
      onClose();
    }
  };

  const formatSize = (size?: number): string => {
    if (!size) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024)
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return "";
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return "";
    }
  };

  const isVideoFile = (fileName: string): boolean => {
    const videoExtensions = [
      ".mp4",
      ".mov",
      ".avi",
      ".mkv",
      ".webm",
      ".flv",
      ".wmv",
      ".m4v",
    ];
    const lowerName = fileName.toLowerCase();
    return videoExtensions.some((ext) => lowerName.endsWith(ext));
  };

  const isSpreadsheetFile = (fileName: string): boolean => {
    const spreadsheetExtensions = [".csv", ".xlsx", ".xls"];
    const lowerName = fileName.toLowerCase();
    return spreadsheetExtensions.some((ext) => lowerName.endsWith(ext));
  };

  const isMatchingFile = (fileName: string): boolean => {
    if (fileFilter === "all") return true;
    if (fileFilter === "video") return isVideoFile(fileName);
    if (fileFilter === "spreadsheet") return isSpreadsheetFile(fileName);
    return false;
  };

  const getFileIcon = (fileName: string): string => {
    if (isVideoFile(fileName)) return "🎥";
    if (isSpreadsheetFile(fileName)) return "📊";
    return "📄";
  };

  // Filter files based on mode and filter
  const displayFiles =
    mode === "file" && fileFilter !== "all"
      ? files.filter((f) => isMatchingFile(f.name))
      : files;

  const handleFileClick = (file: DropboxItem) => {
    if (mode === "file") {
      setSelectedFile(file);
    }
  };

  const handleSelectFile = () => {
    if (selectedFile && onSelectFile) {
      onSelectFile(selectedFile.id, selectedFile.name);
      onClose();
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b px-4 py-3 text-left">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleBack}
              disabled={
                currentFolderPath === "/" || folderHistory.length === 0
              }
            >
              ← Back
            </Button>
            <DialogTitle className="text-lg font-semibold">
              {currentFolder?.name || "Dropbox"}
            </DialogTitle>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            ✕ Close
          </Button>
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="max-h-[60vh] flex-1 p-4">
          {loading && <BrowserLoadingSkeleton rows={8} />}

          {error && !loading && (
            <div className="mb-4 flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void loadFolder(currentFolderPath)}
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
              {displayFiles.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {fileFilter === "spreadsheet" ? "📊" : "📄"} Files (
                    {displayFiles.length})
                    {mode === "file" && fileFilter === "spreadsheet" && (
                      <span className="font-normal text-gray-500 ml-2">
                        (CSV, XLSX only)
                      </span>
                    )}
                  </h3>
                  <div className="space-y-1">
                    {displayFiles.map((file) => {
                      const isSelected = selectedFile?.id === file.id;
                      const isMatching = isMatchingFile(file.name);

                      return (
                        <div
                          key={file.id}
                          onClick={() =>
                            mode === "file" && handleFileClick(file)
                          }
                          className={`p-2 rounded border transition-colors ${
                            mode === "file" ? "cursor-pointer" : ""
                          } ${
                            isSelected
                              ? "bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600 ring-2 ring-blue-400"
                              : isMatching
                                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                                : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              {getFileIcon(file.name)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">
                                {file.name}
                              </p>
                              <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                                {file.size && (
                                  <span>{formatSize(file.size)}</span>
                                )}
                                {file.modifiedTime && (
                                  <span>{formatDate(file.modifiedTime)}</span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">
                                ✓ Selected
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {folders.length === 0 &&
                displayFiles.length === 0 &&
                !loading && (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <p>
                      {mode === "file" && fileFilter === "spreadsheet"
                        ? "No CSV or XLSX files found in this folder"
                        : "This folder is empty"}
                    </p>
                  </div>
                )}
            </>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border p-4">
          <div className="text-sm text-muted-foreground">
            {mode === "file" && selectedFile ? (
              <span>
                Selected file: <strong>{selectedFile.name}</strong>
              </span>
            ) : mode === "folder" && currentFolder ? (
              <span>
                Selected folder: <strong>{currentFolder.name}</strong>
              </span>
            ) : (
              <span className="text-gray-400">
                {mode === "file"
                  ? "Click a file to select it"
                  : "Navigate to a folder"}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {mode === "folder" ? (
              <Button
                type="button"
                onClick={handleSelectFolder}
                disabled={!currentFolder}
              >
                Select This Folder
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSelectFile}
                disabled={!selectedFile}
              >
                Select File
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
