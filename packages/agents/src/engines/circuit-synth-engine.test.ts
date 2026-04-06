import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCircuitSynthEngine, isCircuitSynthAvailable } from './circuit-synth-engine';
import type { SchemaJson } from './tscircuit-engine';

const SCHEMA: SchemaJson = {
  components: [
    { ref: 'R1', value: '10k', footprint: '0402' },
    { ref: 'C1', value: '100nF', footprint: '0402' },
    { ref: 'U1', value: 'NE555', footprint: 'DIP-8' },
  ],
  nets: ['GND', 'VCC', 'NET1'],
  connections: [
    { name: 'GND', pins: [{ ref: 'R1', pin: 2 }, { ref: 'C1', pin: 2 }] },
    { name: 'VCC', pins: [{ ref: 'U1', pin: 1 }, { ref: 'C1', pin: 1 }] },
    { name: 'NET1', pins: [{ ref: 'R1', pin: 1 }, { ref: 'U1', pin: 2 }] },
  ],
};

// ============================================================
// isCircuitSynthAvailable
// ============================================================

describe('isCircuitSynthAvailable', () => {
  const originalEnv = process.env.KICAD_SERVICE_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.KICAD_SERVICE_URL;
    } else {
      process.env.KICAD_SERVICE_URL = originalEnv;
    }
  });

  it('returns false when KICAD_SERVICE_URL is not set', () => {
    delete process.env.KICAD_SERVICE_URL;
    expect(isCircuitSynthAvailable()).toBe(false);
  });

  it('returns true when KICAD_SERVICE_URL is set', () => {
    process.env.KICAD_SERVICE_URL = 'http://localhost:8000';
    expect(isCircuitSynthAvailable()).toBe(true);
  });
});

// ============================================================
// runCircuitSynthEngine — happy path (mocked fetch)
// ============================================================

describe('runCircuitSynthEngine', () => {
  beforeEach(() => {
    process.env.KICAD_SERVICE_URL = 'http://localhost:8000';
  });

  afterEach(() => {
    delete process.env.KICAD_SERVICE_URL;
    vi.restoreAllMocks();
  });

  it('calls /circuit-synth/generate with correct payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        kicad_sch_content: '(kicad_sch)',
        kicad_pcb_content: '(kicad_pcb)',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await runCircuitSynthEngine(SCHEMA, 60, 40, 'proj-123');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/circuit-synth/generate');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.components).toHaveLength(3);
    expect(body.board_width_mm).toBe(60);
    expect(body.board_height_mm).toBe(40);
    expect(body.project_id).toBe('proj-123');
    expect(Array.isArray(body.connections)).toBe(true);
  });

  it('returns kicad file contents on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        kicad_sch_content: '(kicad_sch (version 20230121))',
        kicad_pcb_content: '(kicad_pcb (version 20221018))',
      }),
    }));

    const result = await runCircuitSynthEngine(SCHEMA);
    expect(result.kicad_sch_content).toContain('kicad_sch');
    expect(result.kicad_pcb_content).toContain('kicad_pcb');
  });

  it('returns null file contents when service returns nulls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, kicad_sch_content: null, kicad_pcb_content: null }),
    }));

    const result = await runCircuitSynthEngine(SCHEMA);
    expect(result.kicad_sch_content).toBeNull();
    expect(result.kicad_pcb_content).toBeNull();
  });

  it('throws on non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(runCircuitSynthEngine(SCHEMA)).rejects.toThrow('503');
  });

  it('throws when service reports failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error: 'No components in schema' }),
    }));

    await expect(runCircuitSynthEngine(SCHEMA)).rejects.toThrow('No components in schema');
  });

  it('uses default URL when KICAD_SERVICE_URL is not set', async () => {
    delete process.env.KICAD_SERVICE_URL;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, kicad_sch_content: null, kicad_pcb_content: null }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await runCircuitSynthEngine(SCHEMA);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('localhost:8000');
  });
});
