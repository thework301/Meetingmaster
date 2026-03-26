'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Download, Trash2, User } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function UserSettingsPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: user } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', session.user.id)
        .single();

      if (user) {
        setFullName(user.full_name);
        setEmail(user.email);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase
      .from('users')
      .update({ full_name: fullName })
      .eq('id', session.user.id);

    if (error) {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } else {
      toast({ title: 'Profile updated' });
    }
    setSaving(false);
  };

  const handleExport = () => {
    window.location.href = '/api/user/export';
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') {
      toast({ title: 'Type DELETE to confirm', variant: 'destructive' });
      return;
    }

    const res = await fetch('/api/user/account', { method: 'DELETE' });
    if (res.ok) {
      await supabase.auth.signOut();
      router.push('/login');
    } else {
      const err = await res.json();
      toast({ title: err.error || 'Failed to delete account', variant: 'destructive' });
    }
  };

  if (loading) return <div className="p-6 text-slate-500">Loading…</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Account Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your profile and data</p>
      </div>

      {/* Profile */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-base">Profile</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled className="mt-1 bg-slate-50" />
            <p className="text-xs text-slate-400 mt-1">Email is managed by your SSO provider</p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      {/* GDPR */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-slate-500" />
            <CardTitle className="text-base">Your Data</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Export my data</p>
              <p className="text-xs text-slate-500">Download all your data in JSON format (GDPR Art. 20)</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="w-3 h-3" />
              Export
            </Button>
          </div>
          <Separator />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Data retention</p>
              <p className="text-xs text-slate-400">Configured by your company admin</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-0 shadow-sm border-red-100">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <CardTitle className="text-base text-red-700">Danger Zone</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Delete my account</p>
              <p className="text-xs text-slate-500">Permanently delete your account and all your data</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteModal(true)}
              className="gap-2"
            >
              <Trash2 className="w-3 h-3" />
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-slate-900 text-lg">Delete Your Account</h3>
            <p className="text-sm text-slate-700">
              This will permanently delete your account, profile, and all your data. This cannot be undone.
            </p>
            <div>
              <Label className="text-sm">Type <strong>DELETE</strong> to confirm</Label>
              <Input
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="mt-1"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setShowDeleteModal(false); setDeleteConfirm(''); }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== 'DELETE'}
                className="flex-1"
              >
                Delete My Account
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
