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
import DropboxBrowserContent from "./DropboxBrowserContent";
import DropboxBrowserFooter from "./DropboxBrowserFooter";
import type { BrowserMode, DropboxFolder, DropboxItem, FileFilter } from "./dropbox-browser-types";
import { isSpreadsheetFileName, isVideoFileName } from "./file-type-utils";

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

  const isMatchingFile = (fileName: string): boolean => {
    if (fileFilter === "all") return true;
    if (fileFilter === "video") return isVideoFileName(fileName);
    if (fileFilter === "spreadsheet") return isSpreadsheetFileName(fileName);
    return false;
  };

  const getFileIcon = (fileName: string): string => {
    if (isVideoFileName(fileName)) return "🎥";
    if (isSpreadsheetFileName(fileName)) return "📊";
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

          <DropboxBrowserContent
            loading={loading}
            error={error}
            mode={mode}
            fileFilter={fileFilter}
            folders={folders}
            displayFiles={displayFiles}
            selectedFile={selectedFile}
            onRetry={() => void loadFolder(currentFolderPath)}
            onFolderClick={handleFolderClick}
            onFileClick={handleFileClick}
            isMatchingFile={isMatchingFile}
            getFileIcon={getFileIcon}
            formatDate={formatDate}
            formatSize={formatSize}
          />
        </ScrollArea>
        <DropboxBrowserFooter
          mode={mode}
          selectedFile={selectedFile}
          currentFolder={currentFolder}
          onClose={onClose}
          onSelectFolder={handleSelectFolder}
          onSelectFile={handleSelectFile}
        />
      </DialogContent>
    </Dialog>
  );
}
