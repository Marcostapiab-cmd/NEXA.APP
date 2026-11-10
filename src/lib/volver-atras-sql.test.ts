// Ensayo del procedimiento de producción en PGlite: respaldo → 050 → volver atrás.
import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';

it('volver atrás restaura funciones, políticas y permisos anteriores', async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}', raw_app_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.perfiles (id uuid PRIMARY KEY, nombre text, rol text);
    CREATE TABLE public.grupales_alumnos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
    CREATE TABLE public.pagos (id int); CREATE TABLE public.pedidos_planes (id int);
    CREATE TABLE public.notificaciones (id int); CREATE TABLE public.incidencias (id int);
    CREATE TABLE public.reservas (id int);
    ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY vieja ON public.perfiles FOR SELECT TO authenticated USING (true);
    CREATE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT 'viejo'::text $$;
    CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;
    CREATE FUNCTION public.interna() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
  `);
  await db.exec(readFileSync('supabase/produccion/01_respaldo_antes_050_053.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/050_seguridad_roles.sql', 'utf8'));
  const anon = async () => (await db.query<{ ok: boolean }>(`SELECT has_function_privilege('anon', 'public.interna()', 'EXECUTE') ok`)).rows[0].ok;
  expect(await anon()).toBe(false);

  await db.exec(readFileSync('supabase/produccion/03_volver_atras_050_053.sql', 'utf8').replace("NOTIFY pgrst, 'reload schema';", ''));
  expect((await db.query<{ r: string }>(`SELECT public.get_my_role() r`)).rows[0].r).toBe('viejo');
  expect((await db.query<{ policyname: string }>(`SELECT policyname FROM pg_policies WHERE tablename = 'perfiles'`)).rows.map(r => r.policyname)).toEqual(['vieja']);
  expect(await anon()).toBe(true);
  expect((await db.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'perfiles_proteger'`)).rows).toHaveLength(0);
}, 60_000);
