/**
 * Logical layout engine — decides where each component sits on the schema sheet
 * based on the netlist connectivity (power flow left → right) and routes
 * orthogonal Manhattan wires between connected pins.
 *
 * Algorithm:
 *   1. Classify components: IC / connector / passive / power-flag.
 *   2. Detect main rail (VIN/VCC/+5V) and ground.
 *   3. Find the "main" IC (most pins, or connected to both VIN and VOUT).
 *   4. Bucket passives into input-side / output-side / signal based on their
 *      shared net with the main IC.
 *   5. Place columns: source connector | input caps | main IC | output caps | sink connector.
 *   6. Stack components vertically inside each column.
 *   7. Generate GND flags below ground-connected pins and power flags above
 *      power-net pins.
 *   8. Manhattan-route each net through a horizontal trunk with vertical drops.
 */
import type { SchemaComponent, SchemaNet } from '@layrix/types';
import {
  capacitor, capacitorPolarized, resistor, diode, led, ic, connector,
  gndFlag, powerFlag, type SymbolDef, type ICPin,
} from './schema-symbols';

const POWER_NET_REGEX = /^(VCC|VDD|\+?[0-9.]+V|VIN|V_?BUS|V_?BAT)$/i;
const GND_NET_REGEX = /^(GND|VSS|0V|AGND|DGND|PGND)$/i;
const OUT_NET_REGEX = /^(VOUT|V_?OUT|OUTPUT|OUT)$/i;

export interface PlacedSymbol {
  ref: string;
  value: string;
  symbol: SymbolDef;
  /** Top-left position on the canvas. */
  ox: number;
  oy: number;
  /** Origin-component reference (null for synthetic power flags). */
  sourceRef: string | null;
  /** For power flags: the net they represent. */
  netLabel: string | null;
}

export interface ResolvedPin {
  /** Component ref or `__pwr:<net>:<index>` for power-flag pseudo-components. */
  ref: string;
  pinId: string;
  /** Absolute coordinates on the canvas. */
  x: number;
  y: number;
}

export interface WireSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RoutedNet {
  name: string;
  segments: WireSegment[];
  junctions: Array<{ x: number; y: number }>;
  /** Whether this is a power rail (skip wires, replaced by power flags). */
  isPower: boolean;
  isGround: boolean;
  color: string;
}

