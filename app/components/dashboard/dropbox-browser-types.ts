export interface DropboxItem {
  id: string;
  name: string;
  size?: number;
  modifiedTime?: string;
}

export interface DropboxFolder {
  id: string;
  name: string;
  modifiedTime?: string;
}

export type BrowserMode = "folder" | "file";
export type FileFilter = "video" | "spreadsheet" | "all";
