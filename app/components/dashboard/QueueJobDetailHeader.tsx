"use client";

import type { BulkJob } from "./types";

type Props = {
  selectedJob: BulkJob;
  setSelectedJobId: (jobId: string | null) => void;
  fetchJobStatus: (jobId: string) => Promise<void>;
  fetchQueue: () => Promise<void>;
  requestConfirm: (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "default";
  }) => Promise<boolean>;
  showAppToast: (opts: { message: string; type?: "success" | "error" | "info" }) => void;
};

export default function QueueJobDetailHeader({
  selectedJob,
  setSelectedJobId,
  fetchJobStatus,
  fetchQueue,
  requestConfirm,
  showAppToast,
}: Props) {
  return (
    <div className="flex justify-between items-start mb-6">
      <div className="flex-1">
        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">📋 Job Progress</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">{selectedJob.id}</p>
        {selectedJob.notes && (
          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded text-sm text-blue-800 dark:text-blue-200">
            <strong>📝 Notes:</strong> {selectedJob.notes}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            const notes = prompt("Add notes for this job:", selectedJob.notes || "");
            if (notes === null) return;
            try {
              const res = await fetch("/api/queue-notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ jobId: selectedJob.id, notes }),
              });
              const data = await res.json();
              if (!res.ok) {
                showAppToast({ message: data.error || "Failed to update notes", type: "error" });
                return;
              }
              showAppToast({ message: "Notes updated", type: "success" });
              fetchJobStatus(selectedJob.id);
            } catch {
              showAppToast({ message: "An error occurred", type: "error" });
            }
          }}
          className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
          title="Add/edit notes"
        >
          📝 Notes
        </button>
        <button
          onClick={async () => {
            const ok = await requestConfirm({
              title: "Copy job",
              message: "Copy this job? This will create a duplicate with the same settings.",
              confirmLabel: "Copy",
            });
            if (!ok) return;
            try {
              const res = await fetch("/api/queue-copy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ jobId: selectedJob.id }),
              });
              const data = await res.json();
              if (!res.ok) {
                showAppToast({ message: data.error || "Failed to copy job", type: "error" });
                return;
              }
              showAppToast({ message: `Job copied! New job ID: ${data.jobId}`, type: "success" });
              fetchQueue();
              setSelectedJobId(data.jobId);
              fetchJobStatus(data.jobId);
            } catch {
              showAppToast({ message: "An error occurred", type: "error" });
            }
          }}
          className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded-lg transition-colors"
          title="Copy this job"
        >
          📋 Copy
        </button>
        <button
          onClick={() => {
            const url = `/api/export-job?jobId=${encodeURIComponent(selectedJob.id)}&format=csv`;
            window.open(url, "_blank");
            showAppToast({ message: "Export started", type: "info" });
          }}
          className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg transition-colors"
          title="Export job report (CSV)"
        >
          📥 Export
        </button>
        <button
          onClick={() => setSelectedJobId(null)}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl font-bold transition-colors"
        >
          ×
        </button>
      </div>
    </div>
  );
}
