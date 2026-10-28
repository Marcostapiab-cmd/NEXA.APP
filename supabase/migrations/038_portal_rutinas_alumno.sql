-- Migration 038: el alumno puede ver sus propias rutinas en el portal.
--
-- Hasta ahora `rutinas` solo tenía políticas para el staff, así que la página
-- "Mis rutinas" del portal siempre salía vacía. El alumno puede estar enlazado
-- a su ficha por `user_id` (invitado desde la ficha) o por `perfil_id` (se
-- registró solo): se aceptan ambos.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rutinas' AND policyname = 'rutinas_portal_self_read'
  ) THEN
    CREATE POLICY "rutinas_portal_self_read" ON public.rutinas
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.atletas a
          WHERE (a.user_id = auth.uid() OR a.perfil_id = auth.uid())
            AND rutinas.alumno_ids @> jsonb_build_array(a.id::text)
        )
      );
  END IF;
END $$;

-- Los alumnos que se registraron solos quedaron enlazados solo por perfil_id,
-- pero las políticas del portal (reservas, planes, pagos) miran user_id.
-- Se copia el enlace para que vean sus clases, planes y pagos.
UPDATE public.atletas a
SET user_id = a.perfil_id
WHERE a.user_id IS NULL
  AND a.perfil_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.perfil_id)
  AND NOT EXISTS (SELECT 1 FROM public.atletas b WHERE b.user_id = a.perfil_id);
