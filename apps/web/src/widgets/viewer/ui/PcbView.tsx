'use client';

import { useMemo, useState } from 'react';
import { Layers, ZoomIn, ZoomOut, Maximize2, List, LayoutGrid } from 'lucide-react';
import type { PCBState } from '@layrix/types';
import { Button } from '@/shared/ui/button';
import { StageHeader } from './StageHeader';
import { KiCanvasViewer } from './KiCanvasViewer';
import { ViewModeSwitch, type ViewMode } from './ViewModeSwitch';
import { layoutBoard, type PlacedComponent } from '../lib/layout-engine';
import { cn } from '@/shared/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

type LayerTab = 'top' | 'bottom' | 'both';
type PcbTab   = 'canvas' | 'list';

const PX_PER_MM = 6;
const mm = (v: number) => v * PX_PER_MM;

const KIND_STYLE: Record<PlacedComponent['kind'], { fill: string; stroke: string; ref: string; body: string }> = {
  IC:    { fill: '#090d12', stroke: '#1d5fa0', ref: '#5baeff', body: '#3a5a80' },
  CAP:   { fill: '#0e1212', stroke: '#1d5040', ref: '#22C55E', body: '#2a4a38' },
  RES:   { fill: '#120d08', stroke: '#6b3a10', ref: '#D4820A', body: '#5a3010' },
  DIODE: { fill: '#120810', stroke: '#5a2060', ref: '#A855F7', body: '#4a1858' },
  LED:   { fill: '#120808', stroke: '#7a1818', ref: '#F87171', body: '#601818' },
  CONN:  { fill: '#0e0e0e', stroke: '#444',    ref: '#888',    body: '#333'    },
  MISC:  { fill: '#0e0e0e', stroke: '#333',    ref: '#666',    body: '#2a2a2a' },
};

