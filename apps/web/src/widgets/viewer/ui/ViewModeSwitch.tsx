'use client';

import { Layers, ListTree } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type ViewMode = 'native' | 'spec';

interface ViewModeSwitchProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** When true, the 'native' option is disabled (no .kicad file available). */
  nativeDisabled?: boolean;
}

export function ViewModeSwitch({ mode, onChange, nativeDisabled }: ViewModeSwitchProps) {
  return (
    <div className="flex items-center gap-0.5 bg-[#1a1a1a] rounded-md p-0.5 border border-border">
      <button
        type="button"
        onClick={() => onChange('native')}
        disabled={nativeDisabled}
        title={nativeDisabled ? 'Generate the design to enable native KiCad view' : 'Native KiCad render'}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-medium transition-colors',
          mode === 'native' && !nativeDisabled
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground'
        )}
      >
        <Layers size={10} />
        Native
      </button>
      <button
        type="button"
        onClick={() => onChange('spec')}
        title="Datasheet view"
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-medium transition-colors',
          mode === 'spec'
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <ListTree size={10} />
        Spec
      </button>
    </div>
  );
}
