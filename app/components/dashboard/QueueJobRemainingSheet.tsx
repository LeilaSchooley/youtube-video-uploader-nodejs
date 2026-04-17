"use client";

import type { RemainingRow } from "./queue-job-detail-helpers";

type Props = {
  rows: RemainingRow[];
  selectedJobId: string;
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
  showAppToast: (opts: { message: string; type?: "success" | "error" | "info" }) => void;
};

export default function QueueJobRemainingSheet({
  rows,
  selectedJobId,
  isCollapsed,
  setIsCollapsed,
  showAppToast,
}: Props) {
  if (rows.length === 0) return null;

  const handleDownloadPending = async () => {
    try {
      const res = await fetch(`/api/export-pending?jobId=${selectedJobId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showAppToast({ message: data.error || "Failed to download pending sheet", type: "error" });
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition");
      const match = disp && disp.match(/filename="?([^";]+)"?/);
      const name = match?.[1]?.trim() || `pending-videos-${selectedJobId}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      showAppToast({ message: "Pending sheet downloaded", type: "success" });
    } catch (e) {
      showAppToast({ message: e instanceof Error ? e.message : "Download failed", type: "error" });
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
        >
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            📋 Remaining videos to upload ({rows.length})
          </h4>
          <span className="text-gray-500 dark:text-gray-400 text-xs">{isCollapsed ? "▶" : "▼"}</span>
        </button>
        <button
          type="button"
          onClick={handleDownloadPending}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
        >
          Generate (download CSV)
        </button>
      </div>
      {!isCollapsed && (
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                <tr>
                  <th className="px-4 py-2 font-semibold w-12">#</th>
                  <th className="px-4 py-2 font-semibold">Title</th>
                  <th className="px-4 py-2 font-semibold w-36">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.index}
                    className="border-t border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="px-4 py-2 font-mono text-gray-600 dark:text-gray-400">{row.index + 1}</td>
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200 truncate max-w-xs" title={row.title}>
                      {row.title}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          row.status.includes("Uploading") || row.status.includes("Checking")
                            ? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200"
                            : "bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
