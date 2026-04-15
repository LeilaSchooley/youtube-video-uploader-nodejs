"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DuplicateModalState } from "@/app/dashboard/hooks/useBulkUpload";

export interface DuplicateTitlesDialogProps {
  duplicateModal: DuplicateModalState | null;
  onDismiss: () => void;
  onAddOnlyNew: () => void;
  onAddAllAnyway: () => void;
}

export default function DuplicateTitlesDialog({
  duplicateModal,
  onDismiss,
  onAddOnlyNew,
  onAddAllAnyway,
}: DuplicateTitlesDialogProps) {
  if (!duplicateModal) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden sm:max-w-lg">
        <DialogHeader className="p-5 pb-3 text-left border-b border-border">
          <DialogTitle>Some titles already uploaded</DialogTitle>
          <DialogDescription className="text-left space-y-2 pt-1">
            <span>
              {duplicateModal.duplicateTitles.length} of your items match titles
              in your uploaded list (by name). You can add them anyway or add
              only the new ones.
            </span>
            <span className="block text-xs text-muted-foreground">
              Matching is by title (case-insensitive) against your local uploaded
              list, not the YouTube API.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 py-3 overflow-y-auto flex-1 min-h-0 max-h-[40vh]">
          <ul className="text-sm text-foreground space-y-1">
            {duplicateModal.duplicateTitles.slice(0, 15).map((t, i) => (
              <li key={i} className="truncate" title={t}>
                • {t}
              </li>
            ))}
            {duplicateModal.duplicateTitles.length > 15 && (
              <li className="text-muted-foreground">
                … and {duplicateModal.duplicateTitles.length - 15} more
              </li>
            )}
          </ul>
        </div>
        <DialogFooter className="p-5 border-t border-border flex flex-row flex-wrap gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onDismiss}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={onAddOnlyNew}
          >
            Add only new
          </Button>
          <Button
            type="button"
            className="bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={onAddAllAnyway}
          >
            Add all anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
