export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border p-10">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-slate-500 text-sm mb-8">Last updated: January 2025</p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">1. Acceptance</h2>
            <p>By using Meeting Master, you agree to these Terms of Service. If you do not agree, do not use the service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">2. Service Description</h2>
            <p>Meeting Master provides AI-powered meeting management tools including voice transcription, summary generation, and action item tracking.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">3. Acceptable Use</h2>
            <p>You must not use Meeting Master to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Record meetings without the consent of all participants</li>
              <li>Violate any applicable laws or regulations</li>
              <li>Attempt to reverse-engineer or circumvent security measures</li>
              <li>Share account credentials with unauthorised parties</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">4. Recording Consent</h2>
            <p>You are responsible for ensuring all meeting participants consent to being recorded and transcribed before starting a Meeting Master session. Recording laws vary by jurisdiction.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">5. Subscription & Billing</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Free plan: limited to 5 meetings/month</li>
              <li>Paid plans are billed monthly via Stripe</li>
              <li>Cancel at any time via Admin Settings → Manage Billing</li>
              <li>No refunds for partial months</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">6. Intellectual Property</h2>
            <p>Meeting content (transcripts, summaries) belongs to you. Meeting Master's code, design, and AI models are proprietary.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">7. Limitation of Liability</h2>
            <p>Meeting Master is provided &quot;as is&quot;. We are not liable for any direct, indirect, incidental, or consequential damages arising from use of the service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">8. Contact</h2>
            <p>For queries: <a href="mailto:legal@meetingmaster.io" className="text-blue-600 underline">legal@meetingmaster.io</a></p>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t">
          <a href="/dashboard" className="text-blue-600 hover:underline text-sm">← Back to Dashboard</a>
        </div>
      </div>
    </div>
  );
}
