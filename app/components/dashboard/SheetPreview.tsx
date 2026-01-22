"use client";

interface SheetPreviewProps {
  previewData: {
    spreadsheetTitle: string;
    sheetName: string;
    totalRows: number;
    validRows: number;
    rowsWithVideoSource: number;
    rowsWithThumbnails: number;
    previewRows: Array<Record<string, string>>;
    columns: string[];
  };
  onClose: () => void;
}

export default function SheetPreview({ previewData, onClose }: SheetPreviewProps) {
  const {
    spreadsheetTitle,
    sheetName,
    totalRows,
    validRows,
    rowsWithVideoSource,
    rowsWithThumbnails,
    previewRows,
    columns,
  } = previewData;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-3xl">👁️</span>
            <div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
                Sheet Preview
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {spreadsheetTitle} • {sheetName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Stats */}
        <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Rows</div>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalRows}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-green-200 dark:border-green-700">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Valid Videos</div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">{validRows}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {validRows === totalRows ? "✅ All valid" : `⚠️ ${totalRows - validRows} missing title/description`}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-purple-200 dark:border-purple-700">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">With Video Source</div>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{rowsWithVideoSource}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {rowsWithVideoSource === totalRows ? "✅ All have source" : `⚠️ ${totalRows - rowsWithVideoSource} missing`}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-orange-200 dark:border-orange-700">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">With Thumbnails</div>
              <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{rowsWithThumbnails}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {rowsWithThumbnails > 0 ? `${rowsWithThumbnails} videos` : "None"}
              </div>
            </div>
          </div>
        </div>

        {/* Preview Table */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
              Preview (First {Math.min(10, previewRows.length)} rows)
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {validRows} videos will be uploaded from this sheet
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900">
                  <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Row
                  </th>
                  {columns.slice(0, 8).map((col) => (
                    <th
                      key={col}
                      className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300"
                    >
                      {col}
                    </th>
                  ))}
                  {columns.length > 8 && (
                    <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">
                      ... ({columns.length - 8} more)
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => {
                  const hasTitle = row.youtube_title || row.youtube_title;
                  const hasDescription = row.youtube_description || row.youtube_description;
                  const hasVideoSource = row.video_url || row.drive_file_id || row.path;
                  const isValid = hasTitle || hasDescription;

                  return (
                    <tr
                      key={idx}
                      className={`${
                        isValid
                          ? "bg-white dark:bg-gray-800"
                          : "bg-red-50 dark:bg-red-900/20"
                      } hover:bg-gray-50 dark:hover:bg-gray-700`}
                    >
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-mono text-gray-600 dark:text-gray-400">
                        {idx + 1}
                      </td>
                      {columns.slice(0, 8).map((col) => (
                        <td
                          key={col}
                          className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-800 dark:text-gray-200 max-w-xs truncate"
                          title={row[col] || ""}
                        >
                          {row[col] ? (
                            <span className="truncate block">{String(row[col]).substring(0, 50)}</span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </td>
                      ))}
                      {columns.length > 8 && (
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                          ...
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {previewRows.length < totalRows && (
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
              Showing first {previewRows.length} of {totalRows} rows
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <strong className="text-gray-800 dark:text-gray-200">{validRows}</strong> videos will be uploaded
            {rowsWithVideoSource < validRows && (
              <span className="text-orange-600 dark:text-orange-400 ml-2">
                ⚠️ {validRows - rowsWithVideoSource} missing video source
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
