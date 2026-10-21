-- ============================================================
-- NEXA 035 — Corregir planes 2:1 guardados como 1:1
-- ============================================================
-- El modal "Inscribir alumno" creaba el plan sin modalidad y TODAS las
-- clases como '1:1 Individual', aunque la ficha del alumno dijera 2:1.
-- Por eso la pantalla de horarios las mostraba como 1:1 y el trigger de
-- la migración 024 no dejaba poner a dos alumnos 2:1 en el mismo horario.
--
-- Esta migración solo toca datos de alumnos con tipo_sesion = '2:1':
--  1. Planes sin modalidad → modalidad '2:1'.
--  2. Clases futuras y activas de esos planes guardadas como 1:1 (o sin
--     tipo) → '2:1 Duo'.
-- Cada clase se actualiza por separado: si alguna choca con la agenda
-- (p. ej. ya hay un 1:1 en ese horario), se omite y se informa con un
-- NOTICE, sin detener el resto. Los planes con modalidad ya definida no
-- se modifican.

UPDATE public.planes p
   SET modalidad = '2:1'
  FROM public.atletas a
 WHERE p.alumno_id::text = a.id::text   -- en la base real alumno_id es texto y atletas.id es uuid
   AND a.tipo_sesion = '2:1'
   AND p.modalidad IS NULL;

DO $$
DECLARE
  r record;
  v_ok int := 0;
  v_omitidas int := 0;
BEGIN
  FOR r IN
    SELECT res.id, res.fecha, res.hora
      FROM public.reservas res
      JOIN public.planes   p ON p.id::text = res.plan_id::text
      JOIN public.atletas  a ON a.id::text = p.alumno_id::text
     WHERE a.tipo_sesion = '2:1'
       AND p.modalidad   = '2:1'
       AND res.fecha    >= current_date
       AND res.estado NOT IN ('cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show')
       AND (res.tipo_clase IS NULL OR res.tipo_clase ILIKE '%1:1%')
     ORDER BY res.fecha, res.hora
  LOOP
    BEGIN
      UPDATE public.reservas SET tipo_clase = '2:1 Duo' WHERE id = r.id;
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_omitidas := v_omitidas + 1;
      RAISE NOTICE 'Reserva % (% %) no se pudo pasar a 2:1: %', r.id, r.fecha, r.hora, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Clases pasadas a 2:1: %, omitidas por conflicto: %', v_ok, v_omitidas;
END $$;
