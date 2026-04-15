"use client";

interface QueueManagementEmptyStateProps {
  onGoToUpload?: () => void;
}

export default function QueueManagementEmptyState({
  onGoToUpload,
}: QueueManagementEmptyStateProps) {
  return (
    <div className="card text-center py-12">
      <div className="text-5xl mb-4 opacity-80">📭</div>
      <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
        No jobs yet
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-sm mx-auto">
        Add your first upload from the Upload tab. Your queue and progress will
        appear here.
      </p>
      {onGoToUpload && (
        <button
          type="button"
          onClick={onGoToUpload}
          className="btn-primary inline-flex items-center gap-2"
        >
          <span>📤</span>
          <span>Go to Upload</span>
        </button>
      )}
    </div>
  );
}
