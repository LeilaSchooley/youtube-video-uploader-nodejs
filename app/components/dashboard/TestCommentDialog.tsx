import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface TestCommentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (videoId: string, commentText: string) => Promise<void>;
  isLoading: boolean;
}

export function TestCommentDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: TestCommentDialogProps) {
  const [videoId, setVideoId] = useState("");
  const [commentText, setCommentText] = useState("");

  const handleSubmit = async () => {
    if (!videoId.trim() || !commentText.trim()) return;
    await onSubmit(videoId.trim(), commentText.trim());
    setVideoId("");
    setCommentText("");
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Test Comment Posting</AlertDialogTitle>
          <AlertDialogDescription>
            Test if you can post comments to YouTube videos. This helps debug
            permission issues without uploading.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium">YouTube Video ID</label>
            <Input
              placeholder="e.g., dQw4w9WgXcQ"
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              disabled={isLoading}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-gray-500">
              Find this in the video URL: youtube.com/watch?v=<strong>VIDEO_ID</strong>
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Comment Text</label>
            <Textarea
              placeholder="Enter comment text..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              disabled={isLoading}
              className="mt-1"
              rows={4}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSubmit}
            disabled={isLoading || !videoId.trim() || !commentText.trim()}
          >
            {isLoading ? "Posting..." : "Test Post Comment"}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
