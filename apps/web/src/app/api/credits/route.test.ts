import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { createSupabaseMock } from '@/test/mocks/supabase';

const mockCreateClient = vi.fn();
vi.mock('@/shared/lib/supabase-server', () => ({
  createRouteHandlerClient: () => mockCreateClient(),
}));

beforeEach(() => {
  mockCreateClient.mockReset();
});

describe('GET /api/credits', () => {
  it('returns 200 with credits data for authenticated user', async () => {
    mockCreateClient.mockReturnValue(
      createSupabaseMock({ creditsData: { balance: 10, plan: 'free' } })
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: { balance: number; plan: string } };
    expect(json.success).toBe(true);
    expect(json.data.balance).toBe(10);
    expect(json.data.plan).toBe('free');
  });

  it('returns 401 when not authenticated', async () => {
    mockCreateClient.mockReturnValue(createSupabaseMock({ user: null }));
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 500 on DB error', async () => {
    mockCreateClient.mockReturnValue(
      createSupabaseMock({ creditsError: { message: 'DB error' }, creditsData: null })
    );
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
