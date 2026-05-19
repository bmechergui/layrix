'use client';

import { Activity, AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import type { ERCViolation, PCBState } from '@layrix/types';
import { StageHeader } from './StageHeader';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEV = {
  error: {
    icon: <AlertTriangle size={12} />,
    label: 'ERROR',
    row: 'border-l-2 border-destructive/50 bg-[#180808]',
    badge: 'bg-destructive/15 text-destructive border-destructive/25',
    text: '#ef4444',
    count: 'bg-destructive/15 text-destructive',
  },
  warning: {
    icon: <Info size={12} />,
    label: 'WARN',
    row: 'border-l-2 border-warning/40 bg-[#141008]',
    badge: 'bg-warning/15 text-warning border-warning/25',
    text: '#f59e0b',
    count: 'bg-warning/15 text-warning',
  },
} as const;

function GroupHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[#0a0a0a] border-b border-[#141414]">
      <span className="text-[9px] font-mono font-bold tracking-widest uppercase" style={{ color }}>
        {label}
      </span>
      <span
        className="text-[9px] font-mono px-1.5 py-0.5 rounded leading-none"
        style={{ background: `${color}18`, color }}
      >
        {count}
      </span>
      <span className="flex-1 border-t border-dashed border-[#1e1e1e]" />
    </div>
  );
}

function ViolationRow({ v }: { v: ERCViolation }) {
  const s = SEV[v.severity];
  return (
    <li className={`flex items-start gap-3 px-4 py-3 hover:bg-[#141414] transition-colors ${s.row}`}>
      <span style={{ color: s.text }} className="shrink-0 mt-0.5">{s.icon}</span>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-xs text-foreground/90 leading-snug">{v.message}</p>
        <div className="flex flex-wrap items-center gap-2">
          {v.type && (
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border leading-none ${s.badge}`}>
              {v.type}
            </span>
          )}
          {(v.ref || v.pin) && (
            <span className="text-[10px] font-mono text-[#4a4a4a]">
              {v.ref}{v.pin ? `.${v.pin}` : ''}
            </span>
          )}
          {v.x_mm !== undefined && v.y_mm !== undefined && (
            <span className="text-[10px] font-mono text-[#3a3a3a]">
              ({v.x_mm.toFixed(2)}, {v.y_mm.toFixed(2)}) mm
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ErcView({ state }: { state: PCBState }) {
  const violations = state.ercViolations ?? [];
  const skipped    = state.erc_skipped === true;
  const errors     = violations.filter((v) => v.severity === 'error');
  const warnings   = violations.filter((v) => v.severity === 'warning');

  const metaText = skipped
    ? 'skipped'
    : violations.length === 0
    ? 'clean'
    : `${errors.length} error${errors.length !== 1 ? 's' : ''} · ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`;

  return (
    <div className="flex flex-col h-full bg-[#080808]">
      <StageHeader
        icon={<Activity size={12} />}
        title="ERC — Electrical Rules Check"
        meta={
          <span className={violations.length > 0 ? 'text-warning' : skipped ? 'text-muted-foreground' : 'text-[#22C55E]'}>
            {metaText}
          </span>
        }
        actions={
          violations.length > 0 ? (
            <div className="flex items-center gap-1">
              {errors.length > 0 && (
                <span className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded bg-destructive/10 text-destructive border border-destructive/20">
                  <AlertTriangle size={9} /> {errors.length}
                </span>
              )}
              {warnings.length > 0 && (
                <span className="flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded bg-warning/10 text-warning border border-warning/20">
                  <Info size={9} /> {warnings.length}
                </span>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto">
        {/* Skipped */}
        {skipped && (
          <div className="m-4 rounded-xl border border-warning/20 bg-[#141008] px-4 py-4 flex items-start gap-3">
            <Info size={16} className="text-warning shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-warning">ERC skipped</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                kicad-cli is not available in this environment.
                Schematic electrical rules will be enforced in the production pipeline.
              </p>
            </div>
          </div>
        )}

        {/* Clean */}
        {!skipped && violations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 py-12">
            <div className="w-12 h-12 rounded-2xl bg-[#22C55E]/10 border border-[#22C55E]/20 flex items-center justify-center">
              <CheckCircle2 size={22} className="text-[#22C55E]" />
            </div>
            <div className="text-center max-w-xs">
              <p className="text-sm font-semibold text-foreground mb-1">Schematic is ERC clean</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                All pins connected, no power rail conflicts, no floating nets.
                Ready for placement.
              </p>
            </div>
          </div>
        )}

        {/* Violations list — errors first, then warnings */}
        {violations.length > 0 && (
          <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] overflow-hidden m-4">
            {errors.length > 0 && (
              <>
                <GroupHeader label="Errors" count={errors.length} color="#ef4444" />
                <ul className="divide-y divide-[#111]">
                  {errors.map((v) => <ViolationRow key={v.id} v={v} />)}
                </ul>
              </>
            )}
            {warnings.length > 0 && (
              <>
                <GroupHeader label="Warnings" count={warnings.length} color="#f59e0b" />
                <ul className="divide-y divide-[#111]">
                  {warnings.map((v) => <ViolationRow key={v.id} v={v} />)}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Action hint when violations */}
        {violations.length > 0 && (
          <div className="flex items-start gap-2 mx-4 mb-4 px-4 py-3 rounded-lg border border-[#1e1e1e] bg-[#0a0a0a]">
            <ShieldAlert size={13} className="text-[#3d3d3d] shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#3d3d3d] leading-relaxed">
              Fix ERC errors before proceeding to placement.
              Warnings may indicate acceptable design choices (e.g. unused pins with pull-resistors).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
