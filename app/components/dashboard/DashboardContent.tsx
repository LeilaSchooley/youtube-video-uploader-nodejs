"use client";

/**
 * Main Dashboard Content - Orchestrates all dashboard sections
 * This component manages the layout and state coordination between sections
 */

import { useState, useEffect } from "react";
import Statistics from "./Statistics";
import type { User } from "./types";

interface DashboardContentProps {
  user: User;
  queue: any[];
  nextUploadTime: Date | null;
  timeUntilNext: string;
  // Add other props as needed
}

export default function DashboardContent({
  user,
  queue,
  nextUploadTime,
  timeUntilNext,
}: DashboardContentProps) {
  // UI state
  const [showAllFiles, setShowAllFiles] = useState<boolean>(true);
  const [showSingleUpload, setShowSingleUpload] = useState<boolean>(false);
  const [showBatchUpload, setShowBatchUpload] = useState<boolean>(true);
  const [showBulkUpload, setShowBulkUpload] = useState<boolean>(false);
  const [showMetadataUpdate, setShowMetadataUpdate] = useState<boolean>(false);
  const [showBatchInstructions, setShowBatchInstructions] = useState<boolean>(false);

  // Load preferences from localStorage
  useEffect(() => {
    const savedSingle = localStorage.getItem("showSingleUpload");
    if (savedSingle !== null) {
      setShowSingleUpload(savedSingle === "true");
    }
    const savedBatch = localStorage.getItem("showBatchUpload");
    if (savedBatch !== null) {
      setShowBatchUpload(savedBatch === "true");
    }
    const savedInstructions = localStorage.getItem("showBatchInstructions");
    if (savedInstructions !== null) {
      setShowBatchInstructions(savedInstructions === "true");
    }
  }, []);

  return (
    <>
      {/* Statistics Dashboard */}
      <Statistics 
        queue={queue}
        nextUploadTime={nextUploadTime}
        timeUntilNext={timeUntilNext}
      />

      {/* Other sections will be imported here */}
      {/* All Files Section - to be extracted */}
      {/* Upload Forms - to be extracted */}
      {/* Queue Management - to be extracted */}
    </>
  );
}


