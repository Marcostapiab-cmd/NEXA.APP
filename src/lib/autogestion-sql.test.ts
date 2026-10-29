// Prueba la migración 041 en un Postgres real (PGlite, en memoria) con la misma
// estructura de tablas que producción. Ejecuta los escenarios obligatorios:
// cupos 1:1 / 2:1, plazos, reagendamiento atómico, créditos, bloqueos, lista de
// espera, auditoría y permisos. No toca la base de datos real.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { horaChile, limiteCancelacion } from './politica-cancelacion';
import { SQL_BASE, MIGRACIONES } from './sql-test-base';



const COACH = { A: '00000000-0000-0000-0000-00000000000a', B: '00000000-0000-0000-0000-00000000000b', C: '00000000-0000-0000-0000-00000000000c' };
const uid = (n: number) => `10000000-0000-0000-0000-00000000000${n}`;
const atl = (n: number) => `20000000-0000-0000-0000-00000000000${n}`;
const plan = (n: number) => `30000000-0000-0000-0000-00000000000${n}`;

const hoyCl = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const sumar = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
function proximoLunes(desde: string, minDias: number) { let f = sumar(desde, minDias); while (dow(f) !== 1) f = sumar(f, 1); return f; }

let db: PGlite;
const HOY = hoyCl();
const D = proximoLunes(HOY, 7);       // lunes al menos 7 días adelante
const MIE = sumar(D, 2), JUE = sumar(D, 3), VIE = sumar(D, 4);

async function como(n: number | null, rol: string | null = null) {
  await db.query(`SELECT set_config('test.uid', $1, false), set_config('test.rol', $2, false)`, [n ? uid(n) : '', rol ?? '']);
}
async function rpc<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ r: T }>(`SELECT ${sql} AS r`, params);
  return r.rows[0].r;
}
const reservar   = (f: string, h: string, c: string) => rpc<{ ok: boolean; error?: string; reserva_id?: number }>('public.alumno_reservar_clase($1::date, $2, $3::uuid)', [f, h, c]);
const cancelar   = (id: number) => rpc<{ ok: boolean; error?: string }>('public.alumno_cancelar_reserva($1::int)', [id]);
const reagendar  = (id: number, f: string, h: string, c: string) => rpc<{ ok: boolean; error?: string; reserva_id?: number }>('public.alumno_reagendar_reserva($1::int, $2::date, $3, $4::uuid)', [id, f, h, c]);
async function disponibles(desde: string, hasta: string, reservaId?: number) {
  const r = await db.query<{ fecha: string; hora: string; coach_id: string; modalidad: string; cupos: number }>(
    `SELECT fecha::text, hora, coach_id::text, modalidad, cupos FROM public.alumno_horarios_disponibles($1::date, $2::date, $3::int)`,
    [desde, hasta, reservaId ?? null]);
  return r.rows;
}
const ofrece = (rows: { fecha: string; hora: string; coach_id: string }[], f: string, h: string, c: string) =>
  rows.some(r => r.fecha === f && r.hora === h && r.coach_id === c);
async function estado(id: number) {
  return (await db.query<{ estado: string }>('SELECT estado FROM public.reservas WHERE id = $1', [id])).rows[0]?.estado;
}
async function miPlan() { return rpc<{ disponibles: number; reservadas: number; usadas: number }>('public.alumno_mi_plan()'); }

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SQL_BASE);
  for (const m of MIGRACIONES) await db.exec(readFileSync(`supabase/migrations/${m}`, 'utf8'));
  await db.exec(`
    INSERT INTO public.coaches VALUES ('${COACH.A}','Catalina',true),('${COACH.B}','Marcos',true),('${COACH.C}','Gian Carlos',true);
    INSERT INTO public.atletas (id, nombre, email, user_id, tipo_sesion) VALUES
      ('${atl(1)}','Uno','uno@x.cl','${uid(1)}','1:1'), ('${atl(2)}','Dos','dos@x.cl','${uid(2)}','2:1'),
      ('${atl(3)}','Tres','tres@x.cl','${uid(3)}','2:1'), ('${atl(4)}','Cuatro','cuatro@x.cl','${uid(4)}','1:1'),
      ('${atl(5)}','Cinco','cinco@x.cl','${uid(5)}','2:1');
    INSERT INTO public.planes (id, alumno_id, nombre, tipo, total_clases, start_date, end_date, modalidad) VALUES
      ('${plan(1)}','${atl(1)}','1:1 3x','trimestral',36,'${HOY}','${sumar(HOY, 90)}','1:1'),
      ('${plan(2)}','${atl(2)}','2:1 2x','mensual',8,'${HOY}','${sumar(HOY, 40)}','2:1'),
      ('${plan(3)}','${atl(3)}','2:1 2x','mensual',8,'${HOY}','${sumar(HOY, 40)}','2:1'),
      ('${plan(4)}','${atl(4)}','1:1 1x','mensual',3,'${HOY}','${sumar(HOY, 40)}','1:1'),
      ('${plan(5)}','${atl(5)}','2:1 1x','mensual',4,'${HOY}','${sumar(HOY, 40)}','2:1');
  `);
}, 60_000);

