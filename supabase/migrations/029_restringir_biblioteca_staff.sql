-- Migración 029: restringir la biblioteca de ejercicios (videos) a staff.
--
-- Problema: las políticas de la migración 014 daban acceso total
-- (leer/crear/editar/borrar) a CUALQUIER usuario autenticado, incluyendo
-- alumnos y alumnos grupales — no solo a admin/profesor, que es lo único
-- que la app permite ver esta sección (/biblioteca no está en las rutas
-- permitidas para 'alumno' ni 'recepcionista' en el middleware).
--
-- Con esto, un alumno con sesión iniciada ya no podría editar, borrar o
-- subir videos directamente contra la base de datos / storage, aunque la
-- interfaz nunca se lo ofreciera.

-- ─── ejercicios_propios ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "propios_all_authenticated" ON public.ejercicios_propios;
CREATE POLICY "propios_staff_all" ON public.ejercicios_propios
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'profesor'))
  WITH CHECK (get_my_role() IN ('admin', 'profesor'));

-- ─── ejercicios_custom ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "custom_all_authenticated" ON public.ejercicios_custom;
CREATE POLICY "custom_staff_all" ON public.ejercicios_custom
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'profesor'))
  WITH CHECK (get_my_role() IN ('admin', 'profesor'));

-- ─── Storage: bucket ejercicios-videos ─────────────────────────────────────

DROP POLICY IF EXISTS "video_read_authenticated"  ON storage.objects;
DROP POLICY IF EXISTS "video_insert_authenticated" ON storage.objects;
-- "video_delete_own" ya limitaba el borrado al propio coach_id; se deja igual.

CREATE POLICY "video_read_staff" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'ejercicios-videos' AND get_my_role() IN ('admin', 'profesor'));

CREATE POLICY "video_insert_staff" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ejercicios-videos' AND get_my_role() IN ('admin', 'profesor'));
