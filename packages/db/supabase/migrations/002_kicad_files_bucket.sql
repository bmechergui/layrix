-- Migration 002 — Bucket kicad-files (Supabase Storage)
-- Stocke les fichiers .kicad_sch + .kicad_pcb générés par Circuit-Synth
-- Accès via signed URL (1h) uniquement — bucket privé

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kicad-files',
  'kicad-files',
  false,
  10485760, -- 10MB max par fichier
  ARRAY['text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- RLS : chaque user accède uniquement à son dossier {userId}/...
CREATE POLICY "kicad_files_owner_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kicad-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "kicad_files_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kicad-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "kicad_files_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'kicad-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "kicad_files_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'kicad-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
