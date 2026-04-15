"use client";

export default function BrowserLoadingSkeleton({
  rows = 6,
}: {
  rows?: number;
}) {
  return (
    <div
      className="space-y-3 py-4"
      aria-busy="true"
      aria-label="Loading list"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-lg bg-muted"
        />
      ))}
    </div>
  );
}
