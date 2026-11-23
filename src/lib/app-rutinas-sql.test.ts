// Prueba la migración 055 (app de rutinas) en PGlite con las reglas RLS activas:
// las consultas corren con el rol `authenticated`, como en Supabase.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';

const U = { a1: '10000000-0000-0000-0000-000000000001', a2: '10000000-0000-0000-0000-000000000002', coach: '10000000-0000-0000-0000-0000000000c1' };
const ATL = { a1: '20000000-0000-0000-0000-000000000001', a2: '20000000-0000-0000-0000-000000000002' };
let db: PGlite;

async function como(quien: 'a1' | 'a2' | 'coach' | 'anon') {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('test.uid', $1, false)`, [quien === 'anon' ? '' : U[quien]]);
  await db.exec(`SET ROLE ${quien === 'anon' ? 'anon' : 'authenticated'}`);
}
const registro = (atleta: string, rutina = 'r1', serie = 1, peso = 40) => db.query(
  `INSERT INTO public.registros_ejercicio (atleta_id, rutina_id, dia, ejercicio_id, ejercicio_nombre, serie, peso_kg, reps)
   VALUES ($1, $2, '2030-01-07', 'e1', 'Sentadilla', $3, $4, 10) RETURNING id`, [atleta, rutina, serie, peso]);
const comentario = (atleta: string, texto = 'Me duele el hombro, ¿lo puedo cambiar?') => db.query<{ id: string }>(
  `INSERT INTO public.comentarios_ejercicio (atleta_id, rutina_id, dia, ejercicio_id, ejercicio_nombre, texto)
   VALUES ($1, 'r1', '2030-01-07', 'e1', 'Sentadilla', $2) RETURNING id`, [atleta, texto]);
const n = async (sql: string) => (await db.query(sql)).rows.length;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
    CREATE TABLE public.perfiles (id uuid PRIMARY KEY, rol text);
    CREATE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT rol FROM public.perfiles WHERE id = auth.uid() $$;
    CREATE TABLE public.atletas (id uuid PRIMARY KEY, nombre text, user_id uuid, perfil_id uuid);
    -- rutinas: como en producción (el alumno solo lee las suyas; el staff todo)
    CREATE TABLE public.rutinas (id text PRIMARY KEY, nombre text, alumno_ids jsonb, start_date text, end_date text, sessions jsonb);
    ALTER TABLE public.rutinas ENABLE ROW LEVEL SECURITY;
    CREATE POLICY rutinas_portal_self_read ON public.rutinas FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.atletas a WHERE (a.user_id = auth.uid() OR a.perfil_id = auth.uid()) AND rutinas.alumno_ids @> jsonb_build_array(a.id::text)));
    CREATE POLICY rutinas_staff ON public.rutinas FOR ALL TO authenticated USING (get_my_role() IN ('admin','profesor')) WITH CHECK (get_my_role() IN ('admin','profesor'));
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.rutinas TO authenticated;
    GRANT SELECT ON public.atletas TO authenticated;
    INSERT INTO public.perfiles VALUES ('${U.a1}','alumno'),('${U.a2}','alumno'),('${U.coach}','profesor');
    INSERT INTO public.atletas VALUES ('${ATL.a1}','Uno','${U.a1}',NULL),('${ATL.a2}','Dos',NULL,'${U.a2}');
    INSERT INTO public.rutinas VALUES ('r1','Fuerza','["${ATL.a1}"]','2030-01-01','2030-02-28','{"2030-01-07":{"name":"Piernas","exercises":[{"id":"e1","name":"Sentadilla","series":4,"reps":"10"}]}}'),
                                      ('r2','Otra','["${ATL.a2}"]','2030-01-01','2030-02-28','{}');
  `);
  await db.exec(readFileSync('supabase/migrations/055_app_rutinas.sql', 'utf8'));
}, 60_000);

