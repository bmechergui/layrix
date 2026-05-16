import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runRealPlacement,
  PlacementServiceUnavailableError,
} from './placement-service';

const ORIGINAL_FETCH = globalThis.fetch;

function makeKiCadPcb(): string {
  return '(kicad_pcb (version 20240108) (generator pcbnew))';
}

function makeOkResponse(positions: Array<{ ref: string; x_mm: number; y_mm: number }>) {
  const body = {
    kicad_pcb_b64: Buffer.from('(kicad_pcb updated)').toString('base64'),
    placed_count: positions.length,
    positions,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('placement-service', () => {
  beforeEach(() => {
    process.env['KICAD_SERVICE_URL'] = 'http://localhost:8000';
  });
  afterEach(() => {
    delete process.env['KICAD_SERVICE_URL'];
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('returns decoded kicad_pcb_content and positions on success', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeOkResponse([
        { ref: 'U1', x_mm: 25, y_mm: 25 },
        { ref: 'R1', x_mm: 30, y_mm: 20 },
      ]),
    ) as unknown as typeof fetch;

    const result = await runRealPlacement({
      kicadPcbContent: makeKiCadPcb(),
      boardWidthMm: 50,
      boardHeightMm: 50,
    });
    expect(result.kicadPcbContent).toBe('(kicad_pcb updated)');
    expect(result.positions).toHaveLength(2);
    expect(result.positions[0]).toEqual({ ref: 'U1', x_mm: 25, y_mm: 25 });
  });

  it('throws PlacementServiceUnavailableError when KICAD_SERVICE_URL is missing', async () => {
    delete process.env['KICAD_SERVICE_URL'];
    await expect(
      runRealPlacement({
        kicadPcbContent: makeKiCadPcb(),
        boardWidthMm: 50,
        boardHeightMm: 50,
      }),
    ).rejects.toBeInstanceOf(PlacementServiceUnavailableError);
  });

  it('throws PlacementServiceUnavailableError on HTTP 503', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('{"detail":"pcbnew non disponible"}', { status: 503 }),
    ) as unknown as typeof fetch;
    await expect(
      runRealPlacement({
        kicadPcbContent: makeKiCadPcb(),
        boardWidthMm: 50,
        boardHeightMm: 50,
      }),
    ).rejects.toBeInstanceOf(PlacementServiceUnavailableError);
  });

  it('throws PlacementServiceUnavailableError on HTTP 500', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('{"detail":"boom"}', { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      runRealPlacement({
        kicadPcbContent: makeKiCadPcb(),
        boardWidthMm: 50,
        boardHeightMm: 50,
      }),
    ).rejects.toBeInstanceOf(PlacementServiceUnavailableError);
  });

  it('throws PlacementServiceUnavailableError on network error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(
      runRealPlacement({
        kicadPcbContent: makeKiCadPcb(),
        boardWidthMm: 50,
        boardHeightMm: 50,
      }),
    ).rejects.toBeInstanceOf(PlacementServiceUnavailableError);
  });

  it('throws PlacementServiceUnavailableError on AbortError (timeout)', async () => {
    globalThis.fetch = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }) as unknown as typeof fetch;
    await expect(
      runRealPlacement({
        kicadPcbContent: makeKiCadPcb(),
        boardWidthMm: 50,
        boardHeightMm: 50,
      }),
    ).rejects.toBeInstanceOf(PlacementServiceUnavailableError);
  });

  it('throws PlacementServiceUnavailableError on malformed JSON response', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('not json', { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(
      runRealPlacement({
        kicadPcbContent: makeKiCadPcb(),
        boardWidthMm: 50,
        boardHeightMm: 50,
      }),
    ).rejects.toBeInstanceOf(PlacementServiceUnavailableError);
  });

  it('posts request body with base64 + dimensions', async () => {
    const fetchSpy = vi.fn(async () =>
      makeOkResponse([{ ref: 'U1', x_mm: 0, y_mm: 0 }]),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runRealPlacement({
      kicadPcbContent: '(kicad_pcb test)',
      boardWidthMm: 80,
      boardHeightMm: 60,
    });
    const call = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = call?.[0] as string;
    const init = call?.[1] as RequestInit | undefined;
    expect(url).toBe('http://localhost:8000/place/auto');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body)) as {
      kicad_pcb_b64: string;
      board_width_mm: number;
      board_height_mm: number;
    };
    expect(body.board_width_mm).toBe(80);
    expect(body.board_height_mm).toBe(60);
    expect(Buffer.from(body.kicad_pcb_b64, 'base64').toString('utf-8')).toBe(
      '(kicad_pcb test)',
    );
  });
});
