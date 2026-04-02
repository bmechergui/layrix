import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { createSupabaseMock } from '@/test/mocks/supabase';

const mockCreateClient = vi.fn();
vi.mock('@/shared/lib/supabase-server', () => ({
  createRouteHandlerClient: () => mockCreateClient(),
}));

const MOCK_PROJECT = {
  id: 'proj-123',
  name: 'My PCB',
  description: 'A test PCB',
  status: 'INITIAL',
  iteration_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  mockCreateClient.mockReset();
});

describe('GET /api/projects', () => {
  it('returns 200 with project list', async () => {
    mockCreateClient.mockReturnValue(
      createSupabaseMock({ projectsData: [MOCK_PROJECT] })
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean; data: unknown[] };
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
  });

  it('returns 401 when not authenticated', async () => {
    mockCreateClient.mockReturnValue(createSupabaseMock({ user: null }));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    mockCreateClient.mockReturnValue(
      createSupabaseMock({ projectsError: { message: 'DB error' }, projectsData: null })
    );
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe('POST /api/projects', () => {
  function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 201 on valid project creation', async () => {
    mockCreateClient.mockReturnValue(
      createSupabaseMock({ insertData: MOCK_PROJECT })
    );
    const res = await POST(makeRequest({ name: 'My PCB', description: 'Test' }));
    expect(res.status).toBe(201);
    const json = await res.json() as { success: boolean };
    expect(json.success).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    mockCreateClient.mockReturnValue(createSupabaseMock({ user: null }));
    const res = await POST(makeRequest({ name: 'Test' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    mockCreateClient.mockReturnValue(createSupabaseMock());
    const res = await POST(makeRequest({ description: 'No name' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is empty string', async () => {
    mockCreateClient.mockReturnValue(createSupabaseMock());
    const res = await POST(makeRequest({ name: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    mockCreateClient.mockReturnValue(createSupabaseMock());
    const req = new NextRequest('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'bad-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB insert error', async () => {
    mockCreateClient.mockReturnValue(
      createSupabaseMock({ insertError: { message: 'DB error' }, insertData: null })
    );
    const res = await POST(makeRequest({ name: 'My PCB' }));
    expect(res.status).toBe(500);
  });
});
