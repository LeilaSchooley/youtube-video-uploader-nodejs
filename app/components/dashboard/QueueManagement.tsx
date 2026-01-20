"use client";

interface ProgressItem {
  index: number;
  status: string;
  videoId?: string;
  fileSize?: number;
  duration?: number;
  uploadSpeed?: number;
}

interface QueueManagementProps {
  queue: any[];
  searchQuery: string;
  selectedJobId: string | null;
  setSelectedJobId: (jobId: string | null) => void;
  fetchJobStatus: (jobId: string) => Promise<void>;
  fetchQueue: () => Promise<void>;
  handleQueueAction: (jobId: string, action: "pause" | "resume" | "cancel" | "delete") => Promise<void>;
  jobStatus: any;
  jobFiles: any;
  loadingFiles: boolean;
  handleDeleteFile: (jobId: string, filePath: string, fileName: string) => Promise<void>;
  handleDeleteAllFiles: (jobId: string) => Promise<void>;
  setShowToast: (toast: { message: string; type: "success" | "error" | "info" }) => void;
}

export default function QueueManagement({
  queue,
  searchQuery,
  selectedJobId,
  setSelectedJobId,
  fetchJobStatus,
  fetchQueue,
  handleQueueAction,
  jobStatus,
  jobFiles,
  loadingFiles,
  handleDeleteFile,
  handleDeleteAllFiles,
  setShowToast,
}: QueueManagementProps) {
  // Format file size
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  // Format upload speed
  const formatSpeed = (bytesPerSecond?: number) => {
    if (!bytesPerSecond) return "";
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024)
      return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
    return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`;
  };

  // Format duration
  const formatDuration = (seconds?: number) => {
    if (!seconds) return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      const mins = minutes.toString().padStart(2, "0");
      const secsStr = secs.toString().padStart(2, "0");
      return `${hours}:${mins}:${secsStr}`;
    }
    const mins = minutes.toString().padStart(2, "0");
    const secsStr = secs.toString().padStart(2, "0");
    return `${mins}:${secsStr}`;
  };

  return (
    <>
      {/* Historical Jobs - Only show if there are jobs */}
      {queue.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">📊</span>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              Upload History
            </h2>
          </div>

          {/* Simplified Jobs List */}
          <div className="flex flex-col gap-3">
            {queue
              .filter(
                (job) =>
                  !searchQuery ||
                  job.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  job.status.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .slice(0, 10) // Show only first 10 jobs
              .map((job) => {
                // Calculate job progress
                const jobProgress = job.progress || [];
                const completedCount = jobProgress.filter(
                  (p: any) =>
                    p.status.includes("Uploaded") ||
                    p.status.includes("Scheduled") ||
                    p.status.includes("Already uploaded")
                ).length;
                const failedCount = jobProgress.filter((p: any) =>
                  p.status.includes("Failed")
                ).length;
                const totalVideos = job.totalVideos || jobProgress.length || 0;
                const progressPercent =
                  totalVideos > 0
                    ? Math.round((completedCount / totalVideos) * 100)
                    : 0;

                return (
                  <div
                    key={job.id}
                    className={`p-5 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                      selectedJobId === job.id
                        ? "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-blue-400 dark:border-blue-500 shadow-lg"
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-md"
                    }`}
                    onClick={() => {
                      setSelectedJobId(job.id);
                      // Immediately fetch job status and queue when clicked
                      fetchJobStatus(job.id);
                      fetchQueue();
                    }}
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className={`w-4 h-4 rounded-full flex-shrink-0 ${
                              job.status === "completed"
                                ? "bg-green-500 shadow-lg shadow-green-500/50"
                                : job.status === "failed"
                                ? "bg-red-500 shadow-lg shadow-red-500/50"
                                : job.status === "processing"
                                ? "bg-yellow-500 animate-pulse shadow-lg shadow-yellow-500/50"
                                : job.status === "paused"
                                ? "bg-blue-500 shadow-lg shadow-blue-500/50"
                                : "bg-gray-400"
                            }`}
                          ></div>
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400 truncate">
                            {job.id}
                          </span>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                              job.status === "completed"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : job.status === "failed"
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                : job.status === "processing"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 animate-pulse"
                                : job.status === "paused"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                            }`}
                          >
                            {job.status === "completed" && "✓ "}
                            {job.status === "failed" && "✕ "}
                            {job.status === "processing" && "⚡ "}
                            {job.status === "paused" && "⏸ "}
                            {job.status.toUpperCase()}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        {totalVideos > 0 && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Progress: {completedCount} / {totalVideos}
                              </span>
                              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                                {progressPercent}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                              <div
                                className={`h-2.5 rounded-full transition-all duration-300 ${
                                  job.status === "completed"
                                    ? "bg-gradient-to-r from-green-500 to-emerald-500"
                                    : job.status === "failed"
                                    ? "bg-gradient-to-r from-red-500 to-pink-500"
                                    : job.status === "processing"
                                    ? "bg-gradient-to-r from-yellow-500 to-orange-500 animate-pulse"
                                    : "bg-gradient-to-r from-blue-500 to-indigo-500"
                                }`}
                                style={{ width: `${progressPercent}%` }}
                              ></div>
                            </div>
                            {(completedCount > 0 || failedCount > 0) && (
                              <div className="flex items-center gap-4 mt-1 text-xs text-gray-600 dark:text-gray-400">
                                {completedCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                    {completedCount} completed
                                  </span>
                                )}
                                {failedCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                    {failedCount} failed
                                  </span>
                                )}
                                {totalVideos - completedCount - failedCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                    {totalVideos - completedCount - failedCount} pending
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2 mb-2">
                          {job.totalVideos && (
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                              📹 {job.totalVideos} video{job.totalVideos !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span>📅</span>
                            <span>Created: {new Date(job.createdAt).toLocaleString()}</span>
                          </div>
                          {job.status === "processing" &&
                            job.progress &&
                            job.progress.length > 0 &&
                            job.progress[0] &&
                            (job.progress[0].status.includes("Uploading") ||
                              job.progress[0].status === "Pending") && (
                              <div className="mt-2 p-2 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg">
                                <div className="flex items-center gap-2 text-green-800 dark:text-green-200 font-semibold text-sm">
                                  <span className="animate-pulse-slow">⚡</span>
                                  <span>Uploading first video now...</span>
                                </div>
                              </div>
                            )}
                        </div>
                        {/* Queue Management Actions */}
                        <div className="flex gap-2 mt-4 flex-wrap pt-3 border-t border-gray-200 dark:border-gray-700">
                          {job.status === "pending" && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "pause");
                                }}
                                className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ⏸ Pause
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "cancel");
                                }}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ✕ Cancel
                              </button>
                            </>
                          )}
                          {job.status === "paused" && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "resume");
                                }}
                                className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ▶ Resume
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "cancel");
                                }}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ✕ Cancel
                              </button>
                            </>
                          )}
                          {job.status === "processing" && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "pause");
                                }}
                                className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ⏸ Pause
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQueueAction(job.id, "cancel");
                                }}
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                ✕ Cancel
                              </button>
                            </>
                          )}
                          {(job.status === "completed" ||
                            job.status === "failed" ||
                            job.status === "cancelled") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    `Are you sure you want to delete this ${job.status} job? This will remove it from the queue and clean up associated files.`
                                  )
                                ) {
                                  handleQueueAction(job.id, "delete");
                                }
                              }}
                              className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg transition-colors"
                              title="Delete this job"
                            >
                              🗑️ Delete
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-2xl text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {selectedJobId === job.id ? "▼" : "▶"}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {selectedJobId && jobStatus && (() => {
        const progress = jobStatus.progress || [];
        const totalVideos = jobStatus.totalVideos || progress.length || 0;
        const completed = progress.filter(
          (p: ProgressItem) =>
            p.status.includes("Uploaded") ||
            p.status.includes("Scheduled") ||
            p.status.includes("scheduled") ||
            p.status.includes("Already uploaded")
        ).length;
        const failed = progress.filter(
          (p: ProgressItem) =>
            p.status.includes("Failed") ||
            p.status.includes("Missing") ||
            p.status.includes("Invalid") ||
            p.status.includes("not found") ||
            p.status.includes("Cannot access") ||
            p.status.includes("error")
        ).length;
        const processing = progress.filter(
          (p: ProgressItem) =>
            p.status.includes("Uploading") ||
            p.status === "Pending" ||
            p.status.includes("thumbnail") ||
            p.status.includes("Checking")
        ).length;
        const pending = totalVideos - completed - failed - processing;
        const progressPercentage =
          totalVideos > 0 ? Math.round((completed / totalVideos) * 100) : 0;

        return (
          <div className="mt-5 p-6 bg-gradient-to-br from-gray-50 dark:from-gray-800 to-blue-50 dark:to-blue-900/30 border-2 border-blue-200 dark:border-blue-700 rounded-xl shadow-lg">
            <div className="flex justify-between items-start mb-6">
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">
                  📋 Job Progress
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                  {jobStatus.id}
                </p>
                {jobStatus.notes && (
                  <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded text-sm text-blue-800 dark:text-blue-200">
                    <strong>📝 Notes:</strong> {jobStatus.notes}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const notes = prompt("Add notes for this job:", jobStatus.notes || "");
                    if (notes !== null) {
                      try {
                        const res = await fetch("/api/queue-notes", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            jobId: jobStatus.id,
                            notes,
                          }),
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setShowToast({
                            message: "Notes updated",
                            type: "success",
                          });
                          fetchJobStatus(jobStatus.id);
                        } else {
                          setShowToast({
                            message: data.error || "Failed to update notes",
                            type: "error",
                          });
                        }
                      } catch (error) {
                        setShowToast({
                          message: "An error occurred",
                          type: "error",
                        });
                      }
                    }
                  }}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
                  title="Add/edit notes"
                >
                  📝 Notes
                </button>
                <button
                  onClick={async () => {
                    if (
                      confirm(
                        "Copy this job? This will create a duplicate with the same settings."
                      )
                    ) {
                      try {
                        const res = await fetch("/api/queue-copy", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ jobId: jobStatus.id }),
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setShowToast({
                            message: `Job copied! New job ID: ${data.jobId}`,
                            type: "success",
                          });
                          fetchQueue();
                          setSelectedJobId(data.jobId);
                          fetchJobStatus(data.jobId);
                        } else {
                          setShowToast({
                            message: data.error || "Failed to copy job",
                            type: "error",
                          });
                        }
                      } catch (error) {
                        setShowToast({
                          message: "An error occurred",
                          type: "error",
                        });
                      }
                    }
                  }}
                  className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition-colors"
                  title="Copy this job"
                >
                  📋 Copy
                </button>
                <button
                  onClick={() => setSelectedJobId(null)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold transition-colors"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Progress Statistics */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Overall Progress
                </span>
                <span className="text-lg font-bold text-gray-800 dark:text-white">
                  {progressPercentage}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
                <div
                  className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="text-2xl font-bold text-gray-800 dark:text-white">
                    {totalVideos}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Total Videos
                  </div>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-700">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {completed}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                    ✅ Completed
                  </div>
                </div>
                <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg border border-yellow-200 dark:border-yellow-700">
                  <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                    {processing + pending}
                  </div>
                  <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    ⏳ Processing
                  </div>
                </div>
                <div className="text-center p-3 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-700">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                    {failed}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 mt-1">❌ Failed</div>
                </div>
              </div>
            </div>

            {/* First Video Upload Message */}
            {progress.length > 0 &&
              progress[0] &&
              (progress[0].status.includes("Uploading") || progress[0].status === "Pending") &&
              completed === 0 && (
                <div className="mb-6 p-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl shadow-lg text-white animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl animate-pulse-slow">⚡</div>
                    <div>
                      <div className="font-bold text-lg mb-1">
                        Uploading First Video Now!
                      </div>
                      <div className="text-sm opacity-90">
                        The first video is being uploaded immediately. Progress will update in
                        real-time.
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* Video List */}
            {progress.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Video Details ({completed} / {totalVideos} completed)
                </h4>
                <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
                  {progress.map((item: any, idx: number) => {
                    const isSuccess =
                      item.status.includes("Uploaded") ||
                      item.status.includes("Scheduled") ||
                      item.status.includes("scheduled") ||
                      item.status.includes("Already uploaded");
                    const isFailed =
                      item.status.includes("Failed") ||
                      item.status.includes("Missing") ||
                      item.status.includes("Invalid") ||
                      item.status.includes("not found") ||
                      item.status.includes("Cannot access") ||
                      item.status.includes("error");
                    const isProcessing =
                      item.status.includes("Uploading") ||
                      item.status === "Pending" ||
                      item.status.includes("thumbnail") ||
                      item.status.includes("Checking");

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border transition-all ${
                          isSuccess
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
                            : isFailed
                            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700"
                            : isProcessing
                            ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700"
                            : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-lg font-bold text-gray-800 dark:text-white flex-shrink-0">
                            {isSuccess ? "✅" : isFailed ? "❌" : isProcessing ? "⏳" : "⏸️"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-gray-800 dark:text-white">
                                Video {item.index + 1}
                              </span>
                              {item.videoId && (
                                <a
                                  href={`https://www.youtube.com/watch?v=${item.videoId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  🔗 View on YouTube
                                </a>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-600 dark:text-gray-400">
                              {item.fileSize && (
                                <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                  📦 {formatFileSize(item.fileSize)}
                                </span>
                              )}
                              {item.duration && (
                                <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                  ⏱️ {formatDuration(item.duration)}
                                </span>
                              )}
                              {item.uploadSpeed && (
                                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded">
                                  ⚡ {formatSpeed(item.uploadSpeed)}
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className={`text-xs px-3 py-1 rounded-full font-medium flex-shrink-0 ${
                              isSuccess
                                ? "bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200"
                                : isFailed
                                ? "bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200"
                                : isProcessing
                                ? "bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 animate-pulse-slow"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Uploaded Files Management */}
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                      <span>📁</span>
                      <span>Uploaded Files on Server</span>
                    </h4>
                    {jobFiles &&
                      (jobFiles.files.videos.length > 0 ||
                        jobFiles.files.thumbnails.length > 0) && (
                        <button
                          onClick={() => handleDeleteAllFiles(selectedJobId!)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          🗑️ Delete All Files
                        </button>
                      )}
                  </div>

                  {loadingFiles ? (
                    <div className="text-center py-4">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-800 dark:border-white"></div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        Loading files...
                      </p>
                    </div>
                  ) : jobFiles &&
                    (jobFiles.files.videos.length > 0 ||
                      jobFiles.files.thumbnails.length > 0 ||
                      jobFiles.files.csv) ? (
                    <div className="space-y-4">
                      {/* Total Size Info */}
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-blue-800 dark:text-blue-200 font-medium">
                            Total Storage: {jobFiles.totalSizeFormatted}
                          </span>
                          <span className="text-blue-600 dark:text-blue-400">
                            {jobFiles.totalFiles} file
                            {jobFiles.totalFiles !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>

                      {/* Video Files */}
                      {jobFiles.files.videos.length > 0 && (
                        <div>
                          <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            📹 Video Files ({jobFiles.files.videos.length})
                          </h5>
                          <div className="space-y-2">
                            {jobFiles.files.videos.map((file: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                    {file.name}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {file.sizeFormatted}
                                  </p>
                                </div>
                                <button
                                  onClick={() =>
                                    handleDeleteFile(selectedJobId!, file.path, file.name)
                                  }
                                  className="ml-3 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                  title={`Delete ${file.name}`}
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Thumbnail Files */}
                      {jobFiles.files.thumbnails.length > 0 && (
                        <div>
                          <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            🖼️ Thumbnail Files ({jobFiles.files.thumbnails.length})
                          </h5>
                          <div className="space-y-2">
                            {jobFiles.files.thumbnails.map((file: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                    {file.name}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {file.sizeFormatted}
                                  </p>
                                </div>
                                <button
                                  onClick={() =>
                                    handleDeleteFile(selectedJobId!, file.path, file.name)
                                  }
                                  className="ml-3 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                                  title={`Delete ${file.name}`}
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* CSV File */}
                      {jobFiles.files.csv && (
                        <div>
                          <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            📄 CSV File
                          </h5>
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                {jobFiles.files.csv.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {jobFiles.files.csv.sizeFormatted}
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                handleDeleteFile(
                                  selectedJobId!,
                                  jobFiles.files.csv.path,
                                  jobFiles.files.csv.name
                                )
                              }
                              className="ml-3 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                              title={`Delete ${jobFiles.files.csv.name}`}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="text-4xl mb-2">📭</div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        No files found on server for this job
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-5xl mb-3 animate-pulse-slow">⏳</div>
                <p className="text-gray-600 dark:text-gray-400 font-medium">
                  Processing will begin shortly...
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                  The first video will upload immediately once processing begins
                </p>
                {jobStatus && jobStatus.status === "processing" && (
                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold">
                      ⚡ Processing videos...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}

