"use client";

import { useState, useCallback, type FormEvent, type RefObject } from "react";
import type { BulkUploadProgress } from "@/app/components/dashboard/types";

export interface DuplicateModalState {
  duplicateTitles: string[];
  pendingFiles: File[];
  pendingUrls: string[];
}

export interface UseBulkUploadOptions {
  setShowToast: (toast: { message: string; type: "success" | "error" | "info" }) => void;
  setMessage: (msg: { type: "success" | "error" | "info" | null; text: string | null }) => void;
  bulkFilesInputRef?: RefObject<HTMLInputElement | null>;
}

export function useBulkUpload({
  setShowToast,
  setMessage,
  bulkFilesInputRef,
}: UseBulkUploadOptions) {
  const [selectedBulkFiles, setSelectedBulkFiles] = useState<File[]>([]);
  const [bulkUrls, setBulkUrls] = useState<string[]>([]);
  const [urlAuthHeaders, setUrlAuthHeaders] = useState<string>("");
  const [urlTimeout, setUrlTimeout] = useState<string>("");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkUploadProgress, setBulkUploadProgress] = useState<BulkUploadProgress | null>(null);
  const [checkDuplicatesBeforeUpload, setCheckDuplicatesBeforeUpload] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<DuplicateModalState | null>(null);

  const doBulkSubmit = useCallback(
    async (files: File[], urls: string[]) => {
      setBulkUploading(true);
      setBulkUploadProgress(null);
      setMessage({ type: null, text: null });

      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      urls.forEach((url) => {
        if (url.trim()) formData.append("urls", url.trim());
      });
      if (urlAuthHeaders.trim()) formData.append("urlAuthHeaders", urlAuthHeaders.trim());
      if (urlTimeout.trim()) formData.append("urlTimeout", urlTimeout.trim());
      formData.append("useWorker", "true");

      try {
        const res = await fetch("/api/upload-bulk", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: "Bulk upload failed" }));
          throw new Error(errorData.error || "Bulk upload failed");
        }

        if (res.status === 202) {
          const data = await res.json();
          setShowToast({
            message: `✅ Upload queued! Job ID: ${data.jobId}. Processing ${data.totalItems} items in background.`,
            type: "success",
          });
          setMessage({
            type: "success",
            text: `Upload queued: ${data.totalItems} items. Check status below.`,
          });
          setSelectedBulkFiles([]);
          setBulkUrls([]);
          setUrlAuthHeaders("");
          setUrlTimeout("");
          if (bulkFilesInputRef?.current) bulkFilesInputRef.current.value = "";
          return;
        }

        if (!res.body) throw new Error("No response body for bulk upload");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let totalCompleted = 0;
        let totalFailed = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                switch (data.type) {
                  case "start":
                    setBulkUploadProgress({
                      total: data.total,
                      totalBatches: data.totalBatches,
                      currentBatch: 0,
                      completed: 0,
                      failed: 0,
                      message: `Starting bulk upload: ${data.total} videos in ${data.totalBatches} batches`,
                    });
                    break;
                  case "batch_start":
                    setBulkUploadProgress((prev) => ({
                      ...prev!,
                      currentBatch: data.batchNumber,
                      totalBatches: data.totalBatches,
                      message: `Processing batch ${data.batchNumber}/${data.totalBatches}`,
                    }));
                    break;
                  case "upload_start":
                    setBulkUploadProgress((prev) => ({
                      ...prev!,
                      currentFile: data.filename,
                      message: `Uploading: ${data.filename}`,
                    }));
                    break;
                  case "upload_success":
                    totalCompleted++;
                    setBulkUploadProgress((prev) => ({
                      ...prev!,
                      completed: totalCompleted,
                      message: `✅ ${data.filename} uploaded (${totalCompleted}/${prev!.total})`,
                    }));
                    break;
                  case "upload_failed":
                    totalFailed++;
                    setBulkUploadProgress((prev) => ({
                      ...prev!,
                      failed: totalFailed,
                      message: `❌ ${data.filename} failed: ${data.error}`,
                    }));
                    break;
                  case "batch_complete":
                    setBulkUploadProgress((prev) => ({
                      ...prev!,
                      completed: data.completed,
                      failed: data.failed,
                      message: `Batch ${data.batchNumber}/${data.totalBatches} complete: ${data.completed} succeeded, ${data.failed} failed`,
                    }));
                    break;
                  case "progress":
                    setBulkUploadProgress((prev) => ({
                      ...prev!,
                      completed: data.totalCompleted,
                      failed: data.totalFailed,
                      total: data.total || prev?.total || 0,
                      message: `Progress: ${data.totalCompleted} succeeded, ${data.totalFailed} failed`,
                    }));
                    break;
                  case "complete":
                    totalCompleted = data.totalCompleted;
                    totalFailed = data.totalFailed;
                    const finalMessage =
                      totalFailed > 0
                        ? `✅ Bulk Upload Complete!\n\n📊 ${totalCompleted} videos uploaded successfully\n⚠️ ${totalFailed} videos failed`
                        : `✅ Bulk Upload Complete!\n\n📊 ${totalCompleted} videos uploaded successfully`;
                    setShowToast({ message: finalMessage.trim(), type: totalFailed > 0 ? "info" : "success" });
                    setMessage({
                      type: totalFailed > 0 ? "info" : "success",
                      text: `✅ Bulk upload complete: ${totalCompleted} succeeded${totalFailed > 0 ? `, ${totalFailed} failed` : ""}`,
                    });
                    break;
                  case "error":
                    throw new Error(data.error);
                }
              } catch (parseError) {
                console.error("Error parsing SSE data for bulk upload:", parseError, line);
              }
            }
          }
        }
        if (bulkFilesInputRef?.current) bulkFilesInputRef.current.value = "";
        setSelectedBulkFiles([]);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : "An error occurred during bulk upload.";
        setShowToast({ message: errorMsg, type: "error" });
        setMessage({ type: "error", text: errorMsg });
      } finally {
        setBulkUploading(false);
      }
    },
    [
      urlAuthHeaders,
      urlTimeout,
      setShowToast,
      setMessage,
      bulkFilesInputRef,
    ],
  );

  const handleBulkUpload = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (selectedBulkFiles.length === 0 && bulkUrls.length === 0) {
        setShowToast({
          message: "Please select video files or enter URLs to upload.",
          type: "error",
        });
        return;
      }
      setBulkUploadProgress(null);
      setMessage({ type: null, text: null });

      if (checkDuplicatesBeforeUpload) {
        const titles: string[] = [
          ...selectedBulkFiles.map((f) => f.name),
          ...bulkUrls.filter((u) => u?.trim()).map((u) => u.trim()),
        ];
        if (titles.length === 0) {
          await doBulkSubmit(selectedBulkFiles, bulkUrls);
          return;
        }
        try {
          const res = await fetch("/api/uploaded-videos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ titles }),
            credentials: "include",
          });
          if (!res.ok) {
            await doBulkSubmit(selectedBulkFiles, bulkUrls);
            return;
          }
          const data = await res.json();
          const duplicateTitles: string[] = data.duplicateTitles || [];
          if (duplicateTitles.length > 0) {
            setDuplicateModal({
              duplicateTitles,
              pendingFiles: selectedBulkFiles,
              pendingUrls: bulkUrls,
            });
            return;
          }
        } catch {
          await doBulkSubmit(selectedBulkFiles, bulkUrls);
          return;
        }
      }
      await doBulkSubmit(selectedBulkFiles, bulkUrls);
    },
    [
      selectedBulkFiles,
      bulkUrls,
      checkDuplicatesBeforeUpload,
      doBulkSubmit,
      setShowToast,
      setMessage,
    ],
  );

  return {
    selectedBulkFiles,
    setSelectedBulkFiles,
    bulkUrls,
    setBulkUrls,
    urlAuthHeaders,
    setUrlAuthHeaders,
    urlTimeout,
    setUrlTimeout,
    bulkUploading,
    bulkUploadProgress,
    checkDuplicatesBeforeUpload,
    setCheckDuplicatesBeforeUpload,
    duplicateModal,
    setDuplicateModal,
    doBulkSubmit,
    handleBulkUpload,
  };
}
