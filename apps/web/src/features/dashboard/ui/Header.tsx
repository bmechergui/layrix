'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { CreditsBadge } from './CreditsBadge';
import { UserMenu } from './UserMenu';
import { useAppStore } from '@/shared/store/app-store';

interface HeaderProps {
  title?: string;
}

const STEP_LABELS: Record<string, string> = {
  SCHEMA:    'Schema',
  PLACEMENT: 'Placement',
  ROUTING:   'Routing',
  DRC:       'DRC',
  EXPORT:    'Export',
};

function AgentStatusBadge() {
  const isAgentRunning = useAppStore((s) => s.isAgentRunning);
  const agentStep = useAppStore((s) => s.agentStep);

  if (!isAgentRunning) return null;

  const label = agentStep ? STEP_LABELS[agentStep] ?? agentStep : 'Thinking…';

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      <span className="text-[11px] font-medium text-primary leading-none">{label}</span>
    </div>
  );
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="h-14 border-b border-border bg-[#0a0a0a] flex items-center justify-between px-6 sticky top-0 z-10">
      {title && (
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      )}

      <div className="flex items-center gap-4 ml-auto">
        <AgentStatusBadge />
        <CreditsBadge />
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Notifications">
          <Bell size={16} />
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
