'use client';

import { ShieldCheck, AlertTriangle } from 'lucide-react';
import type { PCBState } from '@layrix/types';
import { StageHeader } from './StageHeader';
import { PcbView } from './PcbView';

export function DrcView({ state }: { state: PCBState }) {
  const violations = state.drcViolations ?? [];
  const isClean = violations.length === 0;

  return (
    <div className="flex flex-col h-full">
      <StageHeader
        icon={<ShieldCheck size={12} />}
        title="Design Rules Check"
        meta={
          isClean ? (
            <span className="text-[#22C55E]">✓ 0 violations</span>
          ) : (
            <span className="text-[#F59E0B]">{violations.length} violations</span>
          )
        }
      />

      {isClean ? (
        <div className="border-b border-border bg-[#22C55E]/5 px-4 py-2.5 flex items-center gap-2 shrink-0">
          <ShieldCheck size={14} className="text-[#22C55E]" />
          <span className="text-xs text-[#22C55E] font-medium">
            DRC clean — ready for manufacturing.
          </span>
        </div>
      ) : (
        <div className="border-b border-border bg-[#F59E0B]/5 px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-[#F59E0B]" />
            <span className="text-xs text-[#F59E0B] font-medium">
              {violations.length} violation{violations.length === 1 ? '' : 's'} found
            </span>
          </div>
          <ul className="text-[11px] text-muted-foreground space-y-0.5 mt-2">
            {violations.slice(0, 5).map((v) => (
              <li key={v.id} className="font-mono">
                · {v.severity.toUpperCase()} @ ({v.x_mm.toFixed(1)}, {v.y_mm.toFixed(1)}): {v.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <PcbView state={state} title="Final layout" showRouting />
      </div>
    </div>
  );
}
