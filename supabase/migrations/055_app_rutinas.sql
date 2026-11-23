-- ============================================================
-- NEXA 055 — App de rutinas: registros de pesos y comentarios del alumno
-- ============================================================
-- SOLO CREA tablas, funciones y reglas NUEVAS. No modifica ni borra ninguna
-- tabla, columna ni regla existente (rutinas, atletas, perfiles quedan igual).
--
-- registros_ejercicio   → el alumno anota, por serie, el peso (kg) y las
--                         repeticiones que hizo en un ejercicio de SU rutina.
-- comentarios_ejercicio → el alumno deja un comentario sobre un ejercicio;
--                         el coach lo marca como leído y puede responder.
--
-- Cada fila apunta a: la rutina (rutinas.id), el día de la rutina (la fecha
-- 'YYYY-MM-DD' con la que el planificador guarda el entrenamiento) y el
-- ejercicio (su id dentro de ese día). Así no hay que cambiar `rutinas`.
--
-- Quién puede qué (reglas RLS):
--   alumno: ve, crea, corrige y borra SOLO sus registros, y solo de rutinas
--           que le asignaron; ve y crea SOLO sus comentarios (puede editar el
--           texto mientras no tenga respuesta). No puede marcar leído ni responder.
--   coach (profesor) y admin (admin, host): ven todo; marcan leído y responden.
--   nadie sin sesión ve nada.
-- Re-ejecutable.
-- ============================================================

-- ── ¿La sesión actual es el alumno dueño de esta ficha? ─────
CREATE OR REPLACE FUNCTION public.nexa_es_mi_ficha(p_atleta uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.atletas a
     WHERE a.id = p_atleta AND (a.user_id = auth.uid() OR a.perfil_id = auth.uid()))
$$;

-- ── ¿Esa rutina está asignada a esa ficha? ─────────────────
CREATE OR REPLACE FUNCTION public.nexa_rutina_asignada(p_rutina text, p_atleta uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rutinas r
     WHERE r.id = p_rutina AND r.alumno_ids @> jsonb_build_array(p_atleta::text))
$$;

-- ── ¿La sesión actual es coach o admin? ────────────────────
CREATE OR REPLACE FUNCTION public.nexa_es_coach()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.get_my_role(), '') IN ('admin', 'host', 'profesor')
$$;

GRANT EXECUTE ON FUNCTION public.nexa_es_mi_ficha(uuid), public.nexa_rutina_asignada(text, uuid), public.nexa_es_coach() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.nexa_es_mi_ficha(uuid), public.nexa_rutina_asignada(text, uuid), public.nexa_es_coach() FROM PUBLIC, anon;

-- ── 1. Registros de pesos ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.registros_ejercicio (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atleta_id        uuid NOT NULL REFERENCES public.atletas(id) ON DELETE CASCADE,
  rutina_id        text NOT NULL,
  dia              text NOT NULL CHECK (dia ~ '^\d{4}-\d{2}-\d{2}$'),
  ejercicio_id     text NOT NULL,
  ejercicio_nombre text NOT NULL,
  serie            int  NOT NULL CHECK (serie BETWEEN 1 AND 30),
  peso_kg          numeric(6,2) CHECK (peso_kg >= 0 AND peso_kg <= 1000),
  reps             int  CHECK (reps >= 0 AND reps <= 300),
  fecha            date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Santiago')::date),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Una fila por serie y por día realizado: corregir = actualizar esa fila
  UNIQUE (atleta_id, rutina_id, dia, ejercicio_id, serie, fecha)
);
CREATE INDEX IF NOT EXISTS registros_ejercicio_atleta_idx ON public.registros_ejercicio (atleta_id, ejercicio_nombre, fecha DESC);
CREATE INDEX IF NOT EXISTS registros_ejercicio_rutina_idx ON public.registros_ejercicio (rutina_id, dia, ejercicio_id);

