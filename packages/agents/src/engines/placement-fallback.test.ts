import { describe, it, expect } from 'vitest';
import {
  classifyKind,
  computeLayout,
  MARGIN_MM,
  IC_SPACING_MM,
  CLUSTER_RADIUS_BASE_MM,
  CLUSTER_RADIUS_STEP_MM,
  EDGE_OFFSET_MM,
} from './placement-fallback';

// ============================================================================
// classifyKind — mirrors Python classify_kind table
// ============================================================================

describe('classifyKind', () => {
  it.each([
    ['U1', 'IC'],
    ['U10', 'IC'],
    ['IC2', 'IC'],
    ['IC42', 'IC'],
    ['R1', 'RES'],
    ['R100', 'RES'],
    ['C1', 'CAP'],
    ['C12', 'CAP'],
    ['D1', 'DIODE'],
    ['LED1', 'DIODE'],
    ['LED99', 'DIODE'],
    ['J1', 'CONN'],
    ['P3', 'CONN'],
    ['TP1', 'MISC'],
    ['Y1', 'MISC'],
    ['X1', 'MISC'],
  ])('%s → %s', (ref, kind) => {
    expect(classifyKind(ref)).toBe(kind);
  });

  it('handles lowercase', () => {
    expect(classifyKind('u1')).toBe('IC');
    expect(classifyKind('r5')).toBe('RES');
  });

  it('empty string → MISC', () => {
    expect(classifyKind('')).toBe('MISC');
  });

  it('unknown prefix → MISC', () => {
    expect(classifyKind('Z1')).toBe('MISC');
    expect(classifyKind('FOO42')).toBe('MISC');
  });
});

// ============================================================================
// computeLayout — signature and IC placement
// ============================================================================

describe('computeLayout signature', () => {
  it('returns empty for empty refs', () => {
    expect(computeLayout([], 50, 50)).toEqual({});
  });

  it('every ref has a position', () => {
    const refs = ['U1', 'R1', 'R2', 'C1', 'D1', 'J1'];
    const layout = computeLayout(refs, 80, 60);
    expect(Object.keys(layout).sort()).toEqual([...refs].sort());
  });

  it('each value is a [x, y, rotation] tuple', () => {
    const layout = computeLayout(['U1'], 50, 50);
    const pos = layout['U1']!;
    expect(pos).toHaveLength(3);
    expect(typeof pos[0]).toBe('number');
    expect(typeof pos[1]).toBe('number');
    expect(typeof pos[2]).toBe('number');
  });
});

describe('computeLayout IC placement', () => {
  it('single IC at centroid', () => {
    const layout = computeLayout(['U1'], 50, 50);
    const [x, y] = layout['U1']!;
    expect(Math.abs(x - 25)).toBeLessThan(1);
    expect(Math.abs(y - 25)).toBeLessThan(1);
  });

  it('two ICs spread horizontally on the mid row', () => {
    const layout = computeLayout(['U1', 'U2'], 60, 40);
    const [x1, y1] = layout['U1']!;
    const [x2, y2] = layout['U2']!;
    expect(Math.abs(y1 - y2)).toBeLessThan(1);
    expect(Math.abs(y1 - 20)).toBeLessThan(1);
    expect(Math.abs(x2 - x1)).toBeGreaterThan(5);
  });

  it('three ICs roughly equally spaced', () => {
    const layout = computeLayout(['U1', 'U2', 'U3'], 90, 50);
    const xs = ['U1', 'U2', 'U3'].map((r) => layout[r]![0]).sort((a, b) => a - b);
    for (const x of xs) {
      expect(x).toBeGreaterThan(MARGIN_MM);
      expect(x).toBeLessThan(90 - MARGIN_MM);
    }
    const gap1 = xs[1]! - xs[0]!;
    const gap2 = xs[2]! - xs[1]!;
    expect(Math.abs(gap1 - gap2)).toBeLessThan(2);
  });
});

