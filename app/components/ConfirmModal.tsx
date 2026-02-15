"use client";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const isDanger = variant === "danger";
  const confirmClass = isDanger
    ? "bg-red-600 hover:bg-red-700 text-white"
    : "bg-indigo-600 hover:bg-indigo-700 text-white";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <h2
          id="confirm-modal-title"
          className="text-lg font-bold text-gray-800 dark:text-white mb-2"
        >
          {title}
        </h2>
        <p
          id="confirm-modal-desc"
          className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line mb-6"
        >
          {message}
        </p>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg font-medium bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg font-medium ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
