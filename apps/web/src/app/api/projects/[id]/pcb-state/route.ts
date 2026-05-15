import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/shared/lib/supabase-server';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const { data, error } = await supabase
    .from('projects')
    .select('pcb_state')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: { pcb_state: data.pcb_state } });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof payload !== 'object' || payload === null) {
    return NextResponse.json({ success: false, error: 'Payload must be an object' }, { status: 400 });
  }

  const { id } = await ctx.params;
  const { data, error } = await supabase
    .from('projects')
    .update({ pcb_state: payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('pcb_state')
    .single();

  if (error || !data) {
    return NextResponse.json({ success: false, error: error?.message ?? 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: { pcb_state: data.pcb_state } });
}
