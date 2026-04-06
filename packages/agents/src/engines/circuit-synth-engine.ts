/**
 * Circuit-Synth engine — generates native .kicad_sch + .kicad_pcb files.
 *
 * Always works without any external service:
 *   - Inline TypeScript S-expression generators produce valid KiCad 7 files
 *   - If KICAD_SERVICE_URL is set, the Python service is tried first for pcbnew quality
 *
 * TSCircuit is NEVER used — this is the sole engine.
 */

import type { SchemaJson, SchemaComponent, SchemaNet } from '@layrix/types';

export type { SchemaJson };

export interface CircuitSynthResult {
  kicad_sch_content: string;
  kicad_pcb_content: string;
}

// ============================================================
// Layout helpers
// ============================================================

function gridPos(
  idx: number,
  total: number,
  boardW: number,
  boardH: number
): { x: number; y: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.ceil(total / cols);
  const margin = 5;
  const usableW = boardW - 2 * margin;
  const usableH = boardH - 2 * margin;
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  return {
    x: +( margin + (col + 0.5) * (usableW / cols)).toFixed(3),
    y: +( margin + (row + 0.5) * (usableH / rows)).toFixed(3),
  };
}

function padCount(footprint: string): number {
  const fp = footprint.toUpperCase();
  if (fp.includes('SOT-23-5')) return 5;
  if (fp.includes('SOT-23')) return 3;
  if (fp.includes('DIP-14')) return 14;
  if (fp.includes('DIP-16') || fp.includes('SOIC-16')) return 16;
  if (fp.includes('DIP-8') || fp.includes('TSSOP-8') || fp.includes('SOIC-8')) return 8;
  return 2; // 0402, 0603, 0805, 1206, LED, CAP…
}

function footprintToLibId(footprint: string): string {
  const fp = footprint.toUpperCase();
  if (fp.includes('LED')) return 'Device:LED';
  if (fp.includes('CAP') || fp.includes('C_')) return 'Device:C';
  if (fp.includes('SOT-23')) return 'Device:Q_NPN_BCE';
  if (fp.includes('DIP') || fp.includes('SOIC')) return 'Device:IC';
  if (fp.includes('CONN') || fp.includes('2PIN') || fp.includes('2BROCHE')) return 'Connector_Generic:Conn_01x02';
  return 'Device:R';
}

// ============================================================
// .kicad_sch generator (KiCad 7 S-expression format)
// ============================================================

