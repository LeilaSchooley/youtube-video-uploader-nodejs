import Link from 'next/link';

export default function Privacy() {
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
        <h1 style={{ color: '#282828' }}>Privacy Policy</h1>
        <p><strong>Effective date:</strong> 2025-12-29</p>

        <h3>Google privacy</h3>
        <p>
          Google&apos;s privacy policy:
          <a href="http://www.google.com/policies/privacy" target="_blank" rel="noopener noreferrer">
            http://www.google.com/policies/privacy
          </a>.
        </p>

        <h2>Summary</h2>
        <p>
          <strong>ZonDiscounts</strong> (&quot;we&quot;, &quot;us&quot;) available at
          <a href="https://zondiscounts.com" target="_blank" rel="noopener noreferrer"> zondiscounts.com</a> lets you upload
          videos to YouTube via your Google account. This policy explains what we
          collect, how we use it, and your choices.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Google account info:</strong> name, email, basic profile from
            Google OAuth.
          </li>
          <li>
            <strong>OAuth tokens:</strong> access and refresh tokens to call the
            YouTube Data API.
          </li>
          <li>
            <strong>User content metadata:</strong> video titles, descriptions,
            tags and upload history.
          </li>
          <li>
            <strong>Logs:</strong> usage and error logs for debugging and
            security.
          </li>
        </ul>

        <h2>How we use your data</h2>
        <ul>
          <li>Upload and manage videos using the YouTube Data API.</li>
          <li>Authenticate you and maintain your session.</li>
          <li>Debugging, monitoring, and improving service quality.</li>
        </ul>

        <h2>Sharing &amp; third parties</h2>
        <p>
          We do not sell your personal data. We may share data with service
          providers (hosting, analytics) who are contractually required to protect
          your data. Your interactions with YouTube are subject to Google&apos;s
          policies.
        </p>

        <h2>Cookies &amp; local storage</h2>
        <p>
          We may store small pieces of information on your browser or device
          (cookies, localStorage) for session management and preferences.
          Third-party services we use (analytics, hosting) may also set cookies.
          You can manage or disable cookies through your browser settings.
        </p>

        <h2>Data retention &amp; deletion</h2>
        <p>
          We store tokens and data while your account is active. You can delete
          your account or revoke access; we will remove your data within 30 days.
        </p>

        <h2>Security</h2>
        <p>
          We use reasonable security measures (HTTPS, restricted access). No
          method is 100% secure.
        </p>

        <h2>Your rights</h2>
        <p>
          Contact
          <a href="mailto:privacy@zondiscounts.com">privacy@zondiscounts.com</a> to access, correct, or request deletion of your data.
        </p>

        <h3>Revoke access &amp; delete data</h3>
        <p>
          To revoke this app&apos;s access to your Google account, visit your Google
          account connections page:
          <a href="https://myaccount.google.com/connections?filters=3,4&hl=en" target="_blank" rel="noopener noreferrer">
            https://myaccount.google.com/connections?filters=3,4&hl=en
          </a>. You can also request deletion of stored data by emailing
          <a href="mailto:privacy@zondiscounts.com">privacy@zondiscounts.com</a>
          or by using the account deletion action in your dashboard (POST
          <code>/delete-account</code>). We will remove your data within 30 days
          after verification.
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

