'use client';

/**
 * SchemaCanvas — proper electronic schematic renderer.
 *
 * Replaces the old ratsnest-style view. Uses KiCad-conventional symbols,
 * logical column layout (power flow left → right), and Manhattan-routed
 * wires with junction dots.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import type { PCBState } from '@layrix/types';
import { layoutSchema, type LayoutResult } from '../lib/schema-layout';

const ZOOM_FACTOR = 1.15;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const NET_LABEL_COLOR = '#71717A';

interface ViewBox { x: number; y: number; w: number; h: number }

export function SchemaCanvas({ pcbState }: { pcbState: PCBState | null }) {
  const components = pcbState?.components ?? [];
  const connections = pcbState?.connections ?? [];

  const layout: LayoutResult = useMemo(
    () => layoutSchema(components, connections),
    [components, connections],
  );

  const [vb, setVb] = useState<ViewBox>({ x: 0, y: 0, w: layout.width, h: layout.height });
  const dragRef = useRef<{ sx: number; sy: number; vbx: number; vby: number } | null>(null);

  useEffect(() => {
    setVb({ x: 0, y: 0, w: layout.width, h: layout.height });
  }, [layout.width, layout.height]);

  const resetView = useCallback(() => {
    setVb({ x: 0, y: 0, w: layout.width, h: layout.height });
  }, [layout.width, layout.height]);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    setVb(prev => {
      const scale = e.deltaY < 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
      const nw = Math.min(layout.width / MIN_SCALE, Math.max(layout.width / MAX_SCALE, prev.w * scale));
      const nh = Math.min(layout.height / MIN_SCALE, Math.max(layout.height / MAX_SCALE, prev.h * scale));
      return {
        x: prev.x + (prev.w - nw) * mx,
        y: prev.y + (prev.h - nh) * my,
        w: nw,
        h: nh,
      };
    });
  }, [layout.width, layout.height]);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, vbx: vb.x, vby: vb.y };
    e.currentTarget.style.cursor = 'grabbing';
  }, [vb.x, vb.y]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - dragRef.current.sx) * (vb.w / rect.width);
    const dy = (e.clientY - dragRef.current.sy) * (vb.h / rect.height);
    setVb(prev => ({ ...prev, x: dragRef.current!.vbx - dx, y: dragRef.current!.vby - dy }));
  }, [vb.w, vb.h]);

  const onMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    dragRef.current = null;
    e.currentTarget.style.cursor = 'grab';
  }, []);

  if (!components.length) {
    return <SchemaEmptyState />;
  }

  return (
    <div className="relative h-full bg-[#0a0a0a] overflow-hidden select-none">
      {/* Top-left meta */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3 pointer-events-none">
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#A1A1AA]">
          Schematic
        </span>
        <span className="text-[10px] font-mono text-[#52525B]">
          {components.length} comp.
          <span className="text-[#2A2A2A]"> · </span>
          {layout.nets.length} nets
        </span>
      </div>

      {/* Top-right reset */}
      <button
        type="button"
        onClick={resetView}
        className="absolute top-3 right-3 z-10 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[#A1A1AA] border border-[#1F1F1F] rounded bg-[#0D0D0D]/80 hover:text-foreground hover:border-[#2E2E2E] transition-colors"
        title="Reset zoom"
      >
        fit
      </button>

      {/* Footer hint */}
      <p className="absolute bottom-2 left-4 text-[9px] text-[#3D3D3D] font-mono pointer-events-none">
        scroll to zoom · drag to pan
      </p>

      <svg
        width="100%"
        height="100%"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        style={{ cursor: 'grab', display: 'block' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Sheet background — subtle dot grid */}
        <defs>
          <pattern id="schDots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="0.5" cy="0.5" r="0.5" fill="#1c1c1c" />
          </pattern>
        </defs>
        <rect x={0} y={0} width={layout.width} height={layout.height} fill="url(#schDots)" />

        {/* Sheet border — light frame */}
        <rect x={20} y={20} width={layout.width - 40} height={layout.height - 40}
          fill="none" stroke="#1F1F1F" strokeWidth={1} />

        {/* Wires */}
        {layout.nets.map((net, i) => (
          <g key={`net-${i}`}>
            {net.segments.map((s, si) => (
              <line key={si}
                x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                stroke={net.color}
                strokeWidth={net.isPower ? 2 : net.isGround ? 1.6 : 1.5}
                opacity={net.isPower || net.isGround ? 0.85 : 0.92}
              />
            ))}
            {net.junctions.map((j, ji) => (
              <circle key={`j${ji}`} cx={j.x} cy={j.y} r={2.5} fill={net.color} />
            ))}
            {/* Net label near first segment — only for signal nets with 2+ segments */}
            {!net.isPower && !net.isGround && net.segments.length > 0 && (() => {
              const s = net.segments[0]!;
              const mx = (s.x1 + s.x2) / 2;
              const my = Math.min(s.y1, s.y2) - 4;
              return (
                <text x={mx} y={my} textAnchor="middle" fontSize={9}
                  fontFamily="monospace" fill={NET_LABEL_COLOR}>
                  {net.name}
                </text>
              );
            })()}
          </g>
        ))}

        {/* Symbols */}
        {layout.placed.map((p) => (
          <React.Fragment key={p.ref}>
            {p.symbol.render({ ox: p.ox, oy: p.oy, ref: p.sourceRef ?? '', value: p.value })}
          </React.Fragment>
        ))}

        {/* Title block — bottom-right corner */}
        <g>
          <rect
            x={layout.width - 220}
            y={layout.height - 60}
            width={200}
            height={40}
            fill="#0d0d0d"
            stroke="#2A2A2A"
            strokeWidth={0.8}
          />
          <text x={layout.width - 210} y={layout.height - 44} fontSize={8} fontFamily="monospace" fill="#71717A">
            LAYRIX · AI PCB DESIGN
          </text>
          <text x={layout.width - 210} y={layout.height - 30} fontSize={8} fontFamily="monospace" fill="#52525B">
            {components.length} comp · {layout.nets.length} nets
          </text>
        </g>
      </svg>
    </div>
  );
}

function SchemaEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8 bg-[#0a0a0a]">
      <div className="w-16 h-16 rounded-xl bg-[#141414] border border-border flex items-center justify-center">
        <FileText size={32} className="text-primary/30" />
      </div>
      <div className="space-y-1.5 max-w-[260px]">
        <p className="text-xs text-[#A1A1AA] font-medium">Schematic</p>
        <p className="text-[11px] text-[#52525B] leading-relaxed">
          Generated by the Schematic agent — components, symbols,
          power flags, and orthogonal wires.
        </p>
      </div>
      <p className="text-[9px] text-[#3D3D3D] font-mono">Describe your circuit in the chat to begin</p>
    </div>
  );
}
