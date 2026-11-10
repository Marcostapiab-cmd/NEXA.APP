-- ============================================================
-- NEXA — Respaldo ANTES de aplicar 050, 051, 052 y 053
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase (proyecto de producción) justo antes
-- de aplicar las migraciones. Solo LEE datos de producción y los copia al
-- esquema `respaldo_050` (no modifica nada existente).
-- Además: descargar un respaldo desde Supabase → Database → Backups.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS respaldo_050;
REVOKE ALL ON SCHEMA respaldo_050 FROM PUBLIC, anon, authenticated;

-- Datos que las migraciones tocan o amplían
CREATE TABLE respaldo_050.perfiles          AS SELECT * FROM public.perfiles;
CREATE TABLE respaldo_050.auth_app_metadata AS SELECT id, raw_app_meta_data FROM auth.users;
CREATE TABLE respaldo_050.pagos             AS SELECT * FROM public.pagos;
CREATE TABLE respaldo_050.pedidos_planes    AS SELECT * FROM public.pedidos_planes;
CREATE TABLE respaldo_050.notificaciones    AS SELECT * FROM public.notificaciones;
CREATE TABLE respaldo_050.incidencias       AS SELECT * FROM public.incidencias;

-- Políticas actuales (las de `perfiles` no están en el repositorio)
CREATE TABLE respaldo_050.politicas AS
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies;

-- Definiciones de las funciones que se reemplazan
CREATE TABLE respaldo_050.funciones AS
  SELECT p.oid::regprocedure::text AS firma, pg_get_functiondef(p.oid) AS definicion
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('get_my_role', 'handle_new_user', 'nexa_tarea_horaria', 'confirmar_pedido_plan_pago',
                       'confirmar_pedido_grupal_pago', 'confirmar_compra_grupal_pago');

-- Quién podía ejecutar cada función SECURITY DEFINER (para poder restaurarlo)
CREATE TABLE respaldo_050.permisos_funciones AS
  SELECT p.oid::regprocedure::text AS firma,
         has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef;

-- Restricciones de pagos y pedidos que 052 reemplaza
CREATE TABLE respaldo_050.restricciones AS
  SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS definicion
    FROM pg_constraint WHERE conrelid IN ('public.pagos'::regclass, 'public.pedidos_planes'::regclass) AND contype = 'c';

SELECT 'perfiles' t, count(*) FROM respaldo_050.perfiles
UNION ALL SELECT 'pagos', count(*) FROM respaldo_050.pagos
UNION ALL SELECT 'pedidos_planes', count(*) FROM respaldo_050.pedidos_planes
UNION ALL SELECT 'politicas', count(*) FROM respaldo_050.politicas
UNION ALL SELECT 'funciones', count(*) FROM respaldo_050.funciones;
