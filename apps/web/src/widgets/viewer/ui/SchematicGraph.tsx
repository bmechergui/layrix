'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  RotateCcw, 
  Search, 
  X, 
  Palette, 
  Info 
} from 'lucide-react';
import type { SchemaComponent, SchemaNet } from '@layrix/types';
import { buildSchematicLayout, netColor, type SchematicNode } from '../lib/schematic-layout';

interface SchematicGraphProps {
  components: SchemaComponent[];
  connections: SchemaNet[];
}

// Layout constants — EDA-grade proportions
const NODE_W = 162;
const HDR_H = 40;
const PIN_H = 17;
const PIN_PAD = 6;
const PIN_STUB = 8;        // stub length extending outside box
const COL_GAP = 88;
const ROW_GAP = 32;
const COL_X = [20, 228, 448, 668, 878];
const SVG_MARGIN_TOP = 56;
const SVG_MARGIN_BOTTOM = 24;

interface ThemeColors {
  name: string;
  bg: string;
  gridColor: string;
  gridOpacity: number;
  nodeBg: string;
  nodeBorder: string;
  icBorder: string;
  passiveBorder: string;
  connBorder: string;
  headerIC: string;
  headerPassive: string;
  headerConnector: string;
  textMuted: string;
  textPrimary: string;
  textNet: string;
  textRefIC: string;
  textRefPassive: string;
  textRefConnector: string;
  wireOpacity: number;
  wireGlow: string;
  controlBg: string;
  controlBorder: string;
  controlText: string;
  controlHover: string;
}

const THEMES: Record<'cyberpunk' | 'retro', ThemeColors> = {
  cyberpunk: {
    name: 'Cyberpunk Neon',
    bg: '#050508',
    gridColor: 'rgba(0, 243, 255, 0.05)',
    gridOpacity: 0.9,
    nodeBg: 'rgba(10, 10, 16, 0.92)',
    nodeBorder: '#1f202e',
    icBorder: '#00c2ff',
    passiveBorder: '#d4820a',
    connBorder: '#22c55e',
    headerIC: 'linear-gradient(180deg, rgba(0, 194, 255, 0.18) 0%, rgba(10, 10, 16, 0) 100%)',
    headerPassive: 'linear-gradient(180deg, rgba(212, 130, 10, 0.12) 0%, rgba(10, 10, 16, 0) 100%)',
    headerConnector: 'linear-gradient(180deg, rgba(34, 197, 94, 0.12) 0%, rgba(10, 10, 16, 0) 100%)',
    textMuted: '#52526b',
    textPrimary: '#e4e4e7',
    textNet: '#8a8a9a',
    textRefIC: '#00c2ff',
    textRefPassive: '#f59e0b',
    textRefConnector: '#4ade80',
    wireOpacity: 0.75,
    wireGlow: '#00c2ff',
    controlBg: 'bg-[#0f0f16]/95',
    controlBorder: 'border-[#1f202e]',
    controlText: 'text-[#8a8a9a] hover:text-[#00c2ff]',
    controlHover: 'hover:bg-[#1a1a26]',
  },
  retro: {
    name: 'Retro Paper',
    bg: '#fbf9f3',
    gridColor: 'rgba(120, 100, 80, 0.06)',
    gridOpacity: 0.8,
    nodeBg: '#ffffff',
    nodeBorder: '#c3bfb5',
    icBorder: '#1e1b4b',
    passiveBorder: '#78350f',
    connBorder: '#064e3b',
    headerIC: 'linear-gradient(180deg, #f2efe6 0%, #ffffff 100%)',
    headerPassive: 'linear-gradient(180deg, #f7f5ef 0%, #ffffff 100%)',
    headerConnector: 'linear-gradient(180deg, #eef5f1 0%, #ffffff 100%)',
    textMuted: '#8b8577',
    textPrimary: '#1e1b4b',
    textNet: '#6b6659',
    textRefIC: '#1e1b4b',
    textRefPassive: '#78350f',
    textRefConnector: '#064e3b',
    wireOpacity: 0.85,
    wireGlow: '#ef4444',
    controlBg: 'bg-[#ffffff]/95',
    controlBorder: 'border-[#c3bfb5]',
    controlText: 'text-[#6b6659] hover:text-[#1e1b4b]',
    controlHover: 'hover:bg-[#f2efe6]',
  },
};

