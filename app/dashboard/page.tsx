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
    }, 5000); // Poll every 5 seconds
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
    
    // Add scheduling options if enabled
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.5rem', color: 'var(--secondary-color)' }}>ZonDiscounts Uploader Dashboard</h1>
        <div>
          <a
            href="/api/auth/logout"
            style={{
              background: 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '30px',
              padding: '10px 20px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '500',
              textDecoration: 'none',
              display: 'inline-block',
              marginRight: '10px',
            }}
          >
            Logout
          </a>
          <button
            onClick={handleDeleteAccount}
            style={{
              background: '#777',
              color: '#fff',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '30px',
              cursor: 'pointer',
            }}
          >
            Delete Account
          </button>
        </div>
      </div>

      {message.type && (
        <div style={{
          marginBottom: '20px',
          padding: '15px',
          borderRadius: '8px',
          fontWeight: '500',
          fontSize: '1rem',
          backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24',
          border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
        }}>
          {message.text}
        </div>
      )}

      {/* Statistics Dashboard - Always Visible */}
      {(() => {
        // Get all progress items from all jobs
        const allProgress = queue.flatMap(job => job.progress || []);
        
        // Calculate total videos - use totalVideos from jobs if available, otherwise use progress length
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
        
        // Calculate progress percentage
        const progressPercentage = totalVideos > 0 
          ? Math.round((completed / totalVideos) * 100) 
          : (completedJobs > 0 && queue.length === completedJobs ? 100 : 0);
        
        const remaining = totalVideos > 0 ? totalVideos - completed - failed : 0;
        
        // Show empty state if no jobs
        if (queue.length === 0) {
          return (
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '16px',
              boxShadow: '0 12px 40px rgba(102, 126, 234, 0.3)',
              padding: '50px 30px',
              marginBottom: '40px',
              textAlign: 'center',
              color: 'white',
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '20px' }}>📊</div>
              <h2 style={{ fontSize: '2.2rem', marginBottom: '15px', fontWeight: '700' }}>
                Welcome to Your Upload Dashboard
              </h2>
              <p style={{ fontSize: '1.1rem', opacity: 0.95, marginBottom: '30px', maxWidth: '600px', margin: '0 auto 30px' }}>
                Start uploading videos to see real-time statistics, progress tracking, and detailed analytics.
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '20px',
                maxWidth: '600px',
                margin: '0 auto',
                marginTop: '30px',
              }}>
                <div style={{ padding: '20px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>0</div>
                  <div style={{ fontSize: '0.9rem', opacity: 0.9, marginTop: '5px' }}>Total Videos</div>
                </div>
                <div style={{ padding: '20px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>0</div>
                  <div style={{ fontSize: '0.9rem', opacity: 0.9, marginTop: '5px' }}>Completed</div>
                </div>
                <div style={{ padding: '20px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>0</div>
                  <div style={{ fontSize: '0.9rem', opacity: 0.9, marginTop: '5px' }}>Jobs</div>
                </div>
              </div>
            </div>
          );
        }
        
        return (
          <div style={{
            background: 'var(--card-background)',
            borderRadius: '16px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.1)',
            padding: '40px',
            marginBottom: '40px',
            border: '1px solid rgba(0,0,0,0.05)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <h2 style={{ fontSize: '2.2rem', fontWeight: '700', color: 'var(--secondary-color)', margin: 0 }}>
                📊 Upload Statistics
              </h2>
              <div style={{
                padding: '8px 16px',
                background: processing > 0 ? '#fff3cd' : '#d4edda',
                borderRadius: '20px',
                fontSize: '0.9rem',
                fontWeight: '600',
                color: processing > 0 ? '#856404' : '#155724',
              }}>
                {processing > 0 ? '⚡ Processing' : '✓ Ready'}
              </div>
            </div>
            
            {/* Overall Progress Bar */}
            <div style={{ marginBottom: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontWeight: '500', color: 'var(--text-color)' }}>Overall Progress</span>
                <span style={{ fontWeight: '600', color: 'var(--secondary-color)' }}>{progressPercentage}%</span>
              </div>
              <div style={{
                width: '100%',
                height: '30px',
                background: '#e9ecef',
                borderRadius: '15px',
                overflow: 'hidden',
                position: 'relative',
              }}>
                <div style={{
                  width: `${progressPercentage}%`,
                  height: '100%',
                  background: progressPercentage === 100 ? '#28a745' : 'linear-gradient(90deg, #007bff, #0056b3)',
                  borderRadius: '15px',
                  transition: 'width 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                }}>
                  {progressPercentage > 0 && progressPercentage < 100 && `${progressPercentage}%`}
                  {progressPercentage === 100 && '✓ Complete'}
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '30px',
            }}>
              {/* Total Videos */}
              <div style={{
                padding: '20px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '12px',
                color: 'white',
                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
              }}>
                <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '8px' }}>Total Videos</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>{totalVideos}</div>
              </div>

              {/* Completed */}
              <div style={{
                padding: '20px',
                background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                borderRadius: '12px',
                color: 'white',
                boxShadow: '0 4px 15px rgba(17, 153, 142, 0.4)',
              }}>
                <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '8px' }}>Completed</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>{completed}</div>
                {totalVideos > 0 && (
                  <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '5px' }}>
                    {Math.round((completed / totalVideos) * 100)}% of total
                  </div>
                )}
              </div>

              {/* Pending */}
              <div style={{
                padding: '20px',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                borderRadius: '12px',
                color: 'white',
                boxShadow: '0 4px 15px rgba(240, 147, 251, 0.4)',
              }}>
                <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '8px' }}>Pending</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>{pending}</div>
                {totalVideos > 0 && (
                  <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '5px' }}>
                    {Math.round((pending / totalVideos) * 100)}% of total
                  </div>
                )}
              </div>

              {/* Failed */}
              <div style={{
                padding: '20px',
                background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                borderRadius: '12px',
                color: 'white',
                boxShadow: '0 4px 15px rgba(250, 112, 154, 0.4)',
              }}>
                <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '8px' }}>Failed</div>
                <div style={{ fontSize: '2.5rem', fontWeight: '700' }}>{failed}</div>
                {totalVideos > 0 && (
                  <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '5px' }}>
                    {Math.round((failed / totalVideos) * 100)}% of total
                  </div>
                )}
              </div>
            </div>

            {/* Job Status Summary */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '15px',
              padding: '20px',
              background: '#f8f9fa',
              borderRadius: '10px',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#667eea' }}>{queue.length}</div>
                <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '5px' }}>Total Jobs</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#11998e' }}>{completedJobs}</div>
                <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '5px' }}>Completed</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f5576c' }}>{processing}</div>
                <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '5px' }}>Processing</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#fee140' }}>{pendingJobs}</div>
                <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '5px' }}>Pending</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#fa709a' }}>{failedJobs}</div>
                <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '5px' }}>Failed</div>
              </div>
            </div>

            {/* Remaining Videos */}
            {remaining > 0 && (
              <div style={{
                marginTop: '25px',
                padding: '15px',
                background: remaining > 0 ? '#fff3cd' : '#d4edda',
                border: `1px solid ${remaining > 0 ? '#ffc107' : '#28a745'}`,
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <div style={{ 
                  fontSize: '1.1rem', 
                  fontWeight: '600', 
                  color: remaining > 0 ? '#856404' : '#155724', 
                  marginBottom: '5px' 
                }}>
                  {remaining > 0 ? `${remaining} videos remaining` : 'All videos processed!'}
                </div>
                {remaining > 0 && (
                  <div style={{ fontSize: '0.9rem', color: '#856404' }}>
                    {processing > 0 ? 'Worker is processing videos...' : 'Waiting for worker to process...'}
                  </div>
                )}
              </div>
            )}
            
            {/* Summary */}
            {totalVideos === 0 && queue.length > 0 && (
              <div style={{
                marginTop: '25px',
                padding: '15px',
                background: '#e7f3ff',
                border: '1px solid #b3d9ff',
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.95rem', color: '#004085' }}>
                  Jobs are queued. Statistics will appear once processing begins.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Profile Section - Moved below statistics */}
      <div style={{
        background: 'var(--card-background)',
        borderRadius: '12px',
        boxShadow: '0 8px 24px var(--shadow-color)',
        padding: '30px',
        marginBottom: '40px',
      }}>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', color: 'var(--secondary-color)' }}>Profile</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <img
            src={user.picture}
            alt={user.name}
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '3px solid var(--primary-color)',
            }}
          />
          <p style={{ fontSize: '1.1rem', color: 'var(--text-color)' }}>
            <strong>Name:</strong> {user.name}
          </p>
        </div>
      </div>

      <div style={{
        background: 'var(--card-background)',
        borderRadius: '12px',
        boxShadow: '0 8px 24px var(--shadow-color)',
        padding: '30px',
        marginBottom: '40px',
      }}>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', color: 'var(--secondary-color)' }}>Single Video Upload</h2>
        <form onSubmit={handleSingleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <label htmlFor="title" style={{ fontWeight: '500', color: 'var(--secondary-color)' }}>Title</label>
          <input
            type="text"
            id="title"
            name="title"
            placeholder="Enter video title"
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '1rem',
            }}
          />

          <label htmlFor="description" style={{ fontWeight: '500', color: 'var(--secondary-color)' }}>Description</label>
          <textarea
            id="description"
            name="description"
            placeholder="Enter video description"
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '1rem',
              resize: 'vertical',
              minHeight: '100px',
            }}
          />

          <label htmlFor="video" style={{ fontWeight: '500', color: 'var(--secondary-color)' }}>Choose File</label>
          <input
            type="file"
            id="video"
            name="video"
            accept="video/*"
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '1rem',
            }}
          />

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="publishDate" style={{ fontWeight: '500', color: 'var(--secondary-color)' }}>Schedule Publish Date</label>
              <input
                type="datetime-local"
                id="publishDate"
                name="publishDate"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '1rem',
                }}
              />
            </div>
          </div>

          <label htmlFor="privacyStatus" style={{ fontWeight: '500', color: 'var(--secondary-color)' }}>Privacy Status</label>
          <select
            id="privacyStatus"
            name="privacyStatus"
            defaultValue="public"
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '1rem',
              marginBottom: '20px',
            }}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="unlisted">Unlisted</option>
          </select>

          <button
            type="submit"
            disabled={uploading}
            style={{
              background: uploading ? '#ccc' : 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '30px',
              padding: '14px 28px',
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: '1.1rem',
              fontWeight: '500',
            }}
          >
            {uploading ? 'Uploading...' : 'Upload Video'}
          </button>
        </form>
      </div>

      <div style={{
        background: 'var(--card-background)',
        borderRadius: '12px',
        boxShadow: '0 8px 24px var(--shadow-color)',
        padding: '30px',
        marginBottom: '40px',
      }}>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', color: 'var(--secondary-color)' }}>Batch Upload from CSV (Background Processing)</h2>
        <div style={{ marginBottom: '20px', padding: '15px', background: '#e7f3ff', borderRadius: '8px', border: '1px solid #b3d9ff' }}>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#004085' }}>
            <strong>New Background Processing System:</strong> Upload your CSV and video files to the server. 
            The system will process them in the background, uploading X videos per day automatically. 
            You can close your browser and check status later.
          </p>
        </div>
        <div style={{ marginBottom: '10px', fontSize: '13px' }}>
          <h3>CSV File Instructions</h3>
          <p>Your CSV file should include the following columns:</p>
          <ul>
            <li><strong>youtube_title:</strong> The title of your video (required)</li>
            <li><strong>youtube_description:</strong> A detailed description of your video (required)</li>
            <li><strong>thumbnail_path:</strong> File path to the video thumbnail image (optional)</li>
            <li><strong>video:</strong> File path to the video file on your server (required)</li>
            <li><strong>scheduleTime:</strong> The date and time to publish the video with. (yyyy-MM-dd HH:mm) (optional)</li>
            <li><strong>privacyStatus:</strong> Must be &apos;public&apos;, &apos;private&apos;, or &apos;unlisted&apos; (defaults to &apos;public&apos;)</li>
          </ul>
          <p style={{ color: '#555', fontSize: '0.95rem' }}>
            <strong>Important:</strong> The <code>video</code> and <code>thumbnail_path</code> columns should contain 
            absolute file paths on your server. Files will be copied to server storage when you submit the form.
          </p>
        </div>
        <form onSubmit={handleCsvUpload} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <label htmlFor="csvFile" style={{ fontWeight: '500', color: 'var(--secondary-color)' }}>Upload CSV</label>
          <input
            type="file"
            id="csvFile"
            name="csvFile"
            accept=".csv"
            required
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '1rem',
            }}
          />

          <div style={{
            padding: '15px',
            background: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enableScheduling}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEnableScheduling(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontWeight: '500', color: 'var(--secondary-color)' }}>
                Enable Upload Scheduling (Spread uploads across multiple days)
              </span>
            </label>

            {enableScheduling && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
                <div>
                  <label htmlFor="videosPerDay" style={{ fontWeight: '500', color: 'var(--secondary-color)', display: 'block', marginBottom: '5px' }}>
                    Videos Per Day
                  </label>
                  <input
                    type="number"
                    id="videosPerDay"
                    min="1"
                    value={videosPerDay}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setVideosPerDay(e.target.value)}
                    placeholder="e.g., 5"
                    required={enableScheduling}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      fontSize: '1rem',
                    }}
                  />
                  <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '5px' }}>
                    Number of videos to upload per day. Videos will be scheduled starting from the start date.
                  </p>
                </div>

                <div>
                  <label htmlFor="scheduleStartDate" style={{ fontWeight: '500', color: 'var(--secondary-color)', display: 'block', marginBottom: '5px' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    id="scheduleStartDate"
                    value={scheduleStartDate}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setScheduleStartDate(e.target.value)}
                    required={enableScheduling}
                    min={new Date().toISOString().split('T')[0]}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      fontSize: '1rem',
                    }}
                  />
                  <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '5px' }}>
                    First day to start uploading videos. Videos will be distributed across days based on &quot;Videos Per Day&quot;.
                  </p>
                </div>
                
                <div style={{
                  padding: '10px',
                  background: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  color: '#856404',
                }}>
                  <strong>Note:</strong> When scheduling is enabled, videos are uploaded immediately but scheduled to publish on their assigned dates. All videos will be uploaded as private initially (required for scheduling), then updated to your CSV&apos;s privacyStatus if possible.
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={csvUploading}
            style={{
              background: csvUploading ? '#ccc' : 'var(--primary-color)',
              color: 'white',
              border: 'none',
              borderRadius: '30px',
              padding: '14px 28px',
              cursor: csvUploading ? 'not-allowed' : 'pointer',
              fontSize: '1.1rem',
              fontWeight: '500',
            }}
          >
            {csvUploading ? 'Uploading Files...' : 'Queue Upload Job'}
          </button>
        </form>
      </div>

      {/* Queue Status Section */}
      <div style={{
        background: 'var(--card-background)',
        borderRadius: '12px',
        boxShadow: '0 8px 24px var(--shadow-color)',
        padding: '30px',
        marginBottom: '40px',
      }}>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', color: 'var(--secondary-color)' }}>Upload Queue Status</h2>
        
        {queue.length === 0 ? (
          <p style={{ color: '#666' }}>No upload jobs in queue.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {queue.map((job) => (
              <div
                key={job.id}
                style={{
                  padding: '15px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  background: selectedJobId === job.id ? '#f0f8ff' : 'white',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setSelectedJobId(job.id);
                  fetchJobStatus(job.id);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>Job ID:</strong> {job.id}
                    <br />
                    <strong>Status:</strong> 
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      marginLeft: '8px',
                      background: job.status === 'completed' ? '#d4edda' : 
                                  job.status === 'failed' ? '#f8d7da' : 
                                  job.status === 'processing' ? '#fff3cd' : '#e2e3e5',
                      color: job.status === 'completed' ? '#155724' : 
                             job.status === 'failed' ? '#721c24' : 
                             job.status === 'processing' ? '#856404' : '#383d41',
                    }}>
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
          <div style={{
            marginTop: '20px',
            padding: '20px',
            background: '#f8f9fa',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
          }}>
            <h3 style={{ marginBottom: '15px', color: 'var(--secondary-color)' }}>
              Job Progress: {jobStatus.id}
            </h3>
            {jobStatus.progress && jobStatus.progress.length > 0 ? (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {jobStatus.progress.map((item: ProgressItem, idx: number) => (
                    <li
                      key={idx}
                      style={{
                        padding: '8px',
                        borderBottom: idx < jobStatus.progress.length - 1 ? '1px solid #ddd' : 'none',
                        fontSize: '0.9rem',
                      }}
                    >
                      Video {item.index + 1}: {item.status}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={{ color: '#666' }}>No progress data available yet.</p>
            )}
          </div>
        )}
      </div>

      <footer style={{ textAlign: 'center', padding: '20px 0', color: '#777' }}>
        &copy; 2025 ZonDiscounts. <Link href="/privacy">Privacy</Link> • <Link href="/terms">Terms</Link>
      </footer>
    </div>
  );
}

