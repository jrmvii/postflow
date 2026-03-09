export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: March 9, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Overview</h2>
        <p className="text-gray-700 leading-relaxed">
          Postflow is a social media management tool operated by Worldtown. This
          policy describes how we collect, use, and protect your data when you
          use our service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Data We Collect</h2>
        <ul className="list-disc pl-6 text-gray-700 space-y-2">
          <li>
            <strong>Account information:</strong> email address and name when
            you register.
          </li>
          <li>
            <strong>LinkedIn data:</strong> when you connect your LinkedIn
            account, we access your profile name, email, profile picture, and
            the list of company pages you administer.
          </li>
          <li>
            <strong>OAuth tokens:</strong> LinkedIn access and refresh tokens
            are stored encrypted (AES-256-GCM) and used solely to publish
            content on your behalf.
          </li>
          <li>
            <strong>Content:</strong> posts you create and schedule through
            Postflow.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. How We Use Your Data</h2>
        <p className="text-gray-700 leading-relaxed">
          Your data is used exclusively to provide the Postflow service:
          publishing and scheduling posts to your LinkedIn profile and company
          pages. We do not sell, share, or transfer your data to third parties.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Data Security</h2>
        <p className="text-gray-700 leading-relaxed">
          All OAuth tokens are encrypted at rest using AES-256-GCM. The
          application is hosted on private infrastructure with HTTPS enforced.
          Access to the database is restricted to the application server.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Data Retention</h2>
        <p className="text-gray-700 leading-relaxed">
          You can disconnect your LinkedIn account at any time, which deletes
          your stored tokens. You can request full account deletion by
          contacting us.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Contact</h2>
        <p className="text-gray-700 leading-relaxed">
          For any questions about this privacy policy, contact us at{" "}
          <a
            href="mailto:info@wtco.io"
            className="text-blue-600 hover:underline"
          >
            info@wtco.io
          </a>
          .
        </p>
      </section>
    </div>
  );
}