describe('Política en SQL = política en TypeScript (zona America/Santiago)', () => {
  const casos: [string, string][] = [
    ['2026-11-04', '10:00'], ['2026-11-04', '12:00'], ['2026-11-04', '12:01'], ['2026-11-06', '15:00'],
    ['2026-11-06', '17:00'], ['2026-11-06', '18:00'], ['2026-11-06', '20:00'], ['2026-09-07', '10:00'],
    ['2026-04-05', '18:00'], ['2026-07-15', '07:00'],
  ];
  for (const [f, h] of casos) {
    it(`${f} ${h}`, async () => {
      const r = await db.query<{ l: Date }>(`SELECT public.nexa_limite_cancelacion($1::date, $2) AS l`, [f, h]);
      expect(new Date(r.rows[0].l).getTime()).toBe(limiteCancelacion(f, h).getTime());
    });
  }
  it('el corte AM quedó en 22:00', async () => {
    const r = await db.query<{ l: Date }>(`SELECT public.nexa_limite_cancelacion('2026-11-04', '12:00') AS l`);
    expect(new Date(r.rows[0].l).getTime()).toBe(horaChile('2026-11-03', '22:00').getTime());
  });
});

describe('Escenarios obligatorios', () => {
  let r1: number, r2: number, r3: number;

  it('1. reserva 1:1 ocupa el horario completo del profesor', async () => {
    await como(1);
    const r = await reservar(D, '10:00', COACH.A);
    expect(r).toMatchObject({ ok: true });
    r1 = r.reserva_id!;
    await como(4);
    expect(ofrece(await disponibles(D, D), D, '10:00', COACH.A)).toBe(false);
    expect(ofrece(await disponibles(D, D), D, '10:00', COACH.B)).toBe(true);
    expect(await reservar(D, '10:00', COACH.A)).toMatchObject({ ok: false, error: 'sin_cupo' });
    await como(2); // un 2:1 tampoco puede entrar a un 1:1
    expect(ofrece(await disponibles(D, D), D, '10:00', COACH.A)).toBe(false);
  });

  it('2. primer cupo 2:1: queda 1 disponible solo para alumnos 2:1', async () => {
    await como(2);
    const r = await reservar(D, '17:00', COACH.B);
    expect(r.ok).toBe(true); r2 = r.reserva_id!;
    await como(3);
    const fila = (await disponibles(D, D)).find(x => x.hora === '17:00' && x.coach_id === COACH.B);
    expect(fila?.cupos).toBe(1);
    await como(1); // alumno 1:1 nunca ve un 2:1 con un alumno
    expect(ofrece(await disponibles(D, D), D, '17:00', COACH.B)).toBe(false);
    expect(await reservar(D, '17:00', COACH.B)).toMatchObject({ ok: false, error: 'sin_cupo' });
  });

  it('3. segundo cupo 2:1 completa la sesión', async () => {
    await como(3);
    const r = await reservar(D, '17:00', COACH.B);
    expect(r.ok).toBe(true); r3 = r.reserva_id!;
    await como(5);
    expect(ofrece(await disponibles(D, D), D, '17:00', COACH.B)).toBe(false);
    expect(await reservar(D, '17:00', COACH.B)).toMatchObject({ ok: false, error: 'sin_cupo' });
  });

  it('4. la base de datos impide superar la capacidad aunque se inserte directo', async () => {
    await como(null, 'admin');
    await expect(db.query(`INSERT INTO public.reservas (alumno_id, fecha, hora, estado, tipo_clase, coach_id)
      VALUES ('${atl(5)}', '${D}'::timestamp AT TIME ZONE 'UTC', '17:00', 'pendiente', '2:1 Duo', '${COACH.B}')`)).rejects.toThrow(/Cupo completo/);
    await expect(db.query(`INSERT INTO public.reservas (alumno_id, fecha, hora, estado, tipo_clase, coach_id)
      VALUES ('${atl(5)}', '${D}'::timestamp AT TIME ZONE 'UTC', '10:00', 'pendiente', '2:1 Duo', '${COACH.A}')`)).rejects.toThrow(/1:1/);
  });

  it('5. cancelar dentro de plazo conserva el crédito y libera solo ese cupo', async () => {
    await como(2);
    const antes = await miPlan();
    expect(await cancelar(r2)).toMatchObject({ ok: true });
    expect(await estado(r2)).toBe('cancelada_tiempo');
    expect(await estado(r3)).toBe('pendiente'); // el otro alumno mantiene su reserva
    const despues = await miPlan();
    expect(despues.disponibles).toBe(antes.disponibles + 1);
    await como(5);
    expect((await disponibles(D, D)).find(x => x.hora === '17:00' && x.coach_id === COACH.B)?.cupos).toBe(1);
  });

  it('6. cancelar fuera de plazo se rechaza y la clase queda igual', async () => {
    // Clase de hoy dentro de 1 hora: siempre está fuera de plazo (regla A o B).
    const ahora = new Date();
    const enUnaHora = new Date(ahora.getTime() + 3_600_000);
    const f = enUnaHora.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    const h = enUnaHora.toLocaleTimeString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
    await como(null, 'admin');
    const { rows } = await db.query<{ id: number }>(`INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase, coach_id)
      VALUES ('${atl(1)}', '${plan(1)}', '${f}'::timestamp AT TIME ZONE 'UTC', '${h}', 'pendiente', '1:1 Individual', '${COACH.C}') RETURNING id`);
    await como(1);
    expect(await cancelar(rows[0].id)).toMatchObject({ ok: false, error: 'fuera_de_plazo' });
    expect(await reagendar(rows[0].id, JUE, '10:00', COACH.A)).toMatchObject({ ok: false, error: 'fuera_de_plazo' });
    expect(await estado(rows[0].id)).toBe('pendiente');
    await como(null, 'admin');
    await db.query(`DELETE FROM public.reservas WHERE id = $1`, [rows[0].id]);
  });

  it('7. reagendar mueve la clase sin gastar un crédito extra y libera el cupo original', async () => {
    await como(1);
    const antes = await miPlan();
    const opciones = await disponibles(D, sumar(D, 7), r1);
    expect(ofrece(opciones, MIE, '10:00', COACH.A)).toBe(true);
    const r = await reagendar(r1, MIE, '10:00', COACH.A);
    expect(r).toMatchObject({ ok: true });
    expect(await estado(r1)).toBe('reagendada');
    expect(await estado(r.reserva_id!)).toBe('pendiente');
    expect((await miPlan()).disponibles).toBe(antes.disponibles); // mismo crédito
    const reag = await db.query(`SELECT * FROM public.reagendas WHERE reserva_original_id = $1`, [String(r1)]);
    expect(reag.rows).toHaveLength(1);
    await como(4);
    expect(ofrece(await disponibles(D, D), D, '10:00', COACH.A)).toBe(true); // el cupo original vuelve
    r1 = r.reserva_id!;
  });

  it('8. reagendar a un horario sin cupo falla y conserva la reserva original', async () => {
    await como(4);
    const mia = await reservar(JUE, '09:00', COACH.C);
    expect(mia.ok).toBe(true);
    expect(await reagendar(mia.reserva_id!, MIE, '10:00', COACH.A)).toMatchObject({ ok: false, error: 'sin_cupo' });
    expect(await estado(mia.reserva_id!)).toBe('pendiente');
  });

  it('10. un error a mitad del reagendamiento revierte todo (la original sigue activa)', async () => {
    await como(null, 'admin');
    await db.exec(`
      CREATE FUNCTION public.falla_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF current_setting('test.fallar', true) = 'si' THEN RAISE EXCEPTION 'falla simulada'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER falla_test BEFORE INSERT ON public.reservas FOR EACH ROW EXECUTE FUNCTION public.falla_test();`);
    await db.query(`SELECT set_config('test.fallar', 'si', false)`);
    await como(1);
    const antes = await db.query('SELECT count(*)::int n FROM public.reagendas');
    expect(await reagendar(r1, VIE, '10:00', COACH.A)).toMatchObject({ ok: false });
    expect(await estado(r1)).toBe('pendiente');
    expect((await db.query('SELECT count(*)::int n FROM public.reagendas')).rows).toEqual(antes.rows);
    await db.query(`SELECT set_config('test.fallar', '', false)`);
    await db.exec('DROP TRIGGER falla_test ON public.reservas; DROP FUNCTION public.falla_test();');
  });

  it('9. cancelar una clase de un horario fijo no toca las semanas siguientes', async () => {
    await como(null, 'admin');
    const fijas = await db.query<{ id: number }>(`INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase, coach_id)
      SELECT '${atl(1)}', '${plan(1)}', (('${D}'::date + s * 7)::timestamp AT TIME ZONE 'UTC'), '07:00', 'pendiente', '1:1 Individual', '${COACH.C}'
      FROM generate_series(0, 3) s RETURNING id`);
    const ids = fijas.rows.map(r => r.id);
    await como(1);
    expect((await cancelar(ids[1])).ok).toBe(true);
    expect(await Promise.all(ids.map(estado))).toEqual(['pendiente', 'cancelada_tiempo', 'pendiente', 'pendiente']);
  });

  it('11. no se puede reservar dos veces ni a la misma hora que otra clase', async () => {
    await como(1);
    expect(await reservar(MIE, '10:00', COACH.B)).toMatchObject({ ok: false, error: 'choque_alumno' });
    const opciones = await disponibles(MIE, MIE);
    expect(opciones.some(o => o.hora === '10:00')).toBe(false);
  });

  it('12. control de créditos: no se reservan más clases que las del plan', async () => {
    await como(4); // plan de 3 clases, ya tiene 1 (jueves 09:00)
    expect((await reservar(VIE, '09:00', COACH.C)).ok).toBe(true);
    const tercera = await reservar(VIE, '11:00', COACH.C);
    expect(tercera.ok).toBe(true);
    expect(await reservar(VIE, '12:00', COACH.C)).toMatchObject({ ok: false, error: 'sin_creditos' });
    expect((await miPlan()).disponibles).toBe(0);
    // Cancelar a tiempo devuelve el crédito, y se puede volver a usar una sola vez
    expect((await cancelar(tercera.reserva_id!)).ok).toBe(true);
    expect((await reservar(VIE, '12:00', COACH.C)).ok).toBe(true);
    expect(await reservar(VIE, '13:00', COACH.C)).toMatchObject({ ok: false, error: 'sin_creditos' });
  });

  it('13. no se reserva fuera de la vigencia del plan', async () => {
    await como(2);
    const fuera = proximoLunes(sumar(HOY, 41), 0);
    expect(await reservar(fuera, '10:00', COACH.A)).toMatchObject({ ok: false, error: 'fuera_de_vigencia' });
    expect((await disponibles(fuera, sumar(fuera, 5))).length).toBe(0);
  });

  it('14. respeta bloqueos del profesor (vacaciones) y del gimnasio', async () => {
    await como(null, 'admin');
    const SAB = sumar(D, 5);
    await db.query(`INSERT INTO public.horario_bloqueos (fecha, coach_id, tipo, motivo) VALUES ($1, $2, 'vacaciones', 'test')`, [JUE, COACH.A]);
    await db.query(`INSERT INTO public.horario_bloqueos (fecha, hora_inicio, hora_fin, motivo) VALUES ($1, '08:00', '10:00', 'test')`, [SAB]);
    await como(5);
    const jue = await disponibles(JUE, JUE);
    expect(jue.some(x => x.coach_id === COACH.A)).toBe(false);
    expect(jue.some(x => x.coach_id === COACH.B)).toBe(true);
    expect(await reservar(JUE, '15:00', COACH.A)).toMatchObject({ ok: false, error: 'sin_cupo' });
    const sab = await disponibles(SAB, SAB);
    expect(sab.some(x => x.hora === '08:00' || x.hora === '09:00')).toBe(false);
    expect(sab.some(x => x.hora === '10:00')).toBe(true);
  });

  it('respeta la capacidad física (profesores simultáneos)', async () => {
    await como(null, 'admin');
    await db.query(`UPDATE public.horario_config SET max_profesores = 2`);
    await como(2);
    expect((await reservar(MIE, '16:00', COACH.A)).ok).toBe(true);  // profesor 1 trabajando (2:1, 1/2)
    await como(5);
    expect((await reservar(MIE, '16:00', COACH.B)).ok).toBe(true);  // profesor 2 trabajando (2:1, 1/2)
    await como(1); // 1:1: necesitaría un tercer profesor → no se ofrece
    expect((await disponibles(MIE, MIE)).filter(x => x.hora === '16:00')).toHaveLength(0);
    expect(await reservar(MIE, '16:00', COACH.C)).toMatchObject({ ok: false, error: 'sin_cupo' });
    await como(3); // 2:1: puede sumarse a A o B, pero no abrir C
    const r = (await disponibles(MIE, MIE)).filter(x => x.hora === '16:00').map(x => x.coach_id).sort();
    expect(r).toEqual([COACH.A, COACH.B]);
    await como(null, 'admin');
    await expect(db.query(`INSERT INTO public.reservas (alumno_id, fecha, hora, estado, tipo_clase, coach_id)
      VALUES ('${atl(4)}', '${MIE}'::timestamp AT TIME ZONE 'UTC', '16:00', 'pendiente', '1:1 Individual', '${COACH.C}')`)).rejects.toThrow(/Capacidad/);
    await db.query(`UPDATE public.horario_config SET max_profesores = 3`);
  });

  it('lista de espera: avisa al compatible cuando se libera el cupo, una sola vez', async () => {
    await como(5); // 2:1 espera el miércoles 10:00 (hoy es un 1:1 del alumno 1)
    expect(await rpc('public.alumno_lista_espera($1::date, $2, NULL)', [MIE, '10:00'])).toMatchObject({ ok: true });
    await como(1);
    expect((await cancelar(r1)).ok).toBe(true); // libera miércoles 10:00 A
    const n = await db.query(`SELECT * FROM public.notificaciones WHERE tipo = 'cupo_liberado' AND atleta_id = $1`, [atl(5)]);
    expect(n.rows).toHaveLength(1);
    const e = await db.query(`SELECT estado FROM public.lista_espera WHERE atleta_id = $1`, [atl(5)]);
    expect(e.rows[0]).toMatchObject({ estado: 'notificada' });
    // otro cupo liberado en el mismo horario no repite el aviso
    await como(1);
    const otra = await reservar(MIE, '10:00', COACH.A);
    expect(otra.ok).toBe(true);
    expect((await cancelar(otra.reserva_id!)).ok).toBe(true);
    expect((await db.query(`SELECT * FROM public.notificaciones WHERE tipo = 'cupo_liberado'`)).rows).toHaveLength(1);
  });

  it('15. notificaciones encoladas sin duplicados', async () => {
    const r = await db.query<{ tipo: string; n: number }>(`SELECT tipo, count(*)::int n FROM public.notificaciones GROUP BY tipo ORDER BY tipo`);
    const tipos = Object.fromEntries(r.rows.map(x => [x.tipo, x.n]));
    expect(tipos.reserva_confirmada).toBeGreaterThan(0);
    expect(tipos.reserva_cancelada).toBeGreaterThan(0);
    expect(tipos.reserva_reagendada).toBe(1);
    const dup = await db.query(`SELECT clave FROM public.notificaciones GROUP BY clave HAVING count(*) > 1`);
    expect(dup.rows).toHaveLength(0);
    const conf = await db.query<{ datos: Record<string, unknown> }>(`SELECT datos FROM public.notificaciones WHERE tipo = 'reserva_reagendada'`);
    expect(conf.rows[0].datos).toMatchObject({ hora: '10:00', modalidad: '1:1', profesor: 'Catalina' });
  });

  it('seguridad: un alumno no puede tocar clases de otro ni usar funciones de admin', async () => {
    await como(2);
    expect(await cancelar(r3)).toMatchObject({ ok: false, error: 'no_encontrada' });
    expect(await rpc('public.admin_devolver_credito($1::int, $2)', [r3, 'x'])).toMatchObject({ ok: false, error: 'no_autorizado' });
    await como(null);
    expect(await reservar(MIE, '18:00', COACH.C)).toMatchObject({ ok: false, error: 'no_autorizado' });
  });

  it('excepción administrativa: devuelve el crédito de una cancelación tardía, con motivo y auditoría', async () => {
    await como(null, 'admin');
    await db.query(`UPDATE public.reservas SET estado = 'cancelada_tarde' WHERE id = $1`, [r3]);
    await como(3);
    const antes = await miPlan();
    await como(null, 'admin');
    expect(await rpc('public.admin_devolver_credito($1::int, $2)', [r3, ''])).toMatchObject({ ok: false, error: 'motivo_requerido' });
    expect(await rpc('public.admin_devolver_credito($1::int, $2)', [r3, 'Enfermedad con certificado'])).toMatchObject({ ok: true });
    await como(3);
    expect((await miPlan()).disponibles).toBe(antes.disponibles + 1);
    const a = await db.query(`SELECT origen, motivo FROM public.auditoria_reservas WHERE reserva_id = $1 ORDER BY id DESC LIMIT 1`, [r3]);
    expect(a.rows[0]).toMatchObject({ origen: 'staff', motivo: 'Excepción: Enfermedad con certificado' });
  });

  it('auditoría: toda acción del alumno queda registrada con su origen', async () => {
    const a = await db.query<{ accion: string; origen: string }>(`SELECT accion, origen FROM public.auditoria_reservas WHERE origen = 'alumno'`);
    expect(a.rows.length).toBeGreaterThan(5);
  });
});
