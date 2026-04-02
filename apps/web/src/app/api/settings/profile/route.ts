import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerClient } from '@/shared/lib/supabase-server';

const updateSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().max(500).nullable().optional(),
});

export async function GET() {
  const supabase = await createRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      full_name: (user.user_metadata['full_name'] as string | undefined) ?? null,
      avatar_url: (user.user_metadata['avatar_url'] as string | undefined) ?? null,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.auth.updateUser({
    data: parsed.data,
  });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: {
      full_name: (data.user.user_metadata['full_name'] as string | undefined) ?? null,
      avatar_url: (data.user.user_metadata['avatar_url'] as string | undefined) ?? null,
    },
  });
}