export interface LayoutResult {
  placed: PlacedSymbol[];
  pinIndex: Map<string, ResolvedPin>; // key = "ref.pinId"
  nets: RoutedNet[];
  width: number;
  height: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component classification
// ─────────────────────────────────────────────────────────────────────────────
type CompType = 'ic' | 'cap' | 'pcap' | 'res' | 'led' | 'diode' | 'conn' | 'other';

function classify(c: SchemaComponent): CompType {
  const ref = c.ref.toUpperCase();
  const val = (c.value ?? '').toUpperCase();
  const fp = (c.footprint ?? '').toUpperCase();
  if (ref.startsWith('U') || ref.startsWith('IC')) return 'ic';
  if (ref.startsWith('LED') || val.includes('LED')) return 'led';
  if (ref.startsWith('D')) return 'diode';
  if (ref.startsWith('R')) return 'res';
  if (ref.startsWith('C')) {
    if (fp.includes('CP_') || val.includes('UF') && parseFloat(val) >= 10) return 'pcap';
    return 'cap';
  }
  if (ref.startsWith('J') || ref.startsWith('CONN') || ref.startsWith('P')) return 'conn';
  return 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// IC pin map — best effort per known part, fallback to generic 4-pin
// ─────────────────────────────────────────────────────────────────────────────
const IC_PIN_MAPS: Record<string, ICPin[]> = {
  'LM7805':    [{ name: 'VI', side: 'left' }, { name: 'GND', side: 'bottom' }, { name: 'VO', side: 'right' }],
  '7805':      [{ name: 'VI', side: 'left' }, { name: 'GND', side: 'bottom' }, { name: 'VO', side: 'right' }],
  'LM317':     [{ name: 'ADJ', side: 'bottom' }, { name: 'VO', side: 'right' }, { name: 'VI', side: 'left' }],
  'AMS1117':   [{ name: 'GND', side: 'bottom' }, { name: 'VO', side: 'right' }, { name: 'VI', side: 'left' }],
  'TPS7333':   [{ name: 'IN', side: 'left' }, { name: 'GND', side: 'bottom' }, { name: 'OUT', side: 'right' }, { name: 'EN', side: 'left' }],
  'NE555':     [
    { name: 'GND', side: 'bottom' },
    { name: 'TRG', side: 'left' },
    { name: 'OUT', side: 'right' },
    { name: 'RST', side: 'left' },
    { name: 'CTL', side: 'right' },
    { name: 'THR', side: 'left' },
    { name: 'DIS', side: 'right' },
    { name: 'VCC', side: 'top' },
  ],
  'NE555P':    [
    { name: 'GND', side: 'bottom' },
    { name: 'TRG', side: 'left' },
    { name: 'OUT', side: 'right' },
    { name: 'RST', side: 'left' },
    { name: 'CTL', side: 'right' },
    { name: 'THR', side: 'left' },
    { name: 'DIS', side: 'right' },
    { name: 'VCC', side: 'top' },
  ],
};

function getICPins(comp: SchemaComponent, connections: SchemaNet[]): ICPin[] {
  const val = (comp.value ?? '').toUpperCase().replace(/[^\w]/g, '');
  for (const [key, pins] of Object.entries(IC_PIN_MAPS)) {
    if (val.includes(key)) return pins;
  }
  // Fallback: build from connections touching this IC, distribute 1..N
  const conns = connections.filter(n => n.pins.some(p => p.ref === comp.ref));
  const pinNames = new Set<string>();
  for (const c of conns) {
    for (const p of c.pins) {
      if (p.ref === comp.ref) pinNames.add(String(p.pin));
    }
  }
  const arr = Array.from(pinNames).sort();
  const result: ICPin[] = [];
  const half = Math.ceil(arr.length / 2);
  arr.forEach((name, i) => {
    result.push({ name, side: i < half ? 'left' : 'right' });
  });
  if (result.length === 0) {
    return [{ name: '1', side: 'left' }, { name: '2', side: 'right' }];
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build symbol for a component
// ─────────────────────────────────────────────────────────────────────────────
function symbolFor(c: SchemaComponent, type: CompType, connections: SchemaNet[]): SymbolDef {
  switch (type) {
    case 'cap':    return capacitor();
    case 'pcap':   return capacitorPolarized();
    case 'res':    return resistor();
    case 'diode':  return diode();
    case 'led':    return led();
    case 'ic':     return ic(getICPins(c, connections));
    case 'conn': {
      // Try to infer pin count from connections
      const conns = connections.filter(n => n.pins.some(p => p.ref === c.ref));
      const pinNums = new Set<number>();
      for (const cn of conns) {
        for (const p of cn.pins) {
          if (p.ref === c.ref) pinNums.add(typeof p.pin === 'number' ? p.pin : parseInt(String(p.pin), 10) || 1);
        }
      }
      const numPins = Math.max(2, pinNums.size);
      return connector(numPins, c.value);
    }
    default:       return capacitor();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout the whole schematic
// ─────────────────────────────────────────────────────────────────────────────
export function layoutSchema(
  components: SchemaComponent[],
  connections: SchemaNet[],
): LayoutResult {
  const placed: PlacedSymbol[] = [];
  const pinIndex = new Map<string, ResolvedPin>();

  // Classify
  const byRef = new Map<string, SchemaComponent>();
  const typeByRef = new Map<string, CompType>();
  for (const c of components) {
    byRef.set(c.ref, c);
    typeByRef.set(c.ref, classify(c));
  }

  // Detect power & ground nets
  const powerNet = connections.find(n => POWER_NET_REGEX.test(n.name) || OUT_NET_REGEX.test(n.name))?.name;
  const groundNet = connections.find(n => GND_NET_REGEX.test(n.name))?.name;

  // For each component, find which nets it's connected to
  const netsByRef = new Map<string, Set<string>>();
  for (const c of components) netsByRef.set(c.ref, new Set());
  for (const net of connections) {
    for (const p of net.pins) {
      netsByRef.get(p.ref)?.add(net.name);
    }
  }

  // Find main IC = IC with the most distinct nets (or first IC)
  const ics = components.filter(c => typeByRef.get(c.ref) === 'ic');
  const mainIC = ics.length
    ? ics.reduce((best, c) =>
        (netsByRef.get(c.ref)?.size ?? 0) > (netsByRef.get(best.ref)?.size ?? 0) ? c : best
      , ics[0]!)
    : null;

  // Find input vs output nets relative to main IC
  const mainNets = mainIC ? Array.from(netsByRef.get(mainIC.ref) ?? []) : [];
  const inputNet = mainNets.find(n => /^(VIN|VI|IN|VBUS|VBAT|VCC|VDD)$/i.test(n))
                ?? mainNets.find(n => POWER_NET_REGEX.test(n) && !OUT_NET_REGEX.test(n));
  const outputNet = mainNets.find(n => OUT_NET_REGEX.test(n));

  // Bucket components into columns
  const colSource: SchemaComponent[]   = [];
  const colInputs: SchemaComponent[]   = [];
  const colCenter: SchemaComponent[]   = mainIC ? [mainIC] : [];
  const colOutputs: SchemaComponent[]  = [];
  const colSink: SchemaComponent[]     = [];
  const colSignal: SchemaComponent[]   = [];

  for (const c of components) {
    if (c === mainIC) continue;
    const t = typeByRef.get(c.ref)!;
    const nets = netsByRef.get(c.ref) ?? new Set();

    if (t === 'conn') {
      // Source connector = has input net, no output net
      if (inputNet && nets.has(inputNet)) colSource.push(c);
      else if (outputNet && nets.has(outputNet)) colSink.push(c);
      else colSink.push(c); // fallback
      continue;
    }

    if (t === 'ic') {
      // Non-main IC → signal column
      colSignal.push(c);
      continue;
    }

    // Passives — bucket by which power side they're on
    const onInput = inputNet ? nets.has(inputNet) : false;
    const onOutput = outputNet ? nets.has(outputNet) : false;

    if (onInput && !onOutput) colInputs.push(c);
    else if (onOutput && !onInput) colOutputs.push(c);
    else if (mainIC) colSignal.push(c);
    else colInputs.push(c);
  }

  // Geometry constants
  const COL_X = [60, 200, 400, 600, 740];   // source, in-caps, IC, out-caps, sink
  const SIGNAL_X = 380;                      // signal IC/passives row (above)
  const ROW_GAP = 90;
  const FIRST_Y = 180;

  // Helper to place column
  const place = (col: SchemaComponent[], x: number, startY: number) => {
    let y = startY;
    for (const c of col) {
      const type = typeByRef.get(c.ref)!;
      const sym = symbolFor(c, type, connections);
      // Center symbol horizontally on column x
      const ox = x - sym.width / 2;
      placed.push({
        ref: c.ref,
        value: c.value,
        symbol: sym,
        ox,
        oy: y,
        sourceRef: c.ref,
        netLabel: null,
      });
      // Index pins
      for (const p of sym.pins) {
        pinIndex.set(`${c.ref}.${p.id}`, { ref: c.ref, pinId: p.id, x: ox + p.x, y: y + p.y });
      }
      y += sym.height + ROW_GAP;
    }
  };

  place(colSource,  COL_X[0]!, FIRST_Y);
  place(colInputs,  COL_X[1]!, FIRST_Y);
  place(colCenter,  COL_X[2]!, FIRST_Y);
  place(colOutputs, COL_X[3]!, FIRST_Y);
  place(colSink,    COL_X[4]!, FIRST_Y);

  // Signal column (above main IC if present)
  if (colSignal.length) {
    let x = SIGNAL_X;
    let y = 40;
    for (const c of colSignal) {
      const type = typeByRef.get(c.ref)!;
      const sym = symbolFor(c, type, connections);
      const ox = x;
      placed.push({
        ref: c.ref,
        value: c.value,
        symbol: sym,
        ox,
        oy: y,
        sourceRef: c.ref,
        netLabel: null,
      });
      for (const p of sym.pins) {
        pinIndex.set(`${c.ref}.${p.id}`, { ref: c.ref, pinId: p.id, x: ox + p.x, y: y + p.y });
      }
      x += sym.width + 30;
    }
  }

  // Resolve pin coordinates for each net's pins. Use pin name from connection,
  // matching either by exact id ("1", "VIN") or by numeric fallback.
  const resolvePin = (ref: string, pin: number | string): ResolvedPin | null => {
    const key1 = `${ref}.${pin}`;
    const direct = pinIndex.get(key1);
    if (direct) return direct;

    // Numeric fallback for ICs that use names: pick nth pin in declared order
    const compPlaced = placed.find(p => p.ref === ref);
    if (!compPlaced) return null;
    const num = typeof pin === 'number' ? pin : parseInt(String(pin), 10);
    if (!Number.isFinite(num)) return null;
    const pinDef = compPlaced.symbol.pins[num - 1];
    if (!pinDef) return null;
    return { ref, pinId: pinDef.id, x: compPlaced.ox + pinDef.x, y: compPlaced.oy + pinDef.y };
  };

  // Generate GND flags below each ground pin & power flags above each power pin
  let pwrCounter = 0;
  const pwrPlaced: PlacedSymbol[] = [];

  for (const net of connections) {
    const isGnd = GND_NET_REGEX.test(net.name);
    const isPwr = POWER_NET_REGEX.test(net.name);
    if (!isGnd && !isPwr) continue;

    for (const p of net.pins) {
      const pin = resolvePin(p.ref, p.pin);
      if (!pin) continue;

      const flagRef = `__pwr:${net.name}:${pwrCounter++}`;
      if (isGnd) {
        const sym = gndFlag();
        const ox = pin.x - sym.width / 2;
        const oy = pin.y + 6;
        pwrPlaced.push({ ref: flagRef, value: '', symbol: sym, ox, oy, sourceRef: null, netLabel: net.name });
        pinIndex.set(`${flagRef}.gnd`, { ref: flagRef, pinId: 'gnd', x: pin.x, y: pin.y + 6 });
      } else {
        const sym = powerFlag(net.name);
        const ox = pin.x - sym.width / 2;
        const oy = pin.y - sym.height - 6;
        pwrPlaced.push({ ref: flagRef, value: '', symbol: sym, ox, oy, sourceRef: null, netLabel: net.name });
        pinIndex.set(`${flagRef}.pwr`, { ref: flagRef, pinId: 'pwr', x: pin.x, y: pin.y - 6 });
      }
    }
  }
  placed.push(...pwrPlaced);

  // Route wires — Manhattan paths net by net.
  // For power/ground nets, the wire is just a short stub between each device
  // pin and its dedicated flag (already placed).
  const nets: RoutedNet[] = [];
  const NET_COLORS = [
    '#22D3EE', '#A78BFA', '#F472B6', '#FACC15', '#34D399',
    '#FB923C', '#60A5FA', '#F87171', '#84CC16', '#E879F9',
  ];

  for (let i = 0; i < connections.length; i++) {
    const net = connections[i]!;
    const isGnd = GND_NET_REGEX.test(net.name);
    const isPwr = POWER_NET_REGEX.test(net.name);
    const color = isGnd ? '#A1A1AA' : isPwr ? '#F59E0B' : NET_COLORS[i % NET_COLORS.length]!;

    const pinCoords = net.pins
      .map(p => resolvePin(p.ref, p.pin))
      .filter((p): p is ResolvedPin => p !== null);
    if (pinCoords.length < 2) {
      nets.push({ name: net.name, segments: [], junctions: [], isPower: isPwr, isGround: isGnd, color });
      continue;
    }

    if (isGnd || isPwr) {
      // Stubs to each flag — already handled by the flag's own short line.
      // Add a tiny connector between pin and the flag origin.
      const segs: WireSegment[] = [];
      for (const p of pinCoords) {
        if (isGnd) {
          segs.push({ x1: p.x, y1: p.y, x2: p.x, y2: p.y + 6 });
        } else {
          segs.push({ x1: p.x, y1: p.y, x2: p.x, y2: p.y - 6 });
        }
      }
      nets.push({ name: net.name, segments: segs, junctions: [], isPower: isPwr, isGround: isGnd, color });
      continue;
    }

    // Signal net: horizontal trunk at average Y, vertical drops to each pin
    const trunkY = Math.round(pinCoords.reduce((s, p) => s + p.y, 0) / pinCoords.length);
    const sortedByX = [...pinCoords].sort((a, b) => a.x - b.x);
    const minX = sortedByX[0]!.x;
    const maxX = sortedByX[sortedByX.length - 1]!.x;

    const segments: WireSegment[] = [];
    // Trunk
    segments.push({ x1: minX, y1: trunkY, x2: maxX, y2: trunkY });
    // Drops
    const junctions: Array<{ x: number; y: number }> = [];
    for (const p of pinCoords) {
      if (p.y !== trunkY) {
        segments.push({ x1: p.x, y1: trunkY, x2: p.x, y2: p.y });
        // Mark junction at trunk for >2 pins
        if (pinCoords.length > 2 && p.x !== minX && p.x !== maxX) {
          junctions.push({ x: p.x, y: trunkY });
        }
      }
    }
    nets.push({ name: net.name, segments, junctions, isPower: false, isGround: false, color });
  }

  // Compute canvas bounds
  const maxX = placed.reduce((m, p) => Math.max(m, p.ox + p.symbol.width), 0) + 80;
  const maxY = placed.reduce((m, p) => Math.max(m, p.oy + p.symbol.height), 0) + 80;

  return {
    placed,
    pinIndex,
    nets,
    width: Math.max(800, maxX),
    height: Math.max(450, maxY),
  };
}
