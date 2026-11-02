// Prueba la migración 044 (renovaciones, retención de horarios, vencimientos y
// reglamento) en un Postgres real en memoria (PGlite). No toca la base real.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { SQL_BASE, MIGRACIONES } from './sql-test-base';

const COACH = { A: '00000000-0000-0000-0000-00000000000a', B: '00000000-0000-0000-0000-00000000000b' };
const uid  = (n: number) => `10000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const atl  = (n: number) => `20000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const plan = (n: number) => `30000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const sumar = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
/** Todas las fechas con ese día de semana en [desde, hasta] */
function fechasDow(desde: string, hasta: string, d: number) {
  const out: string[] = [];
  for (let f = desde; f <= hasta; f = sumar(f, 1)) if (dow(f) === d) out.push(f);
  return out;
}

let db: PGlite;
async function como(n: number | null, rol: string | null = null) {
  await db.query(`SELECT set_config('test.uid', $1, false), set_config('test.rol', $2, false)`, [n ? uid(n) : '', rol ?? '']);
}
async function rpc<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ r: T }>(`SELECT ${sql} AS r`, params);
  return r.rows[0].r;
}
async function insertar(alumno: number, planN: number, fecha: string, hora: string, estado = 'pendiente', coach = COACH.A, tipo = '1:1 Individual') {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase, coach_id)
     VALUES ($1, $2, $3::timestamp AT TIME ZONE 'UTC', $4, $5, $6, $7) RETURNING id`,
    [atl(alumno), plan(planN), fecha, hora, estado, tipo, coach]);
  return rows[0].id;
}
async function crearPlan(n: number, alumno: number, inicio: string, fin: string, total: number, extra = '') {
  await db.query(`INSERT INTO public.planes (id, alumno_id, nombre, tipo, total_clases, start_date, end_date, modalidad${extra ? ', ' + extra.split('=')[0] : ''})
                  VALUES ($1, $2, 'Personalizado 1:1', 'mensual', $3, $4, $5, '1:1'${extra ? ', ' + extra.split('=')[1] : ''})`,
    [plan(n), atl(alumno), total, inicio, fin]);
}
/** Horario fijo lunes y miércoles a las 10:00 con la profesora A, entre dos fechas */
async function horarioFijo(alumno: number, planN: number, desde: string, hasta: string, hora = '10:00', coach = COACH.A) {
  for (const d of [1, 3]) for (const f of fechasDow(desde, hasta, d)) {
    await insertar(alumno, planN, f, hora, f < HOY ? 'presente' : 'pendiente', coach);
  }
}
const notif = async (clave: string) => (await db.query<{ tipo: string; datos: Record<string, unknown> }>(
  `SELECT tipo, datos FROM public.notificaciones WHERE clave = $1`, [clave])).rows[0];

type Opciones = {
  puede: boolean; frecuencia: number; modalidad: string; vencido: boolean;
  opciones: { tipo: string; precio: number; clases: number; inicio: string; fin: string }[];
  horarios_fijos: { dow: number; hora: string }[]; solicitud: { id: string; estado: string } | null;
  reglamento_version: number | null; reglamento_aceptado: boolean;
};

const FIN1 = sumar(HOY, 10);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SQL_BASE);
  for (const m of MIGRACIONES) await db.exec(readFileSync(`supabase/migrations/${m}`, 'utf8'));
  await db.exec(`
    INSERT INTO public.coaches VALUES ('${COACH.A}','Catalina',true),('${COACH.B}','Marcos',true);
    INSERT INTO public.atletas (id, nombre, apellido, email, user_id, tipo_sesion) VALUES
      ('${atl(1)}','Ana','Pérez','ana@x.cl','${uid(1)}','1:1'),
      ('${atl(2)}','Beto','Soto','beto@x.cl','${uid(2)}','1:1'),
      ('${atl(3)}','Caro','Díaz','caro@x.cl','${uid(3)}','1:1'),
      ('${atl(4)}','Dani','Rojas','dani@x.cl','${uid(4)}','1:1'),
      ('${atl(5)}','Eli','Mora','eli@x.cl','${uid(5)}','1:1'),
      ('${atl(6)}','Fran','Vega','fran@x.cl','${uid(6)}','1:1');
  `);
  await como(null, 'admin');
  // Ana: plan de 8 clases que vence en 10 días, lunes y miércoles 10:00 con Catalina
  await crearPlan(1, 1, sumar(FIN1, -30), FIN1, 8);
  await horarioFijo(1, 1, sumar(FIN1, -30), FIN1);
}, 60_000);

