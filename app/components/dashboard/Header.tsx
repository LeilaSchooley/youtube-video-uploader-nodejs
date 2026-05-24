"use client";

import { useEffect, useState } from "react";
import { useDropboxAuth } from "@/app/components/dashboard/DropboxAuthContext";
import { useGoogleDriveAuth } from "@/app/components/dashboard/GoogleDriveAuthContext";
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
  const { hasDropboxAuth, dropboxAuthLoading, connectDropbox, disconnectDropbox } =
    useDropboxAuth();
  const {
    hasGoogleDriveAuth,
    driveAuthLoading,
    connectGoogleDrive,
    disconnectGoogleDrive,
  } = useGoogleDriveAuth();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const displayName = user?.name?.trim() || "Account";
  const pictureUrl = user?.picture?.trim() || "";
  const fallbackInitial = displayName.charAt(0).toUpperCase() || "A";
  const showFallbackAvatar = !pictureUrl || avatarLoadFailed;
  const selectedChannelInfo = availableChannels.find(
    (channel) => channel.userId === selectedChannel,
  );
  const selectedChannelName = selectedChannelInfo?.displayName?.trim() || null;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [pictureUrl]);

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
              {pictureUrl && !avatarLoadFailed ? (
                // eslint-disable-next-line @next/next/no-img-element -- Google profile URL; dynamic remote
                <img
                  src={pictureUrl}
                  alt={displayName}
                  onError={() => setAvatarLoadFailed(true)}
                  className="w-10 h-10 rounded-full object-cover border-2 border-red-600 dark:border-red-400 shadow-lg relative z-10"
                />
              ) : null}
              <span
                className={`w-10 h-10 rounded-full border-2 border-red-600 dark:border-red-400 shadow-lg relative z-10 inline-flex items-center justify-center text-sm font-bold text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-900/60 ${showFallbackAvatar ? "" : "hidden"}`}
                aria-hidden={showFallbackAvatar ? "false" : "true"}
              >
                {fallbackInitial}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-white">
                {displayName}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <span className="text-green-500">✓</span>
                <span>Connected</span>
              </p>
              {selectedChannelName ? (
                <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                  Channel: <span className="font-medium">{selectedChannelName}</span>
                </p>
              ) : null}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2 rounded-xl border-2 border-slate-200 dark:border-slate-700 px-3 py-2.5 bg-slate-50/90 dark:bg-slate-900/50 shadow-sm max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Cloud storage
          </p>
          <p className="text-[10px] leading-snug text-slate-600 dark:text-slate-400">
            Connect one or both — bulk upload, Python bot queues, and Google
            Sheets metadata. Tokens stay on this server with your Google sign-in
            (survives logout).
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 rounded-lg border border-blue-200/80 dark:border-blue-800/60 px-2.5 py-2 bg-blue-50/80 dark:bg-blue-950/30">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                  📦 Dropbox
                </span>
                {dropboxAuthLoading ? (
                  <span className="text-xs text-muted-foreground">Checking…</span>
                ) : hasDropboxAuth === true ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                      ✓ Connected
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-md text-[11px] px-2"
                      onClick={() => void disconnectDropbox()}
                    >
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-[11px] px-2.5"
                    onClick={() => void connectDropbox()}
                  >
                    Connect
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 px-2.5 py-2 bg-emerald-50/80 dark:bg-emerald-950/30">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                  📁 Google Drive
                </span>
                {driveAuthLoading ? (
                  <span className="text-xs text-muted-foreground">Checking…</span>
                ) : hasGoogleDriveAuth === true ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                      ✓ Connected
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-md text-[11px] px-2"
                      onClick={() => void disconnectGoogleDrive()}
                    >
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] px-2.5"
                    onClick={() => void connectGoogleDrive()}
                  >
                    Connect
                  </Button>
                )}
              </div>
              {!driveAuthLoading && hasGoogleDriveAuth !== true && (
                <p className="text-[10px] leading-snug text-emerald-900/70 dark:text-emerald-100/70">
                  Separate OAuth project from YouTube (Drive + Sheets scopes).
                </p>
              )}
            </div>
          </div>
          {!dropboxAuthLoading &&
            !driveAuthLoading &&
            hasDropboxAuth !== true &&
            hasGoogleDriveAuth !== true && (
              <p className="text-[10px] leading-snug text-amber-800 dark:text-amber-200/90 border-t border-slate-200 dark:border-slate-700 pt-2">
                Pick at least one provider above. Use Dropbox for legacy paths;
                Drive for Sheets and the second OAuth app.
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
