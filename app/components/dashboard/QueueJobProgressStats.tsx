"use client";

type Props = {
  totalVideos: number;
  completed: number;
  processing: number;
  pending: number;
  failed: number;
  progressPercentage: number;
};

export default function QueueJobProgressStats({
  totalVideos,
  completed,
  processing,
  pending,
  failed,
  progressPercentage,
}: Props) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Overall Progress</span>
        <span className="text-lg font-bold text-gray-800 dark:text-white">{progressPercentage}%</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
        <div
          className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Videos" value={totalVideos} baseClass="text-gray-800 dark:text-white" />
        <StatCard
          label="✅ Completed"
          value={completed}
          cardClass="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700"
          baseClass="text-green-700 dark:text-green-300"
          labelClass="text-green-600 dark:text-green-400"
        />
        <StatCard
          label="⏳ Processing"
          value={processing + pending}
          cardClass="bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700"
          baseClass="text-yellow-700 dark:text-yellow-300"
          labelClass="text-yellow-600 dark:text-yellow-400"
        />
        <StatCard
          label="❌ Failed"
          value={failed}
          cardClass="bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700"
          baseClass="text-red-700 dark:text-red-300"
          labelClass="text-red-600 dark:text-red-400"
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  cardClass = "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700",
  baseClass = "text-gray-800 dark:text-white",
  labelClass = "text-gray-600 dark:text-gray-400",
}: {
  label: string;
  value: number;
  cardClass?: string;
  baseClass?: string;
  labelClass?: string;
}) {
  return (
    <div className={`text-center p-3 rounded-lg border ${cardClass}`}>
      <div className={`text-2xl font-bold ${baseClass}`}>{value}</div>
      <div className={`text-xs mt-1 ${labelClass}`}>{label}</div>
    </div>
  );
}
