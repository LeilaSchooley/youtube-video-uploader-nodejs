"use client";

import type { BrowserMode, DropboxFolder, DropboxItem, FileFilter } from "./dropbox-browser-types";

type Props = {
  loading: boolean;
  error: string | null;
  mode: BrowserMode;
  fileFilter: FileFilter;
  folders: DropboxFolder[];
  displayFiles: DropboxItem[];
  selectedFile: DropboxItem | null;
  onRetry: () => void;
  onFolderClick: (id: string) => void;
  onFileClick: (file: DropboxItem) => void;
  isMatchingFile: (name: string) => boolean;
  getFileIcon: (name: string) => string;
  formatDate: (value?: string) => string;
  formatSize: (value?: number) => string;
};

export default function DropboxBrowserContent({
  loading,
  error,
  mode,
  fileFilter,
  folders,
  displayFiles,
  selectedFile,
  onRetry,
  onFolderClick,
  onFileClick,
  isMatchingFile,
  getFileIcon,
  formatDate,
  formatSize,
}: Props) {
  if (error && !loading) {
    return (
      <div className="mb-4 flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  if (loading) return null;

  return (
    <>
      {folders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">📁 Folders ({folders.length})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => onFolderClick(folder.id)}
                className="p-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg border border-gray-200 dark:border-gray-600 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📁</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{folder.name}</p>
                    {folder.modifiedTime && <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(folder.modifiedTime)}</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {displayFiles.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {fileFilter === "spreadsheet" ? "📊" : "📄"} Files ({displayFiles.length})
            {mode === "file" && fileFilter === "spreadsheet" && <span className="font-normal text-gray-500 ml-2">(CSV, XLSX only)</span>}
          </h3>
          <div className="space-y-1">
            {displayFiles.map((file) => {
              const isSelected = selectedFile?.id === file.id;
              const isMatching = isMatchingFile(file.name);
              return (
                <div
                  key={file.id}
                  onClick={() => mode === "file" && onFileClick(file)}
                  className={`p-2 rounded border transition-colors ${mode === "file" ? "cursor-pointer" : ""} ${
                    isSelected
                      ? "bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600 ring-2 ring-blue-400"
                      : isMatching
                        ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                        : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getFileIcon(file.name)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">{file.name}</p>
                      <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                        {file.size && <span>{formatSize(file.size)}</span>}
                        {file.modifiedTime && <span>{formatDate(file.modifiedTime)}</span>}
                      </div>
                    </div>
                    {isSelected && <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">✓ Selected</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {folders.length === 0 && displayFiles.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>{mode === "file" && fileFilter === "spreadsheet" ? "No CSV or XLSX files found in this folder" : "This folder is empty"}</p>
        </div>
      )}
    </>
  );
}
