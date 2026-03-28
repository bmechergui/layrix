'use client';

import { Coins } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

export function CreditsBadge() {
  const credits = useAppStore((s) => s.credits);

  // For free plan, daily_limit is the cap; for paid plans, show balance
  const limit = credits.daily_limit ?? 100;
  const pct = (credits.balance / limit) * 100;
  const color = pct > 50 ? 'text-primary' : pct > 20 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className={`flex items-center gap-1.5 text-xs font-mono font-medium ${color}`}>
      <Coins size={13} />
      <span>{credits.balance}</span>
      <span className="text-muted-foreground font-normal">cr · {credits.plan}</span>
    </div>
  );
}
