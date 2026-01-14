import Link from 'next/link';

export default function Privacy() {
  return (
    <div className="bg-gray-50 text-gray-800 py-10 px-5">
      <div className="max-w-4xl mx-auto bg-white p-7 rounded-xl shadow-lg">
        <h1 className="text-3xl font-bold mb-4 text-gray-800">Privacy Policy</h1>
        <p className="mb-6"><strong>Effective date:</strong> 2025-12-29</p>

        <h3 className="text-xl font-semibold mb-3 mt-6">Google privacy</h3>
        <p className="mb-4">
          Google&apos;s privacy policy:
          <a href="http://www.google.com/policies/privacy" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline ml-1">
            http://www.google.com/policies/privacy
          </a>.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">Summary</h2>
        <p className="mb-4">
          <strong>ZonDiscounts</strong> (&quot;we&quot;, &quot;us&quot;) available at
          <a href="https://zondiscounts.com" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline ml-1"> zondiscounts.com</a> lets you upload
          videos to YouTube via your Google account. This policy explains what we
          collect, how we use it, and your choices.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">Information we collect</h2>
        <ul className="list-disc list-inside mb-4 space-y-2">
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

        <h2 className="text-2xl font-semibold mb-3 mt-6">How we use your data</h2>
        <ul className="list-disc list-inside mb-4 space-y-2">
          <li>Upload and manage videos using the YouTube Data API.</li>
          <li>Authenticate you and maintain your session.</li>
          <li>Debugging, monitoring, and improving service quality.</li>
        </ul>

        <h2 className="text-2xl font-semibold mb-3 mt-6">Sharing &amp; third parties</h2>
        <p className="mb-4">
          We do not sell your personal data. We may share data with service
          providers (hosting, analytics) who are contractually required to protect
          your data. Your interactions with YouTube are subject to Google&apos;s
          policies.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">Cookies &amp; local storage</h2>
        <p className="mb-4">
          We may store small pieces of information on your browser or device
          (cookies, localStorage) for session management and preferences.
          Third-party services we use (analytics, hosting) may also set cookies.
          You can manage or disable cookies through your browser settings.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">Data retention &amp; deletion</h2>
        <p className="mb-4">
          We store tokens and data while your account is active. You can delete
          your account or revoke access; we will remove your data within 30 days.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">Security</h2>
        <p className="mb-4">
          We use reasonable security measures (HTTPS, restricted access). No
          method is 100% secure.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">Your rights</h2>
        <p className="mb-4">
          Contact
          <a href="mailto:privacy@zondiscounts.com" className="text-red-600 hover:underline ml-1">privacy@zondiscounts.com</a> to access, correct, or request deletion of your data.
        </p>

        <h3 className="text-xl font-semibold mb-3 mt-6">Revoke access &amp; delete data</h3>
        <p className="mb-4">
          To revoke this app&apos;s access to your Google account, visit your Google
          account connections page:
          <a href="https://myaccount.google.com/connections?filters=3,4&hl=en" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline ml-1">
            https://myaccount.google.com/connections?filters=3,4&hl=en
          </a>. You can also request deletion of stored data by emailing
          <a href="mailto:privacy@zondiscounts.com" className="text-red-600 hover:underline ml-1">privacy@zondiscounts.com</a>
          or by using the account deletion action in your dashboard (POST
          <code className="bg-gray-100 px-1 rounded">/delete-account</code>). We will remove your data within 30 days
          after verification.
        </p>

        <footer className="mt-5 text-sm text-gray-500">
          <Link href="/terms" className="text-red-600 hover:underline">Terms</Link> • <Link href="/privacy" className="text-red-600 hover:underline">Privacy</Link>
        </footer>
      </div>
    </div>
  );
}
