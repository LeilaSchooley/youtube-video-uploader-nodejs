"use client";

export default function UploadFormsBulkDriveCsvSection() {
  return (
    <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl">📄</span>
        <div className="flex-1">
          <strong className="text-orange-900 dark:text-orange-100 block mb-1">CSV File for Metadata (Optional)</strong>
          <p className="text-sm text-orange-800 dark:text-orange-200 mb-3">Optionally provide a CSV file with video metadata. The CSV should have columns like youtube_title, youtube_description, video_url, drive_file_id, etc.</p>
          <div>
            <label htmlFor="driveCsvFile" className="label text-sm">📄 CSV File</label>
            <input type="file" id="driveCsvFile" name="driveCsvFile" accept=".csv,.xlsx,.xls" className="input-field" />
          </div>
        </div>
      </div>
    </div>
  );
}
