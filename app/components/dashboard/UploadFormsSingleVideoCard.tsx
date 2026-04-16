"use client";

import type { FormEvent, RefObject } from "react";
import { useRef } from "react";
import AiAssistSnippetPanel from "@/app/components/dashboard/AiAssistSnippetPanel";

const ICON_CLAPPER = "\u{1F3AC}";
const ICON_CHECK = "\u{2705}";
const ICON_VIDEO = "\u{1F4F9}";

export interface UploadFormsSingleVideoCardProps {
  showSingleUpload: boolean;
  toggleSingleUpload: () => void;
  handleSingleUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  selectedVideoFile: File | null;
  setSelectedVideoFile: (file: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
}

export default function UploadFormsSingleVideoCard({
  showSingleUpload,
  toggleSingleUpload,
  handleSingleUpload,
  selectedVideoFile,
  setSelectedVideoFile,
  fileInputRef,
  uploading,
}: UploadFormsSingleVideoCardProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

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
        <form onSubmit={handleSingleUpload} className="flex flex-col gap-5">
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

          <AiAssistSnippetPanel
            variant="single"
            titleInputRef={titleRef}
            descriptionTextAreaRef={descriptionRef}
            heading="AI & marketing (optional)"
          />

          <label htmlFor="video" className="label">
            Choose File
          </label>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
              selectedVideoFile
                ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                : "border-gray-300 hover:border-red-500"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && file.type.startsWith("video/")) {
                setSelectedVideoFile(file);
                if (fileInputRef.current) {
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(file);
                  fileInputRef.current.files = dataTransfer.files;
                }
              }
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <input
              ref={fileInputRef}
              type="file"
              id="video"
              name="video"
              accept="video/*"
              required
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setSelectedVideoFile(file);
                }
              }}
            />
            {selectedVideoFile ? (
              <div>
                <div className="text-4xl mb-2">{ICON_CHECK}</div>
                <p className="text-green-700 dark:text-green-300 font-semibold mb-1">
                  {selectedVideoFile.name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {(selectedVideoFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  Click to change file
                </p>
              </div>
            ) : (
              <>
                <div className="text-4xl mb-2">{ICON_VIDEO}</div>
                <p className="text-gray-600 dark:text-gray-400 mb-1">
                  Click to upload or drag and drop
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  Video files only
                </p>
              </>
            )}
          </div>

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

          <label htmlFor="privacyStatus" className="label">
            Privacy Status
          </label>
          <select
            id="privacyStatus"
            name="privacyStatus"
            defaultValue="public"
            required
            className="input-field mb-5"
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
          </select>

          <button
            type="submit"
            disabled={uploading}
            className={`btn-primary ${
              uploading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {uploading ? "Uploading..." : "Upload Video"}
          </button>
        </form>
      )}
    </div>
  );
}