const LAYER_OPTS = [
  { id: 'top'    as const, label: 'Top',    sub: 'F.Cu', color: '#00C2FF' },
  { id: 'bottom' as const, label: 'Bottom', sub: 'B.Cu', color: '#D4820A' },
  { id: 'both'   as const, label: 'Both',   sub: 'F+B',  color: '#888'   },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sortByRef(a: PlacedComponent, b: PlacedComponent) {
  const parse = (r: string) => {
    const m = r.match(/^([A-Za-z]+)(\d+)$/);
    return m ? ([m[1]!, parseInt(m[2]!)] as [string, number]) : ([r, 0] as [string, number]);
  };
  const [pa, na] = parse(a.ref);
  const [pb, nb] = parse(b.ref);
  return pa < pb ? -1 : pa > pb ? 1 : na - nb;
}

// ─── Placement list tab ───────────────────────────────────────────────────────

function PlacementList({ placed }: { placed: PlacedComponent[] }) {
  const sorted = useMemo(() => [...placed].sort(sortByRef), [placed]);

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[#3d3d3d] font-mono">
        No placements
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="text-left text-[9px] uppercase tracking-widest text-[#2e2e2e] bg-[#080808] border-b border-[#141414]">
            <th className="px-4 py-2.5 font-medium w-16">Ref</th>
            <th className="px-4 py-2.5 font-medium">Value</th>
            <th className="px-4 py-2.5 font-medium w-20 text-right">X (mm)</th>
            <th className="px-4 py-2.5 font-medium w-20 text-right">Y (mm)</th>
            <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Size</th>
            <th className="px-4 py-2.5 font-medium hidden md:table-cell">Footprint</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#0e0e0e]">
          {sorted.map((c) => {
            const style = KIND_STYLE[c.kind];
            return (
              <tr key={c.ref} className="hover:bg-[#0f0f0f] transition-colors">
                <td className="px-4 py-2">
                  <span className="font-mono font-bold text-[11px]" style={{ color: style.ref }}>
                    {c.ref}
                  </span>
                </td>
                <td className="px-4 py-2 text-foreground/70 text-[11px]">{c.value}</td>
                <td className="px-4 py-2 font-mono text-[10px] text-right" style={{ color: style.ref }}>
                  {c.x.toFixed(2)}
                </td>
                <td className="px-4 py-2 font-mono text-[10px] text-right" style={{ color: style.ref }}>
                  {c.y.toFixed(2)}
                </td>
                <td className="px-4 py-2 font-mono text-[10px] text-[#3d3d3d] hidden sm:table-cell">
                  {c.w.toFixed(1)}×{c.h.toFixed(1)}
                </td>
                <td className="px-4 py-2 font-mono text-[10px] text-[#3a3a3a] hidden md:table-cell truncate max-w-[120px]">
                  {c.footprint}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Board SVG canvas ─────────────────────────────────────────────────────────

interface BoardCanvasProps {
  placed: PlacedComponent[];
  widthMm: number;
  heightMm: number;
  zoom: number;
  layer: LayerTab;
  showRouting: boolean;
  traces: Array<{ x1: number; y1: number; x2: number; y2: number; net: string; layer: 'F' | 'B' }>;
}

function BoardCanvas({ placed, widthMm, heightMm, zoom, layer, showRouting, traces }: BoardCanvasProps) {
  const PAD = 44;
  const svgW = mm(widthMm);
  const svgH = mm(heightMm);
  const totalW = svgW + PAD * 2;
  const totalH = svgH + PAD * 2;

  const visibleTraces = traces.filter(
    (t) => layer === 'both' || (layer === 'top' ? t.layer === 'F' : t.layer === 'B'),
  );

  return (
    <div
      style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.15s ease' }}
    >
      <svg
        width={totalW}
        height={totalH}
        viewBox={`0 0 ${totalW} ${totalH}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="pcbGrid" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="0.5" fill="rgba(0,194,255,0.06)" />
          </pattern>
          <linearGradient id="fr4" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0b1a09" />
            <stop offset="100%" stopColor="#081205" />
          </linearGradient>
          <filter id="comp-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b" />
            <feComposite in="SourceGraphic" in2="b" operator="over" />
          </filter>
        </defs>

        {/* Outer dot grid */}
        <rect width={totalW} height={totalH} fill="url(#pcbGrid)" />

        {/* Ruler ticks — top edge */}
        {Array.from({ length: Math.floor(widthMm / 5) + 1 }, (_, i) => i * 5).map((tick) => (
          <g key={`tx-${tick}`}>
            <line
              x1={PAD + mm(tick)} y1={PAD - 6}
              x2={PAD + mm(tick)} y2={PAD - 2}
              stroke="#1e1e1e" strokeWidth={0.8}
            />
            <text
              x={PAD + mm(tick)} y={PAD - 10}
              textAnchor="middle"
              fill="#2a2a2a"
              fontSize={6}
              fontFamily="ui-monospace, monospace"
            >
              {tick}
            </text>
          </g>
        ))}
        {/* Ruler ticks — left edge */}
        {Array.from({ length: Math.floor(heightMm / 5) + 1 }, (_, i) => i * 5).map((tick) => (
          <g key={`ty-${tick}`}>
            <line
              x1={PAD - 6} y1={PAD + mm(tick)}
              x2={PAD - 2} y2={PAD + mm(tick)}
              stroke="#1e1e1e" strokeWidth={0.8}
            />
            <text
              x={PAD - 10} y={PAD + mm(tick) + 2}
              textAnchor="end"
              fill="#2a2a2a"
              fontSize={6}
              fontFamily="ui-monospace, monospace"
            >
              {tick}
            </text>
          </g>
        ))}

        <g transform={`translate(${PAD}, ${PAD})`}>
          {/* Board body — FR4 green */}
          <rect x={0} y={0} width={svgW} height={svgH} rx={4}
            fill="url(#fr4)" stroke="#1a3010" strokeWidth={1.5} />

          {/* Copper pour hint (GND plane) */}
          <rect x={2} y={2} width={svgW - 4} height={svgH - 4} rx={3}
            fill="none" stroke="#0a2008" strokeWidth={1} strokeDasharray="3 4" />

          {/* Mounting holes */}
          {[[3, 3], [widthMm - 3, 3], [3, heightMm - 3], [widthMm - 3, heightMm - 3]].map(([x, y], i) => (
            <g key={i}>
              <circle cx={mm(x!)} cy={mm(y!)} r={4} fill="#060606" stroke="#2a4a20" strokeWidth={0.8} />
              <circle cx={mm(x!)} cy={mm(y!)} r={2} fill="none" stroke="#1a3010" strokeWidth={0.5} />
            </g>
          ))}

          {/* Traces */}
          {showRouting && visibleTraces.map((t, i) => {
            const color = t.layer === 'F' ? '#00C2FF' : '#D4820A';
            const op = t.layer === 'F' ? 0.8 : 0.5;
            const midX = (mm(t.x1) + mm(t.x2)) / 2;
            return (
              <path
                key={i}
                d={`M ${mm(t.x1)} ${mm(t.y1)} L ${midX} ${mm(t.y1)} L ${midX} ${mm(t.y2)} L ${mm(t.x2)} ${mm(t.y2)}`}
                stroke={color} strokeWidth={1.4} fill="none"
                strokeLinecap="round" strokeLinejoin="round" opacity={op}
              />
            );
          })}

          {/* Components */}
          {placed.map((c) => {
            const s = KIND_STYLE[c.kind];
            const cw = mm(c.w);
            const ch = mm(c.h);
            const cx = mm(c.x);
            const cy = mm(c.y);
            const isIC = c.kind === 'IC';
            return (
              <g key={c.ref} transform={`translate(${cx}, ${cy})`}>
                {/* Body */}
                <rect width={cw} height={ch} rx={2}
                  fill={s.fill} stroke={s.stroke} strokeWidth={isIC ? 1 : 0.7} />
                {/* IC header band */}
                {isIC && cw > 12 && (
                  <rect width={cw} height={Math.min(7, ch * 0.3)} rx={2}
                    fill={s.body} opacity={0.4} />
                )}
                {/* Pin 1 marker */}
                {isIC && <circle cx={2.5} cy={2.5} r={1.2} fill={s.ref} opacity={0.8} />}
                {/* Ref inside box */}
                <text
                  x={cw / 2} y={ch / 2 + (ch > 8 ? -2 : 2)}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={s.ref} fontSize={Math.min(6.5, cw / 2.2)}
                  fontFamily="ui-monospace, monospace" fontWeight={600}
                >
                  {c.ref}
                </text>
                {/* Value below ref — only if box is tall enough */}
                {ch > 10 && (
                  <text
                    x={cw / 2} y={ch / 2 + 5}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={s.body} fontSize={Math.min(5, cw / 3)}
                    fontFamily="ui-monospace, monospace"
                  >
                    {c.value.length > 6 ? c.value.slice(0, 6) : c.value}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Title block */}
        <text
          x={PAD} y={totalH - 10}
          fill="#242424" fontSize={7}
          fontFamily="ui-monospace, monospace" letterSpacing="0.1em"
        >
          LAYRIX · {widthMm}×{heightMm} mm · {placed.length} COMPONENTS{showRouting ? ` · ${visibleTraces.length} TRACES` : ''}
        </text>
      </svg>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PcbViewProps {
  state: PCBState;
  title?: string;
  showRouting?: boolean;
}

export function PcbView({ state, title = 'PCB Layout', showRouting = false }: PcbViewProps) {
  const [zoom, setZoom]   = useState(1);
  const [layer, setLayer] = useState<LayerTab>('both');
  const [pcbTab, setPcbTab] = useState<PcbTab>('canvas');

  const nativeUrl = state.kicad_pcb_url;
  const [mode, setMode] = useState<ViewMode>(nativeUrl ? 'native' : 'spec');
  const effectiveMode: ViewMode = nativeUrl ? mode : 'spec';

  const widthMm  = state.board_width_mm  ?? 50;
  const heightMm = state.board_height_mm ?? 40;
  const components  = state.components  ?? [];
  const connections = state.connections ?? [];

  const placed = useMemo(
    () => layoutBoard(components, widthMm, heightMm),
    [components, widthMm, heightMm],
  );

  const traces = useMemo(() => {
    if (!showRouting) return [];
    type Trace = { x1: number; y1: number; x2: number; y2: number; net: string; layer: 'F' | 'B' };
    const out: Trace[] = [];
    const byRef = new Map(placed.map((c) => [c.ref, c]));
    connections.forEach((conn, ci) => {
      if (conn.pins.length < 2) return;
      if (/^GND$/i.test(conn.name)) return;
      const anchors = conn.pins
        .map((p) => byRef.get(p.ref))
        .filter((c): c is PlacedComponent => Boolean(c))
        .map((c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 }));
      for (let i = 1; i < anchors.length; i++) {
        const a = anchors[i - 1]!;
        const b = anchors[i]!;
        out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, net: conn.name, layer: ci % 2 === 0 ? 'F' : 'B' });
      }
    });
    return out;
  }, [connections, placed, showRouting]);

  const meta = `${widthMm}×${heightMm} mm · ${components.length} comp${components.length !== 1 ? 's' : ''}${showRouting ? ` · ${traces.length} traces` : ''}`;

  return (
    <div className="flex flex-col h-full bg-[#080808]">
      <StageHeader
        icon={<Layers size={12} />}
        title={title}
        meta={meta}
        actions={
          <>
            <ViewModeSwitch mode={effectiveMode} onChange={setMode} nativeDisabled={!nativeUrl} />
            {effectiveMode === 'spec' && pcbTab === 'canvas' && (
              <div className="flex items-center gap-0.5">
                <Button size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}>
                  <ZoomOut size={12} />
                </Button>
                <span className="text-[10px] font-mono text-[#3d3d3d] w-9 text-center tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <Button size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
                  <ZoomIn size={12} />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(1)}>
                  <Maximize2 size={12} />
                </Button>
              </div>
            )}
          </>
        }
      />

      {effectiveMode === 'native' && nativeUrl ? (
        <KiCanvasViewer src={nativeUrl} controls="basic" />
      ) : (
        <>
          {/* Sub-tab bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#141414] bg-[#080808] shrink-0">
            <div className="flex items-center gap-1">
              {([
                { id: 'canvas' as const, icon: <LayoutGrid size={10} />, label: 'Canvas',      count: undefined as number | undefined },
                { id: 'list'   as const, icon: <List size={10} />,       label: 'Placements',  count: placed.length as number | undefined },
              ]).map(({ id, icon, label, count }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPcbTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150',
                    pcbTab === id
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'text-[#555] hover:text-[#888] hover:bg-[#141414] border border-transparent',
                  )}
                >
                  {icon}
                  {label}
                  {typeof count === 'number' && (
                    <span className={cn(
                      'text-[9px] font-mono px-1.5 py-0.5 rounded leading-none',
                      pcbTab === id ? 'bg-primary/15 text-primary' : 'bg-[#1a1a1a] text-[#3d3d3d]',
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Layer filter — only on canvas tab when routing is shown */}
            {pcbTab === 'canvas' && showRouting && (
              <div className="flex items-center gap-0.5 bg-[#111] rounded-lg p-0.5 border border-[#1e1e1e]">
                {LAYER_OPTS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setLayer(opt.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-150',
                      layer === opt.id
                        ? 'text-[#e0e0e0] bg-[#1a1a1a] border border-[#2e2e2e]'
                        : 'text-[#3d3d3d] hover:text-[#666]',
                    )}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: opt.color }} />
                    {opt.label}
                    <span className="font-mono text-[8px] text-[#333]">{opt.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {pcbTab === 'canvas' && (
              <div className="h-full overflow-auto flex items-center justify-center p-4 bg-[#060606]">
                <BoardCanvas
                  placed={placed}
                  widthMm={widthMm}
                  heightMm={heightMm}
                  zoom={zoom}
                  layer={layer}
                  showRouting={showRouting}
                  traces={traces}
                />
              </div>
            )}
            {pcbTab === 'list' && <PlacementList placed={placed} />}
          </div>
        </>
      )}
    </div>
  );
}
