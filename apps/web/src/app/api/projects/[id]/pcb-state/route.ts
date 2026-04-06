import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/shared/lib/supabase-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createRouteHandlerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('projects')
    .select('pcb_state')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }

  const pcbState = data.pcb_state as Record<string, unknown> | null;
  if (!pcbState) {
    return NextResponse.json({ success: true, data: null });
  }

  // Refresh signed URLs (1h TTL) — the paths are deterministic
  const schPath = `${user.id}/${id}/schema.kicad_sch`;
  const pcbPath = `${user.id}/${id}/board.kicad_pcb`;
  const refreshed = { ...pcbState };

  const [schResult, pcbResult] = await Promise.all([
    supabase.storage.from('kicad-files').createSignedUrl(schPath, 3600),
    supabase.storage.from('kicad-files').createSignedUrl(pcbPath, 3600),
  ]);

  if (schResult.data?.signedUrl) refreshed['kicad_sch_url'] = schResult.data.signedUrl;
  if (pcbResult.data?.signedUrl) refreshed['kicad_pcb_url'] = pcbResult.data.signedUrl;

  return NextResponse.json({ success: true, data: refreshed });
}
