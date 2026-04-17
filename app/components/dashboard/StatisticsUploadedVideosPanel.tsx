"use client";

import { Button } from "@/components/ui/button";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ConfirmFn, UploadedVideoRecord } from "./statistics-types";

type Props = {
  uploadedVideos: UploadedVideoRecord[] | null;
  loadingUploadedVideos: boolean;
  syncingFromQueue: boolean;
  uploadedVideosError: string | null;
  uploadsByDay: Array<{ label: string; date: string; uploads: number }>;
  requestConfirm?: ConfirmFn;
  loadUploadedVideos: (backfill?: boolean) => Promise<void>;
  syncFromQueue: () => Promise<void>;
  downloadUploadedVideosCsv: () => Promise<void>;
  clearUploadHistory: () => Promise<void>;
};

export default function StatisticsUploadedVideosPanel({
  uploadedVideos,
  loadingUploadedVideos,
  syncingFromQueue,
  uploadedVideosError,
  uploadsByDay,
  requestConfirm,
  loadUploadedVideos,
  syncFromQueue,
  downloadUploadedVideosCsv,
  clearUploadHistory,
}: Props) {
  return (
    <>
      <div className="card border border-gray-100 dark:border-gray-700 mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">📋 All uploaded videos</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void loadUploadedVideos(false)} disabled={loadingUploadedVideos} className="bg-indigo-600 text-white hover:bg-indigo-700">
              {loadingUploadedVideos ? "Loading…" : "Load list"}
            </Button>
            <Button
              type="button"
              onClick={() => void syncFromQueue()}
              disabled={syncingFromQueue}
              title="Add any completed videos from the queue that aren’t in the list yet"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {syncingFromQueue ? "Syncing…" : "Sync from queue"}
            </Button>
            {uploadedVideos?.length ? (
              <>
                <Button type="button" variant="secondary" onClick={() => void downloadUploadedVideosCsv()}>
                  Export CSV
                </Button>
                {requestConfirm && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={async () => {
                      const ok = await requestConfirm({
                        title: "Clear upload history",
                        message: "This will clear the local list of uploaded videos only. Videos on your YouTube channel are not affected. Export CSV first if you want to keep a copy.",
                        confirmLabel: "Clear list",
                        variant: "danger",
                      });
                      if (ok) await clearUploadHistory();
                    }}
                    className="bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200"
                  >
                    Clear upload history
                  </Button>
                )}
              </>
            ) : null}
          </div>
        </div>
        {uploadedVideosError && <p className="text-red-600 dark:text-red-400 text-sm mb-3">{uploadedVideosError}</p>}
        {uploadedVideos && (
          <div className="overflow-x-auto">
            {uploadedVideos.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No uploaded videos recorded yet.</p>
            ) : (
              <table className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                    <th className="p-2 font-semibold">Title</th>
                    <th className="p-2 font-semibold">Video ID</th>
                    <th className="p-2 font-semibold">Job ID</th>
                    <th className="p-2 font-semibold">Uploaded at</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadedVideos.map((v, i) => (
                    <tr key={`${v.videoId}-${i}`} className="border-t border-gray-200 dark:border-gray-600">
                      <td className="p-2 max-w-xs truncate" title={v.title}>{v.title}</td>
                      <td className="p-2 font-mono text-xs">
                        <a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                          {v.videoId}
                        </a>
                      </td>
                      <td className="p-2 font-mono text-xs text-gray-600 dark:text-gray-400">{v.jobId}</td>
                      <td className="p-2 text-gray-600 dark:text-gray-400">{new Date(v.uploadedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      {uploadedVideos?.length && uploadsByDay.length ? (
        <div className="card border border-gray-100 dark:border-gray-700 mb-8">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">Uploads per day (UTC, last 14 days)</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">Based on your saved upload history in this app.</p>
          <div className="h-56 w-full min-w-0 text-foreground">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={uploadsByDay} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/80" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  labelFormatter={(_, items) => (items?.[0]?.payload as { date?: string } | undefined)?.date ?? ""}
                  formatter={(value) => [`${value ?? 0}`, "Uploads"]}
                />
                <Bar dataKey="uploads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </>
  );
}
