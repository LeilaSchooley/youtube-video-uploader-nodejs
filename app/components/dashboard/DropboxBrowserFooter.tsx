"use client";

import { Button } from "@/components/ui/button";
import type { BrowserMode, DropboxFolder, DropboxItem } from "./dropbox-browser-types";

type Props = {
  mode: BrowserMode;
  selectedFile: DropboxItem | null;
  currentFolder: DropboxFolder | null;
  onClose: () => void;
  onSelectFolder: () => void;
  onSelectFile: () => void;
};

export default function DropboxBrowserFooter({
  mode,
  selectedFile,
  currentFolder,
  onClose,
  onSelectFolder,
  onSelectFile,
}: Props) {
  return (
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
          <span className="text-gray-400">{mode === "file" ? "Click a file to select it" : "Navigate to a folder"}</span>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {mode === "folder" ? (
          <Button type="button" onClick={onSelectFolder} disabled={!currentFolder}>
            Select This Folder
          </Button>
        ) : (
          <Button type="button" onClick={onSelectFile} disabled={!selectedFile}>
            Select File
          </Button>
        )}
      </div>
    </div>
  );
}
