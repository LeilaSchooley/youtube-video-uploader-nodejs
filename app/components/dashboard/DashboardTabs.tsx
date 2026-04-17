"use client";

import type { ReactNode } from "react";
import { BarChart3, ListOrdered, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface DashboardTabsProps {
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  queueTabBadge: number;
  uploadContent: ReactNode;
  /** Queue activity, worker status, and upload history / statistics (merged). */
  queueContent: ReactNode;
}

export default function DashboardTabs({
  activeTab,
  onActiveTabChange,
  queueTabBadge,
  uploadContent,
  queueContent,
}: DashboardTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onActiveTabChange} className="w-full">
      <TabsList className="sticky top-0 z-20 mb-2 flex h-auto min-h-11 w-full flex-wrap justify-start gap-1 border-b border-border/80 bg-background/95 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <TabsTrigger value="upload" className="gap-2">
          <Upload className="h-4 w-4 shrink-0" />
          Upload Videos
        </TabsTrigger>
        <TabsTrigger value="queue" className="gap-2">
          <span className="flex items-center gap-1 shrink-0" aria-hidden>
            <ListOrdered className="h-4 w-4" />
            <BarChart3 className="h-4 w-4" />
          </span>
          Queue &amp; statistics
          {queueTabBadge > 0 && (
            <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              {queueTabBadge}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="upload"
        className="mt-0 min-h-0 max-w-full space-y-6 overflow-x-hidden"
      >
        {uploadContent}
      </TabsContent>

      <TabsContent value="queue" className="mt-0 space-y-6">
        {queueContent}
      </TabsContent>
    </Tabs>
  );
}