describe('Opciones de renovación', () => {
  it('detecta los horarios fijos, la frecuencia y calcula el precio desde el catálogo', async () => {
    await como(1);
    const o = await rpc<Opciones>('public.alumno_opciones_renovacion()');
    expect(o.puede).toBe(true);
    expect(o.frecuencia).toBe(2);
    expect(o.horarios_fijos.map(h => [h.dow, h.hora])).toEqual([[1, '10:00'], [3, '10:00']]);
    const men = o.opciones.find(x => x.tipo === 'mensual')!;
    const tri = o.opciones.find(x => x.tipo === 'trimestral')!;
    const sem = o.opciones.find(x => x.tipo === 'semestral')!;
    expect(men).toMatchObject({ precio: 225000, clases: 8, inicio: sumar(FIN1, 1) });   // día siguiente al vencimiento
    expect(tri).toMatchObject({ precio: (225000 - 5000) * 3, clases: 24 });
    expect(sem).toMatchObject({ precio: (225000 - 10000) * 6, clases: 48 });
  });

  it('un alumno sin plan no puede renovar (debe inscribirse)', async () => {
    await como(6);
    expect(await rpc('public.alumno_opciones_renovacion()')).toMatchObject({ puede: false, motivo: 'sin_plan' });
  });
});

describe('Reglamento', () => {
  it('el borrador no se exige ni se ve hasta publicarlo', async () => {
    await como(1);
    expect(await rpc('public.alumno_opciones_renovacion()')).toMatchObject({ reglamento_version: null, reglamento_aceptado: true });
  });

  it('publicado, hay que aceptarlo antes de renovar; la aceptación queda registrada con la versión', async () => {
    await como(1);
    expect(await rpc(`public.staff_publicar_reglamento(1)`)).toMatchObject({ ok: false, error: 'no_autorizado' });
    await como(null, 'admin');
    expect(await rpc(`public.staff_publicar_reglamento(1)`)).toMatchObject({ ok: true });
    await como(1);
    expect(await rpc(`public.alumno_solicitar_renovacion('mensual', NULL)`)).toMatchObject({ ok: false, error: 'reglamento_pendiente' });
    expect(await rpc(`public.alumno_aceptar_reglamento(1, 'renovacion')`)).toMatchObject({ ok: true });
    const { rows } = await db.query<{ version: number; huella: string }>(`SELECT version, huella FROM public.reglamento_aceptaciones WHERE atleta_id = $1`, [atl(1)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].huella).toMatch(/^[0-9a-f]{32}$/);
  });

  it('una versión publicada y sus aceptaciones no se pueden modificar', async () => {
    await como(null, 'admin');
    await expect(db.query(`UPDATE public.reglamentos SET contenido = 'otro' WHERE version = 1`)).rejects.toThrow(/versión nueva/);
    await expect(db.query(`DELETE FROM public.reglamento_aceptaciones`)).rejects.toThrow(/no se puede modificar/);
  });
});

