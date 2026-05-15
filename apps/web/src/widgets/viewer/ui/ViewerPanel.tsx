'use client';

import dynamic from 'next/dynamic';
import React, { useState, useEffect } from 'react';
import { Layers, Box, Download, ZoomIn, ZoomOut, Maximize2, Eye, EyeOff, FileText, Cpu, Route } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { useAppStore } from '@/shared/store/app-store';
import { LAYER_COLORS, DEFAULT_LAYER_VISIBILITY, colorToHex } from '../lib/layers';
import type { ZoomControls } from '../lib/renderer';
import type { PCBState, SchemaComponent } from '@layrix/types';
import { SchemaCanvas } from './SchemaCanvas';

// PixiJS ne fonctionne pas côté serveur → dynamic import obligatoire
const PixiCanvas = dynamic(() => import('./PixiCanvas').then((m) => m.PixiCanvas), {
  ssr: false,
  loading: () => <PCBPlaceholder />,
});

// KiCanvas : web components browser uniquement → ssr: false obligatoire
const KiCanvasViewer = dynamic(
  () => import('./KiCanvasViewer').then((m) => m.KiCanvasViewer),
  { ssr: false, loading: () => <PCBPlaceholder /> }
);


export type ViewMode = 'routing' | '3d' | 'schematic' | 'components';

interface ViewerPanelProps {
  projectId?: string;
  mode?: ViewMode;
  onModeChange?: (mode: ViewMode) => void;
}

