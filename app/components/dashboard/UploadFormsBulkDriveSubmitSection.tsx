"use client";

import type { AppToastPayload } from "@/app/app-toast-context";

type Props = {
  drivePythonQueueMode: boolean;
  clearDrivePythonQueueMode: () => Promise<void>;
  showAppToast: (opts: AppToastPayload) => void;
  driveUploadFolderId: string;
  hasGoogleDriveAuth: boolean | null;
  driveUploading: boolean;
  setDriveUploading: (v: boolean) => void;
  schedulingEnabled?: boolean;
  globalVideosPerDay?: string;
  selectedDriveCsvFileId: string;
  selectedDriveCsvFileName: string;
  selectedDriveSheetName: string;
  driveThumbnailsFolderId: string;
  skipDuplicateTitles: boolean;
  driveSpreadsheetUrl: string;
  selectedDriveFolderIdForSheets: string;
  setSelectedJobId?: (jobId: string | null) => void;
  fetchJobStatus?: (jobId: string) => Promise<void>;
  fetchQueue?: () => Promise<void>;
};

export default function UploadFormsBulkDriveSubmitSection(props: Props) {
  if (props.drivePythonQueueMode) {
    return (
      <div className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 space-y-3">
        <p className="text-sm text-gray-800 dark:text-gray-200">
          Standard &quot;Upload from Drive folder&quot; is hidden while a Python bot
          Drive queue is configured. The worker consumes{" "}
          <code className="text-xs">manifests/*.json</code> from your Drive folder.
        </p>
        <button
          type="button"
          onClick={() => {
            void props.clearDrivePythonQueueMode();
            props.showAppToast({
              message:
                "Switched to standard Drive bulk. Pick a folder again to queue videos.",
              type: "info",
            });
          }}
          className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Use standard Drive bulk instead
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={
          !props.driveUploadFolderId ||
          props.hasGoogleDriveAuth !== true ||
          props.driveUploading
        }
        onClick={async () => {
          const folderId = props.driveUploadFolderId?.trim();
          if (!folderId || props.driveUploading) return;
          props.setDriveUploading(true);
          try {
            const scheduleVpd =
              props.schedulingEnabled && props.globalVideosPerDay?.trim()
                ? parseInt(props.globalVideosPerDay.trim(), 10)
                : undefined;
            const response = await fetch("/api/upload-drive", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                driveFolderId: folderId,
                recursive:
                  (
                    document.getElementById(
                      "driveRecursive",
                    ) as HTMLInputElement
                  )?.checked || false,
                postUploadAction:
                  (
                    document.getElementById(
                      "drivePostAction",
                    ) as HTMLSelectElement
                  )?.value || "none",
                completedFolderId:
                  (
                    document.getElementById(
                      "driveCompletedFolder",
                    ) as HTMLInputElement
                  )?.value?.trim() || undefined,
                privacyStatus:
                  (
                    document.getElementById(
                      "drivePrivacy",
                    ) as HTMLSelectElement
                  )?.value || "public",
                driveCsvFileId: props.selectedDriveCsvFileId || undefined,
                driveCsvFileName: props.selectedDriveCsvFileName || undefined,
                driveSheetName: props.selectedDriveSheetName || undefined,
                driveThumbnailsFolderId:
                  props.driveThumbnailsFolderId || undefined,
                videosPerDay:
                  scheduleVpd && scheduleVpd > 0 ? scheduleVpd : undefined,
                skipDuplicateTitles: props.skipDuplicateTitles,
              }),
            });
            const data = await response.json();
            if (response.ok) {
              props.showAppToast({
                message: `Queued ${data.totalItems} video(s) from Drive`,
                type: "success",
              });
              if (data.jobId && props.setSelectedJobId) {
                props.setSelectedJobId(data.jobId);
                void props.fetchJobStatus?.(data.jobId);
                void props.fetchQueue?.();
              }
            } else {
              props.showAppToast({
                message: data.error || "Drive upload failed",
                type: "error",
              });
            }
          } catch (e: unknown) {
            props.showAppToast({
              message: e instanceof Error ? e.message : "Drive upload failed",
              type: "error",
            });
          } finally {
            props.setDriveUploading(false);
          }
        }}
        className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg disabled:opacity-50"
      >
        {props.driveUploading ? "Queueing…" : "Upload from Drive folder"}
      </button>

      <button
        type="button"
        disabled={
          !props.driveSpreadsheetUrl?.trim() ||
          props.hasGoogleDriveAuth !== true ||
          props.driveUploading
        }
        onClick={async () => {
          const url = props.driveSpreadsheetUrl.trim();
          if (!url || props.driveUploading) return;
          props.setDriveUploading(true);
          try {
            const sheetName =
              (
                document.getElementById(
                  "driveSheetNameSelect",
                ) as HTMLSelectElement
              )?.value?.trim() || undefined;
            const scheduleVpd =
              props.schedulingEnabled && props.globalVideosPerDay?.trim()
                ? parseInt(props.globalVideosPerDay.trim(), 10)
                : undefined;
            const response = await fetch("/api/upload-sheets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                spreadsheetUrl: url,
                sheetName,
                driveFolderId:
                  props.selectedDriveFolderIdForSheets ||
                  props.driveUploadFolderId ||
                  undefined,
                videosPerDay:
                  scheduleVpd && scheduleVpd > 0 ? scheduleVpd : undefined,
              }),
            });
            const data = await response.json();
            if (response.ok) {
              props.showAppToast({
                message: `Queued ${data.totalItems ?? data.queued ?? "?"} row(s) from Google Sheet`,
                type: "success",
              });
              if (data.jobId && props.setSelectedJobId) {
                props.setSelectedJobId(data.jobId);
                void props.fetchJobStatus?.(data.jobId);
                void props.fetchQueue?.();
              }
            } else {
              props.showAppToast({
                message: data.error || "Sheet upload failed",
                type: "error",
              });
            }
          } catch (e: unknown) {
            props.showAppToast({
              message: e instanceof Error ? e.message : "Sheet upload failed",
              type: "error",
            });
          } finally {
            props.setDriveUploading(false);
          }
        }}
        className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg disabled:opacity-50 text-sm"
      >
        Queue from Google Sheet URL
      </button>
    </div>
  );
}