describe('Solicitud, comprobante y validación', () => {
  let solicitud: string;

  it('solicita la renovación; no se puede duplicar', async () => {
    await como(1);
    const r = await rpc<{ ok: boolean; id: string; precio: number }>(`public.alumno_solicitar_renovacion('mensual', NULL)`);
    expect(r).toMatchObject({ ok: true, precio: 225000 });
    solicitud = r.id;
    expect(await rpc(`public.alumno_solicitar_renovacion('trimestral', NULL)`)).toMatchObject({ ok: false, error: 'ya_solicitada' });
  });

  it('el comprobante debe estar en la carpeta del alumno; queda en revisión y avisa al admin', async () => {
    await como(1);
    expect(await rpc(`public.alumno_registrar_comprobante($1::uuid, $2)`, [solicitud, `${atl(2)}/x.jpg`])).toMatchObject({ error: 'archivo_invalido' });
    expect(await rpc(`public.alumno_registrar_comprobante($1::uuid, $2)`, [solicitud, `${atl(1)}/comprobante.jpg`])).toMatchObject({ ok: true });
    const { rows } = await db.query<{ estado: string }>(`SELECT estado FROM public.renovaciones WHERE id = $1`, [solicitud]);
    expect(rows[0].estado).toBe('en_revision');
    const inc = await db.query(`SELECT 1 FROM public.incidencias WHERE clave = $1 AND estado = 'abierta' AND prioridad = 'alta'`, [`transferencia:${solicitud}`]);
    expect(inc.rows).toHaveLength(1);
    // Un comprobante NO crea plan ni pago
    const p = await db.query(`SELECT 1 FROM public.planes WHERE plan_anterior_id = $1`, [plan(1)]);
    expect(p.rows).toHaveLength(0);
  });

  it('mientras vence, los horarios fijos quedan guardados: otro alumno no los puede tomar', async () => {
    await como(null, 'admin');
    await crearPlan(2, 2, HOY, sumar(HOY, 60), 8);           // Beto, otro alumno 1:1
    await rpc('public.nexa_procesar_vencimientos()');
    const lunesDespues = fechasDow(sumar(FIN1, 1), sumar(FIN1, 7), 1)[0];
    await como(2);
    expect(await rpc(`public.nexa_cupos_slot($1::date, '10:00', $2::uuid, '1:1')`, [lunesDespues, COACH.A])).toBe(0);
    expect(await rpc(`public.nexa_cupos_slot($1::date, '11:00', $2::uuid, '1:1')`, [lunesDespues, COACH.A])).toBe(1);
    await como(1);                                             // para la propia alumna sigue libre
    expect(await rpc(`public.nexa_cupos_slot($1::date, '10:00', $2::uuid, '1:1')`, [lunesDespues, COACH.A])).toBe(1);
  });

  it('solo el staff valida; al aprobar se crea el plan, el pago y sus clases fijas', async () => {
    await como(1);
    expect(await rpc(`public.staff_aprobar_renovacion($1::uuid, NULL)`, [solicitud])).toMatchObject({ ok: false, error: 'no_autorizado' });
    await como(null, 'recepcionista');
    const r = await rpc<{ ok: boolean; plan_id: string; agenda: { creadas: number } }>(`public.staff_aprobar_renovacion($1::uuid, 'Abono verificado')`, [solicitud]);
    expect(r.ok).toBe(true);
    expect(r.agenda.creadas).toBe(8);
    const { rows: [p] } = await db.query<Record<string, unknown>>(`SELECT * FROM public.planes WHERE id = $1`, [r.plan_id]);
    expect(p).toMatchObject({ start_date: sumar(FIN1, 1), total_clases: 8, estado_pago: 'pagado', precio_clp: 225000, plan_anterior_id: plan(1) });
    const pagos = await db.query(`SELECT 1 FROM public.pagos WHERE plan_id = $1 AND estado = 'pagado' AND monto = 225000`, [r.plan_id]);
    expect(pagos.rows).toHaveLength(1);
    const clases = await db.query<{ d: number; hora: string }>(
      `SELECT extract(dow FROM fecha AT TIME ZONE 'UTC')::int d, hora FROM public.reservas WHERE plan_id = $1::uuid`, [r.plan_id]);
    expect(clases.rows.every(c => [1, 3].includes(c.d) && c.hora === '10:00')).toBe(true);
    const inc = await db.query<{ estado: string }>(`SELECT estado FROM public.incidencias WHERE clave = $1`, [`transferencia:${solicitud}`]);
    expect(inc.rows[0].estado).toBe('resuelta');
    expect(await notif(`renov_aprobada:${solicitud}`)).toBeTruthy();
    // Idempotente: aprobar dos veces no crea otro plan ni otro pago
    expect(await rpc(`public.staff_aprobar_renovacion($1::uuid, NULL)`, [solicitud])).toMatchObject({ ok: true, ya_aprobada: true });
    const n = await db.query<{ n: number }>(`SELECT count(*)::int n FROM public.planes WHERE plan_anterior_id = $1`, [plan(1)]);
    expect(n.rows[0].n).toBe(1);
  });

  it('rechazar exige motivo y avisa al alumno', async () => {
    await como(null, 'admin');
    await crearPlan(3, 3, sumar(HOY, -25), sumar(HOY, 5), 4);
    await como(3);
    const s = await rpc<{ id: string }>(`public.alumno_aceptar_reglamento(1, 'renovacion')`);
    expect(s).toMatchObject({ ok: true });
    const r = await rpc<{ id: string }>(`public.alumno_solicitar_renovacion('mensual', 1)`);
    await como(null, 'admin');
    expect(await rpc(`public.staff_rechazar_renovacion($1::uuid, '')`, [r.id])).toMatchObject({ error: 'motivo_requerido' });
    expect(await rpc(`public.staff_rechazar_renovacion($1::uuid, 'No llegó el abono')`, [r.id])).toMatchObject({ ok: true });
    expect((await notif(`renov_rechazada:${r.id}`)).datos).toMatchObject({ motivo: 'No llegó el abono' });
  });
});