describe('055 — app de rutinas (reglas RLS)', () => {
  it('el alumno solo LEE su rutina; no puede crear, cambiar ni borrar rutinas', async () => {
    await como('a1');
    expect(await n(`SELECT * FROM public.rutinas`)).toBe(1);
    expect((await db.query(`UPDATE public.rutinas SET nombre = 'x' RETURNING id`)).rows).toHaveLength(0);
    expect((await db.query(`DELETE FROM public.rutinas RETURNING id`)).rows).toHaveLength(0);
    await expect(db.query(`INSERT INTO public.rutinas (id, nombre, alumno_ids) VALUES ('r9', 'mía', '[]')`)).rejects.toThrow();
  });

  it('anota pesos de su rutina y los corrige', async () => {
    await como('a1');
    await registro(ATL.a1, 'r1', 1, 40);
    await registro(ATL.a1, 'r1', 2, 45);
    const upd = await db.query(`UPDATE public.registros_ejercicio SET peso_kg = 42.5 WHERE serie = 1 RETURNING peso_kg`);
    expect(Number((upd.rows[0] as { peso_kg: string }).peso_kg)).toBe(42.5);
    expect(await n(`SELECT * FROM public.registros_ejercicio`)).toBe(2);
  });

  it('no puede anotar para otro alumno ni en una rutina que no es suya', async () => {
    await como('a1');
    await expect(registro(ATL.a2, 'r2')).rejects.toThrow(/row-level security/);
    await expect(registro(ATL.a1, 'r2')).rejects.toThrow(/row-level security/);
  });

  it('otro alumno no ve, no cambia y no borra registros ajenos', async () => {
    await como('a2');
    expect(await n(`SELECT * FROM public.registros_ejercicio`)).toBe(0);
    expect((await db.query(`UPDATE public.registros_ejercicio SET peso_kg = 999 RETURNING id`)).rows).toHaveLength(0);
    expect((await db.query(`DELETE FROM public.registros_ejercicio RETURNING id`)).rows).toHaveLength(0);
  });

  it('comentario del alumno: lo crea, lo edita; no puede marcarlo leído ni responderse', async () => {
    await como('a1');
    const { rows } = await comentario(ATL.a1);
    const id = rows[0].id;
    await db.query(`UPDATE public.comentarios_ejercicio SET texto = 'Me duele el hombro derecho' WHERE id = $1`, [id]);
    await expect(db.query(`UPDATE public.comentarios_ejercicio SET leido_at = now() WHERE id = $1`, [id])).rejects.toThrow(/coach/);
    await expect(db.query(`UPDATE public.comentarios_ejercicio SET respuesta = 'sí' WHERE id = $1`, [id])).rejects.toThrow(/coach/);
    await expect(comentario(ATL.a2)).rejects.toThrow(/row-level security/);
  });

  it('el coach ve registros y comentarios de todos, marca leído y responde; no edita el texto del alumno', async () => {
    await como('coach');
    expect(await n(`SELECT * FROM public.registros_ejercicio`)).toBe(2);
    const c = (await db.query<{ id: string }>(`SELECT id FROM public.comentarios_ejercicio`)).rows[0];
    await db.query(`UPDATE public.comentarios_ejercicio SET respuesta = 'Sí, cámbialo por prensa' WHERE id = $1`, [c.id]);
    const r = (await db.query<{ leido_at: string | null; respondido_por: string }>(`SELECT leido_at, respondido_por FROM public.comentarios_ejercicio WHERE id = $1`, [c.id])).rows[0];
    expect(r.leido_at).not.toBeNull();
    expect(r.respondido_por).toBe(U.coach);
    await expect(db.query(`UPDATE public.comentarios_ejercicio SET texto = 'otro' WHERE id = $1`, [c.id])).rejects.toThrow(/coach no puede/);
  });

  it('el alumno ve la respuesta y ya no puede editar un comentario respondido', async () => {
    await como('a1');
    const r = (await db.query<{ respuesta: string }>(`SELECT respuesta FROM public.comentarios_ejercicio`)).rows[0];
    expect(r.respuesta).toMatch(/prensa/);
    expect((await db.query(`UPDATE public.comentarios_ejercicio SET texto = 'x' RETURNING id`)).rows).toHaveLength(0);
  });

  it('sin sesión no ve nada', async () => {
    await como('anon');
    await expect(db.query(`SELECT * FROM public.registros_ejercicio`)).rejects.toThrow(/permission denied/);
    await expect(db.query(`SELECT * FROM public.comentarios_ejercicio`)).rejects.toThrow(/permission denied/);
    await db.exec('RESET ROLE');
  });

  it('se puede volver a ejecutar', async () => {
    await db.exec('RESET ROLE');
    await db.exec(readFileSync('supabase/migrations/055_app_rutinas.sql', 'utf8'));
  });

  it('volver atrás borra solo lo nuevo y deja las rutinas intactas', async () => {
    await db.exec('RESET ROLE');
    await db.exec(readFileSync('supabase/produccion/05_volver_atras_055.sql', 'utf8').replace("NOTIFY pgrst, 'reload schema';", ''));
    expect((await db.query(`SELECT to_regclass('public.registros_ejercicio') r`)).rows[0]).toEqual({ r: null });
    expect((await db.query(`SELECT count(*)::int n FROM public.rutinas`)).rows[0]).toEqual({ n: 2 });
  });
});
