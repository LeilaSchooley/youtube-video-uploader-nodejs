"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface UploadScheduleSettingsProps {
  enabled: boolean;
  videosPerDay: string;
  onEnabledChange: (enabled: boolean) => void;
  onVideosPerDayChange: (value: string) => void;
  /** True after first client read of localStorage */
  hydrated: boolean;
  /** Shown briefly after each auto-save */
  justSaved?: boolean;
}

export default function UploadScheduleSettings({
  enabled,
  videosPerDay,
  onEnabledChange,
  onVideosPerDayChange,
  hydrated,
  justSaved,
}: UploadScheduleSettingsProps) {
  if (!hydrated) {
    return (
      <div className="mb-6 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 text-sm text-gray-500 dark:text-gray-400 animate-pulse">
        Loading upload schedule…
      </div>
    );
  }

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/80 dark:border-blue-800 dark:bg-blue-950/30">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            📅
          </span>
          <div>
            <h3 className="text-lg font-bold text-foreground">
              Upload scheduling (optional)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Global default for uploads that support a daily cap (e.g. Dropbox
              folder queue). Saved automatically in this browser.
            </p>
          </div>
        </div>
        {justSaved && (
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 shrink-0">
            Saved
          </span>
        )}
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
      <div className="flex items-center gap-3">
        <Switch
          id="global-upload-schedule-enabled"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
        <Label
          htmlFor="global-upload-schedule-enabled"
          className="cursor-pointer text-sm font-normal text-foreground"
        >
          Limit uploads per calendar day (UTC)
        </Label>
      </div>

      <div className={enabled ? "" : "opacity-50 pointer-events-none"}>
        <Label htmlFor="globalVideosPerDay" className="text-sm">
          Videos per day
        </Label>
        <Input
          type="number"
          id="globalVideosPerDay"
          name="globalVideosPerDay"
          min="0"
          disabled={!enabled}
          placeholder="0 = upload all immediately"
          value={videosPerDay}
          onChange={(e) => onVideosPerDayChange(e.target.value)}
          className="max-w-xs text-sm"
        />
        <p className="text-xs text-muted-foreground mt-1">
          When enabled, the worker spreads uploads across days (see bulk job
          docs). Per-row{" "}
          <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded text-[11px]">
            publishAt
          </code>{" "}
          in sheets/CSV still overrides when present.
        </p>
      </div>
      </CardContent>
    </Card>
  );
}
