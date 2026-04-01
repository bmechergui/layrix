import { describe, it, expect } from 'vitest';
import { runTSCircuitEngine, isSimpleCircuit } from './tscircuit-engine';
import { selectEngine, runPCBEngine } from './engine-router';

const SIMPLE_SCHEMA = {
  components: [
    { ref: 'LED1', value: 'LED', footprint: 'LED' },
    { ref: 'R1', value: '330R', footprint: '0402' },
  ],
  nets: ['GND', 'VCC', 'NET1'],
};

const COMPLEX_SCHEMA = {
  components: Array.from({ length: 25 }, (_, i) => ({
    ref: `C${i + 1}`, value: '100nF', footprint: '0402',
  })),
  nets: Array.from({ length: 35 }, (_, i) => `NET${i}`),
};

describe('isSimpleCircuit', () => {
  it('returns true for ≤ 20 components + ≤ 30 nets', () => {
    expect(isSimpleCircuit(SIMPLE_SCHEMA)).toBe(true);
  });

  it('returns false for > 20 components', () => {
    expect(isSimpleCircuit(COMPLEX_SCHEMA)).toBe(false);
  });
});

describe('selectEngine', () => {
  it('selects tscircuit for simple circuits', () => {
    expect(selectEngine(SIMPLE_SCHEMA)).toBe('tscircuit');
  });

  it('selects kicad for complex circuits', () => {
    expect(selectEngine(COMPLEX_SCHEMA)).toBe('kicad');
  });
});

describe('runTSCircuitEngine', () => {
  it('returns placements for all components', async () => {
    const result = await runTSCircuitEngine(SIMPLE_SCHEMA);
    expect(result.placements).toHaveLength(2);
    expect(result.placements[0]?.ref).toBe('LED1');
    expect(result.placements[1]?.ref).toBe('R1');
  });

  it('places components within board bounds', async () => {
    const result = await runTSCircuitEngine(SIMPLE_SCHEMA, 50, 50);
    for (const p of result.placements) {
      expect(p.x_mm).toBeGreaterThan(0);
      expect(p.x_mm).toBeLessThan(50);
      expect(p.y_mm).toBeGreaterThan(0);
      expect(p.y_mm).toBeLessThan(50);
    }
  });

  it('returns circuit-json with pcb_board element', async () => {
    const result = await runTSCircuitEngine(SIMPLE_SCHEMA);
    const board = result.circuitJson.find((el) => (el as { type: string }).type === 'pcb_board');
    expect(board).toBeDefined();
    expect((board as { width: number }).width).toBe(50);
  });

  it('returns circuit-json with pcb_component for each component', async () => {
    const result = await runTSCircuitEngine(SIMPLE_SCHEMA);
    const components = result.circuitJson.filter(
      (el) => (el as { type: string }).type === 'pcb_component'
    );
    expect(components).toHaveLength(2);
  });

  it('returns circuit-json with smtpads', async () => {
    const result = await runTSCircuitEngine(SIMPLE_SCHEMA);
    const pads = result.circuitJson.filter(
      (el) => (el as { type: string }).type === 'pcb_smtpad'
    );
    expect(pads.length).toBeGreaterThan(0);
  });

  it('returns boardWidthMm and boardHeightMm', async () => {
    const result = await runTSCircuitEngine(SIMPLE_SCHEMA, 60, 40);
    expect(result.boardWidthMm).toBe(60);
    expect(result.boardHeightMm).toBe(40);
  });
});

describe('runPCBEngine', () => {
  it('runs TSCircuit for simple schema', async () => {
    const result = await runPCBEngine(SIMPLE_SCHEMA);
    expect(result.engine).toBe('tscircuit');
    expect(result.placements.length).toBe(2);
  });

  it('returns kicad stub for complex schema', async () => {
    const result = await runPCBEngine(COMPLEX_SCHEMA);
    expect(result.engine).toBe('kicad');
  });
});
