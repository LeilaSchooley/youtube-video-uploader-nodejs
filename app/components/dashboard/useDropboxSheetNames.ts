import { useEffect } from "react";

export function useDropboxSheetNames(opts: {
  selectedDropboxCsvFile: string;
  setDropboxSheetNames: (sheets: Array<{ title: string; sheetId: number }>) => void;
  setSelectedDropboxSheetName: (name: string | ((prev: string) => string)) => void;
  setLoadingDropboxSheets: (loading: boolean) => void;
}) {
  const {
    selectedDropboxCsvFile,
    setDropboxSheetNames,
    setSelectedDropboxSheetName,
    setLoadingDropboxSheets,
  } = opts;
  useEffect(() => {
    const path = selectedDropboxCsvFile?.trim() || "";
    if (!path) {
      setDropboxSheetNames([]);
      setSelectedDropboxSheetName("");
      return;
    }
    const ext = path.toLowerCase().split(".").pop() || "";
    if (ext === "csv") {
      setDropboxSheetNames([{ title: "Sheet1", sheetId: 0 }]);
      setSelectedDropboxSheetName((prev) => prev || "Sheet1");
      return;
    }
    if (ext !== "xlsx" && ext !== "xls") {
      setDropboxSheetNames([]);
      setSelectedDropboxSheetName("");
      return;
    }
    let cancelled = false;
    setLoadingDropboxSheets(true);
    fetch(`/api/dropbox-sheet-names?filePath=${encodeURIComponent(path)}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const sheets = data.sheets || [];
        setDropboxSheetNames(sheets);
        if (sheets.length > 0) {
          setSelectedDropboxSheetName((prev) => (sheets.some((s: { title: string }) => s.title === prev) ? prev : sheets[0].title));
        } else {
          setSelectedDropboxSheetName("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDropboxSheetNames([]);
          setSelectedDropboxSheetName("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDropboxSheets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDropboxCsvFile, setDropboxSheetNames, setSelectedDropboxSheetName, setLoadingDropboxSheets]);
}
