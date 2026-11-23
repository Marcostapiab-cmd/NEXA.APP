-- ============================================================
-- NEXA — Respaldo ANTES de aplicar 055 (app de rutinas)
-- ============================================================
-- La 055 solo CREA cosas nuevas; no cambia datos existentes. Igual se guarda
-- una copia de lo que usa (rutinas, fichas, perfiles y sus reglas) en el
-- esquema `respaldo_055`. Solo lee y copia: no modifica nada.
-- ============================================================
CREATE SCHEMA IF NOT EXISTS respaldo_055;
REVOKE ALL ON SCHEMA respaldo_055 FROM PUBLIC, anon, authenticated;

CREATE TABLE respaldo_055.rutinas  AS SELECT * FROM public.rutinas;
CREATE TABLE respaldo_055.atletas  AS SELECT * FROM public.atletas;
CREATE TABLE respaldo_055.perfiles AS SELECT * FROM public.perfiles;
CREATE TABLE respaldo_055.politicas AS
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies;

SELECT 'rutinas' t, count(*) FROM respaldo_055.rutinas
UNION ALL SELECT 'atletas', count(*) FROM respaldo_055.atletas
UNION ALL SELECT 'perfiles', count(*) FROM respaldo_055.perfiles
UNION ALL SELECT 'politicas', count(*) FROM respaldo_055.politicas;
