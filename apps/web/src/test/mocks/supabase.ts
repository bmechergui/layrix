import { vi } from 'vitest';

// Supabase mock factory — retourne un client configurable par test
export function createSupabaseMock(overrides?: {
  user?: { id: string; email: string } | null;
  creditsData?: { balance: number; plan: string } | null;
  creditsError?: { message: string } | null;
  projectsData?: unknown[] | null;
  projectsError?: { message: string } | null;
  insertData?: unknown | null;
  insertError?: { code?: string; message: string } | null;
  rpcError?: { message: string } | null;
}) {
  // undefined → use default; null → unauthenticated
  const user = overrides !== undefined && 'user' in overrides
    ? overrides.user
    : { id: 'user-123', email: 'test@example.com' };

  const mockSingle = vi.fn().mockResolvedValue({
    data: overrides?.creditsData ?? { balance: 10, plan: 'free' },
    error: overrides?.creditsError ?? null,
  });

  const mockSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: mockSingle,
      order: vi.fn().mockResolvedValue({
        data: overrides?.projectsData ?? [],
        error: overrides?.projectsError ?? null,
      }),
    }),
    order: vi.fn().mockResolvedValue({
      data: overrides?.projectsData ?? [],
      error: overrides?.projectsError ?? null,
    }),
  });

  const mockInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: overrides?.insertData ?? null,
        error: overrides?.insertError ?? null,
      }),
    }),
  });

  const mockRpc = vi.fn().mockResolvedValue({
    error: overrides?.rpcError ?? null,
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
    }),
    rpc: mockRpc,
  };
}