ALTER TABLE public.registros_ejercicio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registros_alumno_leer   ON public.registros_ejercicio;
DROP POLICY IF EXISTS registros_alumno_crear  ON public.registros_ejercicio;
DROP POLICY IF EXISTS registros_alumno_editar ON public.registros_ejercicio;
DROP POLICY IF EXISTS registros_alumno_borrar ON public.registros_ejercicio;
DROP POLICY IF EXISTS registros_coach_leer    ON public.registros_ejercicio;

CREATE POLICY registros_alumno_leer ON public.registros_ejercicio
  FOR SELECT TO authenticated USING (public.nexa_es_mi_ficha(atleta_id));
CREATE POLICY registros_alumno_crear ON public.registros_ejercicio
  FOR INSERT TO authenticated
  WITH CHECK (public.nexa_es_mi_ficha(atleta_id) AND public.nexa_rutina_asignada(rutina_id, atleta_id));
CREATE POLICY registros_alumno_editar ON public.registros_ejercicio
  FOR UPDATE TO authenticated
  USING (public.nexa_es_mi_ficha(atleta_id))
  WITH CHECK (public.nexa_es_mi_ficha(atleta_id) AND public.nexa_rutina_asignada(rutina_id, atleta_id));
CREATE POLICY registros_alumno_borrar ON public.registros_ejercicio
  FOR DELETE TO authenticated USING (public.nexa_es_mi_ficha(atleta_id));
CREATE POLICY registros_coach_leer ON public.registros_ejercicio
  FOR SELECT TO authenticated USING (public.nexa_es_coach());

CREATE OR REPLACE FUNCTION public.nexa_tocar_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS registros_ejercicio_updated ON public.registros_ejercicio;
CREATE TRIGGER registros_ejercicio_updated BEFORE UPDATE ON public.registros_ejercicio
  FOR EACH ROW EXECUTE FUNCTION public.nexa_tocar_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.registros_ejercicio TO authenticated;
REVOKE ALL ON public.registros_ejercicio FROM anon;