export function ViewerPanel({ projectId, mode: modeProp, onModeChange }: ViewerPanelProps) {
  const [internalMode, setInternalMode] = useState<ViewMode>('schematic');
  const mode = modeProp ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;
  const [layerVisibility, setLayerVisibility] =
    useState<Record<string, boolean>>(DEFAULT_LAYER_VISIBILITY);
  const [zoomControls, setZoomControls] = useState<ZoomControls | null>(null);
  const [showRawKicad, setShowRawKicad] = useState(false);

  const pcbState = useAppStore((s) =>
    projectId ? s.pcbStateByProject[projectId] ?? null : null
  );
  const agentStep = useAppStore((s) => s.agentStep);
  const setPcbState = useAppStore((s) => s.setPcbState);

  // Load persisted PCB state from DB on mount
  useEffect(() => {
    if (!projectId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/pcb-state`);
        if (!res.ok) return;
        const json = await res.json() as { success: boolean; data: Record<string, unknown> | null };
        if (json.success && json.data) {
          setPcbState(projectId, json.data);
        }
      } catch {
        // Non-blocking — viewer still works without persisted state
      }
    })();
  }, [projectId, setPcbState]);

  const toggleLayer = (layer: string) => {
    setLayerVisibility((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        {/* Tab switcher */}
        <div className="flex items-center gap-0.5 bg-[#141414] rounded-lg p-1">
          {(
            [
              { id: 'schematic',  icon: <FileText size={12} />, label: 'Schematic' },
              { id: 'routing',    icon: <Route size={12} />,    label: 'Routing' },
              { id: '3d',         icon: <Box size={12} />,      label: '3D' },
              { id: 'components', icon: <Cpu size={12} />,      label: 'Components' },
            ] as { id: ViewMode; icon: React.ReactNode; label: string }[]
          ).map(({ id, icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === id
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Context-aware controls */}
        <div className="flex items-center gap-2">
          {/* Schema view toggle — only on Schema tab with .kicad_sch */}
          {mode === 'schematic' && pcbState?.kicad_sch_url && (
            <button
              type="button"
              onClick={() => setShowRawKicad((v) => !v)}
              className="h-8 px-2.5 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider rounded-md border border-[#1F1F1F] bg-[#0d0d0d] text-[#A1A1AA] hover:text-foreground hover:border-[#2E2E2E] transition-colors"
              title={showRawKicad ? 'Show logical netlist view' : 'Show raw KiCad schematic'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${showRawKicad ? 'bg-amber-400' : 'bg-primary'}`} />
              {showRawKicad ? 'Raw KiCad' : 'Netlist'}
            </button>
          )}

          {/* Zoom controls — Routing only */}
          {mode === 'routing' && (
            <div className="flex items-center gap-0.5 bg-[#141414] rounded-lg px-1 py-0.5">
              <Button
                variant="ghost" size="icon" className="h-8 w-8" aria-label="Zoom in"
                disabled={!zoomControls}
                onClick={() => zoomControls?.zoomIn()}
                title="Zoom in"
              >
                <ZoomIn size={14} />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-8 w-8" aria-label="Zoom out"
                disabled={!zoomControls}
                onClick={() => zoomControls?.zoomOut()}
                title="Zoom out"
              >
                <ZoomOut size={14} />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-8 w-8" aria-label="Reset zoom"
                disabled={!zoomControls}
                onClick={() => zoomControls?.resetZoom()}
                title="Fit to screen"
              >
                <Maximize2 size={14} />
              </Button>
            </div>
          )}

          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 text-xs bg-primary/90 hover:bg-primary text-black font-semibold"
            disabled={!pcbState || !projectId}
            onClick={() => {
              if (projectId) window.location.assign(`/api/projects/${projectId}/export`);
            }}
          >
            <Download size={13} />
            Gerbers
          </Button>
        </div>
      </div>

      {/* Viewer area */}
      <div className="flex-1 relative overflow-hidden">
        <LiveAgentOverlay agentStep={agentStep} mode={mode} />
        {mode === 'routing' ? (
          pcbState?.kicad_pcb_url ? (
            <KiCanvasViewer src={pcbState.kicad_pcb_url} type="board" className="h-full" />
          ) : (
            <>
              <PixiCanvas
                pcbState={pcbState}
                layerVisibility={layerVisibility}
                onReady={setZoomControls}
              />
              {pcbState?.components?.length ? (
                <PCBInfoBadge pcbState={pcbState} />
              ) : (
                <div className="absolute inset-0 z-10">
                  <PCBEmptyState agentStep={agentStep} />
                </div>
              )}
            </>
          )
        ) : mode === 'schematic' ? (
          showRawKicad && pcbState?.kicad_sch_url ? (
            <KiCanvasViewer src={pcbState.kicad_sch_url} type="schematic" className="h-full" />
          ) : (
            <SchemaCanvas pcbState={pcbState} />
          )
        ) : mode === 'components' ? (
          <ComponentsBOMView pcbState={pcbState} />
        ) : (
          <PCBViewer3DPlaceholder />
        )}
      </div>

      {/* Layer legend + toggles (Routing only) */}
      {mode === 'routing' && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-4 py-2 border-t border-border shrink-0">
          {Object.entries(LAYER_COLORS).map(([layer, color]) => {
            const visible = layerVisibility[layer] ?? true;
            return (
              <button
                key={layer}
                type="button"
                onClick={() => toggleLayer(layer)}
                className={`flex items-center gap-1.5 transition-opacity ${
                  visible ? 'opacity-100' : 'opacity-40'
                }`}
                title={visible ? `Hide ${layer}` : `Show ${layer}`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: colorToHex(color) }}
                />
                <span className="text-[10px] text-muted-foreground font-mono">{layer}</span>
                {visible ? (
                  <Eye size={9} className="text-muted-foreground" />
                ) : (
                  <EyeOff size={9} className="text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PCBPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-xs text-muted-foreground font-mono animate-pulse">
        Loading PCB viewer…
      </div>
    </div>
  );
}

const AGENT_META: Record<string, { agent: string; model: string; targetMode: ViewMode | null }> = {
  SPEC:      { agent: 'Spec Parser',     model: 'Haiku 4.5',   targetMode: null },
  SCHEMA:    { agent: 'Schematic Agent', model: 'Haiku 4.5',   targetMode: 'schematic' },
  PLACEMENT: { agent: 'Placement Agent', model: 'Circuit-Synth', targetMode: 'routing' },
  ROUTING:   { agent: 'Routing Agent',   model: 'Freerouting', targetMode: 'routing' },
  DRC:       { agent: 'DRC Agent',       model: 'pcbnew',      targetMode: 'routing' },
  EXPORT:    { agent: 'Export Agent',    model: 'pcbnew',      targetMode: 'components' },
};

function LiveAgentOverlay({
  agentStep,
  mode,
}: {
  agentStep: string | null;
  mode: ViewMode;
}) {
  if (!agentStep) return null;
  const meta = AGENT_META[agentStep];
  if (!meta) return null;

  const focused = meta.targetMode === mode;

  return (
    <div className="absolute top-3 right-3 z-20 pointer-events-none">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border backdrop-blur-md transition-colors ${
          focused
            ? 'bg-primary/15 border-primary/40 shadow-[0_0_16px_rgba(0,194,255,0.25)]'
            : 'bg-[#0D0D0D]/85 border-[#1F1F1F]'
        }`}
      >
        <span className="relative flex items-center justify-center w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-70" />
          <span className="relative w-2 h-2 rounded-full bg-primary" />
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono font-semibold ${focused ? 'text-primary' : 'text-[#E4E4E7]'}`}>
            {meta.agent}
          </span>
          <span className="text-[9px] text-[#52525B] font-mono">·</span>
          <span className="text-[9px] text-[#71717A] font-mono">{meta.model}</span>
        </span>
        <span className="flex gap-0.5 ml-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`w-1 h-1 rounded-full ${focused ? 'bg-primary' : 'bg-[#A1A1AA]'} animate-pulse`}
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

type AgentStep = 'SPEC' | 'SCHEMA' | 'PLACEMENT' | 'ROUTING' | 'DRC' | 'EXPORT' | null;

const STEP_LABELS: Record<NonNullable<AgentStep>, string> = {
  SPEC:      'Parsing specifications…',
  SCHEMA:    'Generating schematic…',
  PLACEMENT: 'Placing components…',
  ROUTING:   'Auto-routing traces…',
  DRC:       'Running DRC check…',
  EXPORT:    'Exporting Gerbers…',
};

/** Full-area overlay shown when no circuit_json is available */
function PCBEmptyState({ agentStep }: { agentStep: AgentStep }) {
  return (
    <div className="w-full h-full flex items-center justify-center relative overflow-hidden bg-[#0a0a0a]">
      {/* Dot-grid background — PCB workspace feel */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #1c1c1c 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-4 text-center px-8 max-w-[280px]">
        {agentStep ? (
          /* Agent running */
          <>
            <div className="w-16 h-16 rounded-xl bg-[#141414] border border-primary/30 flex items-center justify-center shadow-[0_0_24px_rgba(0,194,255,0.15)]">
              <Layers size={32} className="text-primary/60 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-primary font-medium">{STEP_LABELS[agentStep]}</p>
              <p className="text-[11px] text-[#52525B] leading-relaxed">
                The board renders here as soon as the placement agent finishes.
              </p>
            </div>
          </>
        ) : (
          /* INITIAL: welcoming canvas */
          <>
            <div className="w-16 h-16 rounded-xl bg-[#141414] border border-border flex items-center justify-center">
              <Route size={32} className="text-primary/30" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-[#A1A1AA] font-medium">Routing</p>
              <p className="text-[11px] text-[#52525B] leading-relaxed">
                Auto-placed footprints + Freerouting traces.
                Edge cuts, copper layers, silkscreen, and ground planes.
              </p>
            </div>
            <p className="text-[9px] text-[#3D3D3D] font-mono">Generated by the Routing agent</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Small info badge overlaid on the PCB canvas when circuit is rendered */
function PCBInfoBadge({ pcbState }: { pcbState: PCBState }) {
  const placement = pcbState.placement as { placements?: unknown[] } | undefined;
  const componentCount = placement?.placements?.length ?? pcbState.components?.length ?? 0;
  const boardW = pcbState.board_width_mm;
  const boardH = pcbState.board_height_mm;
  const status = pcbState.status;

  const statusColor =
    status === 'DRC_CLEAN' || status === 'PCB_LIVRÉ'
      ? 'text-green-500'
      : status === 'ROUTING_DONE' || status === 'PLACEMENT_DONE'
        ? 'text-primary/70'
        : 'text-[#52525B]';

  return (
    <div className="absolute bottom-3 right-3 z-10 pointer-events-none">
      <div className="flex items-center gap-3 bg-[#0D0D0D]/85 backdrop-blur-sm border border-[#1E1E1E] rounded-md px-3 py-1.5">
        {boardW && boardH && (
          <span className="text-[9px] text-[#3D3D3D] font-mono">{boardW}×{boardH}mm</span>
        )}
        {componentCount ? (
          <span className="text-[9px] text-[#3D3D3D] font-mono">{componentCount} comp.</span>
        ) : null}
        <span className={`text-[9px] font-mono ${statusColor}`}>{status}</span>
      </div>
    </div>
  );
}

function PCBViewer3DPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
      <div className="w-16 h-16 rounded-xl bg-[#141414] border border-border flex items-center justify-center">
        <Box size={32} className="text-primary/30" />
      </div>
      <div className="space-y-1.5 max-w-[240px]">
        <p className="text-xs text-[#A1A1AA] font-medium">3D preview</p>
        <p className="text-[11px] text-[#52525B] leading-relaxed">
          Renders automatically after PCB completion — FR4 substrate, copper layers,
          solder mask, silkscreen, and component bodies.
        </p>
      </div>
      <p className="text-[9px] text-[#3D3D3D] font-mono">Pro plan · visual inspection before ordering</p>
    </div>
  );
}

// (Old SchemaNetlistView ratsnest + helpers deleted -- replaced by SchemaCanvas in ./SchemaCanvas.tsx)

function ComponentsBOMView({ pcbState }: { pcbState: PCBState | null }) {
  const components: SchemaComponent[] = pcbState?.components ?? [];
  const [copied, setCopied] = useState(false);

  if (!components.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="w-16 h-16 rounded-xl bg-[#141414] border border-border flex items-center justify-center">
          <Cpu size={32} className="text-primary/30" />
        </div>
        <div className="space-y-1.5 max-w-[260px]">
          <p className="text-xs text-[#A1A1AA] font-medium">Components · BOM</p>
          <p className="text-[11px] text-[#52525B] leading-relaxed">
            Bill of materials with grouped values, footprints,
            and LCSC part numbers — exportable as CSV for JLCPCB.
          </p>
        </div>
        <p className="text-[9px] text-[#3D3D3D] font-mono">Available once the schematic is generated</p>
      </div>
    );
  }

  // Group by value+footprint
  const grouped = components.reduce<Record<string, { refs: string[]; value: string; footprint: string; lcsc: string | undefined }>>(
    (acc, c) => {
      const key = `${c.value}||${c.footprint}`;
      if (!acc[key]) acc[key] = { refs: [], value: c.value, footprint: c.footprint, lcsc: c.lcsc };
      acc[key]!.refs.push(c.ref);
      return acc;
    },
    {}
  );
  const bomRows = Object.values(grouped).sort((a, b) => (a.refs[0] ?? '').localeCompare(b.refs[0] ?? ''));

  const copyCSV = () => {
    const header = 'Qty,Refs,Value,Footprint,LCSC';
    const rows = bomRows.map((r) =>
      `${r.refs.length},"${r.refs.join(', ')}","${r.value}","${r.footprint}","${r.lcsc ?? ''}"`
    );
    void navigator.clipboard.writeText([header, ...rows].join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full overflow-auto p-4 bg-[#090909]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] text-[#3D3D3D] font-mono uppercase tracking-wider">
          Bill of Materials — {components.length} refs · {bomRows.length} unique
        </p>
        <button
          type="button"
          onClick={copyCSV}
          className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-mono border rounded transition-colors"
          style={copied
            ? { color: '#22C55E', borderColor: '#22C55E40', backgroundColor: '#22C55E10' }
            : { color: '#3D3D3D', borderColor: '#1E1E1E', backgroundColor: 'transparent' }
          }
        >
          <Download size={9} />
          {copied ? 'Copied!' : 'Copy CSV'}
        </button>
      </div>

      <div className="space-y-px">
        <div className="grid grid-cols-[2rem_2fr_2fr_4rem_4rem] gap-2 px-2 py-1 text-[9px] text-[#2E2E2E] font-mono uppercase tracking-wider border-b border-[#1A1A1A]">
          <span>Qty</span><span>Value</span><span>Footprint</span><span>LCSC</span><span>Refs</span>
        </div>
        {bomRows.map((row) => (
          <div
            key={`${row.value}-${row.footprint}`}
            className="grid grid-cols-[2rem_2fr_2fr_4rem_4rem] gap-2 px-2 py-2 rounded bg-[#0F0F0F] border border-[#181818] text-[10px] font-mono hover:border-[#252525] transition-colors"
          >
            <span className="text-primary/70 font-bold">{row.refs.length}</span>
            <span className="text-[#A1A1AA] truncate">{row.value}</span>
            <span className="text-[#52525B] truncate">{row.footprint}</span>
            <span>
              {row.lcsc ? (
                <a
                  href={`https://www.lcsc.com/product-detail/${row.lcsc}.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary/60 hover:text-primary underline underline-offset-2 transition-colors"
                >
                  {row.lcsc}
                </a>
              ) : (
                <span className="text-[#2A2A2A]">—</span>
              )}
            </span>
            <span className="text-[#3D3D3D] truncate">{row.refs.join(', ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
