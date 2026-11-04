// Prueba la migración 047 (Centro de Ayuda) en un Postgres en memoria (PGlite).
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { SQL_BASE, MIGRACIONES } from './sql-test-base';

const uid = (n: number) => `10000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const atl = (n: number) => `20000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const COACH = '00000000-0000-0000-0000-00000000000a';

let db: PGlite;
async function como(n: number | null, rol: string | null = null) {
  await db.query(`SELECT set_config('test.uid', $1, false), set_config('test.rol', $2, false)`, [n ? uid(n) : '', rol ?? '']);
}
async function rpc<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ r: T }>(`SELECT ${sql} AS r`, params);
  return r.rows[0].r;
}
type Res = { ok: boolean; error?: string; id?: string };
const solicitar = (tema: string, msg: string, reserva: number | null = null) =>
  rpc<Res>(`public.alumno_solicitar_ayuda($1, $2, $3)`, [tema, msg, reserva]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SQL_BASE);
  for (const m of MIGRACIONES) await db.exec(readFileSync(`supabase/migrations/${m}`, 'utf8'));
  await db.exec(`
    INSERT INTO public.coaches VALUES ('${COACH}','Catalina',true);
    INSERT INTO public.atletas (id, nombre, apellido, email, user_id, tipo_sesion) VALUES
      ('${atl(1)}','Ana','Pérez','ana@x.cl','${uid(1)}','1:1'),
      ('${atl(2)}','Beto','Soto','beto@x.cl','${uid(2)}','1:1');
  `);
}, 60_000);

describe('Centro de Ayuda (047)', () => {
  it('sin sesión no se puede enviar ni leer', async () => {
    await como(null);
    expect(await solicitar('clases', 'Hola, una duda')).toMatchObject({ ok: false, error: 'no_autorizado' });
    expect(await rpc('public.alumno_info_ayuda()')).toBeNull();
  });

  it('valida tema y largo del mensaje', async () => {
    await como(1);
    expect(await solicitar('inventado', 'Hola, una duda')).toMatchObject({ ok: false, error: 'tema_invalido' });
    expect(await solicitar('clases', '  hi ')).toMatchObject({ ok: false, error: 'mensaje_corto' });
    expect(await solicitar('clases', 'x'.repeat(1001))).toMatchObject({ ok: false, error: 'mensaje_largo' });
  });

  it('crea la incidencia en "Requiere atención" y encola el correo de recibido', async () => {
    await como(1);
    const r = await solicitar('excepcion', 'Tuve una emergencia y no pude avisar');
    expect(r.ok).toBe(true);
    const { rows } = await db.query<Record<string, unknown>>(`SELECT * FROM public.incidencias WHERE id = $1`, [r.id]);
    expect(rows[0]).toMatchObject({
      tipo: 'solicitud_alumno', estado: 'abierta', automatica: false, prioridad: 'alta',
      atleta_id: atl(1), tema: 'excepcion', descripcion: 'Tuve una emergencia y no pude avisar',
    });
    expect(String(rows[0].titulo)).toContain('Ana Pérez');
    const n = await db.query(`SELECT tipo FROM public.notificaciones WHERE clave = $1`, [`solicitud_recibida:${r.id}`]);
    expect(n.rows).toHaveLength(1);
  });

  it('no enlaza una clase de otro alumno', async () => {
    await como(null, 'admin');
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO public.reservas (alumno_id, fecha, hora, coach_id) VALUES ($1, now(), '10:00', $2) RETURNING id`, [atl(2), COACH]);
    await como(1);
    const r = await solicitar('clases', 'Consulta sobre esta clase', rows[0].id);
    expect(r.ok).toBe(true);
    const i = await db.query<{ reserva_id: number | null }>(`SELECT reserva_id FROM public.incidencias WHERE id = $1`, [r.id]);
    expect(i.rows[0].reserva_id).toBeNull();
  });

  it('máximo 3 consultas abiertas por alumno', async () => {
    await como(1);
    expect((await solicitar('otro', 'Tercera consulta')).ok).toBe(true);
    expect(await solicitar('otro', 'Cuarta consulta')).toMatchObject({ ok: false, error: 'demasiadas' });
    expect(await rpc('public.alumno_info_ayuda()')).toMatchObject({ solicitudes_abiertas: 3 });
  });

  it('cada alumno ve solo sus consultas', async () => {
    await como(2);
    expect(await rpc<unknown[]>('public.alumno_mis_solicitudes()')).toEqual([]);
    await como(1);
    expect(await rpc<unknown[]>('public.alumno_mis_solicitudes()')).toHaveLength(3);
  });

  it('al responder y cerrar, el alumno ve la respuesta y recibe el correo', async () => {
    await como(1);
    const lista = await rpc<{ id: string; tema: string }[]>('public.alumno_mis_solicitudes()');
    const id = lista.find(s => s.tema.startsWith('Excepción'))!.id;
    await como(null, 'admin');
    expect(await rpc<Res>(`public.staff_resolver_incidencia($1, 'resuelta', 'Te devolvimos la clase')`, [id])).toMatchObject({ ok: true });
    const n = await db.query<{ datos: Record<string, unknown> }>(`SELECT datos FROM public.notificaciones WHERE clave = $1`, [`solicitud_respondida:${id}`]);
    expect(n.rows[0].datos).toMatchObject({ respuesta: 'Te devolvimos la clase' });
    await como(1);
    const s = (await rpc<{ id: string; estado: string; respuesta: string }[]>('public.alumno_mis_solicitudes()')).find(x => x.id === id)!;
    expect(s).toMatchObject({ estado: 'resuelta', respuesta: 'Te devolvimos la clase' });
    expect(await rpc('public.alumno_info_ayuda()')).toMatchObject({ solicitudes_abiertas: 2 });
  });

  it('un alumno no puede leer la tabla de incidencias directamente', async () => {
    await db.exec(`GRANT SELECT ON public.incidencias TO authenticated`);
    await como(1);
    await db.exec(`SET ROLE authenticated`);
    const { rows } = await db.query(`SELECT * FROM public.incidencias`);
    await db.exec(`RESET ROLE`);
    expect(rows).toHaveLength(0);
  });
});
