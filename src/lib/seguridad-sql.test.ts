// Prueba la migración 050 (roles protegidos) en PGlite. No toca la base real.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';

const ADMIN = '00000000-0000-0000-0000-0000000000a1';
const ATACANTE = '00000000-0000-0000-0000-0000000000b1';
const PROFE = '00000000-0000-0000-0000-0000000000c1';
const GRUPAL = '00000000-0000-0000-0000-0000000000d1';

let db: PGlite;

/** Simula una petición HTTP de PostgREST con el rol y usuario indicados ('' = servidor/SQL directo). */
async function como(rol: '' | 'anon' | 'authenticated' | 'service_role', uid = '') {
  const claims = rol ? JSON.stringify({ role: rol, sub: uid || undefined }) : '';
  await db.query(`SELECT set_config('request.jwt.claims', $1, false), set_config('test.uid', $2, false)`, [claims, uid]);
}
async function crearUsuario(id: string, email: string, userMeta: object, appMeta: object = {}) {
  await como('');
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data) VALUES ($1, $2, $3, $4)`,
    [id, email, JSON.stringify(userMeta), JSON.stringify(appMeta)]);
}
const rolPerfil = async (id: string) =>
  (await db.query<{ rol: string }>(`SELECT rol FROM public.perfiles WHERE id = $1`, [id])).rows[0]?.rol ?? null;
const rolApp = async (id: string) =>
  (await db.query<{ r: string | null }>(`SELECT raw_app_meta_data->>'rol' r FROM auth.users WHERE id = $1`, [id])).rows[0]?.r ?? null;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}', raw_app_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.perfiles (id uuid PRIMARY KEY, nombre text, rol text CHECK (rol IN ('admin','profesor','alumno','recepcionista','host')));
    CREATE TABLE public.grupales_alumnos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid);
    -- Política "vieja" creada a mano en producción: debe desaparecer
    ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY vieja_todo ON public.perfiles FOR ALL USING (true) WITH CHECK (true);
    -- Funciones como las de producción (abiertas a PUBLIC)
    CREATE FUNCTION public.confirmar_pedido_grupal_pago(p text) RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
    CREATE FUNCTION public.nexa_interna() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
    CREATE FUNCTION public.get_sesiones_publicas() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
    GRANT EXECUTE ON FUNCTION public.nexa_interna() TO authenticated;
    GRANT ALL ON public.perfiles TO authenticated, anon;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
  `);
  // Admin y una cuenta grupal existentes antes de la migración
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${ADMIN}', 'admin@x.cl', '{"rol":"admin"}'), ('${GRUPAL}', 'g@x.cl', '{"rol":"grupales"}');
    INSERT INTO public.perfiles VALUES ('${ADMIN}', 'Admin', 'admin');
    INSERT INTO public.grupales_alumnos (user_id) VALUES ('${GRUPAL}');
  `);
  await db.exec(readFileSync('supabase/migrations/050_seguridad_roles.sql', 'utf8'));
});

describe('050 — roles protegidos', () => {
  it('copia los roles existentes a app_metadata (incluye cuentas grupales)', async () => {
    expect(await rolApp(ADMIN)).toBe('admin');
    expect(await rolApp(GRUPAL)).toBe('grupales');
  });

  it('registrarse con data.rol = admin NO crea un administrador', async () => {
    await crearUsuario(ATACANTE, 'malo@x.cl', { rol: 'admin', nombre: 'Malo' });
    expect(await rolPerfil(ATACANTE)).toBeNull();
    expect(await rolApp(ATACANTE)).toBeNull();
  });

  it('el servidor sí puede crear cuentas con rol (app_metadata) y se sincroniza', async () => {
    await crearUsuario(PROFE, 'profe@x.cl', { nombre: 'Profe' }, { rol: 'profesor' });
    expect(await rolPerfil(PROFE)).toBe('profesor');
    expect(await rolApp(PROFE)).toBe('profesor');
  });

  it('un usuario no puede darse rol ni cambiar el suyo', async () => {
    await como('authenticated', ATACANTE);
    await expect(db.query(`INSERT INTO public.perfiles (id, nombre, rol) VALUES ($1, 'x', 'admin')`, [ATACANTE])).rejects.toThrow(/administrador/);
    await como('authenticated', PROFE);
    await expect(db.query(`UPDATE public.perfiles SET rol = 'admin' WHERE id = $1`, [PROFE])).rejects.toThrow(/administrador/);
    // Su nombre sí lo puede cambiar
    await db.query(`UPDATE public.perfiles SET nombre = 'Profe 2' WHERE id = $1`, [PROFE]);
    expect(await rolPerfil(PROFE)).toBe('profesor');
  });

  it('un admin puede asignar roles y el cambio llega a app_metadata', async () => {
    await como('authenticated', ADMIN);
    await db.query(`UPDATE public.perfiles SET rol = 'recepcionista' WHERE id = $1`, [PROFE]);
    expect(await rolApp(PROFE)).toBe('recepcionista');
    await db.query(`DELETE FROM public.perfiles WHERE id = $1`, [PROFE]);
    expect(await rolApp(PROFE)).toBeNull();
  });

  it('get_my_role ignora roles desconocidos', async () => {
    await como('');
    await db.exec(`ALTER TABLE public.perfiles DROP CONSTRAINT perfiles_rol_check; INSERT INTO public.perfiles VALUES ('${ATACANTE}', 'x', 'superusuario');`);
    await como('authenticated', ATACANTE);
    expect((await db.query<{ r: string | null }>(`SELECT public.get_my_role() r`)).rows[0].r).toBeNull();
    expect((await db.query<{ r: string | null }>(`SELECT public.nexa_mi_rol() r`)).rows[0].r).toBeNull();
  });

  it('reemplaza la política abierta de perfiles', async () => {
    const pols = (await db.query<{ policyname: string }>(`SELECT policyname FROM pg_policies WHERE tablename = 'perfiles'`)).rows.map(r => r.policyname);
    expect(pols).not.toContain('vieja_todo');
    expect(pols).toContain('perfiles_admin');
  });

  it('confirmar pagos y funciones internas: cerradas a anónimos; las públicas siguen abiertas', async () => {
    const puede = async (rol: string, fn: string) =>
      (await db.query<{ ok: boolean }>(`SELECT has_function_privilege($1, $2, 'EXECUTE') ok`, [rol, fn])).rows[0].ok;
    expect(await puede('anon', 'public.confirmar_pedido_grupal_pago(text)')).toBe(false);
    expect(await puede('authenticated', 'public.confirmar_pedido_grupal_pago(text)')).toBe(false);
    expect(await puede('service_role', 'public.confirmar_pedido_grupal_pago(text)')).toBe(true);
    expect(await puede('anon', 'public.nexa_interna()')).toBe(false);
    expect(await puede('authenticated', 'public.nexa_interna()')).toBe(true);
    expect(await puede('anon', 'public.get_sesiones_publicas()')).toBe(true);
  });

  it('se puede volver a ejecutar sin errores', async () => {
    await como('');
    await db.exec(readFileSync('supabase/migrations/050_seguridad_roles.sql', 'utf8'));
  });
});
