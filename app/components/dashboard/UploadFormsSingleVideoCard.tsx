"use client";

import type { FormEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import AiAssistSnippetPanel from "@/app/components/dashboard/AiAssistSnippetPanel";
import UploadFormsSingleVideoSourceSection, {
  type SingleVideoSource,
} from "@/app/components/dashboard/UploadFormsSingleVideoSourceSection";
import { useDropboxAuth } from "./DropboxAuthContext";
import { useGoogleDriveAuth } from "./GoogleDriveAuthContext";

const ICON_CLAPPER = "\u{1F3AC}";

export interface UploadFormsSingleVideoCardProps {
  showSingleUpload: boolean;
  toggleSingleUpload: () => void;
  handleSingleUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  selectedVideoFile: File | null;
  setSelectedVideoFile: (file: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  singleUploadClearKey?: number;
  onBrowseDropboxVideo: () => void;
  onBrowseDriveVideo: () => void;
  dropboxVideoPath: string;
  dropboxVideoName: string;
  setDropboxVideoPath: (path: string) => void;
  setDropboxVideoName: (name: string) => void;
  driveVideoId: string;
  driveVideoName: string;
  setDriveVideoId: (id: string) => void;
  setDriveVideoName: (name: string) => void;
}

export default function UploadFormsSingleVideoCard({
  showSingleUpload,
  toggleSingleUpload,
  handleSingleUpload,
  selectedVideoFile,
  setSelectedVideoFile,
  fileInputRef,
  uploading,
  singleUploadClearKey = 0,
  onBrowseDropboxVideo,
  onBrowseDriveVideo,
  dropboxVideoPath,
  dropboxVideoName,
  setDropboxVideoPath,
  setDropboxVideoName,
  driveVideoId,
  driveVideoName,
  setDriveVideoId,
  setDriveVideoName,
}: UploadFormsSingleVideoCardProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [videoSource, setVideoSource] = useState<SingleVideoSource>("local");
  const { hasDropboxAuth, connectDropbox } = useDropboxAuth();
  const { hasGoogleDriveAuth, connectGoogleDrive } = useGoogleDriveAuth();

  useEffect(() => {
    if (!singleUploadClearKey) return;
    setVideoSource("local");
    setDropboxVideoPath("");
    setDropboxVideoName("");
    setDriveVideoId("");
    setDriveVideoName("");
    setSelectedVideoFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [
    singleUploadClearKey,
    setDropboxVideoPath,
    setDropboxVideoName,
    setDriveVideoId,
    setDriveVideoName,
    setSelectedVideoFile,
    fileInputRef,
  ]);

  const canSubmit =
    videoSource === "local"
      ? !!selectedVideoFile
      : videoSource === "dropbox"
        ? !!dropboxVideoPath
        : !!driveVideoId;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    await handleSingleUpload(e);
  };

  return (
    <div className="card animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <span className="text-3xl">{ICON_CLAPPER}</span>
          <span>Single Video Upload</span>
        </h2>
        <button
          type="button"
          onClick={toggleSingleUpload}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          {showSingleUpload ? "Hide" : "Show"}
        </button>
      </div>
      {showSingleUpload && (
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div>
            <label htmlFor="title" className="label">
              Title
            </label>
            <input
              ref={titleRef}
              type="text"
              id="title"
              name="title"
              placeholder="Enter video title"
              required
              maxLength={100}
              className="input-field"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Max 100 characters (YouTube limit)
            </p>
          </div>

          <div>
            <label htmlFor="description" className="label">
              Description
            </label>
            <textarea
              ref={descriptionRef}
              id="description"
              name="description"
              placeholder="Enter video description"
              required
              maxLength={5000}
              className="input-field min-h-[100px] resize-y"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Max 5000 characters (YouTube limit)
            </p>
          </div>

          <AiAssistSnippetPanel
            variant="single"
            titleInputRef={titleRef}
            descriptionTextAreaRef={descriptionRef}
            heading="AI & marketing (optional)"
          />

          <UploadFormsSingleVideoSourceSection
            videoSource={videoSource}
            setVideoSource={setVideoSource}
            selectedVideoFile={selectedVideoFile}
            setSelectedVideoFile={setSelectedVideoFile}
            fileInputRef={fileInputRef}
            dropboxVideoPath={dropboxVideoPath}
            dropboxVideoName={dropboxVideoName}
            driveVideoId={driveVideoId}
            driveVideoName={driveVideoName}
            hasDropboxAuth={hasDropboxAuth}
            hasGoogleDriveAuth={hasGoogleDriveAuth}
            onBrowseDropbox={onBrowseDropboxVideo}
            onBrowseDrive={onBrowseDriveVideo}
            onSelectDriveVideo={(id, name) => {
              setDriveVideoId(id);
              setDriveVideoName(name);
            }}
            onConnectDropbox={connectDropbox}
            onConnectGoogleDrive={connectGoogleDrive}
          />

          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="publishDate" className="label">
                Schedule Publish Date
              </label>
              <input
                type="datetime-local"
                id="publishDate"
                name="publishDate"
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label htmlFor="privacyStatus" className="label">
              Privacy Status
            </label>
            <select
              id="privacyStatus"
              name="privacyStatus"
              defaultValue="public"
              required
              className="input-field"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={uploading || !canSubmit}
            className={`btn-primary ${
              uploading || !canSubmit ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {uploading ? "Uploading..." : "Upload Video"}
          </button>
        </form>
      )}
    </div>
  );
}
