// Prueba la migración 048 (cierres, ausencias de profesores y lista de espera)
// en un Postgres en memoria (PGlite). No toca la base de datos real.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { SQL_BASE, MIGRACIONES } from './sql-test-base';

const COACH = { A: '00000000-0000-0000-0000-00000000000a', B: '00000000-0000-0000-0000-00000000000b', C: '00000000-0000-0000-0000-00000000000c' };
const uid  = (n: number) => `10000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const atl  = (n: number) => `20000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const plan = (n: number) => `30000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;

const TZ = 'America/Santiago';
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const sumar = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** n-ésimo día hábil (lun–sáb) después de HOY. Cada n da un día distinto
 *  (antes se saltaba el domingo y dos n seguidos podían caer el mismo lunes). */
function habil(n: number) {
  let f = HOY;
  for (let k = 0; k < n; ) { f = sumar(f, 1); if (new Date(`${f}T12:00:00Z`).getUTCDay() !== 0) k++; }
  return f;
}

let db: PGlite;
async function como(n: number | string | null, rol: string | null = null) {
  const id = typeof n === 'number' ? uid(n) : n ?? '';
  await db.query(`SELECT set_config('test.uid', $1, false), set_config('test.rol', $2, false)`, [id, rol ?? '']);
}
async function rpc<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ r: T }>(`SELECT ${sql} AS r`, params);
  return r.rows[0].r;
}
async function insertar(alumno: number, fecha: string, hora: string, coach = COACH.A, tipo = '1:1 Individual'): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase, coach_id)
     VALUES ($1, $2, $3::timestamp AT TIME ZONE 'UTC', $4, 'pendiente', $5, $6) RETURNING id`,
    [atl(alumno), plan(alumno), fecha, hora, tipo, coach]);
  return rows[0].id;
}
const reserva = async (id: number) =>
  (await db.query<{ estado: string; coach_id: string }>(`SELECT estado, coach_id FROM public.reservas WHERE id = $1`, [id])).rows[0];
const notif = async (clave: string) =>
  (await db.query<{ tipo: string; datos: Record<string, unknown> }>(`SELECT tipo, datos FROM public.notificaciones WHERE clave = $1`, [clave])).rows[0];
type Res = Record<string, unknown> & { ok: boolean; error?: string };
const crear = (tipo: string, desde: string, hasta: string, hi: string | null, hf: string | null, coach: string | null, motivo: string, accion: string) =>
  rpc<Res>(`public.staff_crear_cierre($1, $2::date, $3::date, $4, $5, $6::uuid, $7, $8)`, [tipo, desde, hasta, hi, hf, coach, motivo, accion]);
const afectada = async (reservaId: number) =>
  (await db.query<{ id: string; estado: string; solucion: string }>(
    `SELECT id, estado, solucion FROM public.clases_afectadas WHERE reserva_id = $1 ORDER BY created_at DESC LIMIT 1`, [reservaId])).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SQL_BASE);
  for (const m of MIGRACIONES) await db.exec(readFileSync(`supabase/migrations/${m}`, 'utf8'));
  const alumnos = Array.from({ length: 12 }, (_, i) => i + 1);
  await db.exec(`
    INSERT INTO public.coaches VALUES ('${COACH.A}','Ana',true),('${COACH.B}','Beto',true),('${COACH.C}','Cami',true);
    INSERT INTO public.atletas (id, nombre, apellido, email, user_id, tipo_sesion) VALUES
      ${alumnos.map(n => `('${atl(n)}','Alumno${n}','X','a${n}@x.cl','${uid(n)}','${n >= 5 && n <= 6 ? '2:1' : '1:1'}')`).join(',')};
  `);
  await como(null, 'admin');
  await db.exec(`
    INSERT INTO public.planes (id, alumno_id, nombre, tipo, total_clases, start_date, end_date, modalidad) VALUES
      ${alumnos.map(n => `('${plan(n)}','${atl(n)}','Plan','mensual',8,'${sumar(HOY, -5)}','${sumar(HOY, 40)}','${n >= 5 && n <= 6 ? '2:1' : '1:1'}')`).join(',')};
  `);
}, 60_000);

