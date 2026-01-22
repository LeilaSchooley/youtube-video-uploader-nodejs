"use client";

import { useState, useEffect } from "react";

interface DriveSheet {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface SheetsBrowserProps {
  onSelectSheet: (spreadsheetId: string, spreadsheetName: string) => void;
  onClose: () => void;
}

export default function SheetsBrowser({ onSelectSheet, onClose }: SheetsBrowserProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>("all");
  const [sheets, setSheets] = useState<DriveSheet[]>([]);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderHistory, setFolderHistory] = useState<Array<{ id: string; name: string }>>([]);
  const [showAllSheets, setShowAllSheets] = useState(true);

  const loadSheets = async (folderId: string | null) => {
    setLoading(true);
    setError(null);
    
    try {
      if (folderId === "all") {
        // Load all sheets from entire Drive
        setShowAllSheets(true);
        setFolders([]);
        setCurrentFolder({ id: "all", name: "All Sheets" });
        
        const sheetsUrl = "/api/list-drive-sheets?folderId=all";
        const sheetsResponse = await fetch(sheetsUrl);
        const sheetsData = await sheetsResponse.json();
        
        if (!sheetsResponse.ok) {
          throw new Error(sheetsData.error || "Failed to load sheets");
        }
        
        setSheets(sheetsData.sheets || []);
      } else {
        // Load sheets from specific folder
        setShowAllSheets(false);
        
        // First, get folders and files to navigate
        const browseUrl = folderId === null || folderId === "root" 
          ? "/api/browse-drive?folderId=root"
          : `/api/browse-drive?folderId=${encodeURIComponent(folderId)}`;
        
        const browseResponse = await fetch(browseUrl);
        const browseData = await browseResponse.json();
        
        if (!browseResponse.ok) {
          throw new Error(browseData.error || "Failed to load folder");
        }
        
        setFolders(browseData.folders || []);
        setCurrentFolder(browseData.currentFolder || null);

        // Then, get sheets in this folder
        const sheetsUrl = folderId === null || folderId === "root"
          ? "/api/list-drive-sheets?folderId=root"
          : `/api/list-drive-sheets?folderId=${encodeURIComponent(folderId)}`;
        
        const sheetsResponse = await fetch(sheetsUrl);
        const sheetsData = await sheetsResponse.json();
        
        if (!sheetsResponse.ok) {
          throw new Error(sheetsData.error || "Failed to load sheets");
        }
        
        setSheets(sheetsData.sheets || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load sheets");
      console.error("[SHEETS-BROWSER] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSheets(currentFolderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  const handleFolderClick = (folderId: string) => {
    // Add current folder to history before navigating (if not root and exists)
    if (currentFolder && currentFolder.id && currentFolder.id !== "root") {
      setFolderHistory(prev => [...prev, currentFolder]);
    }
    setCurrentFolderId(folderId);
  };

  const handleBack = () => {
    if (folderHistory.length > 0) {
      const previousFolder = folderHistory[folderHistory.length - 1];
      const newHistory = folderHistory.slice(0, -1);
      setFolderHistory(newHistory);
      setCurrentFolderId(previousFolder.id === "root" ? "root" : previousFolder.id);
    } else {
      setCurrentFolderId("root");
    }
  };

  const handleSelectSheet = (sheetId: string, sheetName: string) => {
    onSelectSheet(sheetId, sheetName);
    onClose();
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              Select Google Sheet
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {!showAllSheets && folderHistory.length > 0 && (
                <button
                  onClick={handleBack}
                  className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  ← Back
                </button>
              )}
              <span className="text-gray-500 dark:text-gray-400">
                {currentFolder?.name || "My Drive"}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCurrentFolderId("all");
                  setFolderHistory([]);
                }}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  showAllSheets
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                Show All Sheets
              </button>
              {showAllSheets && (
                <button
                  onClick={() => {
                    setCurrentFolderId("root");
                    setFolderHistory([]);
                  }}
                  className="px-3 py-1 text-xs rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Browse Folders
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-red-600 dark:text-red-400 mb-2">⚠️ {error}</div>
              <button
                onClick={() => loadSheets(currentFolderId)}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Folders */}
              {folders.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <span>📁</span>
                    <span>Folders</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => handleFolderClick(folder.id)}
                        className="p-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg border border-gray-200 dark:border-gray-600 text-left transition-colors flex items-center gap-3"
                      >
                        <span className="text-2xl">📁</span>
                        <span className="font-medium text-gray-800 dark:text-white truncate flex-1">
                          {folder.name}
                        </span>
                        <span className="text-gray-400">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sheets */}
              {sheets.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <span>📊</span>
                    <span>Google Sheets ({sheets.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sheets.map((sheet) => (
                      <button
                        key={sheet.id}
                        onClick={() => handleSelectSheet(sheet.id, sheet.name)}
                        className="p-4 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700 text-left transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">📊</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-blue-900 dark:text-blue-100 truncate mb-1">
                              {sheet.name}
                            </div>
                            {sheet.modifiedTime && (
                              <div className="text-xs text-blue-600 dark:text-blue-400">
                                Modified: {formatDate(sheet.modifiedTime)}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                folders.length === 0 && (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <div className="text-4xl mb-2">📊</div>
                    <div>No Google Sheets found in this folder</div>
                    <div className="text-sm mt-2">Try navigating to a different folder</div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
