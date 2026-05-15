'use client';

import { Download, FileArchive, FileSpreadsheet, Box, AlertCircle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { StageHeader } from './StageHeader';
import type { PCBState } from '@layrix/types';

const OUTPUTS = [
  { id: 'gerbers', icon: FileArchive,      title: 'Gerber files',     desc: 'Industry-standard fabrication output (.gbr + drill).', cost: 1 },
  { id: 'bom',     icon: FileSpreadsheet,  title: 'BOM (LCSC)',       desc: 'Bill of materials with JLCPCB part numbers.',          cost: 1 },
  { id: 'cpl',     icon: FileSpreadsheet,  title: 'Pick & Place',     desc: 'Component placement file for PCBA assembly.',          cost: 1 },
  { id: 'step',    icon: Box,              title: '3D STEP model',    desc: 'For mechanical fit and enclosure design.',              cost: 1 },
] as const;

export function ExportView({ state }: { state: PCBState }) {
  const ready = state.status === 'DRC_CLEAN' || state.status === 'PCB_LIVRÉ';

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <StageHeader
        icon={<Download size={12} />}
        title="Export & manufacture"
        meta={ready ? 'Ready' : 'Pending DRC'}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {!ready && (
            <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-3 flex items-start gap-2 text-xs text-[#F59E0B]">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>Run DRC successfully before exporting fabrication files.</span>
            </div>
          )}

          <section>
            <h2 className="text-base font-semibold text-foreground mb-1">Fabrication outputs</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Download all the files needed to fabricate and assemble your PCB.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {OUTPUTS.map((o) => {
                const Icon = o.icon;
                return (
                  <div
                    key={o.id}
                    className="rounded-xl border border-border bg-[#111111] p-4 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <Icon size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">{o.title}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                          {o.desc}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!ready}
                      className="w-full mt-3 gap-1.5"
                    >
                      <Download size={12} />
                      Download · {o.cost} credit
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-primary/30 bg-primary/[0.03] p-6">
            <h2 className="text-base font-semibold text-foreground mb-1">
              Order from JLCPCB
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              We&apos;ll send your fabrication files to JLCPCB and assemble your boards.
              Requires explicit confirmation — Layrix never orders automatically.
            </p>
            <Button disabled={!ready} className="gap-2">
              Configure JLCPCB order →
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
