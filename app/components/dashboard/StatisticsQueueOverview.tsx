"use client";

import { Button } from "@/components/ui/button";

type Props = {
  queueLength: number;
  nextUploadTime: Date | null;
  timeUntilNext: string;
  exportStats: (format: "json" | "csv") => Promise<void>;
  processing: number;
  progressPercentage: number;
  totalVideos: number;
  completed: number;
  pending: number;
  failed: number;
  completedJobs: number;
  pendingJobs: number;
  failedJobs: number;
  remaining: number;
};

export default function StatisticsQueueOverview(props: Props) {
  if (props.queueLength === 0) {
    return (
      <div className="card border border-gray-100 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
        No <strong className="text-foreground font-medium">bulk</strong> jobs in the queue right now. Per-job charts and batch timing below apply when you have active bulk uploads. Your <strong className="text-foreground font-medium">upload history</strong> above is separate (includes Python manifest uploads when recorded).
      </div>
    );
  }

  return (
    <>
      {props.nextUploadTime && props.timeUntilNext && (
        <div className="mb-8 p-6 bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 rounded-2xl shadow-xl text-white relative overflow-hidden animate-fade-in">
          <div className="absolute inset-0 bg-white/10 backdrop-blur-sm" />
          <div className="relative z-10">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-5">
                <div className="text-5xl animate-pulse-slow">⏰</div>
                <div>
                  <div className="text-sm opacity-90 mb-1 font-medium uppercase tracking-wide">Next Upload Batch</div>
                  <div className="text-4xl font-bold mb-2 font-mono tracking-tight">{props.timeUntilNext}</div>
                  <div className="text-sm opacity-90 mt-1">
                    {props.nextUploadTime.toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                  </div>
                  <div className="text-xs opacity-75 mt-2 flex items-center gap-2">
                    <span>🔄</span>
                    <span>Uploads run every 24 hours</span>
                  </div>
                </div>
              </div>
              <div className="text-right hidden sm:block"><div className="text-5xl animate-pulse-slow opacity-80">⏳</div></div>
            </div>
          </div>
        </div>
      )}
      <div className="card border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">📊 Upload Statistics</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" title="Export statistics as JSON" onClick={() => void props.exportStats("json")}>Export (JSON)</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => void props.exportStats("csv")}>Export (CSV)</Button>
            <div className={`px-4 py-2 rounded-full text-sm font-semibold ${props.processing > 0 ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>
              {props.processing > 0 ? "⚡ Processing" : "✓ Ready"}
            </div>
          </div>
        </div>
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wide">Overall Progress</span>
            <span className="font-bold text-gray-800 dark:text-white text-lg">{props.progressPercentage}%</span>
          </div>
          <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out flex items-center justify-center text-white font-bold text-xs shadow-lg ${
                props.progressPercentage === 100 ? "bg-gradient-to-r from-green-500 to-emerald-600" : "bg-gradient-to-r from-red-600 via-red-500 to-pink-600"
              }`}
              style={{ width: `${props.progressPercentage}%` }}
            >
              {props.progressPercentage > 15 && props.progressPercentage < 100 && `${props.progressPercentage}%`}
              {props.progressPercentage === 100 && "✓ Complete"}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-5 bg-gray-50 rounded-xl">
          <StatCell value={props.queueLength} label="Total Jobs" colorClass="text-indigo-600" />
          <StatCell value={props.completedJobs} label="Completed" colorClass="text-teal-600" />
          <StatCell value={props.processing} label="Processing" colorClass="text-red-500" />
          <StatCell value={props.pendingJobs} label="Pending" colorClass="text-yellow-500" />
          <StatCell value={props.failedJobs} label="Failed" colorClass="text-pink-500" />
        </div>
        {props.totalVideos > 0 ? (
          props.remaining > 0 ? (
            <div className="mt-6 p-4 rounded-lg text-center bg-yellow-50 border border-yellow-300">
              <div className="text-lg font-semibold mb-1 text-yellow-800">{props.remaining} videos remaining</div>
              <div className="text-sm text-yellow-700">Processing videos…</div>
            </div>
          ) : (
            <div className="mt-6 p-4 rounded-lg text-center bg-green-50 border border-green-300">
              <div className="text-lg font-semibold mb-1 text-green-800">All videos processed!</div>
            </div>
          )
        ) : (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <div className="text-sm text-blue-900">Jobs are queued. Statistics will appear once processing begins.</div>
          </div>
        )}
      </div>
    </>
  );
}

function StatCell({ value, label, colorClass }: { value: number; label: string; colorClass: string }) {
  return (
    <div className="text-center">
      <div className={`text-3xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
    </div>
  );
}
