'use client';

import { useEffect, useState, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  authenticated: boolean;
  name: string;
  picture: string;
}

interface Message {
  type: 'success' | 'error' | null;
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
  const [scheduleStartDate, setScheduleStartDate] = useState<string>('');
  const [enableScheduling, setEnableScheduling] = useState<boolean>(false);
  const [queue, setQueue] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);

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

    const formData = new FormData(e.currentTarget);
    const privacy = formData.get('privacyStatus') as string;
    
    if (!confirm(`You have selected "${privacy}" as the video's privacy status. Proceed with upload?`)) {
      setUploading(false);
      return;
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message || 'Video uploaded successfully!' });
        e.currentTarget.reset();
      } else {
        setMessage({ type: 'error', text: data.error || 'Error uploading video' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred while uploading the video.' });
    } finally {
      setUploading(false);
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
      if (!videosPerDay || !scheduleStartDate) {
        setMessage({ type: 'error', text: 'Please fill in videos per day and start date when scheduling is enabled.' });
        setCsvUploading(false);
        return;
      }
      formData.append('videosPerDay', videosPerDay);
      formData.append('scheduleStartDate', scheduleStartDate);
      formData.append('enableScheduling', 'true');
    }

    try {
      const res = await fetch('/api/upload-queue', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: `Files uploaded and queued! Job ID: ${data.jobId}. The worker will process ${data.totalVideos} videos.` });
        e.currentTarget.reset();
        setEnableScheduling(false);
        setVideosPerDay('');
        setScheduleStartDate('');
        fetchQueue();
        setSelectedJobId(data.jobId);
        fetchJobStatus(data.jobId);
      } else {
        setMessage({ type: 'error', text: data.error || 'Error uploading files' });
      }
    } catch (error) {
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
      <div className="flex justify-center items-center min-h-screen">
        <div>Loading...</div>
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
    <div className="max-w-7xl mx-auto px-5 py-10">
      {/* Header */}
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-bold text-gray-800">ZonDiscounts Uploader Dashboard</h1>
        <div className="flex gap-2">
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

      {/* Message */}
      {message.type && (
        <div className={`mb-5 p-4 rounded-lg font-medium ${
          message.type === 'success' 
            ? 'bg-green-100 text-green-800 border border-green-200' 
            : 'bg-red-100 text-red-800 border border-red-200'
        }`}>
          {message.text}
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
        <div className="card border border-gray-100">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800">📊 Upload Statistics</h2>
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
        <h2 className="text-2xl font-bold mb-5 text-gray-800">Profile</h2>
        <div className="flex items-center gap-5">
          <img
            src={user.picture}
            alt={user.name}
            className="w-24 h-24 rounded-full object-cover border-4 border-red-600"
          />
          <p className="text-lg text-gray-700">
            <strong>Name:</strong> {user.name}
          </p>
        </div>
      </div>

      {/* Single Video Upload */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-5 text-gray-800">Single Video Upload</h2>
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
          <input
            type="file"
            id="video"
            name="video"
            accept="video/*"
            required
            className="input-field"
          />

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
        <h2 className="text-2xl font-bold mb-5 text-gray-800">Batch Upload from CSV (Background Processing)</h2>
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
            <li><strong>video:</strong> File path to the video file on your server (required)</li>
            <li><strong>scheduleTime:</strong> The date and time to publish the video with. (yyyy-MM-dd HH:mm) (optional)</li>
            <li><strong>privacyStatus:</strong> Must be &apos;public&apos;, &apos;private&apos;, or &apos;unlisted&apos; (defaults to &apos;public&apos;)</li>
          </ul>
          <p className="text-gray-600 text-sm">
            <strong>Important:</strong> The <code className="bg-gray-100 px-1 rounded">video</code> and <code className="bg-gray-100 px-1 rounded">thumbnail_path</code> columns should contain 
            absolute file paths on your server. Files will be copied to server storage when you submit the form.
          </p>
        </div>
        <form onSubmit={handleCsvUpload} className="flex flex-col gap-5">
          <label htmlFor="csvFile" className="label">Upload CSV</label>
          <input
            type="file"
            id="csvFile"
            name="csvFile"
            accept=".csv"
            required
            className="input-field"
          />

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
                    Number of videos to upload per day. Videos will be scheduled starting from the start date.
                  </p>
                </div>

                <div>
                  <label htmlFor="scheduleStartDate" className="label">Start Date</label>
                  <input
                    type="date"
                    id="scheduleStartDate"
                    value={scheduleStartDate}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setScheduleStartDate(e.target.value)}
                    required={enableScheduling}
                    min={new Date().toISOString().split('T')[0]}
                    className="input-field"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    First day to start uploading videos. Videos will be distributed across days based on &quot;Videos Per Day&quot;.
                  </p>
                </div>
                
                <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-sm text-yellow-800">
                  <strong>Note:</strong> When scheduling is enabled, videos are uploaded immediately but scheduled to publish on their assigned dates. All videos will be uploaded as private initially (required for scheduling), then updated to your CSV&apos;s privacyStatus if possible.
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
        <h2 className="text-2xl font-bold mb-5 text-gray-800">Upload Queue Status</h2>
        
        {queue.length === 0 ? (
          <p className="text-gray-600">No upload jobs in queue.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {queue.map((job) => (
              <div
                key={job.id}
                className={`p-4 border border-gray-300 rounded-lg cursor-pointer transition-colors ${
                  selectedJobId === job.id ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
                }`}
                onClick={() => {
                  setSelectedJobId(job.id);
                  fetchJobStatus(job.id);
                }}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <strong>Job ID:</strong> {job.id}
                    <br />
                    <strong>Status:</strong> 
                    <span className={`px-2 py-1 rounded ml-2 ${
                      job.status === 'completed' ? 'bg-green-100 text-green-800' : 
                      job.status === 'failed' ? 'bg-red-100 text-red-800' : 
                      job.status === 'processing' ? 'bg-yellow-100 text-yellow-800' : 
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {job.status.toUpperCase()}
                    </span>
                    <br />
                    <strong>Created:</strong> {new Date(job.createdAt).toLocaleString()}
                    {job.videosPerDay > 0 && (
                      <>
                        <br />
                        <strong>Schedule:</strong> {job.videosPerDay} videos/day starting {new Date(job.startDate).toLocaleDateString()}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedJobId && jobStatus && (
          <div className="mt-5 p-5 bg-gray-50 border border-gray-300 rounded-lg">
            <h3 className="mb-4 text-gray-800 font-semibold">
              Job Progress: {jobStatus.id}
            </h3>
            {jobStatus.progress && jobStatus.progress.length > 0 ? (
              <div className="max-h-96 overflow-y-auto">
                <ul className="list-none p-0">
                  {jobStatus.progress.map((item: ProgressItem, idx: number) => (
                    <li
                      key={idx}
                      className={`py-2 text-sm ${
                        idx < jobStatus.progress.length - 1 ? 'border-b border-gray-200' : ''
                      }`}
                    >
                      Video {item.index + 1}: {item.status}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-gray-600">No progress data available yet.</p>
            )}
          </div>
        )}
      </div>

      <footer className="text-center py-5 text-gray-500">
        &copy; 2025 ZonDiscounts. <Link href="/privacy" className="text-red-600 hover:underline">Privacy</Link> • <Link href="/terms" className="text-red-600 hover:underline">Terms</Link>
      </footer>
    </div>
  );
}
