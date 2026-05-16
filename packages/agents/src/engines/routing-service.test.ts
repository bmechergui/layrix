import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runRealRouting,
  RoutingServiceUnavailableError,
} from './routing-service';

const ORIGINAL_FETCH = globalThis.fetch;

function makeKiCadPcb(): string {
  return '(kicad_pcb (version 20240108) (generator pcbnew))';
}

function makeOkResponse(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('routing-service', () => {
  beforeEach(() => {
    process.env['KICAD_SERVICE_URL'] = 'http://localhost:8000';
  });
  afterEach(() => {
    delete process.env['KICAD_SERVICE_URL'];
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('returns routed result on 200 with kicad_pcb_b64', async () => {
    const routedPcb = '(kicad_pcb routed)';
    globalThis.fetch = vi.fn(async () =>
      makeOkResponse({
        kicad_pcb_b64: Buffer.from(routedPcb).toString('base64'),
        routed_percent: 100,
        layers: 2,
        via_count: 4,
        track_length_mm: 120.5,
        skipped: false,
      }),
    ) as unknown as typeof fetch;

    const result = await runRealRouting({
      kicadPcbContent: makeKiCadPcb(),
      layers: 2,
    });
    expect(result.skipped).toBe(false);
    expect(result.routedPercent).toBe(100);
    expect(result.kicadPcbContent).toBe(routedPcb);
    expect(result.layers).toBe(2);
  });

  it('propagates skipped state when Freerouting unavailable', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeOkResponse({
        kicad_pcb_b64: null,
        routed_percent: 0,
        layers: 4,
        skipped: true,
        warning: 'Freerouting not available',
      }),
    ) as unknown as typeof fetch;

    const result = await runRealRouting({
      kicadPcbContent: makeKiCadPcb(),
      layers: 4,
    });
    expect(result.skipped).toBe(true);
    expect(result.warning).toContain('Freerouting');
    expect(result.kicadPcbContent).toBeUndefined();
  });

  it('throws RoutingServiceUnavailableError when KICAD_SERVICE_URL is missing', async () => {
    delete process.env['KICAD_SERVICE_URL'];
    await expect(
      runRealRouting({ kicadPcbContent: makeKiCadPcb(), layers: 2 }),
    ).rejects.toBeInstanceOf(RoutingServiceUnavailableError);
  });

  it('throws RoutingServiceUnavailableError on HTTP 500', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('{"detail":"boom"}', { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      runRealRouting({ kicadPcbContent: makeKiCadPcb(), layers: 2 }),
    ).rejects.toBeInstanceOf(RoutingServiceUnavailableError);
  });

  it('throws RoutingServiceUnavailableError on network failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(
      runRealRouting({ kicadPcbContent: makeKiCadPcb(), layers: 2 }),
    ).rejects.toBeInstanceOf(RoutingServiceUnavailableError);
  });

  it('throws RoutingServiceUnavailableError on AbortError (timeout)', async () => {
    globalThis.fetch = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }) as unknown as typeof fetch;
    await expect(
      runRealRouting({ kicadPcbContent: makeKiCadPcb(), layers: 2 }),
    ).rejects.toBeInstanceOf(RoutingServiceUnavailableError);
  });

  it('posts request with base64 + layers + timeout', async () => {
    const fetchSpy = vi.fn(async () =>
      makeOkResponse({
        kicad_pcb_b64: Buffer.from('(kicad_pcb x)').toString('base64'),
        routed_percent: 100, layers: 4, skipped: false,
      }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runRealRouting({ kicadPcbContent: '(kicad_pcb in)', layers: 4 });
    const call = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = call?.[0] as string;
    const init = call?.[1] as RequestInit | undefined;
    expect(url).toBe('http://localhost:8000/route/auto');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body)) as {
      kicad_pcb_b64: string;
      layers: number;
      timeout_s: number;
    };
    expect(body.layers).toBe(4);
    expect(body.timeout_s).toBeGreaterThan(0);
    expect(Buffer.from(body.kicad_pcb_b64, 'base64').toString('utf-8')).toBe(
      '(kicad_pcb in)',
    );
  });
});
