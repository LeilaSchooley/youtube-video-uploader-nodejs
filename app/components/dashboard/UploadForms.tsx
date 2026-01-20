"use client";

import { FormEvent, RefObject } from "react";

interface UploadFormsProps {
  // Single Upload
  showSingleUpload: boolean;
  toggleSingleUpload: () => void;
  handleSingleUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  selectedVideoFile: File | null;
  setSelectedVideoFile: (file: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;

  // ZIP Upload
  handleZipUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  zipUploading: boolean;
  zipUploadProgress: {
    progress: number;
    message: string;
    totalFiles?: number;
    extractedCount?: number;
    videoCount?: number;
    thumbnailCount?: number;
  } | null;

  // Batch/CSV Upload
  showBatchUpload: boolean;
  toggleBatchUpload: () => void;
  showBatchInstructions: boolean;
  toggleBatchInstructions: () => void;
  handleCsvUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  selectedCsvFile: File | null;
  setSelectedCsvFile: (file: File | null) => void;
  csvFileInputRef: RefObject<HTMLInputElement | null>;
  csvUploading: boolean;
  validateCsv: (file: File) => Promise<string[]>;
  csvValidationErrors: string[];
  setCsvValidationErrors: (errors: string[]) => void;
  uploadProgress: {
    currentFile: number;
    totalFiles: number;
    currentFileName: string;
    message: string;
    status: string;
    copyStats?: {
      videosCopied: number;
      videosSkipped: number;
      thumbnailsCopied: number;
      thumbnailsSkipped: number;
      errors: string[];
    };
  } | null;

  // Bulk Upload
  showBulkUpload: boolean;
  setShowBulkUpload: (show: boolean) => void;
  handleBulkUpload: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  selectedBulkFiles: File[];
  setSelectedBulkFiles: (files: File[]) => void;
  bulkFilesInputRef: RefObject<HTMLInputElement | null>;
  bulkUploading: boolean;
  bulkUploadProgress: {
    total: number;
    totalBatches: number;
    currentBatch: number;
    completed: number;
    failed: number;
    currentFile?: string;
    message?: string;
  } | null;
  bulkUrls: string[];
  setBulkUrls: (urls: string[]) => void;
  urlAuthHeaders: string;
  setUrlAuthHeaders: (headers: string) => void;
  urlTimeout: string;
  setUrlTimeout: (timeout: string) => void;

  // Metadata Update
  showMetadataUpdate: boolean;
  setShowMetadataUpdate: (show: boolean) => void;
  handleMetadataUpdate: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  selectedMetadataCsv: File | null;
  setSelectedMetadataCsv: (file: File | null) => void;
  metadataCsvInputRef: RefObject<HTMLInputElement | null>;
  metadataUpdating: boolean;
  metadataUpdateProgress: {
    total: number;
    updated: number;
    failed: number;
    thumbnails: number;
    currentVideo?: string;
    message?: string;
    currentBatch?: number;
    totalBatches?: number;
    rate?: number;
    estimatedSeconds?: number;
    processed?: number;
    failedVideos?: Array<{ videoName: string; error: string; index: number }>;
    totalTime?: number;
    avgRate?: number;
  } | null;
  showFailedVideos: boolean;
  setShowFailedVideos: (show: boolean) => void;

  // Toast
  setShowToast: (toast: { message: string; type: "success" | "error" | "info" }) => void;
}

export default function UploadForms({
  showSingleUpload,
  toggleSingleUpload,
  handleSingleUpload,
  selectedVideoFile,
  setSelectedVideoFile,
  fileInputRef,
  uploading,
  handleZipUpload,
  zipUploading,
  zipUploadProgress,
  showBatchUpload,
  toggleBatchUpload,
  showBatchInstructions,
  toggleBatchInstructions,
  handleCsvUpload,
  selectedCsvFile,
  setSelectedCsvFile,
  csvFileInputRef,
  csvUploading,
  validateCsv,
  csvValidationErrors,
  setCsvValidationErrors,
  uploadProgress,
  showBulkUpload,
  setShowBulkUpload,
  handleBulkUpload,
  selectedBulkFiles,
  setSelectedBulkFiles,
  bulkFilesInputRef,
  bulkUploading,
  bulkUploadProgress,
  bulkUrls,
  setBulkUrls,
  urlAuthHeaders,
  setUrlAuthHeaders,
  urlTimeout,
  setUrlTimeout,
  showMetadataUpdate,
  setShowMetadataUpdate,
  handleMetadataUpdate,
  selectedMetadataCsv,
  setSelectedMetadataCsv,
  metadataCsvInputRef,
  metadataUpdating,
  metadataUpdateProgress,
  showFailedVideos,
  setShowFailedVideos,
  setShowToast,
}: UploadFormsProps) {
  return (
    <>
      {/* Single Video Upload */}
      <div className="card animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <span className="text-3xl">🎬</span>
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
              type="text"
              id="title"
              name="title"
              placeholder="Enter video title"
              required
              className="input-field"
            />

            <label htmlFor="description" className="label">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              placeholder="Enter video description"
              required
              className="input-field min-h-[100px] resize-y"
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
                  <div className="text-4xl mb-2">✅</div>
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
                  <div className="text-4xl mb-2">📹</div>
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

      {/* ZIP Asset Upload */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <span className="text-3xl">📦</span>
            <span>Upload Assets (ZIP)</span>
          </h2>
        </div>

        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>💡 Quick Upload:</strong> Upload all your videos and thumbnails as a ZIP
            file. The system will automatically extract and organize them. Then upload your CSV
            separately to start streaming to YouTube.
          </p>
        </div>

        <form onSubmit={handleZipUpload} className="flex flex-col gap-5">
          <label htmlFor="zipFile" className="label">
            Upload ZIP File (Videos + Thumbnails)
          </label>
          <input
            type="file"
            id="zipFile"
            name="zipFile"
            accept=".zip"
            required
            disabled={zipUploading}
            className="input-field"
          />

          {/* ZIP Upload Progress */}
          {zipUploadProgress && zipUploading && (
            <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl dark:from-blue-900/30 dark:to-indigo-900/30 dark:border-blue-700">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                    <div className="animate-spin text-xl">📦</div>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="font-bold text-blue-900 dark:text-blue-100 text-lg">
                    {zipUploadProgress.message}
                  </div>
                  {zipUploadProgress.totalFiles && (
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      {zipUploadProgress.extractedCount || 0} / {zipUploadProgress.totalFiles}{" "}
                      files extracted
                      {zipUploadProgress.videoCount !== undefined && (
                        <span>
                          {" "}
                          • {zipUploadProgress.videoCount} videos,{" "}
                          {zipUploadProgress.thumbnailCount || 0} thumbnails
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-blue-800 dark:text-blue-200 font-medium">
                    Progress
                  </span>
                  <span className="text-blue-600 dark:text-blue-400 font-bold">
                    {zipUploadProgress.progress}%
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-3 dark:bg-blue-800 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full transition-all duration-500 ease-out relative"
                    style={{
                      width: `${Math.min(100, zipUploadProgress.progress)}%`,
                    }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={zipUploading}
            className={`btn-primary ${
              zipUploading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {zipUploading ? (
              <span className="flex items-center gap-2">
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                {zipUploadProgress?.message || "Uploading..."}
              </span>
            ) : (
              "Upload ZIP File"
            )}
          </button>
        </form>
      </div>

      {/* Batch Upload */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <span className="text-3xl">📄</span>
            <span>Upload CSV & Stream to YouTube</span>
          </h2>
          <button
            type="button"
            onClick={toggleBatchUpload}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            {showBatchUpload ? "Hide" : "Show"}
          </button>
        </div>
        {showBatchUpload && (
          <>
            {/* Quick Info Banner */}
            <div className="mb-5 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                    <strong>🚀 Direct Streaming:</strong> Upload CSV and video files. Videos are
                    streamed directly to YouTube in batches with real-time progress updates. Keep
                    your browser open to see live progress.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleBatchInstructions}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
                >
                  {showBatchInstructions ? "📖 Hide Instructions" : "📖 Show Instructions"}
                </button>
              </div>
            </div>

            {/* Collapsible Instructions */}
            {showBatchInstructions && (
              <div className="mb-5 space-y-3 animate-fade-in">
                <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <h3 className="font-semibold mb-3 text-gray-800 dark:text-white flex items-center gap-2">
                    <span>📋</span>
                    <span>CSV File Format</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        Required Columns:
                      </div>
                      <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            youtube_title
                          </code>
                        </li>
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            youtube_description
                          </code>
                        </li>
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            video_name
                          </code>{" "}
                          or{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            video_url
                          </code>{" "}
                          (filename or URL)
                        </li>
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            path
                          </code>{" "}
                          (file path or URL - auto-detected)
                        </li>
                      </ul>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        Optional Columns:
                      </div>
                      <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            thumbnail_name
                          </code>{" "}
                          or{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            thumbnail_url
                          </code>{" "}
                          (filename or URL)
                        </li>
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            url_auth_headers
                          </code>{" "}
                          (JSON auth headers for URLs)
                        </li>
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            url_timeout
                          </code>{" "}
                          (timeout in milliseconds)
                        </li>
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            drive_file_id
                          </code>{" "}
                          (Google Drive file ID for video)
                        </li>
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            drive_thumbnail_id
                          </code>{" "}
                          (Google Drive file ID for thumbnail)
                        </li>
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            post_upload_action
                          </code>{" "}
                          ("rename", "delete", "move", or "none")
                        </li>
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            completed_folder_id
                          </code>{" "}
                          (Drive folder ID for move action)
                        </li>
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            scheduleTime
                          </code>
                        </li>
                        <li>
                          •{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            privacyStatus
                          </code>
                        </li>
                        <li className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Note: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">path</code>{" "}
                          can be a file path, URL, or Drive file ID (auto-detected).{" "}
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                            thumbnail_path
                          </code>{" "}
                          works the same way.
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-lg">✅</span>
                    <div className="flex-1">
                      <strong className="text-green-900 dark:text-green-100">
                        Multiple Source Types Supported:
                      </strong>
                      <p className="text-sm text-green-800 dark:text-green-200 mt-1">
                        Videos can be from uploaded files, external URLs, or Google Drive file IDs. 
                        Use <code className="bg-green-100 dark:bg-green-800 px-1 rounded">video_url</code>, 
                        <code className="bg-green-100 dark:bg-green-800 px-1 rounded">drive_file_id</code>, or 
                        put URLs/Drive IDs in the <code className="bg-green-100 dark:bg-green-800 px-1 rounded">path</code> column. 
                        URLs and Drive files stream directly - no download needed!
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-lg">💡</span>
                    <div className="flex-1">
                      <strong className="text-blue-900 dark:text-blue-100">How It Works:</strong>
                      <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                        1. Upload video/thumbnail files OR use URLs/Drive IDs in your CSV. 2. Upload your CSV file below. 
                        The system auto-detects URLs and Drive IDs in <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">path</code>, 
                        <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">video_url</code>, or 
                        <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">drive_file_id</code> columns. 
                        3. Videos stream directly to YouTube - no disk storage needed!
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">📝</span>
                    <div className="flex-1">
                      <strong className="text-purple-900 dark:text-purple-100">
                        Description Formatting:
                      </strong>
                      <p className="text-sm text-purple-800 dark:text-purple-200 mt-1">
                        Supports multi-line text (
                        <code className="bg-purple-100 dark:bg-purple-800 px-1 rounded">\n</code>
                        ), emojis, links, and hashtags. Ensure CSV fields are properly quoted for
                        line breaks.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <form onSubmit={handleCsvUpload} className="flex flex-col gap-5">
              <label htmlFor="csvFile" className="label">
                Upload CSV
              </label>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                  selectedCsvFile
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                    : "border-gray-300 hover:border-red-500"
                }`}
                onClick={() => csvFileInputRef.current?.click()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
                    setSelectedCsvFile(file);
                    if (csvFileInputRef.current) {
                      const dataTransfer = new DataTransfer();
                      dataTransfer.items.add(file);
                      csvFileInputRef.current.files = dataTransfer.files;
                    }
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                <input
                  ref={csvFileInputRef}
                  type="file"
                  id="csvFile"
                  name="csvFile"
                  accept=".csv"
                  required
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedCsvFile(file);
                      setCsvValidationErrors([]);
                      const errors = await validateCsv(file);
                      setCsvValidationErrors(errors);
                      if (errors.length === 0) {
                        setShowToast({
                          message: "CSV validation passed!",
                          type: "success",
                        });
                      } else {
                        setShowToast({
                          message: `CSV validation found ${errors.length} error(s)`,
                          type: "error",
                        });
                      }
                    }
                  }}
                />
                {selectedCsvFile ? (
                  <div>
                    <div className="text-4xl mb-2">
                      {csvValidationErrors.length === 0 ? "✅" : "⚠️"}
                    </div>
                    <p
                      className={`font-semibold mb-1 ${
                        csvValidationErrors.length === 0
                          ? "text-green-700 dark:text-green-300"
                          : "text-yellow-700 dark:text-yellow-300"
                      }`}
                    >
                      {selectedCsvFile.name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {(selectedCsvFile.size / 1024).toFixed(2)} KB
                    </p>
                    {csvValidationErrors.length > 0 && (
                      <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded text-xs text-yellow-800 dark:text-yellow-200 max-h-32 overflow-y-auto">
                        <strong>Validation Errors:</strong>
                        <ul className="list-disc list-inside mt-1 space-y-0.5">
                          {csvValidationErrors.slice(0, 5).map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                          {csvValidationErrors.length > 5 && (
                            <li>... and {csvValidationErrors.length - 5} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      Click to change file
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="text-4xl mb-2">📄</div>
                    <p className="text-gray-600 dark:text-gray-400 mb-1">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">CSV files only</p>
                  </>
                )}
              </div>

              <div className="p-4 bg-gray-50 border border-gray-300 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-4">Upload Scheduling Settings</h3>

                <div className="flex flex-col gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                    <p className="text-sm text-blue-900 dark:text-blue-100">
                      <strong>📅 Scheduling:</strong> Use the{" "}
                      <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">
                        scheduleTime
                      </code>{" "}
                      column in your CSV to set publish dates. Videos will be uploaded immediately
                      and YouTube will publish them automatically at the scheduled times.
                    </p>
                  </div>

                  <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-sm text-yellow-800">
                    <strong>Note:</strong> Videos are uploaded immediately but scheduled to publish
                    on their assigned dates. All videos will be uploaded as private initially
                    (required for scheduling), then updated to your CSV&apos;s privacyStatus if
                    possible.
                  </div>
                </div>
              </div>

              {/* Real-time upload progress display */}
              {uploadProgress && csvUploading && (
                <div className="mb-4 p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl dark:from-blue-900/30 dark:to-indigo-900/30 dark:border-blue-700 shadow-sm">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                        <div className="animate-spin text-xl">📤</div>
                      </div>
                      {uploadProgress.totalFiles > 0 && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">
                          {uploadProgress.currentFile}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-blue-900 dark:text-blue-100 text-lg">
                        Streaming to YouTube
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300">
                        {uploadProgress.message || "Preparing files..."}
                      </div>
                    </div>
                  </div>

                  {/* Current file being processed */}
                  {uploadProgress.currentFileName && (
                    <div className="mb-4 p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-blue-100 dark:border-blue-800">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-500">📁</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                          {uploadProgress.currentFileName}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Progress bar */}
                  {uploadProgress.totalFiles > 0 && (
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-blue-800 dark:text-blue-200 font-medium">
                          Processing file {uploadProgress.currentFile} of {uploadProgress.totalFiles}
                        </span>
                        <span className="text-blue-600 dark:text-blue-400 font-bold">
                          {Math.round(
                            (uploadProgress.currentFile / uploadProgress.totalFiles) * 100
                          )}
                          %
                        </span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-3 dark:bg-blue-800 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full transition-all duration-500 ease-out relative"
                          style={{
                            width: `${Math.min(
                              100,
                              (uploadProgress.currentFile / uploadProgress.totalFiles) * 100
                            )}%`,
                          }}
                        >
                          <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={csvUploading || !selectedCsvFile}
                className={`btn-primary ${
                  csvUploading || !selectedCsvFile ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {csvUploading ? (
                  <span className="flex items-center gap-2">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {uploadProgress && uploadProgress.totalFiles > 0
                      ? `Uploading ${uploadProgress.currentFile} / ${uploadProgress.totalFiles}...`
                      : "Starting upload..."}
                  </span>
                ) : !selectedCsvFile ? (
                  "Please select a CSV file first"
                ) : (
                  "Start Upload to YouTube"
                )}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Bulk Upload Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📦</span>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              Bulk Upload (Step 1)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowBulkUpload(!showBulkUpload)}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors"
          >
            {showBulkUpload ? "Hide" : "Show"}
          </button>
        </div>

        {showBulkUpload && (
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>📦 Bulk Upload:</strong> Upload multiple videos from files or URLs. Videos stream directly to YouTube - no disk storage needed! Uploads are processed in the background.
              </p>
            </div>

            <form onSubmit={handleBulkUpload} className="flex flex-col gap-5">
              {/* File Upload */}
              <div>
                <label htmlFor="bulkFiles" className="label">
                  📁 Upload Video Files (Optional)
                </label>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                  selectedBulkFiles.length > 0
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                    : "border-gray-300 hover:border-blue-500"
                }`}
                onClick={() => bulkFilesInputRef.current?.click()}
              >
                <input
                  ref={bulkFilesInputRef}
                  type="file"
                  id="bulkFiles"
                  name="bulkFiles"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setSelectedBulkFiles(files);
                  }}
                />
                {selectedBulkFiles.length > 0 ? (
                  <div>
                    <div className="text-4xl mb-2">✅</div>
                    <p className="text-green-700 dark:text-green-300 font-semibold mb-1">
                      {selectedBulkFiles.length} file(s) selected
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedBulkFiles
                        .map((f) => f.name)
                        .join(", ")
                        .substring(0, 100)}
                      {selectedBulkFiles.length > 0 &&
                      selectedBulkFiles[0].name.length > 100
                        ? "..."
                        : ""}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      Click to change files
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="text-4xl mb-2">📹</div>
                    <p className="text-gray-600 dark:text-gray-400 mb-1">
                      Click to select videos or drag and drop
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                      Multiple video files (batches of 5)
                    </p>
                  </>
                )}
              </div>
              </div>

              {/* URL Upload */}
              <div>
                <label htmlFor="bulkUrls" className="label">
                  🌐 Or Enter Video URLs (One per line)
                </label>
                <textarea
                  id="bulkUrls"
                  name="bulkUrls"
                  placeholder="https://cdn.example.com/video1.mp4&#10;https://cdn.example.com/video2.mp4&#10;https://cdn.example.com/video3.mp4"
                  value={bulkUrls.join("\n")}
                  onChange={(e) => {
                    const urls = e.target.value.split("\n").filter(url => url.trim());
                    setBulkUrls(urls);
                  }}
                  rows={5}
                  className="input-field font-mono text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Enter one URL per line. Videos stream directly from external servers - no download needed!
                </p>
              </div>

              {/* Auth Headers (Optional) */}
              {(bulkUrls.length > 0) && (
                <div>
                  <label htmlFor="urlAuthHeaders" className="label">
                    🔐 Authentication Headers (Optional)
                  </label>
                  <input
                    type="text"
                    id="urlAuthHeaders"
                    name="urlAuthHeaders"
                    placeholder='{"Authorization":"Bearer token123"}'
                    value={urlAuthHeaders}
                    onChange={(e) => setUrlAuthHeaders(e.target.value)}
                    className="input-field font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    JSON format. Only needed if URLs require authentication.
                  </p>
                </div>
              )}

              {/* Timeout (Optional) */}
              {(bulkUrls.length > 0) && (
                <div>
                  <label htmlFor="urlTimeout" className="label">
                    ⏱️ Timeout (Optional, milliseconds)
                  </label>
                  <input
                    type="number"
                    id="urlTimeout"
                    name="urlTimeout"
                    placeholder="600000"
                    value={urlTimeout}
                    onChange={(e) => setUrlTimeout(e.target.value)}
                    className="input-field"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Default: 10 minutes (600000ms). Increase for large files.
                  </p>
                </div>
              )}

              {/* Divider */}
              {(selectedBulkFiles.length > 0 || bulkUrls.length > 0) && (
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      OR
                    </span>
                  </div>
                </div>
              )}

              {/* Google Drive Folder Upload */}
              <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                <div className="flex items-start gap-2 mb-3">
                  <span className="text-xl">📁</span>
                  <div className="flex-1">
                    <strong className="text-green-900 dark:text-green-100 block mb-1">
                      Upload from Google Drive Folder
                    </strong>
                    <p className="text-sm text-green-800 dark:text-green-200 mb-3">
                      Upload all videos from a Google Drive folder. Supports recursive folder scanning and post-upload actions.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        id="driveFolderId"
                        name="driveFolderId"
                        placeholder="Enter Drive folder ID (e.g., 1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p)"
                        className="input-field flex-1 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const folderId = (document.getElementById('driveFolderId') as HTMLInputElement)?.value?.trim();
                          if (!folderId) {
                            setShowToast({ message: "Please enter a Drive folder ID", type: "error" });
                            return;
                          }
                          try {
                            const response = await fetch('/api/upload-drive', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                driveFolderId: folderId,
                                recursive: (document.getElementById('driveRecursive') as HTMLInputElement)?.checked || false,
                                postUploadAction: (document.getElementById('drivePostAction') as HTMLSelectElement)?.value || 'none',
                                completedFolderId: (document.getElementById('driveCompletedFolder') as HTMLInputElement)?.value?.trim() || undefined,
                                privacyStatus: (document.getElementById('drivePrivacy') as HTMLSelectElement)?.value || 'private',
                                useWorker: true,
                              }),
                            });
                            const data = await response.json();
                            if (response.ok) {
                              setShowToast({ message: `Upload queued: ${data.totalItems} videos from "${data.folderName}"`, type: "success" });
                              (document.getElementById('driveFolderId') as HTMLInputElement).value = '';
                            } else {
                              setShowToast({ message: data.error || "Failed to queue Drive upload", type: "error" });
                            }
                          } catch (error: any) {
                            setShowToast({ message: `Error: ${error.message}`, type: "error" });
                          }
                        }}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                      >
                        Upload Folder
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm text-green-800 dark:text-green-200">
                        <input
                          type="checkbox"
                          id="driveRecursive"
                          className="rounded"
                        />
                        Scan subfolders recursively
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label htmlFor="drivePostAction" className="text-xs text-green-700 dark:text-green-300 block mb-1">
                            Post-upload action:
                          </label>
                          <select
                            id="drivePostAction"
                            className="input-field text-sm py-1"
                            defaultValue="none"
                            onChange={(e) => {
                              const moveFolder = document.getElementById('driveMoveFolder');
                              if (moveFolder) {
                                moveFolder.classList.toggle('hidden', e.target.value !== 'move');
                              }
                            }}
                          >
                            <option value="none">None</option>
                            <option value="rename">Rename to video ID</option>
                            <option value="delete">Delete from Drive</option>
                            <option value="move">Move to folder</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="drivePrivacy" className="text-xs text-green-700 dark:text-green-300 block mb-1">
                            Privacy:
                          </label>
                          <select
                            id="drivePrivacy"
                            className="input-field text-sm py-1"
                            defaultValue="private"
                          >
                            <option value="private">Private</option>
                            <option value="unlisted">Unlisted</option>
                            <option value="public">Public</option>
                          </select>
                        </div>
                      </div>
                      <div id="driveMoveFolder" className="hidden">
                        <label htmlFor="driveCompletedFolder" className="text-xs text-green-700 dark:text-green-300 block mb-1">
                          Completed folder ID (for move action):
                        </label>
                        <input
                          type="text"
                          id="driveCompletedFolder"
                          placeholder="Enter folder ID"
                          className="input-field text-sm font-mono"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                      💡 Get folder ID from Drive URL: <code className="bg-green-100 dark:bg-green-800 px-1 rounded">drive.google.com/drive/folders/FOLDER_ID</code>
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Display */}
              {bulkUploadProgress && bulkUploading && (
                <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl dark:from-blue-900/30 dark:to-indigo-900/30 dark:border-blue-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                      <div className="animate-spin text-xl">📤</div>
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-blue-900 dark:text-blue-100 text-lg">
                        Bulk Uploading Videos
                      </div>
                      <div className="text-sm text-blue-700 dark:text-blue-300">
                        {bulkUploadProgress.message || "Preparing..."}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar - Always show when uploading */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-blue-800 dark:text-blue-200 font-medium">
                        {bulkUploadProgress.currentBatch &&
                        bulkUploadProgress.totalBatches ? (
                          <span>
                            Batch {bulkUploadProgress.currentBatch} /{" "}
                            {bulkUploadProgress.totalBatches} •{" "}
                          </span>
                        ) : null}
                        {bulkUploadProgress.completed || 0} succeeded,{" "}
                        {bulkUploadProgress.failed || 0} failed
                        {bulkUploadProgress.total ? " of " + bulkUploadProgress.total : ""}
                      </span>
                      <span className="text-blue-600 dark:text-blue-400 font-bold">
                        {bulkUploadProgress.total > 0
                          ? Math.round(
                              ((bulkUploadProgress.completed + bulkUploadProgress.failed) /
                                bulkUploadProgress.total) *
                                100
                            )
                          : 0}
                        %
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-4 dark:bg-blue-800 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-indigo-500 h-4 rounded-full transition-all duration-500 relative"
                        style={{
                          width:
                            bulkUploadProgress.total > 0
                              ? `${Math.min(
                                  100,
                                  Math.round(
                                    ((bulkUploadProgress.completed +
                                      bulkUploadProgress.failed) /
                                      bulkUploadProgress.total) *
                                      100
                                  )
                                )}%`
                              : "0%",
                        }}
                      >
                        <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                      </div>
                    </div>
                  </div>

                  {bulkUploadProgress.currentFile && (
                    <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-blue-100 dark:border-blue-800">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-500">📁</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                          {bulkUploadProgress.currentFile}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={bulkUploading || (selectedBulkFiles.length === 0 && bulkUrls.length === 0)}
                className={`btn-primary ${
                  bulkUploading || (selectedBulkFiles.length === 0 && bulkUrls.length === 0)
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
              >
                {bulkUploading ? (
                  <span className="flex items-center gap-2">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Queuing...
                  </span>
                ) : (selectedBulkFiles.length === 0 && bulkUrls.length === 0) ? (
                  "Please select files or enter URLs"
                ) : (
                  `Queue ${selectedBulkFiles.length + bulkUrls.length} Video(s) for Upload`
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Metadata Update Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✏️</span>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              Update Metadata (Step 2)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowMetadataUpdate(!showMetadataUpdate)}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors"
          >
            {showMetadataUpdate ? "Hide" : "Show"}
          </button>
        </div>

        {showMetadataUpdate && (
          <div className="space-y-4">
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
              <p className="text-sm text-purple-900 dark:text-purple-100">
                <strong>✏️ Update Metadata:</strong> After uploading videos in Step 1, use this
                to update titles, descriptions, scheduling, and privacy settings. Only{" "}
                <strong>private videos</strong> will be checked and updated.
              </p>
            </div>

            <form onSubmit={handleMetadataUpdate} className="flex flex-col gap-5">
              <label htmlFor="metadataCsv" className="label">
                Upload CSV File
              </label>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                  selectedMetadataCsv
                    ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                    : "border-gray-300 hover:border-purple-500"
                }`}
                onClick={() => metadataCsvInputRef.current?.click()}
              >
                <input
                  ref={metadataCsvInputRef}
                  type="file"
                  id="metadataCsv"
                  name="metadataCsv"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedMetadataCsv(file);
                    }
                  }}
                />
                {selectedMetadataCsv ? (
                  <div>
                    <div className="text-4xl mb-2">✅</div>
                    <p className="text-green-700 dark:text-green-300 font-semibold mb-1">
                      {selectedMetadataCsv.name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {(selectedMetadataCsv.size / 1024).toFixed(2)} KB
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      Click to change file
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="text-4xl mb-2">📄</div>
                    <p className="text-gray-600 dark:text-gray-400 mb-1">
                      Click to upload CSV file
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">CSV files only</p>
                  </>
                )}
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <h3 className="font-semibold mb-3 text-gray-800 dark:text-white">
                  CSV Format (Required Columns)
                </h3>
                <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                  <li>
                    • <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">video_name</code>{" "}
                    - Filename to match uploaded video
                  </li>
                  <li>
                    • <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">youtube_title</code>{" "}
                    - New title
                  </li>
                  <li>
                    •{" "}
                    <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
                      youtube_description
                    </code>{" "}
                    - New description
                  </li>
                  <li>
                    • <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">scheduleTime</code>{" "}
                    - Publish date (optional)
                  </li>
                  <li>
                    • <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">privacyStatus</code>{" "}
                    - public/private/unlisted (optional)
                  </li>
                  <li>
                    • <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">thumbnail_name</code>{" "}
                    - Thumbnail filename (optional)
                  </li>
                </ul>
              </div>

              {/* Progress Display - Enhanced for Large Batches */}
              {metadataUpdateProgress &&
                (metadataUpdating ||
                  metadataUpdateProgress.processed === metadataUpdateProgress.total) && (
                  <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl dark:from-purple-900/30 dark:to-pink-900/30 dark:border-purple-700">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-800 flex items-center justify-center">
                        {metadataUpdating ? (
                          <div className="animate-spin text-2xl">✏️</div>
                        ) : (
                          <div className="text-2xl">✅</div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-purple-900 dark:text-purple-100 text-lg">
                          {metadataUpdating ? "Updating Metadata" : "Update Complete"}
                        </div>
                        <div className="text-sm text-purple-700 dark:text-purple-300">
                          {metadataUpdateProgress.message || "Preparing..."}
                        </div>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-purple-100 dark:border-purple-800">
                        <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">
                          Total
                        </div>
                        <div className="text-lg font-bold text-purple-900 dark:text-purple-100">
                          {metadataUpdateProgress.total}
                        </div>
                      </div>
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="text-xs text-green-600 dark:text-green-400 mb-1">
                          Updated
                        </div>
                        <div className="text-lg font-bold text-green-700 dark:text-green-300">
                          {metadataUpdateProgress.updated}
                        </div>
                      </div>
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                        <div className="text-xs text-red-600 dark:text-red-400 mb-1">Failed</div>
                        <div className="text-lg font-bold text-red-700 dark:text-red-300">
                          {metadataUpdateProgress.failed}
                        </div>
                      </div>
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">
                          Thumbnails
                        </div>
                        <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
                          {metadataUpdateProgress.thumbnails}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {metadataUpdateProgress.total > 0 && (
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-purple-800 dark:text-purple-200 font-medium">
                            {metadataUpdateProgress.currentBatch &&
                            metadataUpdateProgress.totalBatches ? (
                              <>
                                Batch {metadataUpdateProgress.currentBatch} /{" "}
                                {metadataUpdateProgress.totalBatches} •{" "}
                              </>
                            ) : null}
                            {metadataUpdateProgress.processed ||
                            (metadataUpdateProgress.updated + metadataUpdateProgress.failed)}{" "}
                            / {metadataUpdateProgress.total} processed
                          </span>
                          <span className="text-purple-600 dark:text-purple-400 font-bold">
                            {Math.round(
                              ((metadataUpdateProgress.processed ||
                                metadataUpdateProgress.updated +
                                  metadataUpdateProgress.failed) /
                                metadataUpdateProgress.total) *
                                100
                            )}
                            %
                          </span>
                        </div>
                        <div className="w-full bg-purple-200 rounded-full h-4 dark:bg-purple-800 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-purple-500 to-pink-500 h-4 rounded-full transition-all duration-500 relative"
                            style={{
                              width:
                                metadataUpdateProgress.total > 0
                                  ? `${Math.min(
                                      100,
                                      Math.round(
                                        ((metadataUpdateProgress.processed ||
                                          metadataUpdateProgress.updated +
                                            metadataUpdateProgress.failed) /
                                          metadataUpdateProgress.total) *
                                          100
                                      )
                                    )}%`
                                  : "0%",
                            }}
                          >
                            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Performance Metrics */}
                    {(metadataUpdateProgress.rate ||
                      metadataUpdateProgress.estimatedSeconds) && (
                      <div className="flex gap-4 text-xs text-purple-700 dark:text-purple-300 mb-4">
                        {metadataUpdateProgress.rate && (
                          <div className="flex items-center gap-1">
                            <span>⚡</span>
                            <span>{metadataUpdateProgress.rate} videos/min</span>
                          </div>
                        )}
                        {metadataUpdateProgress.estimatedSeconds &&
                        metadataUpdateProgress.estimatedSeconds > 0 ? (
                          <div className="flex items-center gap-1">
                            <span>⏱️</span>
                            <span>
                              ~{Math.round(metadataUpdateProgress.estimatedSeconds / 60)} min
                              remaining
                            </span>
                          </div>
                        ) : null}
                        {metadataUpdateProgress.totalTime ? (
                          <div className="flex items-center gap-1">
                            <span>✅</span>
                            <span>Completed in {metadataUpdateProgress.totalTime}s</span>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Current Video */}
                    {metadataUpdateProgress.currentVideo && (
                      <div className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-purple-100 dark:border-purple-800 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-purple-500">📹</span>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                            {metadataUpdateProgress.currentVideo}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Failed Videos List */}
                    {metadataUpdateProgress.failedVideos &&
                    metadataUpdateProgress.failedVideos.length > 0 ? (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => setShowFailedVideos(!showFailedVideos)}
                          className="w-full p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-left"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                              ⚠️ {metadataUpdateProgress.failedVideos.length} Failed Video
                              {metadataUpdateProgress.failedVideos.length !== 1 ? "s" : ""}
                            </span>
                            <span className="text-red-600 dark:text-red-400">
                              {showFailedVideos ? "▼" : "▶"}
                            </span>
                          </div>
                        </button>
                        {showFailedVideos && (
                          <div className="mt-2 max-h-64 overflow-y-auto space-y-2">
                            {metadataUpdateProgress.failedVideos.map((failed, idx) => (
                              <div
                                key={idx}
                                className="p-2 bg-white/60 dark:bg-gray-800/60 rounded border border-red-200 dark:border-red-800 text-xs"
                              >
                                <div className="font-medium text-red-700 dark:text-red-300 truncate">
                                  {failed.videoName || `Row ${failed.index + 1}`}
                                </div>
                                <div className="text-red-600 dark:text-red-400 mt-1">
                                  {failed.error}
                                </div>
                              </div>
                            ))}
                            {metadataUpdateProgress.failedVideos.length >= 100 && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 p-2 text-center">
                                Showing first 100 failures. Check console for full list.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

              <button
                type="submit"
                disabled={metadataUpdating || !selectedMetadataCsv}
                className={`btn-primary ${
                  metadataUpdating || !selectedMetadataCsv
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
              >
                {metadataUpdating ? (
                  <span className="flex items-center gap-2">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Updating...
                  </span>
                ) : !selectedMetadataCsv ? (
                  "Please select a CSV file first"
                ) : (
                  "Update Metadata"
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}

