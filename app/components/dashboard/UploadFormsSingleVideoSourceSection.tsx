"use client";

import type { RefObject } from "react";
import { useState } from "react";
import { parseDriveIdFromInput } from "@/lib/drive-ids";

const ICON_CHECK = "\u{2705}";
const ICON_VIDEO = "\u{1F4F9}";

export type SingleVideoSource = "local" | "dropbox" | "drive";

type Props = {
  videoSource: SingleVideoSource;
  setVideoSource: (source: SingleVideoSource) => void;
  selectedVideoFile: File | null;
  setSelectedVideoFile: (file: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  dropboxVideoPath: string;
  dropboxVideoName: string;
  driveVideoId: string;
  driveVideoName: string;
  hasDropboxAuth: boolean | null;
  hasGoogleDriveAuth: boolean | null;
  onBrowseDropbox: () => void;
  onBrowseDrive: () => void;
  onSelectDriveVideo: (fileId: string, fileName: string) => void;
  onConnectDropbox: () => void;
  onConnectGoogleDrive: () => void;
};

export default function UploadFormsSingleVideoSourceSection(props: Props) {
  const [drivePaste, setDrivePaste] = useState("");
  const [drivePasteLoading, setDrivePasteLoading] = useState(false);
  const [drivePasteError, setDrivePasteError] = useState<string | null>(null);

  const hasLocalFile = !!props.selectedVideoFile;
  const hasCloud =
    (props.videoSource === "dropbox" && !!props.dropboxVideoPath) ||
    (props.videoSource === "drive" && !!props.driveVideoId);

  const clearLocalFile = () => {
    props.setSelectedVideoFile(null);
    if (props.fileInputRef.current) {
      props.fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <span className="label">Video source</span>
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "local" as const, label: "💻 This device" },
            { id: "dropbox" as const, label: "📦 Dropbox" },
            { id: "drive" as const, label: "📁 Google Drive" },
          ] as const
        ).map((opt) => (
          <label
            key={opt.id}
            className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              props.videoSource === opt.id
                ? "border-red-500 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100"
                : "border-gray-200 dark:border-gray-600 hover:border-gray-300"
            }`}
          >
            <input
              type="radio"
              name="singleVideoSourcePicker"
              value={opt.id}
              checked={props.videoSource === opt.id}
              onChange={() => props.setVideoSource(opt.id)}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>

      <input type="hidden" name="videoSource" value={props.videoSource} />
      <input type="hidden" name="dropboxFilePath" value={props.dropboxVideoPath} />
      <input type="hidden" name="driveFileId" value={props.driveVideoId} />

      {props.videoSource === "local" && (
        <>
          <label
            htmlFor="video"
            className={`relative block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
              hasLocalFile
                ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-red-500 dark:hover:border-red-400"
            }`}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith("video/")) {
                props.setSelectedVideoFile(file);
                if (props.fileInputRef.current) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  props.fileInputRef.current.files = dt.files;
                }
              }
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <input
              ref={props.fileInputRef}
              type="file"
              id="video"
              name="video"
              accept="video/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) props.setSelectedVideoFile(file);
              }}
            />
            {hasLocalFile ? (
              <div className="pointer-events-none">
                <div className="text-4xl mb-2">{ICON_CHECK}</div>
                <p className="text-green-700 dark:text-green-300 font-semibold mb-1">
                  {props.selectedVideoFile!.name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {(props.selectedVideoFile!.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  Click anywhere here to change file
                </p>
              </div>
            ) : (
              <div className="pointer-events-none">
                <div className="text-4xl mb-2">{ICON_VIDEO}</div>
                <p className="text-gray-600 dark:text-gray-400 mb-1">
                  Click anywhere to upload or drag and drop
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  Video files only
                </p>
              </div>
            )}
          </label>
        </>
      )}

      {props.videoSource === "dropbox" && (
        <div className="rounded-lg border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-6 text-center">
          {props.hasDropboxAuth !== true ? (
            <div className="space-y-3">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                Connect Dropbox in the header to pick a video file.
              </p>
              <button
                type="button"
                onClick={() => void props.onConnectDropbox()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
              >
                Connect Dropbox
              </button>
            </div>
          ) : props.dropboxVideoPath ? (
            <div className="space-y-2">
              <div className="text-3xl">{ICON_CHECK}</div>
              <p className="font-semibold text-blue-900 dark:text-blue-100 break-all">
                {props.dropboxVideoName || props.dropboxVideoPath}
              </p>
              <button
                type="button"
                onClick={props.onBrowseDropbox}
                className="text-sm text-blue-700 dark:text-blue-300 underline"
              >
                Choose a different file
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={props.onBrowseDropbox}
              className="w-full space-y-3 cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <p className="text-sm text-blue-900 dark:text-blue-100 pointer-events-none">
                Click anywhere to browse Dropbox for a video file.
              </p>
              <span className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg pointer-events-none">
                📂 Browse Dropbox
              </span>
            </button>
          )}
        </div>
      )}

      {props.videoSource === "drive" && (
        <div className="rounded-lg border-2 border-dashed border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-6 text-center">
          {props.hasGoogleDriveAuth !== true ? (
            <div className="space-y-3">
              <p className="text-sm text-emerald-900 dark:text-emerald-100">
                Connect Google Drive in the header to pick a video file.
              </p>
              <button
                type="button"
                onClick={() => void props.onConnectGoogleDrive()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg"
              >
                Connect Google Drive
              </button>
            </div>
          ) : props.driveVideoId ? (
            <div className="space-y-2">
              <div className="text-3xl">{ICON_CHECK}</div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-100 break-all">
                {props.driveVideoName || props.driveVideoId}
              </p>
              <button
                type="button"
                onClick={props.onBrowseDrive}
                className="text-sm text-emerald-700 dark:text-emerald-300 underline"
              >
                Choose a different file
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                onClick={props.onBrowseDrive}
                className="w-full space-y-3 cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <p className="text-sm text-emerald-900 dark:text-emerald-100 pointer-events-none">
                  Click anywhere to browse Google Drive for a video file.
                </p>
                <span className="inline-block px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg pointer-events-none">
                  📂 Browse Drive
                </span>
              </button>
              <div className="text-left border-t border-emerald-200 dark:border-emerald-800 pt-3 space-y-2">
                <p className="text-xs text-emerald-800 dark:text-emerald-200">
                  Or paste a Drive video link (works even when the folder browser is empty)
                </p>
                <input
                  type="text"
                  value={drivePaste}
                  onChange={(e) => setDrivePaste(e.target.value)}
                  placeholder="https://drive.google.com/file/d/…"
                  className="w-full px-3 py-2 text-sm border border-emerald-200 dark:border-emerald-700 rounded-lg bg-white dark:bg-gray-900"
                />
                {drivePasteError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{drivePasteError}</p>
                )}
                <button
                  type="button"
                  disabled={drivePasteLoading || !drivePaste.trim()}
                  onClick={async () => {
                    const id = parseDriveIdFromInput(drivePaste);
                    if (!id) {
                      setDrivePasteError("Invalid Drive link or file ID");
                      return;
                    }
                    setDrivePasteLoading(true);
                    setDrivePasteError(null);
                    try {
                      const res = await fetch(
                        `/api/drive-file-meta?fileId=${encodeURIComponent(id)}`,
                        { credentials: "include" },
                      );
                      const data = await res.json();
                      if (!res.ok) {
                        throw new Error(data.error || "Could not access file");
                      }
                      const file = data.file as { id: string; name: string };
                      props.onSelectDriveVideo(file.id, file.name);
                      setDrivePaste("");
                    } catch (e: unknown) {
                      setDrivePasteError(
                        e instanceof Error ? e.message : String(e),
                      );
                    } finally {
                      setDrivePasteLoading(false);
                    }
                  }}
                  className="text-sm text-emerald-700 dark:text-emerald-300 underline disabled:opacity-50"
                >
                  {drivePasteLoading ? "Checking…" : "Use pasted link"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(hasLocalFile || hasCloud) && props.videoSource === "local" && hasLocalFile && (
        <button
          type="button"
          onClick={clearLocalFile}
          className="text-xs text-gray-500 hover:text-red-600 underline"
        >
          Clear selected file
        </button>
      )}
    </div>
  );
}
