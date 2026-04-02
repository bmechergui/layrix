'use client';

import { ProfileForm } from '@/features/settings/ui/ProfileForm';
import { TransactionHistory } from '@/features/settings/ui/TransactionHistory';
import { useAppStore } from '@/shared/store/app-store';

export default function SettingsPage() {
  const credits = useAppStore((s) => s.credits);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      {/* Profile section */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">Profile</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Update your display name and avatar.
        </p>
        <ProfileForm />
      </section>

      <div className="border-t border-border" />

      {/* Credits section */}
      <section>
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-lg font-semibold text-foreground">Credit History</h2>
          {credits && (
            <span className="text-sm text-muted-foreground font-mono">
              Balance:{' '}
              <span className="text-primary font-semibold">
                {credits.balance} cr
              </span>
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Last 50 transactions on your account.
        </p>
        <TransactionHistory />
      </section>
    </div>
  );
}
