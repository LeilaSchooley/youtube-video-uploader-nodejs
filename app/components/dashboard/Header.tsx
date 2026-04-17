"use client";

import { useDropboxAuth } from "@/app/components/dashboard/DropboxAuthContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const { hasDropboxAuth, dropboxAuthLoading, connectDropbox } =
    useDropboxAuth();

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
        <div className="flex flex-col gap-1 rounded-xl border-2 border-blue-100 dark:border-blue-800/60 px-3 py-2 bg-blue-50/90 dark:bg-blue-950/40 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-blue-900 dark:text-blue-100 whitespace-nowrap">
              Dropbox
            </span>
            {dropboxAuthLoading ? (
              <span className="text-xs text-muted-foreground">Checking…</span>
            ) : hasDropboxAuth === true ? (
              <span className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1 font-medium">
                <span aria-hidden>✓</span>
                Connected
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs px-3"
                onClick={() => void connectDropbox()}
              >
                Connect Dropbox
              </Button>
            )}
          </div>
          {!dropboxAuthLoading && hasDropboxAuth !== true && (
            <p className="text-[10px] leading-snug text-blue-900/70 dark:text-blue-100/70 max-w-[240px]">
              Connect while signed in with Google — saved on this app server for
              your account (survives logout). New device: same server + same
              Google account restores automatically when keys match.
            </p>
          )}
        </div>
        {/* Channel Selector */}
        {availableChannels.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
              Channel:
            </span>
            <Select
              value={selectedChannel}
              onValueChange={handleChannelChange}
            >
              <SelectTrigger className="min-w-[200px] w-[220px] rounded-xl border-2 shadow-sm">
                <SelectValue placeholder="Select channel" />
              </SelectTrigger>
              <SelectContent>
                {availableChannels.map((channel) => (
                  <SelectItem key={channel.userId} value={channel.userId}>
                    {channel.displayName} ({channel.fileCount} files)
                    {channel.isCurrent ? " ✓" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex gap-3 flex-wrap">
          {process.env.NODE_ENV === "development" && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className="rounded-xl bg-purple-600 text-white hover:bg-purple-700"
              title="Toggle Debug Panel"
            >
              🐛 Debug
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={toggleDarkMode}
            className="rounded-xl border-2 shadow-sm"
            aria-label="Toggle dark mode"
          >
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </Button>
          <Button type="button" asChild className="rounded-xl">
            <a href="/api/auth/logout">Logout</a>
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDeleteAccount}
            className="rounded-xl"
          >
            Delete Account
          </Button>
        </div>
      </div>
    </div>
  );
}
