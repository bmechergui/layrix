import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const mockCreateClient = vi.fn();
vi.mock('@/shared/lib/supabase-server', () => ({
  createRouteHandlerClient: () => mockCreateClient(),
}));

const MOCK_PARAMS = Promise.resolve({ id: 'proj-123' });

function makeRequest() {
  return new NextRequest('http://localhost/api/projects/proj-123/pcb-state');
}

// --- Storage mock factory ---------------------------------------------------
function makeStorageMock(schUrl?: string, pcbUrl?: string) {
  return {
    from: vi.fn().mockReturnValue({
      createSignedUrl: vi.fn().mockImplementation((path: string) => {
        if (path.endsWith('.kicad_sch')) {
          return Promise.resolve({ data: schUrl ? { signedUrl: schUrl } : null, error: null });
        }
        return Promise.resolve({ data: pcbUrl ? { signedUrl: pcbUrl } : null, error: null });
      }),
    }),
  };
}

// --- Supabase mock factory --------------------------------------------------
function makeSupabaseMock(opts: {
  user?: { id: string } | null;
  pcbState?: Record<string, unknown> | null;
  dbError?: { code: string; message: string } | null;
  schUrl?: string;
  pcbUrl?: string;
}) {
  const user = opts.user !== undefined ? opts.user : { id: 'user-123' };
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(
              opts.dbError
                ? { data: null, error: opts.dbError }
                : { data: { pcb_state: opts.pcbState ?? null }, error: null }
            ),
          }),
        }),
      }),
    }),
    storage: makeStorageMock(opts.schUrl, opts.pcbUrl),
  };
}

// ---------------------------------------------------------------------------

const SAMPLE_PCB_STATE = {
  projectId: 'proj-123',
  status: 'ROUTING_DONE',
  components: [{ ref: 'R1', value: '330R', footprint: '0402' }],
};

beforeEach(() => {
  mockCreateClient.mockReset();
});

describe('GET /api/projects/[id]/pcb-state', () => {
  it('returns 401 when not authenticated', async () => {
    mockCreateClient.mockReturnValue(makeSupabaseMock({ user: null }));
    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not found (PGRST116)', async () => {
    mockCreateClient.mockReturnValue(
      makeSupabaseMock({ dbError: { code: 'PGRST116', message: 'Row not found' } })
    );
    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(404);
  });

  it('returns 500 on unexpected DB error', async () => {
    mockCreateClient.mockReturnValue(
      makeSupabaseMock({ dbError: { code: '42P01', message: 'relation does not exist' } })
    );
    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(500);
  });

  it('returns 200 with null when pcb_state is not yet set', async () => {
    mockCreateClient.mockReturnValue(makeSupabaseMock({ pcbState: null }));
    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: null };
    expect(json.success).toBe(true);
    expect(json.data).toBeNull();
  });

  it('returns 200 with pcb_state when project exists', async () => {
    mockCreateClient.mockReturnValue(makeSupabaseMock({ pcbState: SAMPLE_PCB_STATE }));
    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: typeof SAMPLE_PCB_STATE };
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ROUTING_DONE');
  });

  it('injects fresh kicad_sch_url when file exists in storage', async () => {
    mockCreateClient.mockReturnValue(
      makeSupabaseMock({
        pcbState: SAMPLE_PCB_STATE,
        schUrl: 'https://storage.example.com/fresh-sch-url',
      })
    );
    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: Record<string, unknown> };
    expect(json.data['kicad_sch_url']).toBe('https://storage.example.com/fresh-sch-url');
  });

  it('injects fresh kicad_pcb_url when file exists in storage', async () => {
    mockCreateClient.mockReturnValue(
      makeSupabaseMock({
        pcbState: SAMPLE_PCB_STATE,
        pcbUrl: 'https://storage.example.com/fresh-pcb-url',
      })
    );
    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: Record<string, unknown> };
    expect(json.data['kicad_pcb_url']).toBe('https://storage.example.com/fresh-pcb-url');
  });

  it('returns pcb_state without URLs when files not in storage', async () => {
    mockCreateClient.mockReturnValue(makeSupabaseMock({ pcbState: SAMPLE_PCB_STATE }));
    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: Record<string, unknown> };
    // No URL keys injected when storage returns null
    expect(json.data['kicad_sch_url']).toBeUndefined();
    expect(json.data['kicad_pcb_url']).toBeUndefined();
  });
});