-- ── 2. Comentarios del alumno ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.comentarios_ejercicio (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atleta_id        uuid NOT NULL REFERENCES public.atletas(id) ON DELETE CASCADE,
  rutina_id        text NOT NULL,
  dia              text NOT NULL CHECK (dia ~ '^\d{4}-\d{2}-\d{2}$'),
  ejercicio_id     text NOT NULL,
  ejercicio_nombre text NOT NULL,
  texto            text NOT NULL CHECK (length(trim(texto)) BETWEEN 1 AND 1000),
  created_at       timestamptz NOT NULL DEFAULT now(),
  leido_at         timestamptz,
  leido_por        uuid,
  respuesta        text CHECK (respuesta IS NULL OR length(respuesta) <= 1000),
  respondido_at    timestamptz,
  respondido_por   uuid
);
CREATE INDEX IF NOT EXISTS comentarios_ejercicio_atleta_idx ON public.comentarios_ejercicio (atleta_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comentarios_ejercicio_sin_leer_idx ON public.comentarios_ejercicio (created_at DESC) WHERE leido_at IS NULL;

ALTER TABLE public.comentarios_ejercicio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comentarios_alumno_leer   ON public.comentarios_ejercicio;
DROP POLICY IF EXISTS comentarios_alumno_crear  ON public.comentarios_ejercicio;
DROP POLICY IF EXISTS comentarios_alumno_editar ON public.comentarios_ejercicio;
DROP POLICY IF EXISTS comentarios_coach_leer    ON public.comentarios_ejercicio;
DROP POLICY IF EXISTS comentarios_coach_editar  ON public.comentarios_ejercicio;

CREATE POLICY comentarios_alumno_leer ON public.comentarios_ejercicio
  FOR SELECT TO authenticated USING (public.nexa_es_mi_ficha(atleta_id));
CREATE POLICY comentarios_alumno_crear ON public.comentarios_ejercicio
  FOR INSERT TO authenticated
  WITH CHECK (public.nexa_es_mi_ficha(atleta_id) AND public.nexa_rutina_asignada(rutina_id, atleta_id)
              AND leido_at IS NULL AND respuesta IS NULL);
CREATE POLICY comentarios_alumno_editar ON public.comentarios_ejercicio
  FOR UPDATE TO authenticated
  USING (public.nexa_es_mi_ficha(atleta_id) AND respuesta IS NULL)
  WITH CHECK (public.nexa_es_mi_ficha(atleta_id));
CREATE POLICY comentarios_coach_leer ON public.comentarios_ejercicio
  FOR SELECT TO authenticated USING (public.nexa_es_coach());
CREATE POLICY comentarios_coach_editar ON public.comentarios_ejercicio
  FOR UPDATE TO authenticated USING (public.nexa_es_coach()) WITH CHECK (public.nexa_es_coach());

-- Cada uno solo cambia "su parte": el alumno el texto; el coach leído y respuesta.
CREATE OR REPLACE FUNCTION public.nexa_guardia_comentario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.atleta_id IS DISTINCT FROM OLD.atleta_id OR NEW.rutina_id IS DISTINCT FROM OLD.rutina_id
     OR NEW.dia IS DISTINCT FROM OLD.dia OR NEW.ejercicio_id IS DISTINCT FROM OLD.ejercicio_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'No se puede cambiar a qué ejercicio pertenece un comentario.' USING ERRCODE = '42501';
  END IF;
  IF public.nexa_es_coach() THEN
    IF NEW.texto IS DISTINCT FROM OLD.texto THEN
      RAISE EXCEPTION 'El coach no puede editar el comentario del alumno.' USING ERRCODE = '42501';
    END IF;
    IF NEW.leido_at IS NOT NULL AND OLD.leido_at IS NULL THEN NEW.leido_por := auth.uid(); END IF;
    IF NEW.respuesta IS DISTINCT FROM OLD.respuesta THEN
      NEW.respondido_at := CASE WHEN NEW.respuesta IS NULL THEN NULL ELSE now() END;
      NEW.respondido_por := CASE WHEN NEW.respuesta IS NULL THEN NULL ELSE auth.uid() END;
      NEW.leido_at := coalesce(NEW.leido_at, now());
      NEW.leido_por := coalesce(NEW.leido_por, auth.uid());
    END IF;
  ELSIF auth.uid() IS NOT NULL THEN
    -- Alumno: solo el texto (y al editarlo vuelve a quedar "sin leer")
    IF NEW.leido_at IS DISTINCT FROM OLD.leido_at OR NEW.leido_por IS DISTINCT FROM OLD.leido_por
       OR NEW.respuesta IS DISTINCT FROM OLD.respuesta OR NEW.respondido_at IS DISTINCT FROM OLD.respondido_at
       OR NEW.respondido_por IS DISTINCT FROM OLD.respondido_por THEN
      RAISE EXCEPTION 'Solo el coach puede marcar como leído o responder.' USING ERRCODE = '42501';
    END IF;
    IF NEW.texto IS DISTINCT FROM OLD.texto THEN NEW.leido_at := NULL; NEW.leido_por := NULL; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS comentarios_ejercicio_guardia ON public.comentarios_ejercicio;
CREATE TRIGGER comentarios_ejercicio_guardia BEFORE UPDATE ON public.comentarios_ejercicio
  FOR EACH ROW EXECUTE FUNCTION public.nexa_guardia_comentario();

GRANT SELECT, INSERT, UPDATE ON public.comentarios_ejercicio TO authenticated;
REVOKE ALL ON public.comentarios_ejercicio FROM anon;
REVOKE ALL ON FUNCTION public.nexa_guardia_comentario() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nexa_tocar_updated_at() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN PERFORM pg_notify('pgrst', 'reload schema'); END $$;
