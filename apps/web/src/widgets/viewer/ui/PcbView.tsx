'use client';

import { useMemo, useState } from 'react';
import { Layers, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { PCBState } from '@layrix/types';
import { Button } from '@/shared/ui/button';
import { StageHeader } from './StageHeader';
import { KiCanvasViewer } from './KiCanvasViewer';
import { ViewModeSwitch, type ViewMode } from './ViewModeSwitch';
import { layoutBoard } from '../lib/layout-engine';

interface PcbViewProps {
  state: PCBState;
  title?: string;
  showRouting?: boolean;
}

const KIND_COLOR: Record<string, { fill: string; stroke: string; text: string }> = {
  IC:    { fill: '#0a0a0a', stroke: '#3a3a3a', text: '#A1A1AA' },
  CAP:   { fill: '#1a1a1a', stroke: '#555',    text: '#A1A1AA' },
  RES:   { fill: '#2a1a0a', stroke: '#8a5a2a', text: '#D4820A' },
  DIODE: { fill: '#1a1a1a', stroke: '#666',    text: '#A1A1AA' },
  LED:   { fill: '#1a0a0a', stroke: '#a85555', text: '#F87171' },
  CONN:  { fill: '#0a0a0a', stroke: '#777',    text: '#D4D4D8' },
  MISC:  { fill: '#1a1a1a', stroke: '#555',    text: '#A1A1AA' },
};

const NET_COLOR_FCU = '#00C2FF';
const NET_COLOR_BCU = '#D4820A';

type LayerTab = 'top' | 'bottom' | 'both';

export function PcbView({ state, title = 'PCB Layout', showRouting = false }: PcbViewProps) {
  const [zoom, setZoom] = useState(1);
  const [layer, setLayer] = useState<LayerTab>('both');
  const nativeUrl = state.kicad_pcb_url;
  const [mode, setMode] = useState<ViewMode>(nativeUrl ? 'native' : 'spec');
  const effectiveMode: ViewMode = nativeUrl ? mode : 'spec';

  const widthMm = state.board_width_mm ?? 50;
  const heightMm = state.board_height_mm ?? 40;
  const components = state.components ?? [];
  const connections = state.connections ?? [];

  const placed = useMemo(
    () => layoutBoard(components, widthMm, heightMm),
    [components, widthMm, heightMm]
  );

  const mm = (v: number) => v * 6; // 6px per mm at zoom 1
  const svgWidth = mm(widthMm);
  const svgHeight = mm(heightMm);
  const padX = 40;
  const padY = 40;

  const traces = useMemo(() => {
    if (!showRouting) return [];
    type Trace = { x1: number; y1: number; x2: number; y2: number; net: string; layer: 'F' | 'B' };
    const out: Trace[] = [];
    const compById = new Map(placed.map((c) => [c.ref, c]));
    connections.forEach((conn, ci) => {
      if (conn.pins.length < 2) return;
      if (/^GND$/i.test(conn.name)) return; // skip GND visualization (would be plane)
      const anchors = conn.pins
        .map((p) => compById.get(p.ref))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 }));
      for (let i = 1; i < anchors.length; i++) {
        const a = anchors[i - 1]!;
        const b = anchors[i]!;
        out.push({
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          net: conn.name,
          layer: ci % 2 === 0 ? 'F' : 'B',
        });
      }
    });
    return out;
  }, [connections, placed, showRouting]);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <StageHeader
        icon={<Layers size={12} />}
        title={title}
        meta={`${widthMm}×${heightMm}mm · ${components.length} comps`}
        actions={
          <>
            <ViewModeSwitch
              mode={effectiveMode}
              onChange={setMode}
              nativeDisabled={!nativeUrl}
            />
            {effectiveMode === 'spec' && (
              <>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}>
                  <ZoomOut size={12} />
                </Button>
                <span className="text-[10px] font-mono text-muted-foreground w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
                  <ZoomIn size={12} />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(1)}>
                  <Maximize2 size={12} />
                </Button>
              </>
            )}
          </>
        }
      />

      {effectiveMode === 'native' && nativeUrl ? (
        <KiCanvasViewer src={nativeUrl} controls="basic" />
      ) : (
        <>
      {showRouting && (
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-[#0a0a0a] shrink-0">
          {(
            [
              { id: 'top',    label: 'Top',    color: '#00C2FF', sub: 'F.Cu' },
              { id: 'bottom', label: 'Bottom', color: '#D4820A', sub: 'B.Cu' },
              { id: 'both',   label: 'Both',   color: '#FFFFFF', sub: 'F + B' },
            ] as const
          ).map((opt) => {
            const active = layer === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLayer(opt.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[#141414] border border-transparent'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: opt.color }}
                />
                <span>{opt.label}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                  {opt.sub}
                </span>
              </button>
            );
          })}
          <span className="ml-auto text-[10px] font-mono text-muted-foreground">
            {traces.filter((t) => layer === 'both' || (layer === 'top' ? t.layer === 'F' : t.layer === 'B')).length} traces
          </span>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[#080808] flex items-center justify-center p-6">
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease',
          }}
        >
          <svg
            width={svgWidth + padX * 2}
            height={svgHeight + padY * 2}
            viewBox={`0 0 ${svgWidth + padX * 2} ${svgHeight + padY * 2}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern id="pcbDots" width="12" height="12" patternUnits="userSpaceOnUse">
                <circle cx="6" cy="6" r="0.6" fill="rgba(0,194,255,0.08)" />
              </pattern>
              <linearGradient id="boardGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0d1a08" />
                <stop offset="100%" stopColor="#0a1505" />
              </linearGradient>
            </defs>

            {/* Background grid */}
            <rect
              x={0}
              y={0}
              width={svgWidth + padX * 2}
              height={svgHeight + padY * 2}
              fill="url(#pcbDots)"
            />

            {/* Board */}
            <g transform={`translate(${padX}, ${padY})`}>
              <rect
                x={0}
                y={0}
                width={svgWidth}
                height={svgHeight}
                rx={6}
                fill="url(#boardGrad)"
                stroke="#1f3010"
                strokeWidth={1.5}
              />

              {/* Mounting holes */}
              {[
                [3, 3],
                [widthMm - 3, 3],
                [3, heightMm - 3],
                [widthMm - 3, heightMm - 3],
              ].map(([x, y], i) => (
                <circle
                  key={i}
                  cx={mm(x!)}
                  cy={mm(y!)}
                  r={3}
                  fill="#080808"
                  stroke="#444"
                  strokeWidth={0.8}
                />
              ))}

              {/* Traces */}
              {traces
                .filter((t) =>
                  layer === 'both' || (layer === 'top' ? t.layer === 'F' : t.layer === 'B'),
                )
                .map((t, i) => {
                const color = t.layer === 'F' ? NET_COLOR_FCU : NET_COLOR_BCU;
                const opacity = t.layer === 'F' ? 0.85 : 0.55;
                const midX = (mm(t.x1) + mm(t.x2)) / 2;
                return (
                  <g key={i} opacity={opacity}>
                    <path
                      d={`M ${mm(t.x1)} ${mm(t.y1)} L ${midX} ${mm(t.y1)} L ${midX} ${mm(t.y2)} L ${mm(t.x2)} ${mm(t.y2)}`}
                      stroke={color}
                      strokeWidth={1.4}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                );
              })}

              {/* Components */}
              {placed.map((c) => {
                const color = KIND_COLOR[c.kind] ?? KIND_COLOR['MISC']!;
                return (
                  <g key={c.ref} transform={`translate(${mm(c.x)}, ${mm(c.y)})`}>
                    <rect
                      width={mm(c.w)}
                      height={mm(c.h)}
                      rx={1.5}
                      fill={color.fill}
                      stroke={color.stroke}
                      strokeWidth={0.8}
                    />
                    {/* Pin1 marker for IC */}
                    {c.kind === 'IC' && (
                      <circle cx={2} cy={2} r={1} fill="#00C2FF" opacity={0.7} />
                    )}
                    <text
                      x={mm(c.w) / 2}
                      y={-2}
                      textAnchor="middle"
                      fill={color.text}
                      fontSize={7}
                      fontFamily="ui-monospace, monospace"
                    >
                      {c.ref}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Title block */}
            <g transform={`translate(${padX}, ${svgHeight + padY + 14})`}>
              <text
                fill="#71717A"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
                letterSpacing="0.08em"
              >
                LAYRIX · {widthMm}×{heightMm}mm · {components.length} COMPONENTS
                {showRouting && ` · ${traces.length} TRACES`}
              </text>
            </g>
          </svg>
        </div>
      </div>

        </>
      )}
    </div>
  );
}
