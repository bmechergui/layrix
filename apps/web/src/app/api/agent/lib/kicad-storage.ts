import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'kicad-files';
const SIGNED_URL_EXPIRES_SECONDS = 60 * 60; // 1h

interface UploadResult {
  signedUrl: string | null;
  path: string;
}

export async function uploadKicadArtifact(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  filename: 'schematic.kicad_sch' | 'pcb.kicad_pcb',
  content: string,
): Promise<UploadResult> {
  const path = `${userId}/${projectId}/${filename}`;
  const contentType =
    filename.endsWith('.kicad_sch') ? 'application/x-kicad-schematic' : 'application/x-kicad-pcb';

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, content, {
      contentType,
      upsert: true,
      cacheControl: '0',
    });
  if (uploadError) {
    return { signedUrl: null, path };
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRES_SECONDS);
  if (signError || !signed) {
    return { signedUrl: null, path };
  }

  return { signedUrl: signed.signedUrl, path };
}
