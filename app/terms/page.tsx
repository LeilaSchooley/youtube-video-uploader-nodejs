import Link from 'next/link';

export default function Terms() {
  return (
    <div style={{
      fontFamily: '"Roboto", Arial, sans-serif',
      background: '#f9f9f9',
      color: '#333',
      margin: 0,
      padding: '40px',
    }}>
      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
        background: '#fff',
        padding: '28px',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.06)',
      }}>
        <h1 style={{ color: '#282828' }}>Terms of Service</h1>
        <p><strong>Effective date:</strong> 2025-12-29</p>

        <h2>1. Acceptance</h2>
        <p>
          By using <strong>ZonDiscounts</strong> (&quot;we&quot;, &quot;us&quot;), available at
          <a href="https://zondiscounts.com" target="_blank" rel="noopener noreferrer"> zondiscounts.com</a>, you agree to
          these Terms.
        </p>
        <p>
          By using the uploader or any YouTube integration provided by
          ZonDiscounts, you also agree to be bound by the
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer"> YouTube Terms of Service</a>.
        </p>

        <h2>2. Service</h2>
        <p>
          We provide a service to upload and manage videos on YouTube using your
          Google account and the YouTube Data API.
        </p>

        <h2>3. User obligations</h2>
        <ul>
          <li>
            You must own the rights to content you upload and comply with
            YouTube&apos;s policies and copyright laws.
          </li>
          <li>
            You may not misuse the service (no spam, malware, or infringing
            content).
          </li>
        </ul>

        <h3>Privacy status confirmation</h3>
        <p>
          You must explicitly select the video&apos;s privacy status (Private,
          Unlisted, or Public) before uploading. The uploader will confirm the
          selected privacy status and will validate it server-side prior to
          attempting uploads.
        </p>

        <h2>4. Third-party APIs</h2>
        <p>
          The service uses Google APIs; your use is subject to Google&apos;s Terms of
          Service and API policies.
        </p>

        <h2>5. Liability</h2>
        <p>
          We provide the service &quot;as is&quot;. We are not liable for your content or
          any damages beyond applicable law.
        </p>

        <h2>6. Termination</h2>
        <p>
          We may suspend or terminate access for violations or inactivity. You may
          revoke app access via Google account permissions.
        </p>

        <h2>7. Changes</h2>
        <p>
          We may change these Terms; we&apos;ll post updates here with an effective
          date.
        </p>

        <p>
          Contact:
          <strong>
            <a href="mailto:contact@zondiscounts.com">contact@zondiscounts.com</a>
          </strong>
        </p>

        <footer style={{
          marginTop: '20px',
          fontSize: '0.9rem',
          color: '#777',
        }}>
          <Link href="/terms">Terms</Link> • <Link href="/privacy">Privacy</Link>
        </footer>
      </div>
      <link
        href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
    </div>
  );
}

