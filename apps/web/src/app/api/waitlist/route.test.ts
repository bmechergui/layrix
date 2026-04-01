import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

// Mock Supabase createClient — waitlist route uses service key client
const mockInsert = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: mockInsert })),
  })),
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ error: null });
});

describe('POST /api/waitlist', () => {
  it('returns 201 on valid email', async () => {
    const res = await POST(makeRequest({ email: 'user@test.com' }));
    expect(res.status).toBe(201);
    const json = await res.json() as { success: boolean };
    expect(json.success).toBe(true);
  });

  it('returns 400 on invalid email', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Invalid email address');
  });

  it('returns 400 on missing body fields', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('Invalid JSON');
  });

  it('returns 409 when email already registered (23505)', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    const res = await POST(makeRequest({ email: 'existing@test.com' }));
    expect(res.status).toBe(409);
    const json = await res.json() as { error: string };
    expect(json.error).toBe('already_registered');
  });

  it('returns 500 on unexpected DB error', async () => {
    mockInsert.mockResolvedValue({ error: { code: '42P01', message: 'table not found' } });
    const res = await POST(makeRequest({ email: 'user@test.com' }));
    expect(res.status).toBe(500);
  });
});
