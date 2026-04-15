"use client";

import { HIDE_GOOGLE_DRIVE_SHEETS } from "./upload-forms-constants";
import type { UploadFormsBulkSectionProps } from "./upload-forms-bulk-types";

type Props = Pick<
  UploadFormsBulkSectionProps,
  | "uploadSource"
  | "checkDuplicatesBeforeUpload"
  | "setCheckDuplicatesBeforeUpload"
  | "bulkUploading"
  | "selectedBulkFiles"
  | "bulkUrls"
>;

export default function UploadFormsBulkQueueFooter(props: Props) {
  const {
    uploadSource,
    checkDuplicatesBeforeUpload,
    setCheckDuplicatesBeforeUpload,
    bulkUploading,
    selectedBulkFiles,
    bulkUrls,
  } = props;

  return (
    <>
      {(uploadSource === "drive" ||
  uploadSource === "dropbox" ||
  HIDE_GOOGLE_DRIVE_SHEETS) && (
  <>
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checkDuplicatesBeforeUpload}
        onChange={(e) =>
          setCheckDuplicatesBeforeUpload(e.target.checked)
        }
        className="w-4 h-4 text-indigo-600 rounded border-gray-300 dark:border-gray-600"
      />
      <span className="text-sm text-gray-700 dark:text-gray-300">
        Check for duplicates before adding (warn if titles already
        uploaded)
      </span>
    </label>
    <button
      type="submit"
      disabled={
        bulkUploading ||
        (selectedBulkFiles.length === 0 && bulkUrls.length === 0)
      }
      className={`btn-primary ${
        bulkUploading ||
        (selectedBulkFiles.length === 0 && bulkUrls.length === 0)
          ? "opacity-50 cursor-not-allowed"
          : ""
      }`}
    >
      {bulkUploading ? (
      <span className="flex items-center gap-2">
        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        Queuing...
      </span>
    ) : selectedBulkFiles.length === 0 &&
      bulkUrls.length === 0 ? (
      "Please select files or enter URLs"
    ) : (
      `Queue ${selectedBulkFiles.length + bulkUrls.length} Video(s) for Upload`
    )}
    </button>
  </>
      )}
    </>
  );
}
