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

  useEffect(() => {
    fetchUser();
  }, []);

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
    setShowProgress(true);
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
      const res = await fetch('/api/upload-csv', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.status === 'success') {
        setProgress(data.progress);
        setMessage({ type: 'success', text: 'CSV upload completed!' });
      } else {
        setMessage({ type: 'error', text: data.message || 'Error uploading CSV' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred while uploading the CSV file.' });
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
            <option value="private">Private</option>
            <option value="public">Public</option>
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
        <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', color: 'var(--secondary-color)' }}>Batch Upload from CSV</h2>
        <div style={{ marginBottom: '10px', fontSize: '13px' }}>
          <h3>CSV File Instructions</h3>
          <p>Your CSV file should include the following columns:</p>
          <ul>
            <li><strong>youtube_title:</strong> The title of your video (required)</li>
            <li><strong>youtube_description:</strong> A detailed description of your video (required)</li>
            <li><strong>thumbnail_path:</strong> File path to the video thumbnail image (optional)</li>
            <li><strong>video:</strong> File path to the video file (required)</li>
            <li><strong>scheduleTime:</strong> The date and time to publish the video with. (yyyy-MM-dd HH:mm) (optional)</li>
            <li><strong>privacyStatus:</strong> Must be &apos;public&apos;, &apos;private&apos;, or &apos;unlisted&apos; (required)</li>
          </ul>
          <p style={{ color: '#555', fontSize: '0.95rem' }}>
            The uploader will validate the <code>privacyStatus</code> values
            server-side and will reject rows with invalid values. Also ensure
            scheduled publish times (for private) are in the future.
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
            {csvUploading ? 'Uploading...' : 'Upload Videos from CSV'}
          </button>
        </form>

        {showProgress && progress.length > 0 && (
          <div style={{
            background: '#f1f1f1',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '20px',
            marginTop: '20px',
          }}>
            <h3 style={{ marginBottom: '15px', color: 'var(--secondary-color)' }}>Upload Progress</h3>
            <ul style={{ listStyle: 'none' }}>
              {progress.map((item, idx) => (
                <li
                  key={idx}
                  style={{
                    padding: '10px',
                    borderBottom: idx < progress.length - 1 ? '1px solid var(--border-color)' : 'none',
                    fontSize: '1rem',
                  }}
                >
                  Video {item.index + 1}: {item.status}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer style={{ textAlign: 'center', padding: '20px 0', color: '#777' }}>
        &copy; 2025 ZonDiscounts. <Link href="/privacy">Privacy</Link> • <Link href="/terms">Terms</Link>
      </footer>
    </div>
  );
}

