import Link from 'next/link';

export default function Terms() {
  return (
    <div className="bg-gray-50 text-gray-800 py-10 px-5">
      <div className="max-w-4xl mx-auto bg-white p-7 rounded-xl shadow-lg">
        <h1 className="text-3xl font-bold mb-4 text-gray-800">Terms of Service</h1>
        <p className="mb-6"><strong>Effective date:</strong> 2025-12-29</p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">1. Acceptance</h2>
        <p className="mb-4">
          By using <strong>ZonDiscounts</strong> (&quot;we&quot;, &quot;us&quot;), available at
          <a href="https://zondiscounts.com" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline ml-1"> zondiscounts.com</a>, you agree to
          these Terms.
        </p>
        <p className="mb-4">
          By using the uploader or any YouTube integration provided by
          ZonDiscounts, you also agree to be bound by the
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline ml-1"> YouTube Terms of Service</a>.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">2. Service</h2>
        <p className="mb-4">
          We provide a service to upload and manage videos on YouTube using your
          Google account and the YouTube Data API.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">3. User obligations</h2>
        <ul className="list-disc list-inside mb-4 space-y-2">
          <li>
            You must own the rights to content you upload and comply with
            YouTube&apos;s policies and copyright laws.
          </li>
          <li>
            You may not misuse the service (no spam, malware, or infringing
            content).
          </li>
        </ul>

        <h3 className="text-xl font-semibold mb-3 mt-6">Privacy status confirmation</h3>
        <p className="mb-4">
          You must explicitly select the video&apos;s privacy status (Private,
          Unlisted, or Public) before uploading. The uploader will confirm the
          selected privacy status and will validate it server-side prior to
          attempting uploads.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">4. Third-party APIs</h2>
        <p className="mb-4">
          The service uses Google APIs; your use is subject to Google&apos;s Terms of
          Service and API policies.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">5. Liability</h2>
        <p className="mb-4">
          We provide the service &quot;as is&quot;. We are not liable for your content or
          any damages beyond applicable law.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">6. Termination</h2>
        <p className="mb-4">
          We may suspend or terminate access for violations or inactivity. You may
          revoke app access via Google account permissions.
        </p>

        <h2 className="text-2xl font-semibold mb-3 mt-6">7. Changes</h2>
        <p className="mb-4">
          We may change these Terms; we&apos;ll post updates here with an effective
          date.
        </p>

        <p className="mb-4">
          Contact:
          <strong>
            <a href="mailto:contact@zondiscounts.com" className="text-red-600 hover:underline ml-1">contact@zondiscounts.com</a>
          </strong>
        </p>

        <footer className="mt-5 text-sm text-gray-500">
          <Link href="/terms" className="text-red-600 hover:underline">Terms</Link> • <Link href="/privacy" className="text-red-600 hover:underline">Privacy</Link>
        </footer>
      </div>
    </div>
  );
}