describe('Vencimientos', () => {
  it('avisa 7 días antes a quien no ha renovado, una sola vez', async () => {
    await como(null, 'admin');
    await crearPlan(4, 4, sumar(HOY, -23), sumar(HOY, 7), 4);
    await rpc('public.nexa_procesar_vencimientos()');
    await rpc('public.nexa_procesar_vencimientos()');
    const { rows } = await db.query(`SELECT 1 FROM public.notificaciones WHERE clave = $1`, [`renovar:${plan(4)}:7`]);
    expect(rows).toHaveLength(1);
    expect((await notif(`renovar:${plan(4)}:7`)).datos).toMatchObject({ dias: 7, precio: 120000 });
  });

  it('al terminar un plan renovado, las clases sobrantes pasan al período siguiente', async () => {
    await como(null, 'admin');
    await crearPlan(5, 5, sumar(HOY, -32), sumar(HOY, -2), 8);
    const usadas = fechasDow(sumar(HOY, -30), sumar(HOY, -3), 2);
    for (const f of usadas) await insertar(5, 5, f, '08:00', 'presente', COACH.B);
    const sobran = 8 - usadas.length;
    // El staff crea a mano el plan siguiente: queda enlazado como renovación
    await crearPlan(6, 5, sumar(HOY, -1), sumar(HOY, 29), 8);
    const { rows: [n] } = await db.query<{ plan_anterior_id: string }>(`SELECT plan_anterior_id FROM public.planes WHERE id = $1`, [plan(6)]);
    expect(n.plan_anterior_id).toBe(plan(5));
    await rpc('public.nexa_procesar_vencimientos()');
    const { rows: [p] } = await db.query<{ total_clases: number; clases_arrastradas: number }>(
      `SELECT total_clases, clases_arrastradas FROM public.planes WHERE id = $1`, [plan(6)]);
    expect(p).toMatchObject({ total_clases: 8 + sobran, clases_arrastradas: sobran });
    const m = await db.query<{ plan_id: string; cantidad: number }>(
      `SELECT plan_id, cantidad FROM public.movimientos_credito WHERE tipo = 'arrastrado' ORDER BY cantidad`);
    expect(m.rows).toEqual([{ plan_id: plan(5), cantidad: -sobran }, { plan_id: plan(6), cantidad: sobran }]);
    await rpc('public.nexa_procesar_vencimientos()');                       // no se traspasa dos veces
    const { rows: [p2] } = await db.query<{ total_clases: number }>(`SELECT total_clases FROM public.planes WHERE id = $1`, [plan(6)]);
    expect(p2.total_clases).toBe(8 + sobran);
  });

  it('sin renovar: guarda los horarios una semana y luego vence las clases y libera el horario', async () => {
    await como(null, 'admin');
    // Plan que venció hace 2 días: en retención
    await crearPlan(7, 6, sumar(HOY, -32), sumar(HOY, -2), 8);
    await horarioFijo(6, 7, sumar(HOY, -32), sumar(HOY, -2), '18:00', COACH.B);
    await rpc('public.nexa_procesar_vencimientos()');
    expect(await notif(`retenidos:${plan(7)}`)).toBeTruthy();
    const ret = await db.query<{ estado: string }>(`SELECT estado FROM public.retenciones_horario WHERE plan_id = $1`, [plan(7)]);
    expect(ret.rows.length).toBe(2);

    // Plan que venció hace 10 días (pasó la semana) con una clase futura huérfana
    await crearPlan(8, 4, sumar(HOY, -70), sumar(HOY, -10), 8);
    for (const f of fechasDow(sumar(HOY, -60), sumar(HOY, -12), 4).slice(0, 3)) await insertar(4, 8, f, '07:00', 'presente', COACH.B);
    const huerfana = await insertar(4, 8, sumar(HOY, 3), '07:00', 'pendiente', COACH.B);
    await rpc('public.nexa_procesar_vencimientos()');
    const v = await db.query<{ cantidad: number }>(`SELECT cantidad FROM public.movimientos_credito WHERE plan_id = $1 AND tipo = 'vencido'`, [plan(8)]);
    expect(v.rows).toEqual([{ cantidad: 4 }]);                               // 8 − 3 usadas − 1 agendada
    const { rows: [h] } = await db.query<{ estado: string }>(`SELECT estado FROM public.reservas WHERE id = $1`, [huerfana]);
    expect(h.estado).toBe('cancelada');
  });

  it('la tarea horaria incluye los vencimientos', async () => {
    await como(null, null);
    const r = await rpc<{ vencimientos: Record<string, number> }>('public.nexa_tareas_programadas()');
    expect(r.vencimientos).toBeTruthy();
  });
});

