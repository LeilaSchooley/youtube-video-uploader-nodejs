import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { User } from "../types";

export function useDashboardData() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [queue, setQueue] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [availableChannels, setAvailableChannels] = useState<Array<{
    userId: string;
    displayName: string;
    fileCount: number;
    jobCount: number;
    isCurrent: boolean;
  }>>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [allFiles, setAllFiles] = useState<any>(null);
  const [loadingAllFiles, setLoadingAllFiles] = useState<boolean>(false);
  const [jobFiles, setJobFiles] = useState<any>(null);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [nextUploadTime, setNextUploadTime] = useState<Date | null>(null);
  const [timeUntilNext, setTimeUntilNext] = useState<string>("");

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/user");
      const data = await res.json();
      if (data.authenticated) {
        setUser(data);
      } else {
        router.push("/");
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      router.push("/");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchQueue = useCallback(async () => {
    try {
      const timestamp = Date.now();
      const res = await fetch(`/api/upload-queue?t=${timestamp}`);
      const data = await res.json();
      if (res.ok && data.queue) {
        setQueue(data.queue);
      }
    } catch (error) {
      console.error("[ERROR] Error fetching queue:", error);
    }
  }, []);

  const fetchJobStatus = useCallback(async (jobId: string) => {
    try {
      const timestamp = Date.now();
      const res = await fetch(`/api/queue-status?jobId=${jobId}&t=${timestamp}`);
      const data = await res.json();
      if (res.ok && data.job) {
        setJobStatus(data.job);
      }
    } catch (error) {
      console.error("[ERROR] Error fetching job status:", error);
    }
  }, []);

  const fetchJobFiles = useCallback(async (jobId: string) => {
    try {
      setLoadingFiles(true);
      const res = await fetch(`/api/delete-videos?jobId=${jobId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setJobFiles(data);
      }
    } catch (error) {
      console.error("[ERROR] Error fetching job files:", error);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const fetchAllFiles = useCallback(async () => {
    try {
      setLoadingAllFiles(true);
      const url = selectedChannel 
        ? `/api/list-all-files?channel=${encodeURIComponent(selectedChannel)}`
        : "/api/list-all-files";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        setAllFiles(data);
      }
    } catch (error) {
      console.error("[ERROR] Error fetching all files:", error);
    } finally {
      setLoadingAllFiles(false);
    }
  }, [selectedChannel]);

  const fetchAvailableChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      const data = await res.json();
      if (res.ok && data.channels) {
        setAvailableChannels(data.channels);
        if (!selectedChannel && data.currentChannel) {
          setSelectedChannel(data.currentChannel);
        } else if (!selectedChannel && data.channels.length > 0) {
          setSelectedChannel(data.channels[0].userId);
        }
      }
    } catch (error) {
      console.error("[ERROR] Error fetching channels:", error);
    }
  }, [selectedChannel]);

  const calculateNextUploadTime = useCallback(() => {
    const now = new Date();
    let earliestDate: Date | null = null;

    for (const job of queue) {
      if (
        job.videosPerDay > 0 &&
        job.status !== "failed" &&
        job.status !== "completed" &&
        job.status !== "cancelled"
      ) {
        const jobStartTime = new Date(job.createdAt);
        const completedCount =
          job.progress?.filter(
            (p: any) =>
              p.status.includes("Uploaded") || 
              p.status.includes("scheduled") ||
              p.status.includes("Scheduled")
          ).length || 0;
        const totalVideos = job.totalVideos || job.progress?.length || 0;
        
        if (completedCount < totalVideos) {
          const currentBatch = Math.floor(completedCount / job.videosPerDay);
          const nextBatchStartTime = new Date(jobStartTime);
          nextBatchStartTime.setTime(
            jobStartTime.getTime() + (currentBatch + 1) * 24 * 60 * 60 * 1000
          );
          
          if (nextBatchStartTime > now) {
            if (!earliestDate || nextBatchStartTime < earliestDate) {
              earliestDate = nextBatchStartTime;
            }
          } else {
            if (!earliestDate || now < earliestDate) {
              earliestDate = new Date(now.getTime() + 1000);
            }
          }
        }
      }
    }

    setNextUploadTime(earliestDate);
  }, [queue]);

  // Update countdown timer
  useEffect(() => {
    const updateTimer = () => {
      if (!nextUploadTime) {
        setTimeUntilNext("");
        return;
      }

      const now = new Date();
      const diff = nextUploadTime.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeUntilNext("Uploading now...");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeUntilNext(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeUntilNext(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeUntilNext(`${minutes}m ${seconds}s`);
      } else {
        setTimeUntilNext(`${seconds}s`);
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [nextUploadTime]);

  // Initial fetch
  useEffect(() => {
    fetchUser();
    fetchAvailableChannels();
    fetchQueue();
    
    const pollInterval = setInterval(() => {
      fetchQueue();
      if (selectedJobId) {
        fetchJobStatus(selectedJobId);
      }
    }, 1000);
    
    return () => clearInterval(pollInterval);
  }, [fetchUser, fetchAvailableChannels, fetchQueue, fetchJobStatus, selectedJobId]);

  // Fetch job status when selected
  useEffect(() => {
    if (selectedJobId) {
      fetchJobStatus(selectedJobId);
      fetchQueue();
      fetchJobFiles(selectedJobId);
    }
  }, [selectedJobId, fetchJobStatus, fetchQueue, fetchJobFiles]);

  // Recalculate next upload time
  useEffect(() => {
    calculateNextUploadTime();
  }, [calculateNextUploadTime]);

  // Refresh files when channel changes
  useEffect(() => {
    if (selectedChannel && user?.authenticated) {
      fetchAllFiles();
    }
  }, [selectedChannel, user?.authenticated, fetchAllFiles]);

  const handleChannelChange = useCallback((channelUserId: string) => {
    setSelectedChannel(channelUserId);
    fetchAllFiles();
  }, [fetchAllFiles]);

  return {
    user,
    loading,
    queue,
    selectedJobId,
    setSelectedJobId,
    jobStatus,
    availableChannels,
    selectedChannel,
    handleChannelChange,
    allFiles,
    loadingAllFiles,
    jobFiles,
    loadingFiles,
    nextUploadTime,
    timeUntilNext,
    fetchQueue,
    fetchJobStatus,
    fetchJobFiles,
    fetchAllFiles,
  };
}


