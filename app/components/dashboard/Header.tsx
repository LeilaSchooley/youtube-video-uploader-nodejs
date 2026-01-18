"use client";

import { User } from "./types";

interface HeaderProps {
  user: User | null;
  darkMode: boolean;
  toggleDarkMode: () => void;
  showDebugPanel: boolean;
  setShowDebugPanel: (show: boolean) => void;
  availableChannels: Array<{
    userId: string;
    displayName: string;
    fileCount: number;
    jobCount: number;
    isCurrent: boolean;
  }>;
  selectedChannel: string;
  handleChannelChange: (channelId: string) => void;
  handleDeleteAccount: () => void;
}

export default function Header({
  user,
  darkMode,
  toggleDarkMode,
  showDebugPanel,
  setShowDebugPanel,
  availableChannels,
  selectedChannel,
  handleChannelChange,
  handleDeleteAccount,
}: HeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10 pb-6 border-b border-gray-200 dark:border-gray-700">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent mb-2">
          ZonDiscounts Uploader
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage your YouTube video uploads
        </p>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        {/* Profile Section in Header */}
        {user && (
          <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-red-50 via-pink-50 to-red-50 dark:from-red-900/20 dark:via-pink-900/20 dark:to-red-900/20 rounded-xl border-2 border-red-100 dark:border-red-800/50 shadow-sm hover:shadow-md transition-shadow">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl"></div>
              <img
                src={user.picture}
                alt={user.name}
                className="w-10 h-10 rounded-full object-cover border-2 border-red-600 dark:border-red-400 shadow-lg relative z-10"
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-white">
                {user.name}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <span className="text-green-500">✓</span>
                <span>Connected</span>
              </p>
            </div>
          </div>
        )}
        {/* Channel Selector */}
        {availableChannels.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 dark:text-gray-400 font-medium">
              Channel:
            </label>
            <select
              value={selectedChannel}
              onChange={(e) => handleChannelChange(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-all duration-200 shadow-sm hover:shadow-md text-sm min-w-[200px]"
            >
              {availableChannels.map((channel) => (
                <option key={channel.userId} value={channel.userId}>
                  {channel.displayName} ({channel.fileCount} files)
                  {channel.isCurrent ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
            title="Toggle Debug Panel"
          >
            🐛 Debug
          </button>
          <button
            onClick={toggleDarkMode}
            className="px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
            aria-label="Toggle dark mode"
          >
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
          <a href="/api/auth/logout" className="btn-primary">
            Logout
          </a>
          <button
            onClick={handleDeleteAccount}
            className="btn-secondary bg-red-600 hover:bg-red-700"
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}


