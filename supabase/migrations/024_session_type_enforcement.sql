-- ============================================================
-- NEXA 024 — Enforcement de tipo de sesión (1:1 / 2:1)
-- ============================================================

-- ── 1. Modalidad del plan individual ────────────────────────
-- Registra si el plan del alumno es sesión privada (1:1)
-- o semiprivada compartida (2:1).
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS modalidad text
  CHECK (modalidad IN ('1:1', '2:1'));

-- ── 2. Función que valida conflictos de tipo al insertar una reserva individual
CREATE OR REPLACE FUNCTION public.check_reserva_tipo_clash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count   int;
  v_has_1a1 boolean;
BEGIN
  -- Si la reserva se está cancelando, no validar conflicto
  IF NEW.estado IN ('cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show') THEN
    RETURN NEW;
  END IF;

  -- Solo aplica a sesiones individuales (1:1 ó 2:1)
  IF NEW.tipo_clase IS NULL
     OR (NEW.tipo_clase NOT ILIKE '%1:1%'
         AND NEW.tipo_clase NOT ILIKE '%2:1%') THEN
    RETURN NEW;
  END IF;

  -- Contar reservas individuales activas para el mismo coach+fecha+hora
  SELECT
    COUNT(*),
    BOOL_OR(r.tipo_clase ILIKE '%1:1%')
  INTO v_count, v_has_1a1
  FROM public.reservas r
  WHERE r.fecha      = NEW.fecha
    AND r.hora       = NEW.hora
    AND (
          (NEW.coach_id IS NULL AND r.coach_id IS NULL)
          OR r.coach_id = NEW.coach_id
        )
    AND r.tipo_clase NOT ILIKE '%grupal%'
    AND r.estado NOT IN (
          'cancelada_tiempo','cancelada_tarde',
          'cancelada_nexa','no_show'
        )
    AND r.id IS DISTINCT FROM NEW.id;  -- excluye la propia fila en UPDATE

  IF NEW.tipo_clase ILIKE '%1:1%' THEN
    IF v_count > 0 THEN
      RAISE EXCEPTION
        'Conflicto 1:1: el horario % % ya tiene otra sesión activa. Un 1:1 requiere horario exclusivo.',
        NEW.fecha, NEW.hora;
    END IF;

  ELSIF NEW.tipo_clase ILIKE '%2:1%' THEN
    IF v_has_1a1 THEN
      RAISE EXCEPTION
        'Conflicto 2:1: el horario % % ya tiene una sesión 1:1. No se puede mezclar.',
        NEW.fecha, NEW.hora;
    END IF;
    IF v_count >= 2 THEN
      RAISE EXCEPTION
        'Conflicto 2:1: el horario % % ya tiene 2 alumnos. Cupo completo.',
        NEW.fecha, NEW.hora;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger sobre INSERT y UPDATE
DROP TRIGGER IF EXISTS reservas_tipo_clash_check ON public.reservas;
CREATE TRIGGER reservas_tipo_clash_check
  BEFORE INSERT OR UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.check_reserva_tipo_clash();
