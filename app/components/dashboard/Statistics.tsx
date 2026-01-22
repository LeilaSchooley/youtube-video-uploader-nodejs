"use client";

interface ProgressItem {
  index: number;
  status: string;
}

interface StatisticsProps {
  queue: any[];
  nextUploadTime: Date | null;
  timeUntilNext: string;
}

export default function Statistics({ queue, nextUploadTime, timeUntilNext }: StatisticsProps) {
  const allProgress = queue.flatMap((job) => job.progress || []);
  const totalVideos = queue.reduce((sum, job) => {
    return sum + (job.totalVideos || job.progress?.length || 0);
  }, 0);
  
  const completed = allProgress.filter(
    (p) =>
      p && (p.videoId || (p.status && (
        p.status.includes("Uploaded") ||
        p.status.includes("Completed") ||
        p.status.includes("scheduled") ||
        p.status.includes("Scheduled") ||
        p.status.includes("Already uploaded")
      )))
  ).length;
  
  const failed = allProgress.filter(
    (p) =>
      p && p.status && (
        p.status.includes("Failed") || 
        p.status.includes("Missing") ||
        p.status.includes("Invalid") ||
        p.status.includes("not found") ||
        p.status.includes("Cannot access") ||
        p.status.includes("error")
      )
  ).length;
  
  const pending = allProgress.filter(
    (p) =>
      p && p.status && (
        p.status === "Pending" || 
        p.status.includes("Uploading") ||
        p.status.includes("thumbnail") ||
        p.status.includes("Checking")
      )
  ).length;
  
  const processing = queue.filter((job) => job.status === "processing").length;
  const completedJobs = queue.filter((job) => job.status === "completed").length;
  const failedJobs = queue.filter((job) => job.status === "failed").length;
  const pendingJobs = queue.filter((job) => job.status === "pending").length;

  const progressPercentage =
    totalVideos > 0
      ? Math.round((completed / totalVideos) * 100) 
      : completedJobs > 0 && queue.length === completedJobs
      ? 100
      : 0;
  
  const remaining = totalVideos > 0 ? totalVideos - completed - failed : 0;

  if (queue.length === 0) return null;

  return (
    <>
      {/* Next Upload Timer - Enhanced Countdown */}
      {nextUploadTime && timeUntilNext && (
        <div className="mb-8 p-6 bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 rounded-2xl shadow-xl text-white relative overflow-hidden animate-fade-in">
          <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-5">
                <div className="text-5xl animate-pulse-slow">⏰</div>
                <div>
                  <div className="text-sm opacity-90 mb-1 font-medium uppercase tracking-wide">
                    Next Upload Batch
                  </div>
                  <div className="text-4xl font-bold mb-2 font-mono tracking-tight">
                    {timeUntilNext}
                  </div>
                  <div className="text-sm opacity-90 mt-1">
                    {nextUploadTime.toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="text-xs opacity-75 mt-2 flex items-center gap-2">
                    <span>🔄</span>
                    <span>Uploads run every 24 hours</span>
                  </div>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <div className="text-5xl animate-pulse-slow opacity-80">⏳</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Dashboard */}
      <div className="card border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">
            📊 Upload Statistics
          </h2>
          <div
            className={`px-4 py-2 rounded-full text-sm font-semibold ${
              processing > 0
                ? "bg-yellow-100 text-yellow-800"
                : "bg-green-100 text-green-800"
            }`}
          >
            {processing > 0 ? "⚡ Processing" : "✓ Ready"}
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wide">
              Overall Progress
            </span>
            <span className="font-bold text-gray-800 dark:text-white text-lg">
              {progressPercentage}%
            </span>
          </div>
          <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative shadow-inner">
            <div 
              className={`h-full rounded-full transition-all duration-500 ease-out flex items-center justify-center text-white font-bold text-xs shadow-lg ${
                progressPercentage === 100 
                    ? "bg-gradient-to-r from-green-500 to-emerald-600"
                    : "bg-gradient-to-r from-red-600 via-red-500 to-pink-600"
              }`}
              style={{ width: `${progressPercentage}%` }}
            >
              {progressPercentage > 15 &&
                progressPercentage < 100 &&
                `${progressPercentage}%`}
              {progressPercentage === 100 && "✓ Complete"}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <div className="stat-card group hover:scale-105 transition-transform duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                Total Videos
              </div>
              <div className="text-2xl">📹</div>
            </div>
            <div className="text-4xl font-bold text-gray-800 dark:text-white mb-1">
              {totalVideos}
            </div>
          </div>
          <div className="stat-card bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800 group hover:scale-105 transition-transform duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                Completed
              </div>
              <div className="text-2xl">✅</div>
            </div>
            <div className="text-4xl font-bold text-green-700 dark:text-green-300 mb-1">
              {completed}
            </div>
            {totalVideos > 0 && (
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                {Math.round((completed / totalVideos) * 100)}% complete
              </div>
            )}
          </div>
          <div className="stat-card bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-yellow-200 dark:border-yellow-800 group hover:scale-105 transition-transform duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-yellow-700 dark:text-yellow-300 uppercase tracking-wide">
                Processing
              </div>
              <div className="text-2xl animate-pulse-slow">⚡</div>
            </div>
            <div className="text-4xl font-bold text-yellow-700 dark:text-yellow-300 mb-1">
              {pending}
            </div>
            {totalVideos > 0 && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                {Math.round((pending / totalVideos) * 100)}% complete
              </div>
            )}
          </div>
          <div className="stat-card bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border-red-200 dark:border-red-800 group hover:scale-105 transition-transform duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">
                Failed
              </div>
              <div className="text-2xl">❌</div>
            </div>
            <div className="text-4xl font-bold text-red-700 dark:text-red-300 mb-1">
              {failed}
            </div>
            {totalVideos > 0 && (
              <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                {Math.round((failed / totalVideos) * 100)}% complete
              </div>
            )}
          </div>
        </div>

        {/* Job Status Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-5 bg-gray-50 rounded-xl">
          <div className="text-center">
            <div className="text-3xl font-bold text-indigo-600">
              {queue.length}
            </div>
            <div className="text-sm text-gray-600 mt-1">Total Jobs</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-teal-600">
              {completedJobs}
            </div>
            <div className="text-sm text-gray-600 mt-1">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-500">
              {processing}
            </div>
            <div className="text-sm text-gray-600 mt-1">Processing</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-500">
              {pendingJobs}
            </div>
            <div className="text-sm text-gray-600 mt-1">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-pink-500">
              {failedJobs}
            </div>
            <div className="text-sm text-gray-600 mt-1">Failed</div>
          </div>
        </div>

        {/* Remaining Videos */}
        {remaining > 0 && (
          <div
            className={`mt-6 p-4 rounded-lg text-center ${
              remaining > 0
                ? "bg-yellow-50 border border-yellow-300"
                : "bg-green-50 border border-green-300"
            }`}
          >
            <div
              className={`text-lg font-semibold mb-1 ${
                remaining > 0 ? "text-yellow-800" : "text-green-800"
              }`}
            >
              {remaining > 0
                ? `${remaining} videos remaining`
                : "All videos processed!"}
            </div>
            {remaining > 0 && (
              <div className="text-sm text-yellow-700">
                Processing videos...
              </div>
            )}
          </div>
        )}

        {totalVideos === 0 && queue.length > 0 && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <div className="text-sm text-blue-900">
              Jobs are queued. Statistics will appear once processing begins.
            </div>
          </div>
        )}
      </div>
    </>
  );
}


