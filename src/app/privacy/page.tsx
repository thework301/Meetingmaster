export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border p-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-slate-500 text-sm mb-8">Last updated: January 2025</p>

        <div className="prose prose-slate max-w-none space-y-6 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">1. Data We Collect</h2>
            <p>Meeting Master collects the following categories of personal data:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Identity data:</strong> Your name and email address, obtained via Microsoft or Google SSO</li>
              <li><strong>Meeting content:</strong> Voice recordings (transcribed and immediately deleted from our provider), transcripts, summaries, and action items</li>
              <li><strong>Usage data:</strong> Meeting attendance, speaking time, last active date</li>
              <li><strong>Billing data:</strong> Processed by Stripe — we store only your Stripe customer ID</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">2. How We Use Your Data</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide and improve the Meeting Master service</li>
              <li>To generate AI-powered meeting summaries (via Anthropic Claude)</li>
              <li>To send transactional emails (action item reminders, summaries)</li>
              <li>To process payments (via Stripe)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">3. Data Storage & Security</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>All data is stored in Supabase (PostgreSQL) with AES-256 encryption at rest</li>
              <li>All data in transit is encrypted via HTTPS/TLS 1.3</li>
              <li>Voice recordings are streamed directly to Deepgram and deleted immediately after transcription</li>
              <li>Data is stored in the EU region</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">4. Data Retention</h2>
            <p>Meeting data is retained for the period configured by your company admin (default: 12 months). You can request deletion at any time.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">5. Your Rights (GDPR)</h2>
            <p>Under GDPR, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Access:</strong> Export all your data via Settings → Export Data</li>
              <li><strong>Erasure:</strong> Delete your account via Settings → Delete Account</li>
              <li><strong>Portability:</strong> Your data export is provided in JSON format</li>
              <li><strong>Objection:</strong> Contact us at privacy@meetingmaster.io</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">6. Third-Party Services</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Supabase:</strong> Database and authentication</li>
              <li><strong>Deepgram:</strong> Voice transcription (data deleted after processing)</li>
              <li><strong>Anthropic:</strong> AI summary generation</li>
              <li><strong>Resend:</strong> Transactional emails</li>
              <li><strong>Stripe:</strong> Payment processing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">7. Contact</h2>
            <p>For privacy enquiries, contact: <a href="mailto:privacy@meetingmaster.io" className="text-blue-600 underline">privacy@meetingmaster.io</a></p>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t">
          <a href="/dashboard" className="text-blue-600 hover:underline text-sm">← Back to Dashboard</a>
        </div>
      </div>
    </div>
  );
}