function generateSchematic(
  components: SchemaComponent[],
  connections: SchemaNet[]
): string {
  const lines: string[] = [];
  lines.push('(kicad_sch (version 20230121) (generator "layrix-circuit-synth")');
  lines.push('  (paper "A4")');
  lines.push('  (lib_symbols)');

  const cols = Math.max(1, Math.ceil(Math.sqrt(components.length)));

  components.forEach((comp, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 50 + col * 30;
    const y = 50 + row * 30;
    const libId = footprintToLibId(comp.footprint);
    const ref = comp.ref.replace(/"/g, '\\"');
    const val = comp.value.replace(/"/g, '\\"');
    const fp  = comp.footprint.replace(/"/g, '\\"');

    lines.push(`  (symbol (lib_id "${libId}") (at ${x} ${y} 0) (unit 1)`);
    lines.push(`    (property "Reference" "${ref}" (at ${x} ${y - 5} 0) (effects (font (size 1.27 1.27))))`);
    lines.push(`    (property "Value" "${val}" (at ${x} ${y + 5} 0) (effects (font (size 1.27 1.27))))`);
    lines.push(`    (property "Footprint" "${fp}" (at ${x} ${y + 9} 0) (effects (font (size 1.27 1.27)) (hide yes)))`);
    if (comp.lcsc) {
      lines.push(`    (property "LCSC" "${comp.lcsc.replace(/"/g, '\\"')}" (at ${x} ${y + 13} 0) (effects (font (size 1.27 1.27)) (hide yes)))`);
    }
    lines.push('  )');
  });

  // Global net labels
  const compIdx = new Map(components.map((c, i) => [c.ref, i]));
  connections.forEach((conn) => {
    if (!conn.pins.length) return;
    const idx = compIdx.get(conn.pins[0]!.ref) ?? 0;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const lx  = 50 + col * 30 + 10;
    const ly  = 50 + row * 30;
    const name = conn.name.replace(/"/g, '\\"');
    lines.push(`  (global_label "${name}" (shape input) (at ${lx} ${ly} 0)`);
    lines.push('    (effects (font (size 1.27 1.27)))');
    lines.push('  )');
  });

  lines.push('  (sheet_instances (path "/" (page "1")))');
  lines.push(')');
  return lines.join('\n');
}

// ============================================================
// .kicad_pcb generator (KiCad 7 S-expression format)
// ============================================================

function generatePCB(
  components: SchemaComponent[],
  connections: SchemaNet[],
  boardW: number,
  boardH: number
): string {
  const lines: string[] = [];
  lines.push('(kicad_pcb (version 20221018) (generator "layrix-circuit-synth")');
  lines.push('  (general (thickness 1.6))');
  lines.push('  (paper "A4")');
  lines.push('  (layers');
  const layerDefs = [
    '(0 "F.Cu" signal)',
    '(31 "B.Cu" signal)',
    '(36 "B.SilkS" user "B.Silkscreen")',
    '(37 "F.SilkS" user "F.Silkscreen")',
    '(38 "B.Mask" user)',
    '(39 "F.Mask" user)',
    '(44 "Edge.Cuts" user)',
  ];
  layerDefs.forEach((l) => lines.push(`    ${l}`));
  lines.push('  )');
  lines.push('  (setup (pad_to_mask_clearance 0.05))');

  // Net declarations
  lines.push('  (net 0 "")');
  connections.forEach((conn, i) => {
    lines.push(`  (net ${i + 1} "${conn.name.replace(/"/g, '\\"')}")`);
  });
  const netIdx = new Map(connections.map((c, i) => [c.name, i + 1]));

  // Board outline
  const outline: [number, number, number, number][] = [
    [0, 0, boardW, 0],
    [boardW, 0, boardW, boardH],
    [boardW, boardH, 0, boardH],
    [0, boardH, 0, 0],
  ];
  outline.forEach(([x1, y1, x2, y2]) => {
    lines.push(
      `  (gr_line (start ${x1} ${y1}) (end ${x2} ${y2}) (layer "Edge.Cuts") (width 0.05))`
    );
  });

  // Footprints
  const compPositions = new Map<string, { x: number; y: number }>();
  components.forEach((comp, i) => {
    const pos = gridPos(i, components.length, boardW, boardH);
    compPositions.set(comp.ref, pos);
    const pads = padCount(comp.footprint);
    const ref = comp.ref.replace(/"/g, '\\"');
    const val = comp.value.replace(/"/g, '\\"');
    const fp  = comp.footprint.replace(/"/g, '\\"');

    lines.push(`  (footprint "${fp}" (layer "F.Cu") (at ${pos.x} ${pos.y})`);
    lines.push(`    (property "Reference" "${ref}" (at 0 -2 0) (layer "F.SilkS"))`);
    lines.push(`    (property "Value" "${val}" (at 0 2 0) (layer "F.Fab"))`);

    const spacing = 1.0;
    const startX = -((pads - 1) * spacing) / 2;
    for (let p = 0; p < pads; p++) {
      const px = +(startX + p * spacing).toFixed(3);
      lines.push(
        `    (pad "${p + 1}" smd rect (at ${px} 0) (size 0.6 0.6) (layers "F.Cu" "F.Paste" "F.Mask"))`
      );
    }
    lines.push('  )');
  });

  // Traces from connections
  connections.forEach((conn) => {
    const ni = netIdx.get(conn.name) ?? 0;
    const pts: { x: number; y: number }[] = [];

    conn.pins.forEach((pin) => {
      const pos = compPositions.get(pin.ref);
      if (!pos) return;
      const comp = components.find((c) => c.ref === pin.ref);
      const pads = comp ? padCount(comp.footprint) : 2;
      const spacing = 1.0;
      const startX = -((pads - 1) * spacing) / 2;
      const px = +(pos.x + startX + (pin.pin - 1) * spacing).toFixed(3);
      pts.push({ x: px, y: pos.y });
    });

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      lines.push(
        `  (segment (start ${a.x} ${a.y}) (end ${b.x} ${b.y}) (width 0.2) (layer "F.Cu") (net ${ni}))`
      );
    }
  });

  // Ground plane (B.Cu filled zone)
  lines.push(`  (zone (net 0) (net_name "") (layer "B.Cu") (hatch edge 0.508)`);
  lines.push(`    (connect_pads (clearance 0.5))`);
  lines.push(`    (min_thickness 0.25)`);
  lines.push(`    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))`);
  lines.push(`    (polygon (pts`);
  lines.push(`      (xy 0.5 0.5) (xy ${boardW - 0.5} 0.5) (xy ${boardW - 0.5} ${boardH - 0.5}) (xy 0.5 ${boardH - 0.5})`);
  lines.push(`    ))`);
  lines.push('  )');

  lines.push(')');
  return lines.join('\n');
}

// ============================================================
// Public API
// ============================================================

/** Circuit-Synth is always available — inline generation requires no external service. */
export function isCircuitSynthAvailable(): boolean {
  return true;
}

/**
 * Generate native .kicad_sch + .kicad_pcb from a JSON schema.
 *
 * 1. If KICAD_SERVICE_URL is set → try the Python service (pcbnew quality)
 * 2. Always falls back to inline TypeScript S-expression generation
 */
export async function runCircuitSynthEngine(
  schema: SchemaJson,
  boardWidthMm = 50,
  boardHeightMm = 50,
  projectId = ''
): Promise<CircuitSynthResult> {
  const serviceUrl = process.env.KICAD_SERVICE_URL;

  // Try external service first (optional — better quality with pcbnew)
  if (serviceUrl) {
    try {
      const res = await fetch(`${serviceUrl}/circuit-synth/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          components: schema.components,
          nets: schema.nets,
          connections: schema.connections ?? [],
          board_width_mm: boardWidthMm,
          board_height_mm: boardHeightMm,
          project_id: projectId,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.ok) {
        const data = await res.json() as {
          success: boolean;
          kicad_sch_content?: string | null;
          kicad_pcb_content?: string | null;
          error?: string;
        };
        if (data.success && data.kicad_sch_content && data.kicad_pcb_content) {
          return {
            kicad_sch_content: data.kicad_sch_content,
            kicad_pcb_content: data.kicad_pcb_content,
          };
        }
      }
    } catch {
      // Service unavailable — fall through to inline generation
    }
  }

  // Inline TypeScript S-expression generation (always works)
  return {
    kicad_sch_content: generateSchematic(
      schema.components,
      schema.connections ?? []
    ),
    kicad_pcb_content: generatePCB(
      schema.components,
      schema.connections ?? [],
      boardWidthMm,
      boardHeightMm
    ),
  };
}
