import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { createSupabaseMock } from '@/test/mocks/supabase';

const mockCreateClient = vi.fn();
vi.mock('@/shared/lib/supabase-server', () => ({
  createRouteHandlerClient: () => mockCreateClient(),
}));

const MOCK_PARAMS = Promise.resolve({ id: 'proj-123' });

function makeRequest() {
  return new NextRequest('http://localhost/api/projects/proj-123/pcb-state');
}

beforeEach(() => {
  mockCreateClient.mockReset();
});

const SAMPLE_PCB_STATE = {
  projectId: 'proj-123',
  status: 'PLACEMENT_DONE',
  iteration: 2,
  placement: { placements: [], board_width_mm: 50, board_height_mm: 40 },
};

describe('GET /api/projects/[id]/pcb-state', () => {
  it('returns 200 with pcb_state when project exists', async () => {
    mockCreateClient.mockReturnValue(
      createSupabaseMock({ creditsData: SAMPLE_PCB_STATE as unknown as { balance: number; plan: string } })
    );
    // Override the single() to return pcb_state field
    const mock = createSupabaseMock();
    const singleMock = vi.fn().mockResolvedValue({ data: { pcb_state: SAMPLE_PCB_STATE }, error: null });
    mock.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: singleMock }),
        }),
      }),
    });
    mockCreateClient.mockReturnValue(mock);

    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: typeof SAMPLE_PCB_STATE };
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('PLACEMENT_DONE');
  });

  it('returns 200 with null when pcb_state is not yet set', async () => {
    const mock = createSupabaseMock();
    mock.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { pcb_state: null }, error: null }),
          }),
        }),
      }),
    });
    mockCreateClient.mockReturnValue(mock);

    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: null };
    expect(json.success).toBe(true);
    expect(json.data).toBeNull();
  });

  it('returns 401 when not authenticated', async () => {
    mockCreateClient.mockReturnValue(createSupabaseMock({ user: null }));
    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not found (PGRST116)', async () => {
    const mock = createSupabaseMock();
    mock.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'Row not found' },
            }),
          }),
        }),
      }),
    });
    mockCreateClient.mockReturnValue(mock);

    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(404);
  });

  it('returns 500 on unexpected DB error', async () => {
    const mock = createSupabaseMock();
    mock.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '42P01', message: 'relation does not exist' },
            }),
          }),
        }),
      }),
    });
    mockCreateClient.mockReturnValue(mock);

    const res = await GET(makeRequest(), { params: MOCK_PARAMS });
    expect(res.status).toBe(500);
  });
});
