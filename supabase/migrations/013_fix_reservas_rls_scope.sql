-- ============================================================
-- NEXA — Acotar RLS de reservas: profesores solo ven las suyas
-- Problema: políticas de 005 y 009 permiten que un profesor
-- autenticado lea todas las reservas de todos los coaches.
-- Fix: admin y recepcionista conservan acceso total; profesor
-- solo accede a reservas donde coach_id = auth.uid().
-- ============================================================

-- ─── SELECT ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "planes_select_staff"     ON public.reservas;
DROP POLICY IF EXISTS "reservas_checkin_select" ON public.reservas;

CREATE POLICY "reservas_select_scoped" ON public.reservas
  FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('admin', 'recepcionista')
    OR (get_my_role() = 'profesor' AND coach_id = auth.uid())
  );

-- ─── UPDATE ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "planes_update_staff"     ON public.reservas;
DROP POLICY IF EXISTS "reservas_checkin_update" ON public.reservas;

CREATE POLICY "reservas_update_scoped" ON public.reservas
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('admin', 'recepcionista')
    OR (get_my_role() = 'profesor' AND coach_id = auth.uid())
  )
  WITH CHECK (
    get_my_role() IN ('admin', 'recepcionista')
    OR (get_my_role() = 'profesor' AND coach_id = auth.uid())
  );

-- ─── INSERT (sin cambios — no tiene sentido restringir insert por coach_id) ──

DROP POLICY IF EXISTS "planes_insert_staff" ON public.reservas;

CREATE POLICY "reservas_insert_staff" ON public.reservas
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'profesor', 'recepcionista'));