describe('Evaluación inicial obligatoria', () => {
  const evalua = (email: string, rut: string | null = null) =>
    rpc<{ ok: boolean; motivo: string }>(`public.nexa_evaluacion_cumplida($1, $2)`, [email, rut]);

  it('un alumno con planes anteriores puede contratar; una persona nueva no', async () => {
    await como(null, null);
    expect(await evalua('ANA@x.cl')).toMatchObject({ ok: true, motivo: 'alumno' });
    expect(await evalua('nuevo@x.cl', '11.111.111-1')).toMatchObject({ ok: false, motivo: 'sin_evaluacion' });
  });

  it('con la Clase de Prueba pagada: espera a que pase la fecha (busca también por RUT)', async () => {
    await db.exec(`
      CREATE TABLE public.planes_grupales (id uuid PRIMARY KEY, nombre text, num_clases int);
      CREATE TABLE public.grupales_alumnos (id uuid PRIMARY KEY, email text, rut text);
      CREATE TABLE public.grupales_compras (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), alumno_id uuid, plan_grupal_id uuid,
        estado_pago text, primera_fecha date, fecha_compra timestamptz DEFAULT now());
      INSERT INTO public.planes_grupales VALUES ('40000000-0000-0000-0000-000000000001', 'Clase de Prueba', 1);
      INSERT INTO public.grupales_alumnos VALUES ('50000000-0000-0000-0000-000000000001', 'nuevo@x.cl', '11111111-1'),
                                                 ('50000000-0000-0000-0000-000000000002', 'otra@x.cl', '22.222.222-2');
      INSERT INTO public.grupales_compras (alumno_id, plan_grupal_id, estado_pago, primera_fecha) VALUES
        ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'pagado', '${sumar(HOY, 3)}'),
        ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'pagado', '${sumar(HOY, -2)}');
    `);
    expect(await evalua('nuevo@x.cl')).toMatchObject({ ok: false, motivo: 'evaluacion_agendada' });
    expect(await evalua('cualquier@x.cl', '22222222-2')).toMatchObject({ ok: true, motivo: 'evaluacion' });
  });

  it('se puede desactivar desde la configuración', async () => {
    await db.query(`UPDATE public.horario_config SET requiere_evaluacion = false WHERE id = 1`);
    expect(await evalua('nadie@x.cl')).toMatchObject({ ok: true, motivo: 'no_requerida' });
    await db.query(`UPDATE public.horario_config SET requiere_evaluacion = true WHERE id = 1`);
  });
});
