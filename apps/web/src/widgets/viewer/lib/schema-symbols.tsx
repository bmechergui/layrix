/**
 * KiCad-style schematic symbol primitives — SVG.
 *
 * Each symbol returns a `SymbolDef` describing its bounding box, its electrical
 * pins (absolute coordinates inside the bounding box), and a `render(origin)`
 * function that draws the symbol at the given origin.
 *
 * Conventions:
 *  - Stroke width 1.5, color #C8C8CB (neutral light).
 *  - Reference (U1, C1…) in orange above the symbol.
 *  - Value (LM7805, 100nF…) in neutral below the symbol.
 *  - Pins are 1-based numeric or named (VIN, GND, OUT…).
 */
import React from 'react';

export const STROKE = '#C8C8CB';
export const STROKE_W = 1.6;
export const REF_COLOR = '#E07B39';
export const VAL_COLOR = '#A1A1AA';
export const PIN_LABEL_COLOR = '#71717A';

export interface SymbolPin {
  /** Pin identifier — matches connections (numeric "1" or name "VIN"). */
  id: string;
  /** Coordinates relative to the symbol's top-left bounding box. */
  x: number;
  y: number;
}

export interface SymbolDef {
  width: number;
  height: number;
  pins: SymbolPin[];
  /** Draw the symbol at absolute origin (ox, oy). */
  render: (origin: { ox: number; oy: number; ref: string; value: string }) => React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capacitor (non-polarized, horizontal)
// ─────────────────────────────────────────────────────────────────────────────
export function capacitor(): SymbolDef {
  const W = 50, H = 30;
  const mid = W / 2;
  const gap = 4;

  return {
    width: W,
    height: H,
    pins: [
      { id: '1', x: 0,  y: H / 2 },
      { id: '2', x: W,  y: H / 2 },
    ],
    render: ({ ox, oy, ref, value }) => {
      const cy = oy + H / 2;
      return (
        <g key={`cap-${ref}`}>
          <line x1={ox} y1={cy} x2={ox + mid - gap} y2={cy} stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={ox + mid - gap} y1={oy + 6} x2={ox + mid - gap} y2={oy + H - 6} stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={ox + mid + gap} y1={oy + 6} x2={ox + mid + gap} y2={oy + H - 6} stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={ox + mid + gap} y1={cy} x2={ox + W} y2={cy} stroke={STROKE} strokeWidth={STROKE_W} />
          <text x={ox + mid} y={oy - 6} textAnchor="middle" fontSize={11} fontFamily="monospace" fontWeight={600} fill={REF_COLOR}>{ref}</text>
          <text x={ox + mid} y={oy + H + 14} textAnchor="middle" fontSize={10} fontFamily="monospace" fill={VAL_COLOR}>{value}</text>
        </g>
      );
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Capacitor (polarized — electrolytic), with + sign
// ─────────────────────────────────────────────────────────────────────────────
export function capacitorPolarized(): SymbolDef {
  const W = 50, H = 30;
  const mid = W / 2;
  const gap = 4;

  return {
    width: W,
    height: H,
    pins: [
      { id: '1', x: 0,  y: H / 2 },   // anode (+)
      { id: '2', x: W,  y: H / 2 },   // cathode
    ],
    render: ({ ox, oy, ref, value }) => {
      const cy = oy + H / 2;
      return (
        <g key={`pcap-${ref}`}>
          <line x1={ox} y1={cy} x2={ox + mid - gap} y2={cy} stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={ox + mid - gap} y1={oy + 6} x2={ox + mid - gap} y2={oy + H - 6} stroke={STROKE} strokeWidth={STROKE_W} />
          <path d={`M ${ox + mid + gap} ${oy + 6} Q ${ox + mid + gap + 6} ${oy + H/2}, ${ox + mid + gap} ${oy + H - 6}`}
            fill="none" stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={ox + mid + gap + 4} y1={cy} x2={ox + W} y2={cy} stroke={STROKE} strokeWidth={STROKE_W} />
          <text x={ox + mid - gap - 4} y={oy + 4} fontSize={10} fontFamily="monospace" fill={STROKE}>+</text>
          <text x={ox + mid} y={oy - 6} textAnchor="middle" fontSize={11} fontFamily="monospace" fontWeight={600} fill={REF_COLOR}>{ref}</text>
          <text x={ox + mid} y={oy + H + 14} textAnchor="middle" fontSize={10} fontFamily="monospace" fill={VAL_COLOR}>{value}</text>
        </g>
      );
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resistor (rectangle, European style)
// ─────────────────────────────────────────────────────────────────────────────
export function resistor(): SymbolDef {
  const W = 50, H = 16;
  return {
    width: W,
    height: H,
    pins: [
      { id: '1', x: 0, y: H / 2 },
      { id: '2', x: W, y: H / 2 },
    ],
    render: ({ ox, oy, ref, value }) => {
      const cy = oy + H / 2;
      return (
        <g key={`res-${ref}`}>
          <line x1={ox} y1={cy} x2={ox + 10} y2={cy} stroke={STROKE} strokeWidth={STROKE_W} />
          <rect x={ox + 10} y={oy} width={30} height={H} fill="#0a0a0a" stroke={STROKE} strokeWidth={STROKE_W} />
          <line x1={ox + 40} y1={cy} x2={ox + W} y2={cy} stroke={STROKE} strokeWidth={STROKE_W} />
          <text x={ox + W / 2} y={oy - 6} textAnchor="middle" fontSize={11} fontFamily="monospace" fontWeight={600} fill={REF_COLOR}>{ref}</text>
          <text x={ox + W / 2} y={oy + H + 14} textAnchor="middle" fontSize={10} fontFamily="monospace" fill={VAL_COLOR}>{value}</text>
        </g>
      );
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Diode (horizontal, anode → cathode)
// ─────────────────────────────────────────────────────────────────────────────
export function diode(): SymbolDef {
  const W = 50, H = 20;
  const cy = H / 2;
  return {
    width: W,
    height: H,
    pins: [
      { id: '1', x: 0, y: cy },  // anode
      { id: '2', x: W, y: cy },  // cathode
    ],
    render: ({ ox, oy, ref, value }) => {
      const mid = ox + W / 2;
      const y = oy + cy;
      return (
        <g key={`d-${ref}`}>
          <line x1={ox} y1={y} x2={mid - 8} y2={y} stroke={STROKE} strokeWidth={STROKE_W} />
          <polygon points={`${mid - 8},${y - 7} ${mid + 4},${y} ${mid - 8},${y + 7}`} fill={STROKE} />
          <line x1={mid + 4} y1={y - 7} x2={mid + 4} y2={y + 7} stroke={STROKE} strokeWidth={STROKE_W + 0.4} />
          <line x1={mid + 4} y1={y} x2={ox + W} y2={y} stroke={STROKE} strokeWidth={STROKE_W} />
          <text x={mid} y={oy - 4} textAnchor="middle" fontSize={11} fontFamily="monospace" fontWeight={600} fill={REF_COLOR}>{ref}</text>
          <text x={mid} y={oy + H + 12} textAnchor="middle" fontSize={10} fontFamily="monospace" fill={VAL_COLOR}>{value}</text>
        </g>
      );
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LED (diode + arrows)
// ─────────────────────────────────────────────────────────────────────────────
export function led(): SymbolDef {
  const W = 50, H = 28;
  const cy = 14;
  return {
    width: W,
    height: H,
    pins: [
      { id: '1', x: 0, y: cy },
      { id: '2', x: W, y: cy },
    ],
    render: ({ ox, oy, ref, value }) => {
      const mid = ox + W / 2;
      const y = oy + cy;
      return (
        <g key={`led-${ref}`}>
          <line x1={ox} y1={y} x2={mid - 8} y2={y} stroke={STROKE} strokeWidth={STROKE_W} />
          <polygon points={`${mid - 8},${y - 7} ${mid + 4},${y} ${mid - 8},${y + 7}`} fill={STROKE} />
          <line x1={mid + 4} y1={y - 7} x2={mid + 4} y2={y + 7} stroke={STROKE} strokeWidth={STROKE_W + 0.4} />
          <line x1={mid + 4} y1={y} x2={ox + W} y2={y} stroke={STROKE} strokeWidth={STROKE_W} />
          {/* Arrows */}
          <line x1={mid - 2} y1={y - 12} x2={mid + 5} y2={y - 5} stroke={STROKE} strokeWidth={1} />
          <polygon points={`${mid + 5},${y - 5} ${mid + 3},${y - 8} ${mid + 1},${y - 4}`} fill={STROKE} />
          <line x1={mid + 4} y1={y - 12} x2={mid + 11} y2={y - 5} stroke={STROKE} strokeWidth={1} />
          <polygon points={`${mid + 11},${y - 5} ${mid + 9},${y - 8} ${mid + 7},${y - 4}`} fill={STROKE} />
          <text x={mid} y={oy - 2} textAnchor="middle" fontSize={11} fontFamily="monospace" fontWeight={600} fill={REF_COLOR}>{ref}</text>
          <text x={mid} y={oy + H + 12} textAnchor="middle" fontSize={10} fontFamily="monospace" fill={VAL_COLOR}>{value}</text>
        </g>
      );
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// IC / Regulator — box with N named pins on left/right sides
// ─────────────────────────────────────────────────────────────────────────────
export interface ICPin {
  name: string;
  side: 'left' | 'right' | 'top' | 'bottom';
}

export function ic(pinDefs: ICPin[]): SymbolDef {
  const left   = pinDefs.filter(p => p.side === 'left');
  const right  = pinDefs.filter(p => p.side === 'right');
  const top    = pinDefs.filter(p => p.side === 'top');
  const bottom = pinDefs.filter(p => p.side === 'bottom');

  const pinSpacing = 18;
  const padding = 14;

  const innerH = Math.max(left.length, right.length, 1) * pinSpacing + padding;
  const innerW = Math.max(top.length, bottom.length, 1) * pinSpacing + 56;

  const W = innerW;
  const H = innerH;

  // Pins absolute (in symbol box)
  const pins: SymbolPin[] = [];
  left.forEach((p, i) => {
    const y = (i + 0.5) * pinSpacing + padding / 2;
    pins.push({ id: p.name, x: 0, y });
  });
  right.forEach((p, i) => {
    const y = (i + 0.5) * pinSpacing + padding / 2;
    pins.push({ id: p.name, x: W, y });
  });
  top.forEach((p, i) => {
    const x = (i + 0.5) * pinSpacing + padding / 2;
    pins.push({ id: p.name, x, y: 0 });
  });
  bottom.forEach((p, i) => {
    const x = (i + 0.5) * pinSpacing + padding / 2;
    pins.push({ id: p.name, x, y: H });
  });

  return {
    width: W,
    height: H,
    pins,
    render: ({ ox, oy, ref, value }) => (
      <g key={`ic-${ref}`}>
        {/* Body */}
        <rect x={ox + 6} y={oy + 6} width={W - 12} height={H - 12}
          fill="#0F0F0F" stroke={STROKE} strokeWidth={STROKE_W} rx={2} />

        {/* Left pins */}
        {left.map((p, i) => {
          const y = oy + (i + 0.5) * pinSpacing + padding / 2;
          return (
            <g key={`L${i}`}>
              <line x1={ox} y1={y} x2={ox + 6} y2={y} stroke={STROKE} strokeWidth={STROKE_W} />
              <text x={ox + 9} y={y + 3} fontSize={8} fontFamily="monospace" fill={PIN_LABEL_COLOR}>{p.name}</text>
            </g>
          );
        })}
        {/* Right pins */}
        {right.map((p, i) => {
          const y = oy + (i + 0.5) * pinSpacing + padding / 2;
          return (
            <g key={`R${i}`}>
              <line x1={ox + W - 6} y1={y} x2={ox + W} y2={y} stroke={STROKE} strokeWidth={STROKE_W} />
              <text x={ox + W - 9} y={y + 3} fontSize={8} fontFamily="monospace" fill={PIN_LABEL_COLOR} textAnchor="end">{p.name}</text>
            </g>
          );
        })}
        {/* Top pins */}
        {top.map((p, i) => {
          const x = ox + (i + 0.5) * pinSpacing + padding / 2;
          return (
            <g key={`T${i}`}>
              <line x1={x} y1={oy} x2={x} y2={oy + 6} stroke={STROKE} strokeWidth={STROKE_W} />
              <text x={x} y={oy + 14} textAnchor="middle" fontSize={7} fontFamily="monospace" fill={PIN_LABEL_COLOR}>{p.name}</text>
            </g>
          );
        })}
        {/* Bottom pins */}
        {bottom.map((p, i) => {
          const x = ox + (i + 0.5) * pinSpacing + padding / 2;
          return (
            <g key={`B${i}`}>
              <line x1={x} y1={oy + H - 6} x2={x} y2={oy + H} stroke={STROKE} strokeWidth={STROKE_W} />
              <text x={x} y={oy + H - 8} textAnchor="middle" fontSize={7} fontFamily="monospace" fill={PIN_LABEL_COLOR}>{p.name}</text>
            </g>
          );
        })}

        {/* Ref above */}
        <text x={ox + W / 2} y={oy - 6} textAnchor="middle" fontSize={12} fontFamily="monospace" fontWeight={600} fill={REF_COLOR}>{ref}</text>
        {/* Value below */}
        <text x={ox + W / 2} y={oy + H + 16} textAnchor="middle" fontSize={10} fontFamily="monospace" fill={VAL_COLOR}>{value}</text>
      </g>
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector — N pins on right side, pin numbers labeled
// ─────────────────────────────────────────────────────────────────────────────
export function connector(numPins: number, label?: string): SymbolDef {
  const W = 36;
  const pinSpacing = 14;
  const H = numPins * pinSpacing + 8;

  const pins: SymbolPin[] = [];
  for (let i = 0; i < numPins; i++) {
    pins.push({ id: String(i + 1), x: W, y: 4 + i * pinSpacing + pinSpacing / 2 });
  }

  return {
    width: W,
    height: H,
    pins,
    render: ({ ox, oy, ref, value }) => (
      <g key={`conn-${ref}`}>
        <rect x={ox} y={oy} width={20} height={H} fill="#0F0F0F" stroke={STROKE} strokeWidth={STROKE_W} rx={1} />
        {label && (
          <text x={ox + 10} y={oy + H / 2 + 2} textAnchor="middle" fontSize={7} fontFamily="monospace" fill={VAL_COLOR}
            transform={`rotate(-90 ${ox + 10} ${oy + H / 2 + 2})`}>
            {label}
          </text>
        )}
        {Array.from({ length: numPins }, (_, i) => {
          const y = oy + 4 + i * pinSpacing + pinSpacing / 2;
          return (
            <g key={i}>
              <line x1={ox + 20} y1={y} x2={ox + W} y2={y} stroke={STROKE} strokeWidth={STROKE_W} />
              <circle cx={ox + W} cy={y} r={2.5} fill="#0a0a0a" stroke={STROKE} strokeWidth={1.5} />
              <text x={ox + 18} y={y + 3} textAnchor="end" fontSize={7} fontFamily="monospace" fill={PIN_LABEL_COLOR}>{i + 1}</text>
            </g>
          );
        })}
        <text x={ox + W / 2} y={oy - 6} textAnchor="middle" fontSize={11} fontFamily="monospace" fontWeight={600} fill={REF_COLOR}>{ref}</text>
        <text x={ox + W / 2} y={oy + H + 12} textAnchor="middle" fontSize={9} fontFamily="monospace" fill={VAL_COLOR}>{value}</text>
      </g>
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GND power flag — triangle pointing down (pin on top)
// ─────────────────────────────────────────────────────────────────────────────
export function gndFlag(): SymbolDef {
  const W = 18, H = 16;
  return {
    width: W,
    height: H,
    pins: [{ id: 'gnd', x: W / 2, y: 0 }],
    render: ({ ox, oy }) => (
      <g>
        <line x1={ox + W / 2} y1={oy} x2={ox + W / 2} y2={oy + 5} stroke={STROKE} strokeWidth={STROKE_W} />
        <line x1={ox + 1} y1={oy + 5} x2={ox + W - 1} y2={oy + 5} stroke={STROKE} strokeWidth={STROKE_W + 0.4} />
        <line x1={ox + 3} y1={oy + 9} x2={ox + W - 3} y2={oy + 9} stroke={STROKE} strokeWidth={STROKE_W} />
        <line x1={ox + 6} y1={oy + 13} x2={ox + W - 6} y2={oy + 13} stroke={STROKE} strokeWidth={STROKE_W} />
      </g>
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Power flag (+5V, VCC, VIN) — arrow pointing up with label
// ─────────────────────────────────────────────────────────────────────────────
export function powerFlag(label: string): SymbolDef {
  const W = 36, H = 22;
  return {
    width: W,
    height: H,
    pins: [{ id: 'pwr', x: W / 2, y: H }],
    render: ({ ox, oy }) => {
      const mid = ox + W / 2;
      return (
        <g>
          <line x1={mid} y1={oy + H} x2={mid} y2={oy + 10} stroke={STROKE} strokeWidth={STROKE_W} />
          <polygon points={`${mid - 5},${oy + 10} ${mid + 5},${oy + 10} ${mid},${oy + 2}`}
            fill="#0a0a0a" stroke={STROKE} strokeWidth={STROKE_W} />
          <text x={mid} y={oy - 1} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight={600} fill={REF_COLOR}>{label}</text>
        </g>
      );
    },
  };
}