describe('computeLayout passives cluster', () => {
  it('passives stay within cluster radius of single IC', () => {
    const refs = ['U1', 'R1', 'R2', 'C1', 'C2'];
    const layout = computeLayout(refs, 50, 50);
    const [icx, icy] = layout['U1']!;
    for (const r of ['R1', 'R2', 'C1', 'C2']) {
      const [px, py] = layout[r]!;
      const dist = Math.hypot(px - icx, py - icy);
      const maxRadius = CLUSTER_RADIUS_BASE_MM + CLUSTER_RADIUS_STEP_MM * 4 + 2;
      expect(dist).toBeLessThanOrEqual(maxRadius);
      expect(dist).toBeGreaterThanOrEqual(CLUSTER_RADIUS_BASE_MM - 2);
    }
  });

  it('passive attaches to one of the ICs when multiple ICs exist', () => {
    const refs = ['U1', 'U2', 'R1'];
    const layout = computeLayout(refs, 100, 50);
    const [u1x, u1y] = layout['U1']!;
    const [u2x, u2y] = layout['U2']!;
    const [r1x, r1y] = layout['R1']!;
    const d1 = Math.hypot(r1x - u1x, r1y - u1y);
    const d2 = Math.hypot(r1x - u2x, r1y - u2y);
    expect(Math.min(d1, d2)).toBeLessThanOrEqual(
      CLUSTER_RADIUS_BASE_MM + CLUSTER_RADIUS_STEP_MM + 2,
    );
  });

  it('passives without IC still placed within bounds', () => {
    const layout = computeLayout(['R1', 'R2', 'C1'], 50, 50);
    for (const r of ['R1', 'R2', 'C1']) {
      const [x, y] = layout[r]!;
      expect(x).toBeGreaterThanOrEqual(MARGIN_MM);
      expect(x).toBeLessThanOrEqual(50 - MARGIN_MM);
      expect(y).toBeGreaterThanOrEqual(MARGIN_MM);
      expect(y).toBeLessThanOrEqual(50 - MARGIN_MM);
    }
  });
});

describe('computeLayout connectors on edges', () => {
  it('single connector on left edge', () => {
    const layout = computeLayout(['J1'], 50, 50);
    const [x] = layout['J1']!;
    expect(x).toBeLessThanOrEqual(MARGIN_MM + EDGE_OFFSET_MM + 1);
  });

  it('two connectors on opposite edges', () => {
    const layout = computeLayout(['J1', 'J2'], 60, 40);
    const xs = [layout['J1']![0], layout['J2']![0]].sort((a, b) => a - b);
    expect(xs[0]).toBeLessThanOrEqual(MARGIN_MM + EDGE_OFFSET_MM + 1);
    expect(xs[1]).toBeGreaterThanOrEqual(60 - MARGIN_MM - EDGE_OFFSET_MM - 1);
  });

  it('four connectors split 2 left + 2 right', () => {
    const layout = computeLayout(['J1', 'J2', 'J3', 'J4'], 60, 60);
    const left = ['J1', 'J2', 'J3', 'J4'].filter(
      (r) => layout[r]![0] <= MARGIN_MM + EDGE_OFFSET_MM + 1,
    );
    const right = ['J1', 'J2', 'J3', 'J4'].filter(
      (r) => layout[r]![0] >= 60 - MARGIN_MM - EDGE_OFFSET_MM - 1,
    );
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
  });

  it('P-connectors treated as CONN', () => {
    const layout = computeLayout(['P1'], 50, 50);
    expect(layout['P1']![0]).toBeLessThanOrEqual(MARGIN_MM + EDGE_OFFSET_MM + 1);
  });
});

describe('computeLayout bounds', () => {
  it.each([
    [30, 30],
    [50, 50],
    [100, 80],
    [200, 150],
  ])('all positions inside margins for %dx%d', (bw, bh) => {
    const refs = ['U1', 'U2', 'R1', 'R2', 'R3', 'C1', 'C2', 'C3', 'D1', 'J1', 'J2', 'TP1'];
    const layout = computeLayout(refs, bw, bh);
    for (const [ref, pos] of Object.entries(layout)) {
      expect(pos[0], `${ref} x`).toBeGreaterThanOrEqual(MARGIN_MM);
      expect(pos[0], `${ref} x`).toBeLessThanOrEqual(bw - MARGIN_MM);
      expect(pos[1], `${ref} y`).toBeGreaterThanOrEqual(MARGIN_MM);
      expect(pos[1], `${ref} y`).toBeLessThanOrEqual(bh - MARGIN_MM);
    }
  });
});

describe('computeLayout determinism + immutability', () => {
  it('same input → same output', () => {
    const refs = ['U1', 'R1', 'R2', 'C1', 'J1'];
    expect(computeLayout(refs, 50, 50)).toEqual(computeLayout(refs, 50, 50));
  });

  it('input list not mutated', () => {
    const refs = ['U1', 'R1', 'C1'];
    const copy = [...refs];
    computeLayout(refs, 50, 50);
    expect(refs).toEqual(copy);
  });
});

describe('constants are exposed and positive', () => {
  it.each([
    ['MARGIN_MM', MARGIN_MM],
    ['IC_SPACING_MM', IC_SPACING_MM],
    ['CLUSTER_RADIUS_BASE_MM', CLUSTER_RADIUS_BASE_MM],
    ['CLUSTER_RADIUS_STEP_MM', CLUSTER_RADIUS_STEP_MM],
    ['EDGE_OFFSET_MM', EDGE_OFFSET_MM],
  ])('%s is positive', (_name, value) => {
    expect(value).toBeGreaterThan(0);
  });
});