function nodeH(pinCount: number): number {
  return HDR_H + Math.max(pinCount, 1) * PIN_H + PIN_PAD * 2;
}

function nodePos(nodes: SchematicNode[], node: SchematicNode) {
  const x = COL_X[node.col] ?? 20 + node.col * (NODE_W + COL_GAP);
  const before = nodes.filter((n) => n.col === node.col && n.row < node.row);
  const y = SVG_MARGIN_TOP + before.reduce((s, n) => s + nodeH(n.pinRows.length) + ROW_GAP, 0);
  return { x, y, h: nodeH(node.pinRows.length) };
}

function pinY(pos: { y: number }, rowIndex: number): number {
  return pos.y + HDR_H + PIN_PAD + rowIndex * PIN_H + PIN_H / 2;
}

function pinAnchor(
  nodes: SchematicNode[],
  ref: string,
  pin: string,
  side: 'left' | 'right',
): { x: number; y: number } | null {
  const node = nodes.find((n) => n.ref === ref);
  if (!node) return null;
  const pos = nodePos(nodes, node);
  const idx = node.pinRows.findIndex((p) => p.pin === pin);
  const py = pinY(pos, idx >= 0 ? idx : 0);
  return {
    x: side === 'left' ? pos.x - PIN_STUB : pos.x + NODE_W + PIN_STUB,
    y: py,
  };
}

function isPowerNet(name: string) {
  return /^(VCC|VDD|VIN|VBUS|VBAT|3V3|5V|12V|PWR)/i.test(name);
}
function isGndNet(name: string) {
  return /^GND$/i.test(name);
}

// Computes a clean orthogonal (Manhattan) path with rounded corners
function getOrthogonalPath(x1: number, y1: number, x2: number, y2: number, r = 6): string {
  if (Math.abs(y1 - y2) < 0.5) {
    return `M ${x1} ${y1} H ${x2}`;
  }
  if (Math.abs(x1 - x2) < 0.5) {
    return `M ${x1} ${y1} V ${y2}`;
  }

  // Flowing from left to right (typical column transition)
  if (x2 > x1 + 2 * r + 10) {
    const midX = (x1 + x2) / 2;
    const dy = y2 - y1;
    const signY = Math.sign(dy);

    if (Math.abs(dy) < r * 2) {
      // Too tight vertically, use smooth bezier curve as a backup
      return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    }

    return `M ${x1} ${y1} ` +
           `H ${midX - r} ` +
           `Q ${midX} ${y1} ${midX} ${y1 + r * signY} ` +
           `V ${y2 - r * signY} ` +
           `Q ${midX} ${y2} ${midX + r} ${y2} ` +
           `H ${x2}`;
  } else {
    // Backward path or same column (loop-around bypass routing)
    const dy = y2 - y1;
    const signY = Math.sign(dy);
    const offset = 22; // clearance to step around components
    const midY = y1 + dy / 2;

    if (Math.abs(dy) < r * 4) {
      // Too tight, use S-curve fallback to prevent intersections
      return `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`;
    }

    return `M ${x1} ${y1} ` +
           `H ${x1 + offset - r} ` +
           `Q ${x1 + offset} ${y1} ${x1 + offset} ${y1 + r * signY} ` +
           `V ${midY - r * signY} ` +
           `Q ${x1 + offset} ${midY} ${x1 + offset - r} ${midY} ` +
           `H ${x2 - offset + r} ` +
           `Q ${x2 - offset} ${midY} ${x2 - offset} ${midY + r * signY} ` +
           `V ${y2 - r * signY} ` +
           `Q ${x2 - offset} ${y2} ${x2 - offset + r} ${y2} ` +
           `H ${x2}`;
  }
}

