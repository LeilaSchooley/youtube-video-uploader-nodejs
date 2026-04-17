"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  FileJson,
  ListOrdered,
  Terminal,
  Upload,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

export interface CommandPaletteProps {
  onGoUpload: () => void;
  /** Queue, progress, activity, and upload history / charts (single tab). */
  onGoQueue: () => void;
  onExportStatsJson: () => void | Promise<void>;
  onExportStatsCsv: () => void | Promise<void>;
  /** Dev-only: toggle debug panel */
  onToggleDebug?: () => void;
}

export default function CommandPalette({
  onGoUpload,
  onGoQueue,
  onExportStatsJson,
  onExportStatsCsv,
  onToggleDebug,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const run = (fn: () => void | Promise<void>) => {
    setOpen(false);
    void Promise.resolve(fn()).catch(() => {
      toast.error("Action failed");
    });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search actions…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => run(onGoUpload)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Go to Upload
          </CommandItem>
          <CommandItem
            onSelect={() => run(onGoQueue)}
            className="gap-2"
          >
            <ListOrdered className="h-4 w-4" />
            Go to Queue &amp; statistics
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Export">
          <CommandItem
            onSelect={() => run(onExportStatsJson)}
            className="gap-2"
          >
            <FileJson className="h-4 w-4" />
            Export statistics (JSON)
          </CommandItem>
          <CommandItem
            onSelect={() => run(onExportStatsCsv)}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export statistics (CSV)
          </CommandItem>
        </CommandGroup>
        {process.env.NODE_ENV === "development" && onToggleDebug && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Development">
              <CommandItem
                onSelect={() => run(onToggleDebug)}
                className="gap-2"
              >
                <Terminal className="h-4 w-4" />
                Toggle debug panel
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
