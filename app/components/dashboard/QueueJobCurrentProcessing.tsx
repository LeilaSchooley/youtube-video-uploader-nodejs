"use client";

import type { ProgressItem } from "./queue-job-detail-types";

type Props = {
  item: ProgressItem | null;
};

export default function QueueJobCurrentProcessing({ item }: Props) {
  if (!item) return null;
  const title = item.title || `Video ${item.index + 1}`;
  return (
    <div className="mb-6 p-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-lg text-white animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="text-3xl animate-pulse-slow">⚡</div>
        <div className="flex-1">
          <div className="font-bold text-lg mb-1">Currently Processing</div>
          <div className="text-sm opacity-90 font-medium mb-1">{title}</div>
          <div className="text-xs opacity-75">{item.status}</div>
        </div>
      </div>
    </div>
  );
}
