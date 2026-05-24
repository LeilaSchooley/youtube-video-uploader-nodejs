"use client";

import { useCallback, useRef, useState } from "react";
import { useAppToast } from "@/app/app-toast-context";

export function useSheetsMetadata() {
  const setShowToast = useAppToast();
  const [availableSheets, setAvailableSheets] = useState<
    Array<{ title: string; sheetId: number }>
  >([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSheets = useCallback(
    async (spreadsheetUrl: string) => {
      if (!spreadsheetUrl.trim()) {
        setAvailableSheets([]);
        setSpreadsheetTitle("");
        return;
      }

      setLoadingSheets(true);
      try {
        const response = await fetch(
          `/api/sheets-info?spreadsheetUrl=${encodeURIComponent(spreadsheetUrl)}`,
          { credentials: "include" },
        );
        const data = await response.json();

        if (response.ok && data.success) {
          setAvailableSheets(data.sheets || []);
          setSpreadsheetTitle(data.title || "");

          if (data.sheets && data.sheets.length > 0) {
            const sheetSelect = (document.getElementById("driveSheetNameSelect") ||
              document.getElementById("sheetName")) as HTMLSelectElement | null;
            if (sheetSelect) {
              sheetSelect.value = data.sheets[0].title;
            }
          }
        } else {
          setAvailableSheets([]);
          setSpreadsheetTitle("");
          if (data.error) {
            setShowToast({ message: data.error, type: "error" });
          }
        }
      } catch (error: unknown) {
        console.error("Error fetching sheets:", error);
        setAvailableSheets([]);
        setSpreadsheetTitle("");
      } finally {
        setLoadingSheets(false);
      }
    },
    [setShowToast],
  );

  return {
    availableSheets,
    setAvailableSheets,
    loadingSheets,
    spreadsheetTitle,
    setSpreadsheetTitle,
    fetchSheets,
    debounceTimerRef,
  };
}
