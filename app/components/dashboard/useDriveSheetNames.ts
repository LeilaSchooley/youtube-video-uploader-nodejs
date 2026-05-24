import { useEffect } from "react";

export function useDriveSheetNames(opts: {
  selectedDriveCsvFileId: string;
  setDriveSheetNames: (sheets: Array<{ title: string; sheetId: number }>) => void;
  setSelectedDriveSheetName: (name: string | ((prev: string) => string)) => void;
  setLoadingDriveSheets: (loading: boolean) => void;
}) {
  const {
    selectedDriveCsvFileId,
    setDriveSheetNames,
    setSelectedDriveSheetName,
    setLoadingDriveSheets,
  } = opts;

  useEffect(() => {
    const id = selectedDriveCsvFileId?.trim() || "";
    if (!id) {
      setDriveSheetNames([]);
      setSelectedDriveSheetName("");
      return;
    }

    let cancelled = false;
    setLoadingDriveSheets(true);
    fetch(`/api/drive-sheet-names?fileId=${encodeURIComponent(id)}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const sheets = data.sheets || [];
        setDriveSheetNames(sheets);
        if (sheets.length > 0) {
          setSelectedDriveSheetName((prev) =>
            sheets.some((s: { title: string }) => s.title === prev)
              ? prev
              : sheets[0].title,
          );
        } else {
          setSelectedDriveSheetName("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDriveSheetNames([]);
          setSelectedDriveSheetName("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDriveSheets(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedDriveCsvFileId,
    setDriveSheetNames,
    setSelectedDriveSheetName,
    setLoadingDriveSheets,
  ]);
}