describe('Cierres del gimnasio (feriado)', () => {
  it('la vista previa muestra las clases afectadas sin cambiar nada', async () => {
    const dia = habil(3);
    const id = await insertar(1, dia, '10:00');
    await como(null, 'admin');
    const p = await rpc<{ ok: boolean; clases: Record<string, unknown>[] }>(`public.staff_vista_previa_cierre($1::date, $1::date)`, [dia]);
    expect(p.ok).toBe(true);
    expect(p.clases.map(c => c.reserva_id)).toContain(id);
    expect((await reserva(id)).estado).toBe('pendiente');
  });

  it('suspender: la clase queda cancelada por NEXA, el alumno conserva el crédito y recibe el aviso', async () => {
    const dia = habil(4);
    const id = await insertar(2, dia, '09:00');
    await como(2);
    const antes = await rpc<{ disponibles: number }>('public.alumno_mi_plan()');
    await como(null, 'admin');
    const r = await crear('feriado', dia, dia, null, null, null, 'Feriado nacional', 'suspender');
    expect(r).toMatchObject({ ok: true, afectadas: 1, suspendidas: 1, pendientes: 0 });
    expect((await reserva(id)).estado).toBe('cancelada_nexa');
    expect(await afectada(id)).toMatchObject({ estado: 'suspendida' });
    expect((await notif(`suspendida:${id}`)).datos).toMatchObject({ motivo: 'Feriado nacional', hora: '09:00' });
    const mov = await db.query<{ tipo: string; motivo: string }>(`SELECT tipo, motivo FROM public.movimientos_credito WHERE reserva_id = $1 ORDER BY id DESC LIMIT 1`, [id]);
    expect(mov.rows[0]).toMatchObject({ tipo: 'liberado_nexa' });
    expect(mov.rows[0].motivo).toContain('Feriado nacional');
    await como(2);
    expect((await rpc<{ disponibles: number }>('public.alumno_mi_plan()')).disponibles).toBe(antes.disponibles + 1);
    // Nadie puede reservar ese día
    expect(await rpc<Res>(`public.alumno_reservar_clase($1::date, '11:00', $2::uuid)`, [dia, COACH.B])).toMatchObject({ ok: false });
  });

  it('un cierre por horas solo afecta esas horas', async () => {
    const dia = habil(5);
    const a = await insertar(3, dia, '08:00');
    const b = await insertar(4, dia, '15:00');
    await como(null, 'admin');
    const r = await crear('mantencion', dia, dia, '14:00', '17:00', null, 'Mantención de máquinas', 'suspender');
    expect(r).toMatchObject({ ok: true, afectadas: 1 });
    expect((await reserva(a)).estado).toBe('pendiente');
    expect((await reserva(b)).estado).toBe('cancelada_nexa');
  });

  it('nunca borra reservas', async () => {
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.reservas`);
    expect(rows[0].n).toBeGreaterThanOrEqual(4);
    const borradas = await db.query(`SELECT 1 FROM public.movimientos_credito WHERE tipo = 'anulado'`);
    expect(borradas.rows).toHaveLength(0);
  });

  it('valida los datos y los permisos', async () => {
    await como(null, 'admin');
    expect(await crear('inventado', HOY, HOY, null, null, null, 'x', 'suspender')).toMatchObject({ error: 'tipo_invalido' });
    expect(await crear('feriado', sumar(HOY, 2), HOY, null, null, null, 'x', 'suspender')).toMatchObject({ error: 'fechas_invalidas' });
    expect(await crear('feriado', HOY, HOY, '10:00', null, null, 'x', 'suspender')).toMatchObject({ error: 'horas_invalidas' });
    expect(await crear('ausencia', HOY, HOY, null, null, null, 'x', 'revisar')).toMatchObject({ error: 'falta_profesor' });
    expect(await crear('feriado', HOY, HOY, null, null, null, 'x', 'sustituir')).toMatchObject({ error: 'sustituir_solo_profesor' });
    await como(1);
    expect(await crear('feriado', HOY, HOY, null, null, null, 'x', 'suspender')).toMatchObject({ error: 'no_autorizado' });
  });
});

describe('Ausencia de profesor', () => {
  it('sustituir: la clase se mantiene con otro profesor libre y se avisa al alumno', async () => {
    const dia = habil(6);
    const id = await insertar(7, dia, '10:00', COACH.A);
    await insertar(8, dia, '10:00', COACH.B);                 // Beto ocupado a esa hora
    await como(null, 'admin');
    const r = await crear('ausencia', dia, dia, null, null, COACH.A, 'Licencia médica', 'sustituir');
    expect(r).toMatchObject({ ok: true, sustituidas: 1, pendientes: 0 });
    expect((await reserva(id)).coach_id).toBe(COACH.C);       // Cami estaba libre
    expect((await notif(`cambio_prof:${id}:${COACH.C}`)).datos).toMatchObject({ profesor: 'Cami', profesor_anterior: 'Ana' });
    expect((await afectada(id)).solucion).toContain('Cami');
  });

  it('2:1: los dos alumnos pasan juntos al mismo sustituto', async () => {
    const dia = habil(7);
    const a = await insertar(5, dia, '11:00', COACH.A, '2:1 Duo');
    const b = await insertar(6, dia, '11:00', COACH.A, '2:1 Duo');
    await como(null, 'admin');
    await crear('vacaciones', dia, dia, null, null, COACH.A, 'Vacaciones', 'sustituir');
    const ra = await reserva(a); const rb = await reserva(b);
    expect(ra.coach_id).not.toBe(COACH.A);
    expect(ra.coach_id).toBe(rb.coach_id);
  });

  it('sin profesor libre la clase queda pendiente; luego se resuelve a mano', async () => {
    const dia = habil(8);
    const id = await insertar(9, dia, '12:00', COACH.A);
    await insertar(10, dia, '12:00', COACH.B);
    await insertar(11, dia, '12:00', COACH.C);
    await como(null, 'admin');
    const r = await crear('ausencia', dia, dia, null, null, COACH.A, 'Trámite', 'sustituir');
    expect(r).toMatchObject({ ok: true, afectadas: 1, sustituidas: 0, pendientes: 1 });
    const af = await afectada(id);
    expect(af.estado).toBe('pendiente');
    // Beto está ocupado: no se puede asignar
    expect(await rpc<Res>(`public.staff_resolver_clase_afectada($1::uuid, 'sustituir', $2::uuid)`, [af.id, COACH.B]))
      .toMatchObject({ ok: false, error: 'profesor_no_disponible' });
    expect(await rpc<Res>(`public.staff_resolver_clase_afectada($1::uuid, 'suspender', NULL, 'Sin reemplazo')`, [af.id]))
      .toMatchObject({ ok: true, estado: 'suspendida' });
    expect((await reserva(id)).estado).toBe('cancelada_nexa');
    expect(await rpc<Res>(`public.staff_resolver_clase_afectada($1::uuid, 'suspender')`, [af.id])).toMatchObject({ error: 'ya_resuelta' });
  });

  it('un bloqueo creado en Configuración también registra sus clases y genera la alerta', async () => {
    const dia = habil(9);
    const id = await insertar(12, dia, '17:00', COACH.B);
    await como(null, 'admin');
    await db.query(`INSERT INTO public.horario_bloqueos (fecha, motivo, coach_id, tipo) VALUES ($1, 'Curso', $2, 'ausencia')`, [dia, COACH.B]);
    await rpc('public.staff_revisar_ahora()');
    const af = await afectada(id);
    expect(af.estado).toBe('pendiente');
    const inc = await db.query<{ estado: string }>(`SELECT estado FROM public.incidencias WHERE clave = $1`, [`cierre:${dia}`]);
    expect(inc.rows[0].estado).toBe('abierta');
    // Se resuelve → la siguiente revisión cierra la alerta
    await rpc(`public.staff_resolver_clase_afectada($1::uuid, 'mantener', NULL, 'Viene igual')`, [af.id]);
    await rpc('public.staff_revisar_ahora()');
    const inc2 = await db.query<{ estado: string }>(`SELECT estado FROM public.incidencias WHERE clave = $1`, [`cierre:${dia}`]);
    expect(inc2.rows[0].estado).toBe('resuelta');
    // "Se mantiene" no vuelve a aparecer
    await rpc('public.staff_revisar_ahora()');
    expect((await afectada(id)).estado).toBe('se_mantiene');
  });

  it('el profesor avisa su ausencia: queda por aprobar y llega a Requiere atención', async () => {
    const dia = habil(10);
    const id = await insertar(1, dia, '10:00', COACH.C);
    await como(COACH.C, 'profesor');
    expect(await rpc<Res>(`public.profesor_avisar_ausencia($1::date, $1::date, NULL, NULL, '')`, [dia])).toMatchObject({ error: 'motivo_requerido' });
    const r = await rpc<Res & { grupo_id: string }>(`public.profesor_avisar_ausencia($1::date, $1::date, NULL, NULL, 'Enfermo')`, [dia]);
    expect(r).toMatchObject({ ok: true, afectadas: 1, pendientes: 1, sustituidas: 0 });
    expect((await reserva(id)).coach_id).toBe(COACH.C);      // requiere aprobación: no se cambia solo
    const b = await db.query<{ estado: string }>(`SELECT estado FROM public.horario_bloqueos WHERE grupo_id = $1`, [r.grupo_id]);
    expect(b.rows[0].estado).toBe('por_aprobar');
    const inc = await db.query<{ tipo: string; automatica: boolean; prioridad: string }>(
      `SELECT tipo, automatica, prioridad FROM public.incidencias WHERE clave = $1`, [`ausencia:${r.grupo_id}`]);
    expect(inc.rows[0]).toMatchObject({ tipo: 'ausencia_profesor', automatica: false, prioridad: 'alta' });
    // El profesor ve su ausencia, pero no las de otros
    const lista = await rpc<{ grupo_id: string }[]>('public.staff_cierres()');
    expect(lista.every(x => x.grupo_id === r.grupo_id)).toBe(true);
    await como(null, 'admin');
    expect(await rpc<Res>(`public.staff_aprobar_ausencia($1::uuid)`, [r.grupo_id])).toMatchObject({ ok: true });
  });

  it('si la política no exige aprobación, se asigna sustituto automáticamente', async () => {
    const dia = habil(11);
    const id = await insertar(2, dia, '10:00', COACH.C);
    await db.exec(`UPDATE public.horario_config SET sustituto_requiere_aprobacion = false`);
    await como(COACH.C, 'profesor');
    const r = await rpc<Res>(`public.profesor_avisar_ausencia($1::date, $1::date, NULL, NULL, 'Enfermo')`, [dia]);
    expect(r).toMatchObject({ ok: true, sustituidas: 1 });
    expect((await reserva(id)).coach_id).not.toBe(COACH.C);
    await db.exec(`UPDATE public.horario_config SET sustituto_requiere_aprobacion = true`);
  });

  it('un alumno o un profesor no pueden usar las funciones de administración', async () => {
    await como(COACH.C, 'profesor');
    expect(await crear('feriado', HOY, HOY, null, null, null, 'x', 'suspender')).toMatchObject({ error: 'no_autorizado' });
    await como(3);
    expect(await rpc<Res>(`public.profesor_avisar_ausencia($1::date, $1::date, NULL, NULL, 'x')`, [HOY])).toMatchObject({ error: 'no_autorizado' });
  });
});

describe('Lista de espera', () => {
  const espera = (fecha: string, hora: string) =>
    db.query<{ atleta_id: string; estado: string; turno_hasta: string | null }>(
      `SELECT atleta_id, estado, turno_hasta FROM public.lista_espera WHERE fecha = $1 AND hora = $2 ORDER BY created_at`, [fecha, hora]);

  it('modo "todos": cuando el staff libera un cupo, avisa a todos los que esperan', async () => {
    const dia = habil(20);
    // Ocupa a los tres profesores a las 10:00
    const ids = [await insertar(9, dia, '10:00', COACH.A), await insertar(10, dia, '10:00', COACH.B), await insertar(11, dia, '10:00', COACH.C)];
    await como(3); expect((await rpc<Res>(`public.alumno_lista_espera($1::date, '10:00')`, [dia])).ok).toBe(true);
    await como(4); expect((await rpc<Res>(`public.alumno_lista_espera($1::date, '10:00')`, [dia])).ok).toBe(true);
    await como(null, 'admin');
    await db.query(`UPDATE public.reservas SET estado = 'cancelada_nexa' WHERE id = $1`, [ids[0]]);
    const e = (await espera(dia, '10:00')).rows;
    expect(e.map(x => x.estado)).toEqual(['notificada', 'notificada']);
  });

  it('modo "por turnos": avisa de a uno y pasa al siguiente cuando vence el turno', async () => {
    const dia = habil(22);
    const ids = [await insertar(9, dia, '10:00', COACH.A), await insertar(10, dia, '10:00', COACH.B), await insertar(11, dia, '10:00', COACH.C)];
    await db.exec(`UPDATE public.horario_config SET lista_espera_modo = 'turnos', lista_espera_minutos = 60`);
    await como(3); await rpc(`public.alumno_lista_espera($1::date, '10:00')`, [dia]);
    await como(4); await rpc(`public.alumno_lista_espera($1::date, '10:00')`, [dia]);
    await como(null, 'admin');
    await db.query(`UPDATE public.reservas SET estado = 'cancelada_nexa' WHERE id = $1`, [ids[0]]);
    let e = (await espera(dia, '10:00')).rows;
    expect(e.map(x => x.estado)).toEqual(['notificada', 'activa']);
    expect(e[0].turno_hasta).not.toBeNull();
    // Vence el turno del primero sin que reserve
    await db.query(`UPDATE public.lista_espera SET turno_hasta = now() - interval '1 minute' WHERE fecha = $1 AND estado = 'notificada'`, [dia]);
    await rpc('public.staff_revisar_ahora()');
    e = (await espera(dia, '10:00')).rows;
    expect(e.map(x => x.estado)).toEqual(['notificada', 'notificada']);
    await db.exec(`UPDATE public.horario_config SET lista_espera_modo = 'todos'`);
  });

  it('prioridad "mover primero" y rango de horas', async () => {
    const dia = habil(24);
    const ids = [await insertar(9, dia, '11:00', COACH.A), await insertar(10, dia, '11:00', COACH.B), await insertar(11, dia, '11:00', COACH.C)];
    const mia = await insertar(8, habil(26), '09:00', COACH.A);
    await db.exec(`UPDATE public.horario_config SET lista_espera_modo = 'turnos', lista_espera_prioridad = 'mover_primero'`);
    await como(7); expect((await rpc<Res>(`public.alumno_lista_espera_rango($1::date, '10:00', '12:00')`, [dia])).ok).toBe(true);
    await como(8); expect((await rpc<Res>(`public.alumno_lista_espera($1::date, '11:00', $2)`, [dia, mia])).ok).toBe(true);
    await como(null, 'admin');
    await db.query(`UPDATE public.reservas SET estado = 'cancelada_nexa' WHERE id = $1`, [ids[1]]);
    const { rows } = await db.query<{ atleta_id: string; estado: string; hora_avisada: string }>(
      `SELECT atleta_id, estado, hora_avisada FROM public.lista_espera WHERE fecha = $1 ORDER BY created_at`, [dia]);
    expect(rows).toEqual([
      { atleta_id: atl(7), estado: 'activa', hora_avisada: null },
      { atleta_id: atl(8), estado: 'notificada', hora_avisada: '11:00' },   // quiere mover una clase: va primero
    ]);
    await db.exec(`UPDATE public.horario_config SET lista_espera_modo = 'todos', lista_espera_prioridad = 'llegada'`);
    // El rango sí cubre las 11:00: con el modo "todos" se le avisa al liberar otro cupo
    await db.query(`UPDATE public.reservas SET estado = 'cancelada_nexa' WHERE id = $1`, [ids[2]]);
    const r2 = await db.query<{ estado: string }>(`SELECT estado FROM public.lista_espera WHERE fecha = $1 AND atleta_id = $2`, [dia, atl(7)]);
    expect(r2.rows[0].estado).toBe('notificada');
  });

  it('el alumno ve y cancela sus avisos; vencen al pasar la hora', async () => {
    const dia = habil(28);
    await como(3);
    await rpc(`public.alumno_lista_espera($1::date, '18:00')`, [dia]);
    const mias = await rpc<{ id: string; fecha: string }[]>('public.alumno_mis_esperas()');
    const m = mias.find(x => x.fecha === dia)!;
    expect(m).toBeTruthy();
    expect(await rpc<Res>(`public.alumno_cancelar_espera($1::uuid)`, [m.id])).toMatchObject({ ok: true });
    await como(4);
    expect(await rpc<Res>(`public.alumno_cancelar_espera($1::uuid)`, [m.id])).toMatchObject({ ok: false });
    // Vencimiento
    await como(3);
    await rpc(`public.alumno_lista_espera($1::date, '19:00')`, [dia]);
    await db.query(`UPDATE public.lista_espera SET vence_at = now() - interval '1 minute' WHERE fecha = $1 AND hora = '19:00'`, [dia]);
    await como(null, 'admin');
    await rpc('public.staff_revisar_ahora()');
    const v = await db.query<{ estado: string }>(`SELECT estado FROM public.lista_espera WHERE fecha = $1 AND hora = '19:00'`, [dia]);
    expect(v.rows[0].estado).toBe('vencida');
  });
});
