// Ensayo del script de producción 02_aplicar_050_053.sql (todo o nada) sobre una
// base con la estructura de producción. Se ejecuta dos veces para comprobar que
// es re-ejecutable.
import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { SQL_BASE, MIGRACIONES } from './sql-test-base';

it('02_aplicar_050_053.sql se aplica completo y es re-ejecutable', async () => {
  const db = new PGlite();
  await db.exec(SQL_BASE);
  for (const m of MIGRACIONES) await db.exec(readFileSync(`supabase/migrations/${m}`, 'utf8'));
  const m033 = readFileSync('supabase/migrations/033_planes_1a1_precios_y_pedidos.sql', 'utf8');
  await db.exec(`
    DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN others THEN NULL; END $$;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}', raw_app_meta_data jsonb DEFAULT '{}');
    CREATE TABLE public.perfiles (id uuid PRIMARY KEY, nombre text, rol text, created_at timestamptz DEFAULT now());
    CREATE TABLE public.grupales_alumnos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
    ALTER TABLE public.atletas ADD COLUMN IF NOT EXISTS telefono text, ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;
    ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('00000000-0000-0000-0000-0000000000a1', 'admin@x.cl', '{"rol":"admin"}');
    INSERT INTO public.perfiles (id, nombre, rol) VALUES ('00000000-0000-0000-0000-0000000000a1', 'Admin', 'admin');
  ` + m033.slice(m033.indexOf('CREATE TABLE IF NOT EXISTS public.pedidos_planes'), m033.indexOf('ALTER TABLE public.pedidos_planes')));

  const script = readFileSync('supabase/produccion/02_aplicar_050_053.sql', 'utf8').replace(/NOTIFY pgrst, 'reload schema';/g, '');
  await db.exec(script);
  await db.exec(script);

  const existe = async (f: string) => (await db.query<{ r: string | null }>(`SELECT to_regprocedure($1)::text r`, [f])).rows[0].r !== null;
  for (const f of ['public.nexa_mi_rol()', 'public.nexa_reserva_alumno_unica()', 'public.nexa_confirmar_pago_plan(text,int,text,text)',
                   'public.nexa_secreto_notificaciones()']) {
    expect(await existe(f)).toBe(true);
  }
  expect((await db.query<{ r: string }>(`SELECT raw_app_meta_data->>'rol' r FROM auth.users`)).rows[0].r).toBe('admin');
}, 120_000);
