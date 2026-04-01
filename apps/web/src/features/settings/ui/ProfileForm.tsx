'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useAppStore } from '@/shared/store/app-store';
import { CheckCircle, Loader2 } from 'lucide-react';

interface ProfileData {
  full_name: string | null;
  avatar_url: string | null;
  email: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function ProfileForm() {
  const user = useAppStore((s) => s.user);
  const fetchUser = useAppStore((s) => s.fetchUser);

  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? '');
      setAvatarUrl(user.avatar_url ?? '');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveState('saving');
    setErrorMsg('');

    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName || undefined,
          avatar_url: avatarUrl || null,
        }),
      });

      const json = await res.json() as { success: boolean; error?: string };

      if (!res.ok) {
        setErrorMsg(json.error ?? 'Failed to save profile.');
        setSaveState('error');
        return;
      }

      await fetchUser();
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setErrorMsg('Network error. Please try again.');
      setSaveState('error');
    }
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-6">
      {/* Avatar preview */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-lg font-bold text-primary overflow-hidden shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={initials} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Avatar URL
          </label>
          <Input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className="h-9 text-sm"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Link to a public image (Gravatar, GitHub, etc.)
          </p>
        </div>
      </div>

      {/* Email — read-only */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Email
        </label>
        <Input
          value={user?.email ?? ''}
          disabled
          className="h-9 text-sm opacity-60 cursor-not-allowed"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Email cannot be changed.
        </p>
      </div>

      {/* Full name */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Display name
        </label>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
          maxLength={100}
          className="h-9 text-sm"
        />
      </div>

      {/* Error */}
      {saveState === 'error' && (
        <p className="text-sm text-red-400">{errorMsg}</p>
      )}

      <Button
        type="submit"
        disabled={saveState === 'saving'}
        className="gap-2"
      >
        {saveState === 'saving' && <Loader2 size={14} className="animate-spin" />}
        {saveState === 'saved' && <CheckCircle size={14} />}
        {saveState === 'saved' ? 'Saved!' : 'Save changes'}
      </Button>
    </form>
  );
}
