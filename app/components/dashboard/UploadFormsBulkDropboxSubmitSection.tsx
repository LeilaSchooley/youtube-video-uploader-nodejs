"use client";

import type { AppToastPayload } from "@/app/app-toast-context";
import { DASHBOARD_STORAGE } from "@/lib/dashboard-storage-keys";

type Props = {
  dropboxPythonQueueMode: boolean;
  clearDropboxPythonQueueMode: () => Promise<void>;
  showAppToast: (opts: AppToastPayload) => void;
  dropboxUploadFolderPath: string;
  hasDropboxAuth: boolean | null;
  dropboxUploading: boolean;
  setDropboxUploading: (v: boolean) => void;
  schedulingEnabled?: boolean;
  globalVideosPerDay?: string;
  selectedDropboxCsvFile: string;
  selectedDropboxSheetName: string;
  dropboxThumbnailsFolderPath: string;
  checkDuplicatesBeforeUpload: boolean;
  setDropboxUploadFolderPath: (v: string) => void;
  setSelectedDropboxCsvFile: (v: string) => void;
  setSelectedDropboxSheetName: (v: string) => void;
  setDropboxThumbnailsFolderPath: (v: string) => void;
  setSelectedJobId?: (jobId: string | null) => void;
  fetchJobStatus?: (jobId: string) => Promise<void>;
  fetchQueue?: () => Promise<void>;
};

export default function UploadFormsBulkDropboxSubmitSection(props: Props) {
  if (props.dropboxPythonQueueMode) {
    return (
      <div className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 space-y-3">
        <p className="text-sm text-gray-800 dark:text-gray-200">Standard &quot;Upload from Dropbox&quot; is hidden while a Python bot Dropbox queue is configured. The worker consumes <code className="text-xs">manifests/*.json</code> from your Dropbox folder.</p>
        <button
          type="button"
          onClick={() => {
            void props.clearDropboxPythonQueueMode();
            props.showAppToast({ message: "Switched to standard Dropbox bulk. Pick a folder again to queue videos.", type: "info" });
          }}
          className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Use standard Dropbox bulk instead
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={async () => {
        const folderPath = (document.getElementById("dropboxFolderPath") as HTMLInputElement)?.value?.trim();
        if (!folderPath) {
          props.showAppToast({ message: "Please enter a Dropbox folder path", type: "error" });
          return;
        }
        if (props.dropboxUploading) return;
        props.setDropboxUploading(true);
        try {
          const scheduleVpd = props.schedulingEnabled && props.globalVideosPerDay?.trim() ? parseInt(props.globalVideosPerDay.trim(), 10) : undefined;
          if (props.schedulingEnabled && scheduleVpd !== undefined && (Number.isNaN(scheduleVpd) || scheduleVpd < 0)) {
            props.showAppToast({ message: "Videos per day must be a positive number", type: "error" });
            props.setDropboxUploading(false);
            return;
          }

          const response = await fetch("/api/upload-dropbox", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              dropboxFolderPath: folderPath,
              recursive: (document.getElementById("dropboxRecursive") as HTMLInputElement)?.checked || false,
              postUploadAction: (document.getElementById("dropboxPostAction") as HTMLSelectElement)?.value || "none",
              completedFolderPath: (document.getElementById("dropboxCompletedFolder") as HTMLInputElement)?.value?.trim() || undefined,
              privacyStatus: (document.getElementById("dropboxPrivacy") as HTMLSelectElement)?.value || "public",
              videosPerDay: props.schedulingEnabled && scheduleVpd && scheduleVpd > 0 ? scheduleVpd : undefined,
              dropboxCsvPath: props.selectedDropboxCsvFile || undefined,
              dropboxSheetName: props.selectedDropboxSheetName || undefined,
              dropboxThumbnailsFolderPath: props.dropboxThumbnailsFolderPath || undefined,
              useWorker: true,
              skipDuplicateTitles: props.checkDuplicatesBeforeUpload,
            }),
          });
          const data = await response.json();
          if (!response.ok) {
            props.showAppToast({ message: data.error || "Failed to queue Dropbox upload", type: "error" });
            return;
          }
          props.showAppToast({ message: `Upload queued: ${data.totalItems} videos from "${data.folderPath}"`, type: "success" });
          props.setDropboxUploadFolderPath("");
          props.setSelectedDropboxCsvFile("");
          props.setSelectedDropboxSheetName("");
          props.setDropboxThumbnailsFolderPath("");
          const dropboxFolderInput = document.getElementById("dropboxFolderPath") as HTMLInputElement | null;
          if (dropboxFolderInput) dropboxFolderInput.value = "";
          if (typeof window !== "undefined") {
            localStorage.removeItem(DASHBOARD_STORAGE.dropboxUploadFolderPath);
            localStorage.removeItem(DASHBOARD_STORAGE.selectedDropboxCsvFile);
            localStorage.removeItem(DASHBOARD_STORAGE.selectedDropboxSheetName);
            localStorage.removeItem(DASHBOARD_STORAGE.dropboxThumbnailsFolderPath);
          }
          if (data.jobId && props.setSelectedJobId) {
            props.setSelectedJobId(data.jobId);
            if (props.fetchJobStatus) void props.fetchJobStatus(data.jobId);
            if (props.fetchQueue) void props.fetchQueue();
          }
        } catch (error: any) {
          props.showAppToast({ message: `Error: ${error.message}`, type: "error" });
        } finally {
          props.setDropboxUploading(false);
        }
      }}
      disabled={!props.dropboxUploadFolderPath || props.hasDropboxAuth !== true || props.dropboxUploading}
      className={`btn-primary w-full ${props.dropboxUploading ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {props.dropboxUploading ? "Checking duplicates..." : "Upload from Dropbox"}
    </button>
  );
}
