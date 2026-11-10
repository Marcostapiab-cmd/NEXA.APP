-- ============================================================
-- NEXA — Volver atrás 053, 052, 051 y 050
-- ============================================================
-- Usar solo si algo falla después de aplicar las migraciones. Requiere el
-- esquema `respaldo_050` creado por 01_respaldo_antes_050_053.sql.
-- Antes de ejecutarlo, volver a desplegar en Vercel la versión anterior del
-- código (la nueva espera estas funciones).
--
-- No borra datos: columnas nuevas (pagos.referencia_pago, pedidos_planes.*,
-- notificaciones.reclamada_at) y pagos registrados se conservan.
-- ============================================================

BEGIN;

-- ── 053 ──
-- Restaura la tarea horaria anterior (043)
DO $$ DECLARE d text; BEGIN
  SELECT definicion INTO d FROM respaldo_050.funciones WHERE firma = 'nexa_tarea_horaria()';
  IF d IS NOT NULL THEN EXECUTE d; END IF;
END $$;
DROP FUNCTION IF EXISTS public.nexa_secreto_notificaciones();

-- ── 052 ──
DROP FUNCTION IF EXISTS public.nexa_confirmar_pago_plan(text, int, text, text);
DROP FUNCTION IF EXISTS public.nexa_confirmar_cobro_manual(text, int, text, text);
-- La restricción de método se deja con 'flow' si ya hay pagos registrados con Flow.

-- ── 051 ──
DROP TRIGGER IF EXISTS reservas_alumno_unica ON public.reservas;
DROP FUNCTION IF EXISTS public.nexa_reserva_alumno_unica();
DROP FUNCTION IF EXISTS public.staff_reservas_duplicadas();
DROP FUNCTION IF EXISTS public.nexa_reservas_duplicadas();
DROP INDEX IF EXISTS public.reservas_alumno_dia_idx;

-- ── 050 ──
DROP TRIGGER IF EXISTS perfiles_proteger ON public.perfiles;
DROP TRIGGER IF EXISTS perfiles_sync_rol ON public.perfiles;
DROP TRIGGER IF EXISTS grupales_sync_rol ON public.grupales_alumnos;
DROP FUNCTION IF EXISTS public.nexa_proteger_perfiles();
DROP FUNCTION IF EXISTS public.nexa_sync_rol_auth();

-- Funciones anteriores (get_my_role, handle_new_user, confirmaciones)
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT definicion FROM respaldo_050.funciones
            WHERE firma IN ('get_my_role()', 'handle_new_user()') LOOP
    EXECUTE f.definicion;
  END LOOP;
END $$;

-- Políticas anteriores de perfiles
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'perfiles' LOOP
    EXECUTE format('DROP POLICY %I ON public.perfiles', p.policyname);
  END LOOP;
  FOR p IN SELECT * FROM respaldo_050.politicas WHERE schemaname = 'public' AND tablename = 'perfiles' LOOP
    EXECUTE format('CREATE POLICY %I ON public.perfiles AS %s FOR %s TO %s %s %s',
      p.policyname, p.permissive, p.cmd, array_to_string(p.roles, ', '),
      CASE WHEN p.qual IS NOT NULL THEN 'USING (' || p.qual || ')' ELSE '' END,
      CASE WHEN p.with_check IS NOT NULL THEN 'WITH CHECK (' || p.with_check || ')' ELSE '' END);
  END LOOP;
END $$;

-- Permisos de ejecución anteriores (vuelve a abrir lo que antes era ejecutable)
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT * FROM respaldo_050.permisos_funciones LOOP
    CONTINUE WHEN to_regprocedure(f.firma) IS NULL;
    IF f.anon THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', f.firma); END IF;
    IF f.authenticated THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.firma); END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.nexa_mi_rol();
DROP FUNCTION IF EXISTS public.nexa_rol_de(uuid);
DROP FUNCTION IF EXISTS public.nexa_rol_peticion();
-- raw_app_meta_data.rol se puede dejar: el código anterior no lo usa.

COMMIT;
NOTIFY pgrst, 'reload schema';
