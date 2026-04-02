import { runTSCircuitEngine, isSimpleCircuit } from './tscircuit-engine';
import type { SchemaJson, TSCircuitResult } from './tscircuit-engine';

export type { SchemaJson, TSCircuitResult };

export type PCBEngine = 'tscircuit' | 'kicad';

/** Decide which engine to use based on circuit complexity */
export function selectEngine(schema: SchemaJson): PCBEngine {
  return isSimpleCircuit(schema) ? 'tscircuit' : 'kicad';
}

/** Run the appropriate engine and return the result */
export async function runPCBEngine(
  schema: SchemaJson,
  boardWidthMm = 50,
  boardHeightMm = 50
): Promise<TSCircuitResult & { engine: PCBEngine }> {
  const engine = selectEngine(schema);

  if (engine === 'tscircuit') {
    const result = await runTSCircuitEngine(schema, boardWidthMm, boardHeightMm);
    return { ...result, engine };
  }

  // KiCad stub — Phase 3.1
  return {
    engine: 'kicad',
    circuitJson: [],
    gerbers: {},
    boardWidthMm,
    boardHeightMm,
    placements: schema.components.map((c, i) => ({
      ref: c.ref,
      x_mm: (i % 5) * 10 + 5,
      y_mm: Math.floor(i / 5) * 10 + 5,
      rotation: 0,
      side: 'front',
    })),
  };
}
