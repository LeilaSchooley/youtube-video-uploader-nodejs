"use client";

interface QueueManagementToolbarProps {
  hasJobs: boolean;
  onDeleteAll: () => void | Promise<void>;
}

export default function QueueManagementToolbar({
  hasJobs,
  onDeleteAll,
}: QueueManagementToolbarProps) {
  if (!hasJobs) return null;

  return (
    <div className="mb-4 flex justify-end">
      <button
        type="button"
        onClick={() => void onDeleteAll()}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
      >
        <span>🗑️</span>
        <span>Delete All Jobs</span>
      </button>
    </div>
  );
}
