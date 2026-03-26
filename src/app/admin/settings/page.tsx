'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CreditCard, Globe, Shield, Sliders, Bell } from 'lucide-react';
import Link from 'next/link';

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<{
    id: string; name: string; plan: string; seats_purchased: number;
    seats_used: number; billing_email: string; data_retention_months: number;
    stripe_customer_id: string | null;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  // Settings toggles
  const [settings, setSettings] = useState({
    transcription_enabled: true,
    auto_summary_enabled: true,
    send_absent_email: true,
    send_action_item_emails: true,
    escalation_enabled: true,
    weekly_digest_enabled: true,
    data_retention_months: 12,
    require_intro_for_guests: true,
  });

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: user } = await supabase
        .from('users')
        .select('company_id')
        .eq('id', session.user.id)
        .single();

      if (!user) return;

      const { data: companyData } = await supabase
        .from('companies')
        .select('*')
        .eq('id', user.company_id)
        .single();

      if (companyData) {
        setCompany(companyData);
        setSettings(prev => ({ ...prev, data_retention_months: companyData.data_retention_months }));
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    if (!company) return;
    setSaving(true);
    const { error } = await supabase
      .from('companies')
      .update({ data_retention_months: settings.data_retention_months })
      .eq('id', company.id);

    if (error) {
      toast({ title: 'Error saving settings', variant: 'destructive' });
    } else {
      toast({ title: 'Settings saved' });
    }
    setSaving(false);
  };

  const handleBillingPortal = async () => {
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  const handleUpgrade = (plan: string) => {
    window.location.href = `/api/stripe/checkout?plan=${plan}`;
  };

  const handleDeleteCompany = async () => {
    if (deleteConfirm !== company?.name) {
      toast({ title: 'Company name does not match', variant: 'destructive' });
      return;
    }
    const res = await fetch('/api/admin/delete-company', { method: 'DELETE' });
    if (res.ok) {
      await supabase.auth.signOut();
      window.location.href = '/login';
    } else {
      toast({ title: 'Failed to delete company', variant: 'destructive' });
    }
  };

  const seatUsagePercent = company ? Math.round((company.seats_used / company.seats_purchased) * 100) : 0;

  const planFeatures = {
    free: ['5 meetings/month', '30 min max duration', '4 attendees max', '30 days history'],
    pro: ['Unlimited meetings', 'Word & PDF export', 'Escalation reminders', 'Series timeline', '£19/month'],
    team: ['Everything in Pro', 'Admin panel', 'Shared folders', 'Team analytics', '£12/user/month'],
    enterprise: ['Everything in Team', 'Custom data retention', 'SSO/SAML', 'Dedicated support', 'Custom pricing'],
  };

  if (loading) {
    return <div className="p-6 text-center text-slate-500">Loading settings…</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Settings</h1>
          <p className="text-slate-500 text-sm mt-1">Configure company-wide meeting behaviour and billing</p>
        </div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-700">← Back to Admin</Link>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left column */}
        <div className="space-y-6">
          {/* Meeting behaviour */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-500" />
                <CardTitle className="text-base">Meeting Behaviour</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'transcription_enabled', label: 'Voice transcription', desc: 'Auto-transcribe meetings with Deepgram' },
                { key: 'auto_summary_enabled', label: 'AI summaries', desc: 'Generate summaries automatically after meetings' },
                { key: 'send_absent_email', label: 'Absent member emails', desc: 'Send personalised summaries to absent attendees' },
                { key: 'require_intro_for_guests', label: 'Guest introductions', desc: 'Prompt guests to state their name at meeting start' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                      settings[key as keyof typeof settings] ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      settings[key as keyof typeof settings] ? 'translate-x-5' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Notification policy */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-500" />
                <CardTitle className="text-base">Notification Policy</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'send_action_item_emails', label: 'Action item assignments', desc: 'Email users when assigned an action item' },
                { key: 'escalation_enabled', label: 'Escalation reminders', desc: 'Escalate to manager after 48h overdue' },
                { key: 'weekly_digest_enabled', label: 'Weekly digest', desc: 'Send Monday morning meeting digest' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                      settings[key as keyof typeof settings] ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      settings[key as keyof typeof settings] ? 'translate-x-5' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              ))}

              <div>
                <Label className="text-sm font-medium text-slate-900">Data Retention</Label>
                <p className="text-xs text-slate-500 mb-2">Automatically delete meetings older than:</p>
                <select
                  value={settings.data_retention_months}
                  onChange={e => setSettings(prev => ({ ...prev, data_retention_months: parseInt(e.target.value) }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value={3}>3 months</option>
                  <option value={6}>6 months</option>
                  <option value={12}>12 months</option>
                  <option value={24}>24 months</option>
                  <option value={60}>5 years</option>
                  <option value={999}>Never</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-slate-500" />
                <CardTitle className="text-base">Security</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-700">Session timeout</p>
                <Badge variant="outline">8 hours</Badge>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-700">SSO providers</p>
                <div className="flex gap-1">
                  <Badge variant="info">Microsoft</Badge>
                  <Badge variant="info">Google</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-700">Data encryption</p>
                <Badge variant="success">AES-256 at rest</Badge>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-700">GDPR compliance</p>
                <Badge variant="success">Enabled</Badge>
              </div>
              <Separator />
              <div className="flex gap-2">
                <Link href="/api/user/export" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full text-xs">Export my data</Button>
                </Link>
                <Link href="/privacy" className="flex-1">
                  <Button variant="ghost" size="sm" className="w-full text-xs">Privacy Policy</Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Billing card */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-500" />
                <CardTitle className="text-base">Billing & Plan</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Current Plan</p>
                  <p className="text-xs text-slate-500">{company?.billing_email}</p>
                </div>
                <Badge variant={company?.plan === 'free' ? 'secondary' : 'default'} className="capitalize text-sm">
                  {company?.plan || 'Free'}
                </Badge>
              </div>

              {/* Seat usage bar */}
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Seat usage</span>
                  <span>{company?.seats_used || 0} / {company?.seats_purchased || 5} seats</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      seatUsagePercent >= 90 ? 'bg-red-500' :
                      seatUsagePercent >= 70 ? 'bg-amber-500' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(seatUsagePercent, 100)}%` }}
                  />
                </div>
              </div>

              {company?.plan !== 'free' ? (
                <Button onClick={handleBillingPortal} variant="outline" className="w-full">
                  Manage Billing
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 font-medium">Upgrade to unlock more features:</p>
                  <div className="space-y-2">
                    {[
                      { plan: 'pro', label: 'Pro — £19/month', features: planFeatures.pro },
                      { plan: 'team', label: 'Team — £12/user/month', features: planFeatures.team },
                    ].map(({ plan, label, features }) => (
                      <div key={plan} className="border rounded-lg p-3 hover:border-blue-300 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-slate-900">{label}</p>
                          <Button size="sm" onClick={() => handleUpgrade(plan)} className="h-7 text-xs">
                            Upgrade
                          </Button>
                        </div>
                        <ul className="space-y-0.5">
                          {features.slice(0, 3).map(f => (
                            <li key={f} className="text-xs text-slate-500 flex items-center gap-1">
                              <span className="text-green-500">✓</span> {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Integrations */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-500" />
                <CardTitle className="text-base">Integrations</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: 'Microsoft Outlook Add-in', status: 'available', href: '/addin/manifest.xml', desc: 'Add Meeting Master to Outlook toolbar' },
                { name: 'Deepgram Voice AI', status: 'active', href: null, desc: 'Speaker diarisation & transcription' },
                { name: 'Anthropic Claude', status: 'active', href: null, desc: 'AI summaries & action item extraction' },
              ].map(({ name, status, href, desc }) => (
                <div key={name} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{name}</p>
                    <p className="text-xs text-slate-500">{desc}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={status === 'active' ? 'success' : 'secondary'} className="text-xs">
                      {status}
                    </Badge>
                    {href && (
                      <a href={href} download className="text-xs text-blue-600 hover:underline">Download</a>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card className="border-0 shadow-sm border-red-200">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <CardTitle className="text-base text-red-700">Danger Zone</CardTitle>
              </div>
              <CardDescription>These actions are irreversible. Proceed with caution.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Delete all meeting data</p>
                  <p className="text-xs text-slate-500">Permanently delete all transcripts, summaries, and recordings</p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteModal(true)}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Delete Company Data</h3>
                <p className="text-sm text-slate-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-slate-700">
              This will permanently delete all meetings, transcripts, summaries, and action items for <strong>{company?.name}</strong>.
            </p>
            <div>
              <Label className="text-sm">Type <strong>{company?.name}</strong> to confirm</Label>
              <Input
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder={company?.name}
                className="mt-1"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); }} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteCompany}
                disabled={deleteConfirm !== company?.name}
                className="flex-1"
              >
                Delete Everything
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
