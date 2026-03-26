'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Calendar, FolderOpen, Users, Settings,
  LogOut, Plus, ChevronRight, GitBranch, Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  user: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    role: string;
    plan: string;
  } | null;
  folders: Array<{ id: string; name: string; colour_hex: string; is_shared: boolean }>;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/meetings', label: 'Meetings', icon: Calendar },
  { href: '/dashboard/series', label: 'Series Timeline', icon: GitBranch },
  { href: '/dashboard/actions', label: 'Action Items', icon: Users },
];

export function DashboardSidebar({ user, folders }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const planBadgeClass = {
    free: 'bg-slate-100 text-slate-600',
    pro: 'bg-blue-100 text-blue-700',
    team: 'bg-purple-100 text-purple-700',
    enterprise: 'bg-amber-100 text-amber-700',
  }[user?.plan || 'free'] || 'bg-slate-100 text-slate-600';

  return (
    <aside className="w-64 bg-white border-r flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="p-4 border-b">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Calendar className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900">Meeting Master</span>
        </Link>
      </div>

      {/* New Meeting CTA */}
      <div className="p-3">
        <Link href="/meeting/new">
          <Button className="w-full gap-2" size="sm">
            <Plus className="w-4 h-4" />
            New Meeting
          </Button>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              pathname === href
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}

        {/* Folders section */}
        <div className="pt-4">
          <button
            onClick={() => setFoldersExpanded(!foldersExpanded)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700"
          >
            <ChevronRight className={cn('w-3 h-3 transition-transform', foldersExpanded && 'rotate-90')} />
            <FolderOpen className="w-3 h-3" />
            Folders
          </button>

          {foldersExpanded && (
            <div className="mt-1 space-y-0.5">
              {folders.map(folder => (
                <Link
                  key={folder.id}
                  href={`/dashboard?folder=${folder.id}`}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ml-4',
                    pathname === `/dashboard` && 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  <div
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: folder.colour_hex }}
                  />
                  <span className="truncate text-slate-600">{folder.name}</span>
                  {folder.is_shared && (
                    <Users className="w-3 h-3 text-slate-400 ml-auto shrink-0" />
                  )}
                </Link>
              ))}
              <Link
                href="/dashboard/folders/new"
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-slate-400 hover:text-slate-600 ml-4"
              >
                <Plus className="w-3 h-3" />
                Add folder
              </Link>
            </div>
          )}
        </div>

        {/* Admin link */}
        {(user?.role === 'admin') && (
          <div className="pt-2">
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-purple-50 text-purple-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Shield className="w-4 h-4" />
              Admin Panel
            </Link>
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="p-3 border-t space-y-2">
        <div className="flex items-center gap-3 px-2">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium">
              {user?.full_name?.[0] || user?.email?.[0] || '?'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{user?.full_name}</p>
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', planBadgeClass)}>
              {user?.plan || 'free'}
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          <Link href="/dashboard/settings" className="flex-1">
            <Button variant="ghost" size="sm" className="w-full gap-2 text-xs">
              <Settings className="w-3 h-3" />
              Settings
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2 text-xs text-slate-500">
            <LogOut className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
