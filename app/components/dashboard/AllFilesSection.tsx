"use client";

import { useState } from "react";

interface AllFilesSectionProps {
  allFiles: any;
  loadingAllFiles: boolean;
  showAllFiles: boolean;
  setShowAllFiles: (show: boolean) => void;
  fetchAllFiles: () => void;
  setSelectedJobId: (jobId: string) => void;
  fetchJobFiles: (jobId: string) => void;
  handleDeleteFile: (jobId: string, filePath: string, fileName: string) => void;
  handleDeleteAllByCategory: (fileType: "video" | "thumbnail" | "csv") => void;
}

export default function AllFilesSection({
  allFiles,
  loadingAllFiles,
  showAllFiles,
  setShowAllFiles,
  fetchAllFiles,
  setSelectedJobId,
  fetchJobFiles,
  handleDeleteFile,
  handleDeleteAllByCategory,
}: AllFilesSectionProps) {
  const [expandedCategories, setExpandedCategories] = useState<{
    videos: boolean;
    thumbnails: boolean;
    csvs: boolean;
  }>({
    videos: true,
    thumbnails: true,
    csvs: true,
  });

  if (!((allFiles && allFiles.totalFiles > 0) || showAllFiles)) {
    return null;
  }

  return (
    <div className="card animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <span className="text-3xl">📁</span>
          <span>All Uploaded Files</span>
        </h2>
        <button
          onClick={() => {
            setShowAllFiles(!showAllFiles);
            if (!showAllFiles && !allFiles) {
              fetchAllFiles();
            }
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          {showAllFiles ? "Hide" : "View All Files"}
        </button>
      </div>

      {showAllFiles && (
        <div>
          {loadingAllFiles ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800 dark:border-white mb-3"></div>
              <p className="text-gray-600 dark:text-gray-400">
                Loading all files...
              </p>
            </div>
          ) : allFiles && allFiles.totalFiles > 0 ? (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-700">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {allFiles.totalFiles}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Total Files
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {allFiles.videoCount || 0}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Videos
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                    {allFiles.thumbnailCount || 0}
                  </div>
                  <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                    Thumbnails
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                    {allFiles.csvCount || 0}
                  </div>
                  <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                    CSV Files
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                    {allFiles.totalSizeFormatted}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Total Size
                  </div>
                </div>
              </div>

              {/* Files Categorized by Type */}
              <div className="mt-6 space-y-4">
                {/* Videos Category */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
                    <button
                      onClick={() => setExpandedCategories(prev => ({ ...prev, videos: !prev.videos }))}
                      className="flex-1 flex items-center justify-between hover:from-green-100 hover:to-emerald-100 dark:hover:from-green-900/30 dark:hover:to-emerald-900/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">📹</span>
                        <div className="text-left">
                          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                            Videos ({allFiles.videoCount})
                          </h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {allFiles.files.filter((f: any) => f.type === "video").reduce((sum: number, f: any) => sum + f.size, 0) > 0 
                              ? `${((allFiles.files.filter((f: any) => f.type === "video").reduce((sum: number, f: any) => sum + f.size, 0)) / 1024 / 1024).toFixed(2)} MB total`
                              : "No videos"}
                          </p>
                        </div>
                      </div>
                      <span className="text-gray-500 dark:text-gray-400">
                        {expandedCategories.videos ? "▼" : "▶"}
                      </span>
                    </button>
                    {allFiles.files.filter((f: any) => f.type === "video").length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAllByCategory("video");
                        }}
                        className="ml-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                        title="Delete all videos"
                      >
                        🗑️ Delete All
                      </button>
                    )}
                  </div>
                  {expandedCategories.videos && (
                    <div className="p-4 bg-white dark:bg-gray-800 max-h-96 overflow-y-auto space-y-2">
                      {allFiles.files.filter((f: any) => f.type === "video").length > 0 ? (
                        allFiles.files.filter((f: any) => f.type === "video").map((file: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="text-xl">📹</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                  {file.fileName}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  <span>{file.sizeFormatted}</span>
                                  <span>•</span>
                                  <span className="font-mono">{file.jobId.substring(0, 15)}...</span>
                                  <span>•</span>
                                  <span className={`px-2 py-0.5 rounded text-xs ${
                                    file.jobStatus === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                                    file.jobStatus === "processing" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                                    file.jobStatus === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                                    "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                  }`}>
                                    {file.jobStatus}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 ml-3">
                              <a
                                href={`/api/download-file?jobId=${encodeURIComponent(file.jobId)}&filePath=${encodeURIComponent(file.relativePath)}`}
                                download={file.fileName}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0 flex items-center gap-1"
                                title={`Download ${file.fileName}`}
                              >
                                ⬇️ Download
                              </a>
                              <button
                                onClick={() => {
                                  setSelectedJobId(file.jobId);
                                  setShowAllFiles(false);
                                  fetchJobFiles(file.jobId);
                                }}
                                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                title="View job details"
                              >
                                View
                              </button>
                              <button
                                onClick={() => handleDeleteFile(file.jobId, file.relativePath, file.fileName)}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                title={`Delete ${file.fileName}`}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          No videos found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Thumbnails Category */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20">
                    <button
                      onClick={() => setExpandedCategories(prev => ({ ...prev, thumbnails: !prev.thumbnails }))}
                      className="flex-1 flex items-center justify-between hover:from-purple-100 hover:to-pink-100 dark:hover:from-purple-900/30 dark:hover:to-pink-900/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🖼️</span>
                        <div className="text-left">
                          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                            Thumbnails ({allFiles.thumbnailCount})
                          </h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {allFiles.files.filter((f: any) => f.type === "thumbnail").reduce((sum: number, f: any) => sum + f.size, 0) > 0 
                              ? `${((allFiles.files.filter((f: any) => f.type === "thumbnail").reduce((sum: number, f: any) => sum + f.size, 0)) / 1024).toFixed(2)} KB total`
                              : "No thumbnails"}
                          </p>
                        </div>
                      </div>
                      <span className="text-gray-500 dark:text-gray-400">
                        {expandedCategories.thumbnails ? "▼" : "▶"}
                      </span>
                    </button>
                    {allFiles.files.filter((f: any) => f.type === "thumbnail").length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAllByCategory("thumbnail");
                        }}
                        className="ml-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                        title="Delete all thumbnails"
                      >
                        🗑️ Delete All
                      </button>
                    )}
                  </div>
                  {expandedCategories.thumbnails && (
                    <div className="p-4 bg-white dark:bg-gray-800 max-h-96 overflow-y-auto space-y-2">
                      {allFiles.files.filter((f: any) => f.type === "thumbnail").length > 0 ? (
                        allFiles.files.filter((f: any) => f.type === "thumbnail").map((file: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="text-xl">🖼️</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                  {file.fileName}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  <span>{file.sizeFormatted}</span>
                                  <span>•</span>
                                  <span className="font-mono">{file.jobId.substring(0, 15)}...</span>
                                  <span>•</span>
                                  <span className={`px-2 py-0.5 rounded text-xs ${
                                    file.jobStatus === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                                    file.jobStatus === "processing" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                                    file.jobStatus === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                                    "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                  }`}>
                                    {file.jobStatus}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 ml-3">
                              <a
                                href={`/api/download-file?jobId=${encodeURIComponent(file.jobId)}&filePath=${encodeURIComponent(file.relativePath)}`}
                                download={file.fileName}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0 flex items-center gap-1"
                                title={`Download ${file.fileName}`}
                              >
                                ⬇️ Download
                              </a>
                              <button
                                onClick={() => {
                                  setSelectedJobId(file.jobId);
                                  setShowAllFiles(false);
                                  fetchJobFiles(file.jobId);
                                }}
                                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                title="View job details"
                              >
                                View
                              </button>
                              <button
                                onClick={() => handleDeleteFile(file.jobId, file.relativePath, file.fileName)}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                title={`Delete ${file.fileName}`}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          No thumbnails found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* CSV Files Category */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                    <button
                      onClick={() => setExpandedCategories(prev => ({ ...prev, csvs: !prev.csvs }))}
                      className="flex-1 flex items-center justify-between hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">📄</span>
                        <div className="text-left">
                          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                            CSV Files ({allFiles.csvCount})
                          </h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {allFiles.files.filter((f: any) => f.type === "csv").reduce((sum: number, f: any) => sum + f.size, 0) > 0 
                              ? `${((allFiles.files.filter((f: any) => f.type === "csv").reduce((sum: number, f: any) => sum + f.size, 0)) / 1024).toFixed(2)} KB total`
                              : "No CSV files"}
                          </p>
                        </div>
                      </div>
                      <span className="text-gray-500 dark:text-gray-400">
                        {expandedCategories.csvs ? "▼" : "▶"}
                      </span>
                    </button>
                    {allFiles.files.filter((f: any) => f.type === "csv").length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAllByCategory("csv");
                        }}
                        className="ml-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                        title="Delete all CSV files"
                      >
                        🗑️ Delete All
                      </button>
                    )}
                  </div>
                  {expandedCategories.csvs && (
                    <div className="p-4 bg-white dark:bg-gray-800 max-h-96 overflow-y-auto space-y-2">
                      {allFiles.files.filter((f: any) => f.type === "csv").length > 0 ? (
                        allFiles.files.filter((f: any) => f.type === "csv").map((file: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="text-xl">📄</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                  {file.fileName}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  <span>{file.sizeFormatted}</span>
                                  <span>•</span>
                                  <span className="font-mono">{file.jobId.substring(0, 15)}...</span>
                                  <span>•</span>
                                  <span className={`px-2 py-0.5 rounded text-xs ${
                                    file.jobStatus === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                                    file.jobStatus === "processing" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                                    file.jobStatus === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                                    "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                  }`}>
                                    {file.jobStatus}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2 ml-3">
                              <a
                                href={`/api/download-file?jobId=${encodeURIComponent(file.jobId)}&filePath=${encodeURIComponent(file.relativePath)}`}
                                download={file.fileName}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0 flex items-center gap-1"
                                title={`Download ${file.fileName}`}
                              >
                                ⬇️ Download
                              </a>
                              <button
                                onClick={() => {
                                  setSelectedJobId(file.jobId);
                                  setShowAllFiles(false);
                                  fetchJobFiles(file.jobId);
                                }}
                                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                title="View job details"
                              >
                                View
                              </button>
                              <button
                                onClick={() => handleDeleteFile(file.jobId, file.relativePath, file.fileName)}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                title={`Delete ${file.fileName}`}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          No CSV files found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="text-5xl mb-3">📭</div>
              <p className="text-gray-600 dark:text-gray-400 font-medium">
                No files found on server
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                Upload videos using the batch upload form to see them here
              </p>
              {allFiles?.debug && (
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg text-left text-xs">
                  <p className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Debug Info:</p>
                  <p className="text-yellow-700 dark:text-yellow-300">Session: {allFiles.debug.sessionId}</p>
                  <p className="text-yellow-700 dark:text-yellow-300">User ID: {allFiles.debug.userId}</p>
                  <p className="text-yellow-700 dark:text-yellow-300">Safe User ID: {allFiles.debug.safeUserId}</p>
                  <p className="text-yellow-700 dark:text-yellow-300">Uploads dir exists: {allFiles.debug.uploadsDirExists ? "Yes" : "No"}</p>
                  <p className="text-yellow-700 dark:text-yellow-300">User dir exists: {allFiles.debug.userDirExists ? "Yes" : "No"}</p>
                  <p className="text-yellow-700 dark:text-yellow-300">Session dir exists: {allFiles.debug.sessionDirExists ? "Yes" : "No"}</p>
                  <p className="text-yellow-700 dark:text-yellow-300">Jobs in queue: {allFiles.jobs}</p>
                  <p className="text-yellow-700 dark:text-yellow-300 mt-2 text-xs">
                    Files are stored in: <code className="bg-yellow-100 dark:bg-yellow-800 px-1 rounded">/uploads/&lt;user-id&gt; / &lt;job-id&gt; /</code>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