export function SchematicGraph({ components, connections }: SchematicGraphProps) {
  const { nodes, wires } = useMemo(
    () => buildSchematicLayout(components, connections),
    [components, connections],
  );

  // States
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredNet, setHoveredNet] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [theme, setTheme] = useState<'cyberpunk' | 'retro'>('cyberpunk');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

  // References
  const svgRef = useRef<SVGSVGElement | null>(null);
  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const activeTheme = THEMES[theme];

  const svgH = useMemo(() => {
    let max = 0;
    for (let c = 0; c <= 4; c++) {
      const col = nodes.filter((n) => n.col === c);
      const h = col.reduce((s, n) => s + nodeH(n.pinRows.length) + ROW_GAP, 0);
      max = Math.max(max, h);
    }
    return Math.max(450, SVG_MARGIN_TOP + max + SVG_MARGIN_BOTTOM);
  }, [nodes]);

  const svgW = 1060;

  // Fit view automatically on mount or components change
  const handleZoomToFit = () => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = rect.width / svgW;
    const scaleY = rect.height / svgH;
    const newZoom = Math.min(scaleX, scaleY, 1.1) * 0.92;
    setZoom(newZoom);
    setPan({
      x: (rect.width - svgW * newZoom) / 2,
      y: (rect.height - svgH * newZoom) / 2,
    });
  };

  useEffect(() => {
    handleZoomToFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, connections]);

  // Zoom at cursor position
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    const direction = e.deltaY < 0 ? 1 : -1;
    
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const nextZoom = Math.min(Math.max(zoom * (direction > 0 ? zoomFactor : 1 / zoomFactor), 0.35), 3.0);
    
    const dx = mouseX - pan.x;
    const dy = mouseY - pan.y;

    setPan({
      x: mouseX - dx * (nextZoom / zoom),
      y: mouseY - dy * (nextZoom / zoom),
    });
    setZoom(nextZoom);
  };

  // Dragging handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Only drag if left-clicking
    if (e.button !== 0) return;
    // Don't drag if clicking buttons or search
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    isDragging.current = true;
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging.current) {
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleReset = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
    setHoveredNet(null);
    setHoveredNode(null);
    setSearchQuery('');
  };

  // Touch Support for tablets / iPad
  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    isDragging.current = true;
    dragStart.current = { x: touch.clientX - pan.x, y: touch.clientY - pan.y };
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    setPan({
      x: touch.clientX - dragStart.current.x,
      y: touch.clientY - dragStart.current.y,
    });
  };

  // Search filter matching
  const searchNormalized = searchQuery.toLowerCase().trim();
  const matchedNodes = useMemo(() => {
    if (!searchNormalized) return new Set<string>();
    const matches = new Set<string>();
    nodes.forEach((node) => {
      if (
        node.ref.toLowerCase().includes(searchNormalized) ||
        node.value.toLowerCase().includes(searchNormalized) ||
        node.footprint.toLowerCase().includes(searchNormalized)
      ) {
        matches.add(node.ref);
      }
    });
    return matches;
  }, [nodes, searchNormalized]);

  const matchedNets = useMemo(() => {
    if (!searchNormalized) return new Set<string>();
    const matches = new Set<string>();
    connections.forEach((conn) => {
      if (conn.name.toLowerCase().includes(searchNormalized)) {
        matches.add(conn.name);
      }
    });
    return matches;
  }, [connections, searchNormalized]);

  const isSearchActive = searchNormalized.length > 0;

  if (nodes.length === 0) return null;

  const colLabels = ['INPUT', 'DECOUPLING', 'CORE', 'OUTPUT CAPS', 'OUTPUT'] as const;

  return (
    <div 
      className="relative rounded-2xl border overflow-hidden transition-colors duration-300 flex flex-col h-full"
      style={{ 
        backgroundColor: activeTheme.bg, 
        borderColor: theme === 'retro' ? '#e3dfd5' : '#1f202e',
        boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)'
      }}
    >
      {/* Dynamic EDA Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0 select-none backdrop-blur-md bg-opacity-70"
        style={{ 
          borderColor: theme === 'retro' ? '#e3dfd5' : '#1f202e',
          backgroundColor: theme === 'retro' ? '#fcfbf7' : 'rgba(10, 10, 16, 0.4)'
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary/10 border border-primary/20">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Interactive Schematic</span>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest opacity-40" style={{ color: activeTheme.textPrimary }}>
            {nodes.length} Components · {wires.length} Wires
          </span>
        </div>

        {/* Tools and Settings Controls */}
        <div className="flex items-center gap-3">
          {/* Quick Search */}
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 w-3.5 h-3.5 opacity-40" style={{ color: activeTheme.textPrimary }} />
            <input
              type="text"
              placeholder="Search components or nets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-7 py-1 text-xs w-48 rounded-lg bg-black/20 border transition-all placeholder:text-[10px] focus:outline-none focus:w-56 focus:ring-1 focus:ring-primary/45"
              style={{
                borderColor: theme === 'retro' ? '#d3cfc5' : '#1f202e',
                color: activeTheme.textPrimary,
              }}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-foreground/40 hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Theme Selector */}
          <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-black/10"
            style={{ borderColor: theme === 'retro' ? '#d3cfc5' : '#1f202e' }}
          >
            {(['cyberpunk', 'retro'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                  theme === t
                    ? theme === 'retro' ? 'bg-[#c3bfb5] text-white' : 'bg-primary/20 text-primary border border-primary/20'
                    : 'text-foreground/40 hover:text-foreground/80'
                }`}
              >
                {t === 'cyberpunk' ? 'Neon' : 'Paper'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* SVG Canvas Area */}
      <div className="relative flex-1 min-h-[400px] overflow-hidden">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${svgW} ${svgH}`}
          xmlns="http://www.w3.org/2000/svg"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
          className="cursor-grab active:cursor-grabbing outline-none touch-none"
        >
          <defs>
            {/* EDA grid pattern */}
            <pattern id="eda-grid-lines" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.65" fill={activeTheme.gridColor} opacity={activeTheme.gridOpacity} />
            </pattern>

            {/* Glowing filter for active tracks */}
            <filter id="neon-wire-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.0" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Component header gradients */}
            <linearGradient id="ic-header-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme === 'retro' ? '#e2dfd5' : 'rgba(0, 194, 255, 0.16)'} />
              <stop offset="100%" stopColor={theme === 'retro' ? '#ffffff' : 'rgba(0, 194, 255, 0)'} />
            </linearGradient>
            <linearGradient id="passive-header-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme === 'retro' ? '#f5ebd5' : 'rgba(212, 130, 10, 0.12)'} />
              <stop offset="100%" stopColor={theme === 'retro' ? '#ffffff' : 'rgba(212, 130, 10, 0)'} />
            </linearGradient>
            <linearGradient id="connector-header-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme === 'retro' ? '#e0f0e6' : 'rgba(34, 197, 94, 0.12)'} />
              <stop offset="100%" stopColor={theme === 'retro' ? '#ffffff' : 'rgba(34, 197, 94, 0)'} />
            </linearGradient>
          </defs>

          {/* Canvas Transform Wrapper */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Huge grid rect */}
            <rect 
              x={-svgW * 1.5} 
              y={-svgH * 1.5} 
              width={svgW * 4} 
              height={svgH * 4} 
              fill="url(#eda-grid-lines)" 
              pointerEvents="none"
            />

            {/* Column zone dividers */}
            {colLabels.map((label, col) => {
              if (nodes.filter((n) => n.col === col).length === 0) return null;
              const x = (COL_X[col] ?? 0) - 8;
              return (
                <line
                  key={col}
                  x1={x}
                  y1={SVG_MARGIN_TOP - 16}
                  x2={x}
                  y2={svgH - SVG_MARGIN_BOTTOM + 8}
                  stroke={theme === 'retro' ? '#e3dfd5' : '#1e1f2f'}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  opacity={0.7}
                />
              );
            })}

            {/* Column labels */}
            {colLabels.map((label, col) => {
              if (nodes.filter((n) => n.col === col).length === 0) return null;
              const x = (COL_X[col] ?? 0) + NODE_W / 2;
              return (
                <text
                  key={label}
                  x={x}
                  y={SVG_MARGIN_TOP - 16}
                  textAnchor="middle"
                  fill={activeTheme.textMuted}
                  fontSize={8}
                  fontFamily="ui-monospace, monospace"
                  letterSpacing="0.16em"
                  fontWeight={700}
                  opacity={0.65}
                >
                  {label}
                </text>
              );
            })}

            {/* Wires */}
            {wires.map((w, i) => {
              const from = pinAnchor(nodes, w.fromRef, w.fromPin, 'right');
              const to = pinAnchor(nodes, w.toRef, w.toPin, 'left');
              if (!from || !to) return null;

              const color = netColor(w.net);
              const path = getOrthogonalPath(from.x, from.y, to.x, to.y);

              const isHighlighted = hoveredNet === w.net || 
                                    (hoveredNode === w.fromRef || hoveredNode === w.toRef) ||
                                    (isSearchActive && matchedNets.has(w.net));

              const isDimmed = (hoveredNet && hoveredNet !== w.net) || 
                               (hoveredNode && hoveredNode !== w.fromRef && hoveredNode !== w.toRef) ||
                               (isSearchActive && !matchedNets.has(w.net) && matchedNodes.size > 0);

              const isPwr = isPowerNet(w.net);
              const isGnd = isGndNet(w.net);

              return (
                <g 
                  key={`wire-${i}`}
                  className="transition-opacity duration-300"
                  opacity={isDimmed ? 0.15 : 1.0}
                  onMouseEnter={() => setHoveredNet(w.net)}
                  onMouseLeave={() => setHoveredNet(null)}
                  cursor="pointer"
                >
                  {/* Invisible wide path for easier mouse hover selection */}
                  <path
                    d={path}
                    stroke="transparent"
                    strokeWidth={8}
                    fill="none"
                  />

                  {/* Wire glow */}
                  {isHighlighted && (
                    <path
                      d={path}
                      stroke={color}
                      strokeWidth={isPwr || isGnd ? 3.5 : 2.8}
                      fill="none"
                      opacity={0.6}
                      filter="url(#neon-wire-glow)"
                    />
                  )}

                  {/* Physical wire */}
                  <path
                    d={path}
                    stroke={color}
                    strokeWidth={isHighlighted ? 1.8 : (isPwr || isGnd ? 1.4 : 1.1)}
                    fill="none"
                    opacity={isHighlighted ? 1.0 : activeTheme.wireOpacity}
                    strokeDasharray={isGnd ? '3 2' : undefined}
                    className="transition-all duration-200"
                  />

                  {/* Junction points */}
                  <circle 
                    cx={from.x} 
                    cy={from.y} 
                    r={isHighlighted ? 3.0 : 2.2} 
                    fill={color} 
                    opacity={0.9} 
                  />
                  <circle 
                    cx={to.x} 
                    cy={to.y} 
                    r={isHighlighted ? 3.0 : 2.2} 
                    fill={color} 
                    opacity={0.9} 
                  />
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const pos = nodePos(nodes, node);
              const isIC = node.role === 'IC';
              const isConnector = node.role === 'INPUT' || node.role === 'OUTPUT';

              // Visual styling choices
              let borderColor = activeTheme.nodeBorder;
              let hdrFill = 'url(#passive-header-grad)';
              let refColor = activeTheme.textRefPassive;

              if (isIC) {
                borderColor = activeTheme.icBorder;
                hdrFill = 'url(#ic-header-grad)';
                refColor = activeTheme.textRefIC;
              } else if (isConnector) {
                borderColor = activeTheme.connBorder;
                hdrFill = 'url(#connector-header-grad)';
                refColor = activeTheme.textRefConnector;
              }

              // Highlight/Dim Logic
              const isHighlighted = hoveredNode === node.ref || 
                                    (hoveredNet && node.pinRows.some(p => p.net === hoveredNet)) ||
                                    (isSearchActive && matchedNodes.has(node.ref));

              const isDimmed = (hoveredNode && hoveredNode !== node.ref) ||
                               (hoveredNet && !node.pinRows.some(p => p.net === hoveredNet)) ||
                               (isSearchActive && !matchedNodes.has(node.ref) && matchedNets.size === 0);

              return (
                <g 
                  key={node.ref}
                  className="transition-all duration-300"
                  opacity={isDimmed ? 0.35 : 1.0}
                  onMouseEnter={() => setHoveredNode(node.ref)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {/* Glowing Box for highlighted components */}
                  {isHighlighted && (
                    <rect
                      x={pos.x - 2}
                      y={pos.y - 2}
                      width={NODE_W + 4}
                      height={pos.h + 4}
                      rx={6}
                      fill="none"
                      stroke={borderColor}
                      strokeWidth={1.8}
                      opacity={0.7}
                      filter="url(#neon-wire-glow)"
                    />
                  )}

                  {/* Component Container */}
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={NODE_W}
                    height={pos.h}
                    rx={5}
                    fill={activeTheme.nodeBg}
                    stroke={borderColor}
                    strokeWidth={isHighlighted ? 1.5 : (isIC ? 1.1 : 0.8)}
                    className="transition-all duration-200"
                    style={{
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                  />

                  {/* Header */}
                  <rect
                    x={pos.x + 0.5}
                    y={pos.y + 0.5}
                    width={NODE_W - 1}
                    height={HDR_H}
                    rx={4}
                    fill={hdrFill}
                  />

                  <line
                    x1={pos.x}
                    y1={pos.y + HDR_H}
                    x2={pos.x + NODE_W}
                    y2={pos.y + HDR_H}
                    stroke={borderColor}
                    strokeWidth={0.6}
                    opacity={0.4}
                  />

                  {/* Reference Designator */}
                  <text
                    x={pos.x + 8}
                    y={pos.y + 16}
                    fill={refColor}
                    fontSize={10.5}
                    fontWeight={700}
                    fontFamily="ui-monospace, monospace"
                  >
                    {node.ref}
                  </text>

                  {/* Component Value */}
                  <text
                    x={pos.x + 8}
                    y={pos.y + 29}
                    fill={activeTheme.textMuted}
                    fontSize={8.5}
                    fontFamily="ui-monospace, monospace"
                    className="opacity-80"
                  >
                    {node.value}
                  </text>

                  {/* Header Badge */}
                  <text
                    x={pos.x + NODE_W - 8}
                    y={pos.y + 15}
                    textAnchor="end"
                    fill={activeTheme.textMuted}
                    fontSize={7}
                    fontFamily="ui-monospace, monospace"
                    fontWeight={700}
                    letterSpacing="0.08em"
                    className="opacity-55"
                  >
                    {node.role}
                  </text>

                  {/* Pins List */}
                  {node.pinRows.map((p, i) => {
                    const py = pinY(pos, i);
                    const color = netColor(p.net);
                    const isPwr = isPowerNet(p.net);
                    const isGnd = isGndNet(p.net);

                    const isPinNetHighlighted = hoveredNet === p.net;

                    return (
                      <g 
                        key={`${node.ref}-pin-${i}`}
                        className="group/pin cursor-pointer"
                        onMouseEnter={(e) => {
                          setHoveredNet(p.net);
                          setTooltip({
                            x: pos.x + NODE_W + 12,
                            y: py - 16,
                            content: `Net: ${p.net}`
                          });
                        }}
                        onMouseLeave={() => {
                          setHoveredNet(null);
                          setTooltip(null);
                        }}
                      >
                        {/* Horizontal Row Divider */}
                        {i > 0 && (
                          <line
                            x1={pos.x + 1}
                            y1={py - PIN_H / 2}
                            x2={pos.x + NODE_W - 1}
                            y2={py - PIN_H / 2}
                            stroke={theme === 'retro' ? '#eae6db' : '#171722'}
                            strokeWidth={0.6}
                          />
                        )}

                        {/* Left stub */}
                        <line
                          x1={pos.x - PIN_STUB}
                          y1={py}
                          x2={pos.x}
                          y2={py}
                          stroke={borderColor}
                          strokeWidth={0.8}
                          opacity={0.3}
                        />

                        {/* Pin Index */}
                        <text
                          x={pos.x + 7}
                          y={py + 3}
                          fill={activeTheme.textMuted}
                          fontSize={8}
                          fontFamily="ui-monospace, monospace"
                        >
                          {p.pin}
                        </text>

                        {/* Net Name label */}
                        <text
                          x={pos.x + NODE_W - PIN_STUB - 12}
                          y={py + 3}
                          textAnchor="end"
                          fill={isPinNetHighlighted ? color : (isGnd ? '#52526b' : isPwr ? '#D4820A' : activeTheme.textNet)}
                          fontSize={8}
                          fontFamily="ui-monospace, monospace"
                          fontWeight={isPinNetHighlighted ? 700 : 500}
                          className="transition-colors duration-150"
                        >
                          {p.net}
                        </text>

                        {/* Pin Dot indicator */}
                        <circle 
                          cx={pos.x + NODE_W - 10} 
                          cy={py} 
                          r={isPinNetHighlighted ? 3.0 : 2.2} 
                          fill={color} 
                          className="transition-transform duration-150"
                          opacity={isPinNetHighlighted ? 1.0 : 0.75} 
                        />

                        {/* Right stub */}
                        <line
                          x1={pos.x + NODE_W}
                          y1={py}
                          x2={pos.x + NODE_W + PIN_STUB}
                          y2={py}
                          stroke={color}
                          strokeWidth={0.8}
                          opacity={0.4}
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>

          {/* Floating Tooltip inside SVG */}
          {tooltip && (
            <g transform={`translate(${tooltip.x * zoom + pan.x}, ${tooltip.y * zoom + pan.y})`}>
              <rect
                x={-5}
                y={-10}
                width={85}
                height={20}
                rx={4}
                fill={theme === 'retro' ? '#eae6db' : '#141422'}
                stroke={theme === 'retro' ? '#c3bfb5' : '#2a2a3e'}
                strokeWidth={0.7}
                opacity={0.95}
              />
              <text
                x={5}
                y={3}
                fill={activeTheme.textPrimary}
                fontSize={8}
                fontFamily="ui-monospace, monospace"
                fontWeight={600}
              >
                {tooltip.content}
              </text>
            </g>
          )}
        </svg>

        {/* Floating Interactive Canvas HUD controls */}
        <div className={`${activeTheme.controlBg} ${activeTheme.controlBorder} absolute bottom-4 right-4 flex items-center gap-1.5 p-1.5 rounded-xl border shadow-lg backdrop-blur-md bg-opacity-85`}>
          <button
            onClick={() => setZoom(z => Math.min(z + 0.1, 3.0))}
            title="Zoom In"
            className={`p-1.5 rounded-lg transition-colors text-xs ${activeTheme.controlText} ${activeTheme.controlHover}`}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(z - 0.1, 0.35))}
            title="Zoom Out"
            className={`p-1.5 rounded-lg transition-colors text-xs ${activeTheme.controlText} ${activeTheme.controlHover}`}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomToFit}
            title="Fit to Screen"
            className={`p-1.5 rounded-lg transition-colors text-xs ${activeTheme.controlText} ${activeTheme.controlHover}`}
          >
            <Maximize className="w-4 h-4" />
          </button>
          <div className="w-[1px] h-4 bg-gray-500/20" />
          <button
            onClick={handleReset}
            title="Reset Grid"
            className={`p-1.5 rounded-lg transition-colors text-xs ${activeTheme.controlText} ${activeTheme.controlHover}`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Search Results count indicator */}
        {isSearchActive && (
          <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-mono shadow-md backdrop-blur-md bg-black/40 text-primary border-primary/20 animate-fade-in">
            <Info className="w-3.5 h-3.5" />
            <span>
              Found: {matchedNodes.size} Components & {matchedNets.size} Nets
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

