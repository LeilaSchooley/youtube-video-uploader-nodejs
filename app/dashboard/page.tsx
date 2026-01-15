'use client';

import { useEffect, useState, FormEvent, ChangeEvent, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Toast from '@/app/components/Toast';

interface User {
  authenticated: boolean;
  name: string;
  picture: string;
}

interface Message {
  type: 'success' | 'error' | 'info' | null;
  text: string | null;
}

interface ProgressItem {
  index: number;
  status: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [csvUploading, setCsvUploading] = useState<boolean>(false);
  const [message, setMessage] = useState<Message>({ type: null, text: null });
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [showProgress, setShowProgress] = useState<boolean>(false);
  const [videosPerDay, setVideosPerDay] = useState<string>('');
  const [enableScheduling, setEnableScheduling] = useState<boolean>(false);
  const [queue, setQueue] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [nextUploadTime, setNextUploadTime] = useState<Date | null>(null);
  const [timeUntilNext, setTimeUntilNext] = useState<string>('');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  // Calculate next scheduled upload time
  const calculateNextUploadTime = useCallback(() => {
    const now = new Date();
    let earliestDate: Date | null = null;

    // Check all scheduled jobs
    for (const job of queue) {
      if (job.videosPerDay > 0 && job.status !== 'failed') {
        const startDate = new Date(job.startDate);
        startDate.setHours(12, 0, 0, 0); // Scheduled videos publish at noon
        
        // Count how many videos have been completed
        const completedCount = job.progress?.filter((p: ProgressItem) => 
          p.status.includes("Uploaded") || 
          p.status.includes("scheduled") ||
          p.status.includes("Scheduled")
        ).length || 0;
        
        const totalVideos = job.totalVideos || job.progress?.length || 0;
        
        // If there are still videos to upload
        if (completedCount < totalVideos) {
          // Calculate which day the next video should be scheduled for
          const nextVideoIndex = completedCount;
          const dayIndex = Math.floor(nextVideoIndex / job.videosPerDay);
          const scheduledDate = new Date(startDate);
          scheduledDate.setDate(startDate.getDate() + dayIndex);
          
          // Only consider future dates
          if (scheduledDate > now) {
            if (!earliestDate || scheduledDate < earliestDate) {
              earliestDate = scheduledDate;
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
        setTimeUntilNext('');
        return;
      }

      const now = new Date();
      const diff = nextUploadTime.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeUntilNext('Uploading now...');
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

  // Recalculate next upload time when queue changes
  useEffect(() => {
    calculateNextUploadTime();
  }, [calculateNextUploadTime]);

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load dark mode preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') {
      setDarkMode(true);
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', String(newMode));
  };

  const handleQueueAction = async (jobId: string, action: 'pause' | 'resume' | 'cancel') => {
    try {
      const res = await fetch('/api/queue-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, action }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowToast({ message: data.message, type: 'success' });
        fetchQueue();
        if (selectedJobId === jobId) {
          fetchJobStatus(jobId);
        }
      } else {
        setShowToast({ message: data.error || 'Failed to perform action', type: 'error' });
      }
    } catch (error) {
      setShowToast({ message: 'An error occurred', type: 'error' });
    }
  };

  useEffect(() => {
    fetchUser();
    fetchQueue();
    const interval = setInterval(() => {
      fetchQueue();
      if (selectedJobId) {
        fetchJobStatus(selectedJobId);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedJobId]);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/user');
      const data = await res.json();
      if (data.authenticated) {
        setUser(data);
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/upload-queue');
      const data = await res.json();
      if (res.ok && data.queue) {
        setQueue(data.queue);
      }
    } catch (error) {
      console.error('Error fetching queue:', error);
    }
  };

  const fetchJobStatus = async (jobId: string) => {
    try {
      const res = await fetch(`/api/queue-status?jobId=${jobId}`);
      const data = await res.json();
      if (res.ok && data.job) {
        setJobStatus(data.job);
      }
    } catch (error) {
      console.error('Error fetching job status:', error);
    }
  };

  const handleSingleUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setUploading(true);
    setMessage({ type: null, text: null });
    setSelectedVideoFile(null); // Reset file selection after upload starts

    // Store form reference before async operation
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setShowToast({ message: data.message || 'Video uploaded successfully!', type: 'success' });
        setMessage({ type: null, text: null });
        // Reset form using stored reference
        if (form) {
          form.reset();
        }
      } else {
        console.error("=== UPLOAD ERROR (Client) ===");
        console.error("Error:", data.error);
        console.error("Details:", data.details);
        console.error("Code:", data.code);
        console.error("Status:", data.status);
        console.error("Full response:", data);
        console.error("=============================");
        
        const errorMsg = data.error || 'Error uploading video';
        setShowToast({ message: errorMsg, type: 'error' });
        setMessage({ type: 'error', text: errorMsg });
      }
    } catch (error: any) {
      console.error("=== UPLOAD EXCEPTION (Client) ===");
      console.error("Error:", error);
      console.error("Message:", error?.message);
      console.error("Stack:", error?.stack);
      console.error("=================================");
      
      const errorMsg = error?.message || 'An error occurred while uploading the video.';
      setShowToast({ message: errorMsg, type: 'error' });
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setUploading(false);
      // Reset file input after upload completes
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
        setSelectedVideoFile(null);
      }
    }
  };

  const handleCsvUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCsvUploading(true);
    setMessage({ type: null, text: null });
    setShowProgress(false);
    setProgress([]);

    const formData = new FormData(e.currentTarget);
    
      if (enableScheduling) {
        if (!videosPerDay) {
          setShowToast({ message: 'Please fill in videos per day when scheduling is enabled.', type: 'error' });
          setMessage({ type: 'error', text: 'Please fill in videos per day when scheduling is enabled.' });
          setCsvUploading(false);
          return;
        }
      formData.append('videosPerDay', videosPerDay);
      formData.append('enableScheduling', 'true');
    }

    try {
      // Show copying message
      setMessage({ type: 'info', text: 'Copying files to server storage...' });
      
      const res = await fetch('/api/upload-queue', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Build detailed message with copy stats
        let message = `✅ Files Successfully Uploaded!\n\n`;
        message += `📊 ${data.totalVideos} videos queued for processing\n`;
        message += `🆔 Job ID: ${data.jobId}\n\n`;
        
        if (data.copyStats) {
          message += `📁 Files Copied:\n`;
          message += `  ✅ ${data.copyStats.videosCopied} videos`;
          if (data.copyStats.videosSkipped > 0) {
            message += ` (⚠️ ${data.copyStats.videosSkipped} skipped)`;
          }
          message += `\n`;
          
          if (data.copyStats.thumbnailsCopied > 0) {
            message += `  🖼️ ${data.copyStats.thumbnailsCopied} thumbnails`;
            if (data.copyStats.thumbnailsSkipped > 0) {
              message += ` (${data.copyStats.thumbnailsSkipped} skipped)`;
            }
            message += `\n`;
          }
          
          if (data.copyStats.errors && data.copyStats.errors.length > 0) {
            message += `\n⚠️ ${data.copyStats.errors.length} error(s) during copy`;
          }
        }
        
        message += `\n\n⚡ The worker will start processing your videos shortly.`;
        
        setShowToast({ 
          message: message.trim(), 
          type: data.copyStats?.errors?.length > 0 ? 'info' : 'success',
        });
        setMessage({ type: 'success', text: `✅ Successfully uploaded ${data.totalVideos} videos! Check the queue below for progress.` });
        e.currentTarget.reset();
        setEnableScheduling(false);
        setVideosPerDay('');
        fetchQueue();
        setSelectedJobId(data.jobId);
        fetchJobStatus(data.jobId);
      } else {
        setShowToast({ message: data.error || 'Error uploading files', type: 'error' });
        setMessage({ type: 'error', text: data.error || 'Error uploading files' });
      }
    } catch (error) {
      setShowToast({ message: 'An error occurred while uploading files.', type: 'error' });
      setMessage({ type: 'error', text: 'An error occurred while uploading files.' });
    } finally {
      setCsvUploading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account data and revoke access? This action can be undone by reauthorizing the app.')) {
      return;
    }

    try {
      const res = await fetch('/api/delete-account', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Account deletion requested.');
        router.push('/');
      } else {
        alert(data.message || 'Failed to delete account.');
      }
    } catch (err) {
      console.error(err);
      alert('Error: Could not reach the server.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mb-4"></div>
          <p className="text-gray-600 text-lg">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Calculate statistics
  const allProgress = queue.flatMap(job => job.progress || []);
  const totalVideos = queue.reduce((sum, job) => {
    return sum + (job.totalVideos || job.progress?.length || 0);
  }, 0);
  
  const completed = allProgress.filter(p => 
    p.status.includes("Uploaded") || 
    p.status.includes("scheduled") ||
    p.status.includes("Scheduled")
  ).length;
  
  const failed = allProgress.filter(p => 
    p.status.includes("Failed") || 
    p.status.includes("Missing") ||
    p.status.includes("Invalid")
  ).length;
  
  const pending = allProgress.filter(p => 
    p.status === "Pending" || 
    p.status.includes("Uploading") ||
    p.status.includes("thumbnail")
  ).length;
  
  const processing = queue.filter(job => job.status === 'processing').length;
  const completedJobs = queue.filter(job => job.status === 'completed').length;
  const failedJobs = queue.filter(job => job.status === 'failed').length;
  const pendingJobs = queue.filter(job => job.status === 'pending').length;
  
  const progressPercentage = totalVideos > 0 
    ? Math.round((completed / totalVideos) * 100) 
    : (completedJobs > 0 && queue.length === completedJobs ? 100 : 0);
  
  const remaining = totalVideos > 0 ? totalVideos - completed - failed : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-5 py-6 sm:py-10">
        {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 dark:text-white">ZonDiscounts Uploader Dashboard</h1>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={toggleDarkMode}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-full transition-colors"
            aria-label="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
          <a
            href="/api/auth/logout"
            className="btn-primary"
          >
            Logout
          </a>
          <button
            onClick={handleDeleteAccount}
            className="btn-secondary"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <Toast
          message={showToast.message}
          type={showToast.type}
          onClose={() => setShowToast(null)}
          duration={showToast.type === 'info' ? 8000 : 5000}
        />
      )}

      {/* Info Message (for copying progress) */}
      {message.type === 'info' && (
        <div className="mb-5 p-4 rounded-lg font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-700 flex items-center gap-3">
          <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-blue-800 dark:border-blue-200"></div>
          <span>{message.text}</span>
        </div>
      )}

      {/* Success Message (for CSV upload success) */}
      {message.type === 'success' && (
        <div className="mb-5 p-4 rounded-lg font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-700 flex items-center gap-3">
          <div className="text-xl">✅</div>
          <span>{message.text}</span>
        </div>
      )}

      {/* Next Upload Timer */}
      {nextUploadTime && timeUntilNext && (
        <div className="mb-6 p-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-4xl">⏰</div>
              <div>
                <div className="text-sm opacity-90 mb-1">Next Scheduled Upload</div>
                <div className="text-2xl font-bold">{timeUntilNext}</div>
                <div className="text-sm opacity-80 mt-1">
                  {nextUploadTime.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl animate-pulse">⏳</div>
            </div>
          </div>
        </div>
      )}

      {/* Next Upload Timer */}
      {nextUploadTime && timeUntilNext && (
        <div className="mb-6 p-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-4xl">⏰</div>
              <div>
                <div className="text-sm opacity-90 mb-1">Next Scheduled Upload</div>
                <div className="text-2xl font-bold">{timeUntilNext}</div>
                <div className="text-sm opacity-80 mt-1">
                  {nextUploadTime.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl animate-pulse">⏳</div>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Dashboard */}
      {queue.length === 0 ? (
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-2xl p-12 mb-10 text-center text-white">
          <div className="text-5xl mb-5">📊</div>
          <h2 className="text-3xl font-bold mb-4">Welcome to Your Upload Dashboard</h2>
          <p className="text-lg opacity-95 mb-8 max-w-2xl mx-auto">
            Start uploading videos to see real-time statistics, progress tracking, and detailed analytics.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-2xl mx-auto mt-8">
            <div className="p-5 bg-white/20 backdrop-blur-lg rounded-xl">
              <div className="text-4xl font-bold">0</div>
              <div className="text-sm opacity-90 mt-2">Total Videos</div>
            </div>
            <div className="p-5 bg-white/20 backdrop-blur-lg rounded-xl">
              <div className="text-4xl font-bold">0</div>
              <div className="text-sm opacity-90 mt-2">Completed</div>
            </div>
            <div className="p-5 bg-white/20 backdrop-blur-lg rounded-xl">
              <div className="text-4xl font-bold">0</div>
              <div className="text-sm opacity-90 mt-2">Jobs</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card border border-gray-100 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">📊 Upload Statistics</h2>
            <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
              processing > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
            }`}>
              {processing > 0 ? '⚡ Processing' : '✓ Ready'}
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex justify-between mb-2">
              <span className="font-medium text-gray-700">Overall Progress</span>
              <span className="font-semibold text-gray-800">{progressPercentage}%</span>
            </div>
            <div className="w-full h-8 bg-gray-200 rounded-full overflow-hidden relative">
              <div 
                className={`h-full rounded-full transition-all duration-300 flex items-center justify-center text-white font-semibold text-sm ${
                  progressPercentage === 100 ? 'bg-green-500' : 'bg-gradient-to-r from-blue-600 to-blue-800'
                }`}
                style={{ width: `${progressPercentage}%` }}
              >
                {progressPercentage > 0 && progressPercentage < 100 && `${progressPercentage}%`}
                {progressPercentage === 100 && '✓ Complete'}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <div className="p-5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-lg">
              <div className="text-sm opacity-90 mb-2">Total Videos</div>
              <div className="text-4xl font-bold">{totalVideos}</div>
            </div>
            <div className="p-5 bg-gradient-to-br from-teal-500 to-green-400 rounded-xl text-white shadow-lg">
              <div className="text-sm opacity-90 mb-2">Completed</div>
              <div className="text-4xl font-bold">{completed}</div>
              {totalVideos > 0 && (
                <div className="text-xs opacity-90 mt-1">
                  {Math.round((completed / totalVideos) * 100)}% of total
                </div>
              )}
            </div>
            <div className="p-5 bg-gradient-to-br from-pink-400 to-red-500 rounded-xl text-white shadow-lg">
              <div className="text-sm opacity-90 mb-2">Pending</div>
              <div className="text-4xl font-bold">{pending}</div>
              {totalVideos > 0 && (
                <div className="text-xs opacity-90 mt-1">
                  {Math.round((pending / totalVideos) * 100)}% of total
                </div>
              )}
            </div>
            <div className="p-5 bg-gradient-to-br from-pink-500 to-yellow-400 rounded-xl text-white shadow-lg">
              <div className="text-sm opacity-90 mb-2">Failed</div>
              <div className="text-4xl font-bold">{failed}</div>
              {totalVideos > 0 && (
                <div className="text-xs opacity-90 mt-1">
                  {Math.round((failed / totalVideos) * 100)}% of total
                </div>
              )}
            </div>
          </div>

          {/* Job Status Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-5 bg-gray-50 rounded-xl">
            <div className="text-center">
              <div className="text-3xl font-bold text-indigo-600">{queue.length}</div>
              <div className="text-sm text-gray-600 mt-1">Total Jobs</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-teal-600">{completedJobs}</div>
              <div className="text-sm text-gray-600 mt-1">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-500">{processing}</div>
              <div className="text-sm text-gray-600 mt-1">Processing</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-500">{pendingJobs}</div>
              <div className="text-sm text-gray-600 mt-1">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-pink-500">{failedJobs}</div>
              <div className="text-sm text-gray-600 mt-1">Failed</div>
            </div>
          </div>

          {/* Remaining Videos */}
          {remaining > 0 && (
            <div className={`mt-6 p-4 rounded-lg text-center ${
              remaining > 0 ? 'bg-yellow-50 border border-yellow-300' : 'bg-green-50 border border-green-300'
            }`}>
              <div className={`text-lg font-semibold mb-1 ${
                remaining > 0 ? 'text-yellow-800' : 'text-green-800'
              }`}>
                {remaining > 0 ? `${remaining} videos remaining` : 'All videos processed!'}
              </div>
              {remaining > 0 && (
                <div className="text-sm text-yellow-700">
                  {processing > 0 ? 'Worker is processing videos...' : 'Waiting for worker to process...'}
                </div>
              )}
            </div>
          )}

          {totalVideos === 0 && queue.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <div className="text-sm text-blue-900">
                Jobs are queued. Statistics will appear once processing begins.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Profile Section */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-5 text-gray-800">👤 Profile</h2>
        <div className="flex items-center gap-5 p-4 bg-gradient-to-r from-red-50 to-pink-50 rounded-lg border border-red-100">
          <img
            src={user.picture}
            alt={user.name}
            className="w-20 h-20 rounded-full object-cover border-4 border-red-600 shadow-lg"
          />
          <div>
            <p className="text-lg font-semibold text-gray-800">{user.name}</p>
            <p className="text-sm text-gray-600">Google Account Connected</p>
          </div>
        </div>
      </div>

      {/* Single Video Upload */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-5 text-gray-800">🎬 Single Video Upload</h2>
        <form onSubmit={handleSingleUpload} className="flex flex-col gap-5">
          <label htmlFor="title" className="label">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            placeholder="Enter video title"
            required
            className="input-field"
          />

          <label htmlFor="description" className="label">Description</label>
          <textarea
            id="description"
            name="description"
            placeholder="Enter video description"
            required
            className="input-field min-h-[100px] resize-y"
          />

          <label htmlFor="video" className="label">Choose File</label>
          <div 
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
              selectedVideoFile 
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                : 'border-gray-300 hover:border-red-500'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && file.type.startsWith('video/')) {
                setSelectedVideoFile(file);
                if (fileInputRef.current) {
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(file);
                  fileInputRef.current.files = dataTransfer.files;
                }
              }
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <input
              ref={fileInputRef}
              type="file"
              id="video"
              name="video"
              accept="video/*"
              required
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setSelectedVideoFile(file);
                }
              }}
            />
            {selectedVideoFile ? (
              <div>
                <div className="text-4xl mb-2">✅</div>
                <p className="text-green-700 dark:text-green-300 font-semibold mb-1">
                  {selectedVideoFile.name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {(selectedVideoFile.size / (1024 * 1024)).toFixed(2)} MB
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  Click to change file
                </p>
              </div>
            ) : (
              <>
                <div className="text-4xl mb-2">📹</div>
                <p className="text-gray-600 dark:text-gray-400 mb-1">Click to upload or drag and drop</p>
                <p className="text-sm text-gray-500 dark:text-gray-500">Video files only</p>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="publishDate" className="label">Schedule Publish Date</label>
              <input
                type="datetime-local"
                id="publishDate"
                name="publishDate"
                className="input-field"
              />
            </div>
          </div>

          <label htmlFor="privacyStatus" className="label">Privacy Status</label>
          <select
            id="privacyStatus"
            name="privacyStatus"
            defaultValue="public"
            required
            className="input-field mb-5"
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
          </select>

          <button
            type="submit"
            disabled={uploading}
            className={`btn-primary ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {uploading ? 'Uploading...' : 'Upload Video'}
          </button>
        </form>
      </div>

      {/* Batch Upload */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-5 text-gray-800">📦 Batch Upload from CSV (Background Processing)</h2>
        <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>New Background Processing System:</strong> Upload your CSV and video files to the server. 
            The system will process them in the background, uploading X videos per day automatically. 
            You can close your browser and check status later.
          </p>
        </div>
        <div className="mb-5 text-sm">
          <h3 className="font-semibold mb-2">CSV File Instructions</h3>
          <p className="mb-2">Your CSV file should include the following columns:</p>
          <ul className="list-disc list-inside mb-2 space-y-1">
            <li><strong>youtube_title:</strong> The title of your video (required)</li>
            <li><strong>youtube_description:</strong> A detailed description of your video (required)</li>
            <li><strong>thumbnail_path:</strong> File path to the video thumbnail image (optional)</li>
            <li><strong>path:</strong> File path to the video file on your server (required)</li>
            <li><strong>scheduleTime:</strong> The date and time to publish the video with. (yyyy-MM-dd HH:mm) (optional)</li>
            <li><strong>privacyStatus:</strong> Must be &apos;public&apos;, &apos;private&apos;, or &apos;unlisted&apos; (defaults to &apos;public&apos;)</li>
          </ul>
          <p className="text-gray-600 text-sm mb-2">
            <strong>Important:</strong> The <code className="bg-gray-100 px-1 rounded">path</code> and <code className="bg-gray-100 px-1 rounded">thumbnail_path</code> columns should contain 
            absolute file paths on your server. Files will be copied to server storage when you submit the form.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
            <strong>📝 Description Formatting:</strong> Your <code className="bg-blue-100 px-1 rounded">youtube_description</code> can include:
            <ul className="list-disc list-inside mt-1 ml-2 space-y-1">
              <li>Multi-line text with line breaks (use <code className="bg-blue-100 px-1 rounded">\n</code> or actual line breaks in CSV)</li>
              <li>Emojis and special characters (🎯, 💰, 🔗, etc.)</li>
              <li>Links (full URLs will be clickable on YouTube)</li>
              <li>Hashtags (place at the end)</li>
            </ul>
            <p className="mt-2 text-xs">
              <strong>CSV Tip:</strong> If your description contains line breaks, make sure the entire field is properly quoted in your CSV file. 
              The system will preserve all formatting when uploading to YouTube.
            </p>
          </div>
        </div>
        <form onSubmit={handleCsvUpload} className="flex flex-col gap-5">
          <label htmlFor="csvFile" className="label">Upload CSV</label>
          <div 
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-red-500 transition-colors"
            onClick={() => csvFileInputRef.current?.click()}
          >
            <input
              ref={csvFileInputRef}
              type="file"
              id="csvFile"
              name="csvFile"
              accept=".csv"
              required
              className="hidden"
            />
            <div className="text-4xl mb-2">📄</div>
            <p className="text-gray-600 mb-1">Click to upload or drag and drop</p>
            <p className="text-sm text-gray-500">CSV files only</p>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-300 rounded-lg">
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={enableScheduling}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEnableScheduling(e.target.checked)}
                className="w-5 h-5 cursor-pointer"
              />
              <span className="font-medium text-gray-800">
                Enable Upload Scheduling (Spread uploads across multiple days)
              </span>
            </label>

            {enableScheduling && (
              <div className="flex flex-col gap-4 mt-4">
                <div>
                  <label htmlFor="videosPerDay" className="label">Videos Per Day</label>
                  <input
                    type="number"
                    id="videosPerDay"
                    min="1"
                    value={videosPerDay}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setVideosPerDay(e.target.value)}
                    placeholder="e.g., 5"
                    required={enableScheduling}
                    className="input-field"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Number of videos to upload per day. Uploads will start automatically from today and continue daily.
                  </p>
                </div>
                
                <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-sm text-yellow-800">
                  <strong>Note:</strong> When scheduling is enabled, uploads will start automatically from today. Videos are uploaded immediately but scheduled to publish on their assigned dates. All videos will be uploaded as private initially (required for scheduling), then updated to your CSV&apos;s privacyStatus if possible.
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={csvUploading}
            className={`btn-primary ${csvUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {csvUploading ? 'Uploading Files...' : 'Queue Upload Job'}
          </button>
        </form>
      </div>

      {/* Queue Status */}
      <div className="card">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Upload Queue Status</h2>
          {queue.length > 0 && (
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field w-full sm:max-w-xs"
            />
          )}
        </div>
        
        {queue.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-gray-600 text-lg">No upload jobs in queue.</p>
            <p className="text-gray-500 text-sm mt-2">Upload a CSV file to get started!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {queue
              .filter(job => 
                !searchQuery || 
                job.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                job.status.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((job) => (
              <div
                key={job.id}
                className={`p-5 border-2 rounded-xl cursor-pointer transition-all duration-200 ${
                  selectedJobId === job.id 
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-500 shadow-md' 
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-500 hover:shadow-md'
                }`}
                onClick={() => {
                  setSelectedJobId(job.id);
                  fetchJobStatus(job.id);
                }}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-3 h-3 rounded-full ${
                        job.status === 'completed' ? 'bg-green-500' : 
                        job.status === 'failed' ? 'bg-red-500' : 
                        job.status === 'processing' ? 'bg-yellow-500 animate-pulse-slow' : 
                        'bg-gray-400'
                      }`}></div>
                      <span className="font-mono text-sm text-gray-600 dark:text-gray-400">{job.id}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        job.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 
                        job.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : 
                        job.status === 'processing' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 
                        job.status === 'paused' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      }`}>
                        {job.status === 'completed' && '✓ '}
                        {job.status === 'failed' && '✕ '}
                        {job.status === 'processing' && '⚡ '}
                        {job.status === 'paused' && '⏸ '}
                        {job.status.toUpperCase()}
                      </span>
                      {job.totalVideos && (
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {job.totalVideos} video{job.totalVideos !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <div>📅 Created: {new Date(job.createdAt).toLocaleString()}</div>
                      {job.videosPerDay > 0 && (
                        <div>📊 Schedule: {job.videosPerDay} videos/day starting {new Date(job.startDate).toLocaleDateString()}</div>
                      )}
                    </div>
                    {/* Queue Management Actions */}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {job.status === 'pending' && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQueueAction(job.id, 'pause');
                            }}
                            className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            ⏸ Pause
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQueueAction(job.id, 'cancel');
                            }}
                            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            ✕ Cancel
                          </button>
                        </>
                      )}
                      {job.status === 'paused' && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQueueAction(job.id, 'resume');
                            }}
                            className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            ▶ Resume
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQueueAction(job.id, 'cancel');
                            }}
                            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            ✕ Cancel
                          </button>
                        </>
                      )}
                      {job.status === 'processing' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQueueAction(job.id, 'pause');
                          }}
                          className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          ⏸ Pause
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-2xl">
                    {selectedJobId === job.id ? '▼' : '▶'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedJobId && jobStatus && (
          <div className="mt-5 p-6 bg-gradient-to-br from-gray-50 to-blue-50 border-2 border-blue-200 rounded-xl shadow-inner">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                📋 Job Progress: {jobStatus.id}
              </h3>
              <button
                onClick={() => setSelectedJobId(null)}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ×
              </button>
            </div>
            {jobStatus.progress && jobStatus.progress.length > 0 ? (
              <div className="max-h-96 overflow-y-auto">
                <div className="space-y-2">
                  {jobStatus.progress.map((item: ProgressItem, idx: number) => {
                    const isSuccess = item.status.includes("Uploaded") || item.status.includes("Scheduled");
                    const isFailed = item.status.includes("Failed") || item.status.includes("Missing") || item.status.includes("Invalid");
                    const isProcessing = item.status.includes("Uploading") || item.status === "Pending";
                    
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border ${
                          isSuccess ? 'bg-green-50 border-green-200' :
                          isFailed ? 'bg-red-50 border-red-200' :
                          isProcessing ? 'bg-yellow-50 border-yellow-200' :
                          'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-800">Video {item.index + 1}</span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            isSuccess ? 'bg-green-100 text-green-800' :
                            isFailed ? 'bg-red-100 text-red-800' :
                            isProcessing ? 'bg-yellow-100 text-yellow-800 animate-pulse-slow' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {isProcessing && '⏳ '}
                            {isSuccess && '✓ '}
                            {isFailed && '✕ '}
                            {item.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">⏳</div>
                <p className="text-gray-600">No progress data available yet.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="text-center py-5 text-gray-500">
        &copy; 2025 ZonDiscounts. <Link href="/privacy" className="text-red-600 hover:underline">Privacy</Link> • <Link href="/terms" className="text-red-600 hover:underline">Terms</Link>
      </footer>
      </div>
    </div>
  );
}
