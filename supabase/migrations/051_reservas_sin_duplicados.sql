-- ============================================================
-- NEXA 051 — Un alumno no puede tener dos clases activas a la misma hora
-- ============================================================
-- Antes, el disparador de choques (check_reserva_tipo_clash) solo miraba al
-- profesor: el mismo alumno podía quedar dos veces el mismo día y hora con
-- profesores distintos, o por dos solicitudes simultáneas, o al editar o
-- reactivar una reserva cancelada.
--
-- Ahora un disparador revisa al alumno en cada INSERT y en cada UPDATE que lo
-- deje activo en un horario nuevo (incluye reactivar). Usa el mismo candado por
-- horario que la 041 (nexa_lock_slot), así dos solicitudes simultáneas se
-- ordenan y la segunda ve la primera. Alumnos distintos en la misma clase
-- siguen permitidos según los cupos (eso lo valida check_reserva_tipo_clash).
--
-- Los duplicados que ya existan NO se borran: se listan en "Requiere atención"
-- (incidencia manual) y con la función staff_reservas_duplicadas().
-- Requiere 041 y 042. Re-ejecutable.
-- ============================================================

CREATE OR REPLACE FUNCTION public.nexa_reserva_alumno_unica()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_otra int;
BEGIN
  IF NEW.alumno_id IS NULL OR public.nexa_estado_inactivo(NEW.estado)
     OR coalesce(NEW.hora, '') !~ '^\d{2}:\d{2}' THEN
    RETURN NEW;
  END IF;
  -- Un UPDATE que no cambia alumno, día ni hora de una reserva ya activa no se revalida
  IF TG_OP = 'UPDATE' AND NOT public.nexa_estado_inactivo(OLD.estado)
     AND OLD.alumno_id IS NOT DISTINCT FROM NEW.alumno_id
     AND public.nexa_dia(OLD.fecha) = public.nexa_dia(NEW.fecha)
     AND left(OLD.hora, 5) IS NOT DISTINCT FROM left(NEW.hora, 5) THEN
    RETURN NEW;
  END IF;

  PERFORM public.nexa_lock_slot(public.nexa_dia(NEW.fecha), NEW.hora);

  SELECT r.id INTO v_otra
    FROM public.reservas r
   WHERE r.alumno_id = NEW.alumno_id
     AND public.nexa_dia(r.fecha) = public.nexa_dia(NEW.fecha)
     AND left(r.hora, 5) = left(NEW.hora, 5)
     AND NOT public.nexa_estado_inactivo(r.estado)
     AND r.id IS DISTINCT FROM NEW.id
   LIMIT 1;

  IF v_otra IS NOT NULL THEN
    RAISE EXCEPTION 'Reserva duplicada: el alumno ya tiene una clase activa el % a las % (reserva %).',
      public.nexa_dia(NEW.fecha), left(NEW.hora, 5), v_otra
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END $$;

-- El nombre hace que corra antes que reservas_tipo_clash_check (mismo candado, mismo orden).
DROP TRIGGER IF EXISTS reservas_alumno_unica ON public.reservas;
CREATE TRIGGER reservas_alumno_unica
  BEFORE INSERT OR UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.nexa_reserva_alumno_unica();

-- Índice de apoyo para la búsqueda por alumno y día
CREATE INDEX IF NOT EXISTS reservas_alumno_dia_idx
  ON public.reservas (alumno_id, public.nexa_dia(fecha), left(hora, 5));

-- ── Duplicados existentes: solo se informan ──────────────────
CREATE OR REPLACE FUNCTION public.nexa_reservas_duplicadas()
RETURNS TABLE (alumno_id uuid, alumno text, dia date, hora text, reservas int[], estados text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.alumno_id, public.nexa_nombre_atleta(r.alumno_id), public.nexa_dia(r.fecha), left(r.hora, 5),
         array_agg(r.id ORDER BY r.id), array_agg(r.estado ORDER BY r.id)
    FROM public.reservas r
   WHERE r.alumno_id IS NOT NULL AND NOT public.nexa_estado_inactivo(r.estado)
     AND coalesce(r.hora, '') ~ '^\d{2}:\d{2}'
   GROUP BY r.alumno_id, public.nexa_dia(r.fecha), left(r.hora, 5)
  HAVING count(*) > 1
   ORDER BY 3, 4
$$;

CREATE OR REPLACE FUNCTION public.staff_reservas_duplicadas()
RETURNS TABLE (alumno_id uuid, alumno text, dia date, hora text, reservas int[], estados text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(public.get_my_role(), '') NOT IN ('admin', 'host', 'recepcionista') THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.nexa_reservas_duplicadas();
END $$;

REVOKE ALL ON FUNCTION public.nexa_reserva_alumno_unica() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nexa_reservas_duplicadas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.staff_reservas_duplicadas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_reservas_duplicadas() TO authenticated;

-- Registrar los duplicados históricos en "Requiere atención" como incidencias
-- manuales (no se cierran solas): el staff decide cuál cancelar.
DO $$
DECLARE d record; v_id uuid;
BEGIN
  FOR d IN SELECT * FROM public.nexa_reservas_duplicadas() LOOP
    v_id := public.nexa_incidencia('reserva_duplicada', 'alta',
      'duplicada_hist:' || d.alumno_id || ':' || d.dia || ':' || d.hora,
      'Reserva duplicada · ' || coalesce(d.alumno, 'alumno'),
      array_length(d.reservas, 1) || ' reservas activas el ' || to_char(d.dia, 'DD-MM-YYYY') || ' a las ' || d.hora
        || ' (n.º ' || array_to_string(d.reservas, ', ') || '). Cada una consume un crédito.',
      'Revisar y cancelar (como NEXA) las sobrantes. No se borró nada automáticamente.',
      d.alumno_id, d.reservas[1]);
    UPDATE public.incidencias SET automatica = false WHERE id = v_id;
  END LOOP;
END $$;
