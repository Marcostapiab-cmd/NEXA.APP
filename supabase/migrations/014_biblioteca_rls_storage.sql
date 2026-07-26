-- Migration 014: Fix ejercicios RLS + Storage bucket para videos
--
-- Problema raíz: ejercicios_custom y ejercicios_propios fueron creadas manualmente
-- en Supabase sin políticas RLS. Esto bloqueaba todos los writes silenciosamente.
--
-- IMPORTANTE: Usa ADD COLUMN IF NOT EXISTS para no romper datos existentes.

-- ─── ejercicios_propios ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ejercicios_propios (
  id         text PRIMARY KEY,
  nombre     text NOT NULL,
  grupo      text NOT NULL DEFAULT '',
  video_url  text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ejercicios_propios ADD COLUMN IF NOT EXISTS video_path text;
ALTER TABLE public.ejercicios_propios ADD COLUMN IF NOT EXISTS coach_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.ejercicios_propios ENABLE ROW LEVEL SECURITY;

-- Acceso total para usuarios autenticados.
-- coach_id se guarda como metadata pero no se usa en RLS (filas existentes son NULL).
DROP POLICY IF EXISTS "propios_all_authenticated" ON public.ejercicios_propios;
CREATE POLICY "propios_all_authenticated" ON public.ejercicios_propios
  FOR ALL TO authenticated
  USING  (true)
  WITH CHECK (true);

-- ─── ejercicios_custom ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ejercicios_custom (
  ejercicio_id text PRIMARY KEY,
  nombre       text,
  video_url    text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.ejercicios_custom ADD COLUMN IF NOT EXISTS video_path text;
ALTER TABLE public.ejercicios_custom ADD COLUMN IF NOT EXISTS coach_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.ejercicios_custom ENABLE ROW LEVEL SECURITY;

-- Este es el fix principal: antes no existía ninguna política y RLS bloqueaba todo.
DROP POLICY IF EXISTS "custom_all_authenticated" ON public.ejercicios_custom;
CREATE POLICY "custom_all_authenticated" ON public.ejercicios_custom
  FOR ALL TO authenticated
  USING  (true)
  WITH CHECK (true);

-- ─── Storage bucket ───────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ejercicios-videos',
  'ejercicios-videos',
  false,
  52428800,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies
DROP POLICY IF EXISTS "video_read_authenticated"  ON storage.objects;
DROP POLICY IF EXISTS "video_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "video_delete_own"           ON storage.objects;

CREATE POLICY "video_read_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'ejercicios-videos');

CREATE POLICY "video_insert_authenticated" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ejercicios-videos');

CREATE POLICY "video_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ejercicios-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
