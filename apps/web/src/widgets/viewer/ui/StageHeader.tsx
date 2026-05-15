'use client';

import type { ReactNode } from 'react';

interface StageHeaderProps {
  icon: ReactNode;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function StageHeader({ icon, title, meta, actions }: StageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#0a0a0a] shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <span className="text-xs font-semibold text-foreground truncate">{title}</span>
        {meta && (
          <span className="text-[11px] font-mono text-muted-foreground ml-2 truncate">{meta}</span>
        )}
      </div>
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </div>
  );
}
