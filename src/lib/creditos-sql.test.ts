// Prueba la migración 042 (créditos, asistencia, avisos y revisión automática)
// en un Postgres real en memoria (PGlite). No toca la base de datos real.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { SQL_BASE, MIGRACIONES } from './sql-test-base';

const COACH = { A: '00000000-0000-0000-0000-00000000000a', B: '00000000-0000-0000-0000-00000000000b' };
const uid  = (n: number) => `10000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const atl  = (n: number) => `20000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const plan = (n: number) => `30000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;

const TZ = 'America/Santiago';
const diaChile = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const HOY = diaChile(new Date());
const sumar = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Fecha y hora (en punto, hora de Chile) de la primera hora completa después de `horas` desde ahora. */
function enHoras(horas: number) {
  const d = new Date(Date.now() + horas * 3_600_000);
  d.setUTCMinutes(0, 0, 0);
  d.setTime(d.getTime() + 3_600_000);
  const hora = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  return { fecha: diaChile(d), hora };
}

let db: PGlite;
async function como(n: number | null, rol: string | null = null) {
  await db.query(`SELECT set_config('test.uid', $1, false), set_config('test.rol', $2, false)`, [n ? uid(n) : '', rol ?? '']);
}
async function rpc<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<{ r: T }>(`SELECT ${sql} AS r`, params);
  return r.rows[0].r;
}
async function insertar(alumno: number, planN: number | null, fecha: string, hora: string, estado = 'pendiente',
                        tipo = '1:1 Individual', coach = COACH.A): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO public.reservas (alumno_id, plan_id, fecha, hora, estado, tipo_clase, coach_id)
     VALUES ($1, $2, $3::timestamp AT TIME ZONE 'UTC', $4, $5, $6, $7) RETURNING id`,
    [atl(alumno), planN ? plan(planN) : null, fecha, hora, estado, tipo, coach]);
  return rows[0].id;
}
const marcar = (id: number, estado: string) => db.query(`UPDATE public.reservas SET estado = $2 WHERE id = $1`, [id, estado]);
const movimientos = async (reservaId: number) =>
  (await db.query<{ tipo: string; estado_despues: string; detalle: Record<string, unknown> | null }>(
    `SELECT tipo, estado_despues, detalle FROM public.movimientos_credito WHERE reserva_id = $1 ORDER BY id`, [reservaId])).rows;
const notif = async (clave: string) =>
  (await db.query<{ tipo: string; estado: string; datos: Record<string, unknown> }>(
    `SELECT tipo, estado, datos FROM public.notificaciones WHERE clave = $1`, [clave])).rows[0];
type Resumen = Record<string, number | string | null | Record<string, unknown>>;
const miPlan = () => rpc<Resumen>('public.alumno_mi_plan()');

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SQL_BASE);
  // Datos previos a la 042: deben quedar como "saldo inicial"
  await db.exec(`
    INSERT INTO public.coaches VALUES ('${COACH.A}','Catalina',true),('${COACH.B}','Marcos',true);
    INSERT INTO public.atletas (id, nombre, apellido, email, user_id, tipo_sesion) VALUES
      ('${atl(10)}','Antigua','Alumna','antigua@x.cl','${uid(10)}','1:1');
    INSERT INTO public.planes (id, alumno_id, nombre, tipo, total_clases, start_date, end_date, modalidad) VALUES
      ('${plan(10)}','${atl(10)}','Plan antiguo','mensual',4,'${sumar(HOY, -20)}','${sumar(HOY, 10)}','1:1');
  `);
  for (const m of MIGRACIONES) await db.exec(readFileSync(`supabase/migrations/${m}`, 'utf8'));
  await db.exec(`
    INSERT INTO public.atletas (id, nombre, apellido, email, user_id, tipo_sesion) VALUES
      ('${atl(1)}','Ana','Pérez','ana@x.cl','${uid(1)}','1:1'),
      ('${atl(2)}','Beto','Soto','beto@x.cl','${uid(2)}','1:1'),
      ('${atl(3)}','Caro','Díaz','caro@x.cl','${uid(3)}','1:1'),
      ('${atl(4)}','Dani','Rojas',NULL,'${uid(4)}','1:1');
  `);
  await como(null, 'admin');
  await db.exec(`
    INSERT INTO public.planes (id, alumno_id, nombre, tipo, total_clases, start_date, end_date, modalidad, precio_clp, estado_pago) VALUES
      ('${plan(1)}','${atl(1)}','Personalizado 1:1','trimestral',12,'${sumar(HOY, -40)}','${sumar(HOY, 50)}','1:1',600000,'pagado'),
      ('${plan(2)}','${atl(2)}','Personalizado 1:1','mensual',4,'${sumar(HOY, -20)}','${sumar(HOY, 10)}','1:1',150000,'pagado'),
      ('${plan(3)}','${atl(3)}','Personalizado 1:1','mensual',1,'${sumar(HOY, -20)}','${sumar(HOY, 10)}','1:1',50000,'pendiente'),
      ('${plan(4)}','${atl(4)}','Personalizado 1:1','mensual',8,'${sumar(HOY, -20)}','${sumar(HOY, 10)}','1:1',100000,'pagado');
  `);
}, 60_000);

describe('Contador de clases (ejemplo del enunciado)', () => {
  it('12 contratadas, 8 realizadas, 2 agendadas → 2 disponibles y 4 pendientes', async () => {
    await como(null, 'admin');
    for (let i = 1; i <= 8; i++) {
      const id = await insertar(1, 1, sumar(HOY, -i * 3), '10:00');
      await marcar(id, 'presente');
    }
    await insertar(1, 1, sumar(HOY, 3), '10:00');
    await insertar(1, 1, sumar(HOY, 5), '10:00');
    await como(1);
    const p = await miPlan();
    expect(p).toMatchObject({
      vigente: true, contratadas: 12, realizadas: 8, agendadas: 2, disponibles: 2, pendientes: 4,
      inasistencias: 0, tardias: 0, por_confirmar: 0, precio: 600000, estado_pago: 'pagado',
    });
    expect((p.proxima as Record<string, unknown>).fecha).toBe(sumar(HOY, 3));
  });

  it('una clase pasada sin marcar queda "por confirmar" y retiene su crédito', async () => {
    await como(null, 'admin');
    await insertar(2, 2, sumar(HOY, -2), '09:00');      // nadie marcó asistencia
    await como(2);
    expect(await miPlan()).toMatchObject({ contratadas: 4, por_confirmar: 1, disponibles: 3, pendientes: 4 });
  });

  it('el alumno no puede reservar con un crédito retenido (no hay saldo negativo)', async () => {
    await como(null, 'admin');
    await insertar(3, 3, sumar(HOY, -1), '18:00');      // único crédito, sin marcar
    await como(3);
    const r = await rpc<{ ok: boolean; error?: string }>(`public.alumno_reservar_clase($1::date, '10:00', $2::uuid)`, [sumar(HOY, 4), COACH.B]);
    expect(r).toMatchObject({ ok: false, error: 'sin_creditos' });
  });

  it('las condiciones del plan quedan registradas al contratar y no cambian con la configuración', async () => {
    await como(null, 'admin');
    await db.query(`UPDATE public.horario_config SET cancel_horas_aviso_pm = 8 WHERE id = 1`);
    const { rows } = await db.query<{ c: { cancelacion: { cancel_horas_aviso_pm: number } }; regla_clases: string }>(
      `SELECT condiciones AS c, regla_clases FROM public.planes WHERE id = $1`, [plan(1)]);
    expect(rows[0].c.cancelacion.cancel_horas_aviso_pm).toBe(6);
    expect(rows[0].regla_clases).toBe('fija');
    await db.query(`UPDATE public.horario_config SET cancel_horas_aviso_pm = 6 WHERE id = 1`);
  });
});

describe('Historial de créditos', () => {
  it('los datos anteriores a la 042 quedan como saldo inicial', async () => {
    const { rows } = await db.query<{ tipo: string; cantidad: number }>(
      `SELECT tipo, cantidad FROM public.movimientos_credito WHERE plan_id = $1`, [plan(10)]);
    expect(rows).toEqual([{ tipo: 'asignado', cantidad: 4 }]);
  });

  it('reservar compromete, cancelar a tiempo libera y guarda la política aplicada', async () => {
    await como(4);
    const r = await rpc<{ ok: boolean; reserva_id: number }>(`public.alumno_reservar_clase($1::date, '11:00', $2::uuid)`, [sumar(HOY, 6), COACH.B]);
    expect(r.ok).toBe(true);
    expect(await rpc(`public.alumno_cancelar_reserva($1::int)`, [r.reserva_id])).toMatchObject({ ok: true });
    const m = await movimientos(r.reserva_id);
    expect(m.map(x => x.tipo)).toEqual(['comprometido', 'liberado_cancelacion']);
    expect(m[1].detalle).toMatchObject({ a_tiempo: true });
    expect(m[1].detalle?.limite).toBeTruthy();
    expect(m[1].detalle?.solicitud).toBeTruthy();
  });

  it('reagendar no gasta dos créditos: libera la original y compromete la nueva', async () => {
    await como(4);
    const antes = await miPlan();
    const r = await rpc<{ ok: boolean; reserva_id: number }>(`public.alumno_reservar_clase($1::date, '12:00', $2::uuid)`, [sumar(HOY, 6), COACH.B]);
    const mov = await rpc<{ ok: boolean; reserva_id: number }>(`public.alumno_reagendar_reserva($1::int, $2::date, '13:00', $3::uuid)`,
      [r.reserva_id, sumar(HOY, 6), COACH.B]);
    expect(mov.ok).toBe(true);
    expect((await movimientos(r.reserva_id)).map(x => x.tipo)).toEqual(['comprometido', 'liberado_reagenda']);
    expect((await movimientos(mov.reserva_id)).map(x => x.tipo)).toEqual(['comprometido']);
    expect((await miPlan()).disponibles).toBe(Number(antes.disponibles) - 1);
  });

  it('el historial no se puede editar ni borrar', async () => {
    await como(null, 'admin');
    await expect(db.query(`UPDATE public.movimientos_credito SET tipo = 'x'`)).rejects.toThrow(/no se puede modificar/);
    await expect(db.query(`DELETE FROM public.movimientos_credito`)).rejects.toThrow(/no se puede modificar/);
    await expect(db.query(`DELETE FROM public.auditoria_reservas`)).rejects.toThrow(/no se puede modificar/);
  });

  it('el alumno ve solo su historial', async () => {
    await como(4);
    const propios = await db.query<{ tipo: string }>(`SELECT tipo FROM public.alumno_mis_movimientos(50)`);
    expect(propios.rows.length).toBeGreaterThan(0);
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int n FROM public.alumno_mis_movimientos(500) m
       JOIN public.movimientos_credito x ON x.id = m.id WHERE x.atleta_id <> $1`, [atl(4)]);
    expect(rows[0].n).toBe(0);
  });
});

describe('Asistencia', () => {
  it('no se puede marcar asistencia de una clase futura', async () => {
    await como(null, 'admin');
    const id = await insertar(4, 4, sumar(HOY, 2), '08:00', 'pendiente', '1:1 Individual', COACH.A);
    await expect(marcar(id, 'presente')).rejects.toThrow(/clase futura/);
    await db.query(`DELETE FROM public.reservas WHERE id = $1`, [id]);
  });

  it('un profesor no puede devolver créditos ni cambiar el plan de una reserva', async () => {
    await como(null, 'admin');
    const id = await insertar(4, 4, sumar(HOY, -3), '08:00');
    await marcar(id, 'no_show');
    await como(null, 'profesor');
    await expect(marcar(id, 'cancelada_nexa')).rejects.toThrow(/Solo administración/);
    await expect(db.query(`UPDATE public.reservas SET plan_id = $2 WHERE id = $1`, [id, plan(1)])).rejects.toThrow(/plan/);
    await marcar(id, 'presente');                          // corregir no-show → presente sí puede
    expect((await movimientos(id)).map(x => x.tipo)).toEqual(['comprometido', 'consumido_inasistencia', 'corregido']);
  });
});

describe('Avisos automáticos', () => {
  it('correo tras la clase con el resumen real; incluye el aviso de clases restantes sin duplicarlo', async () => {
    await como(null, 'admin');
    const id = await insertar(2, 2, sumar(HOY, -1), '10:00');
    await marcar(id, 'presente');                          // plan de 4: 1 consumida → 3 pendientes (umbral)
    const n = await notif(`clase_realizada:${id}`);
    expect(n.estado).toBe('pendiente');
    expect(n.datos).toMatchObject({ aviso_restantes: true, plan: { contratadas: 4, realizadas: 1, pendientes: 3 } });
    expect(await notif(`restantes:${plan(2)}:3`)).toMatchObject({ estado: 'omitida' });
  });

  it('una inasistencia notifica al alumno y aplica los umbrales', async () => {
    await como(null, 'admin');
    const id = await insertar(2, 2, sumar(HOY, -3), '10:00', 'pendiente', '1:1 Individual', COACH.B);
    await marcar(id, 'no_show');                           // 2 consumidas → 2 pendientes
    expect(await notif(`inasistencia:${id}`)).toMatchObject({ estado: 'pendiente' });
    expect(await notif(`restantes:${plan(2)}:2`)).toBeTruthy();
  });

  it('si la asistencia se corrige antes del envío, el correo se anula; si ya salió, se envía corrección', async () => {
    await como(null, 'admin');
    const a = await insertar(1, 1, sumar(HOY, -30), '10:00');
    await marcar(a, 'presente');
    await marcar(a, 'no_show');
    expect(await notif(`clase_realizada:${a}`)).toMatchObject({ estado: 'omitida' });

    const b = await insertar(1, 1, sumar(HOY, -31), '10:00');
    await marcar(b, 'presente');
    await db.query(`UPDATE public.notificaciones SET estado = 'enviada' WHERE clave = $1`, [`clase_realizada:${b}`]);
    await marcar(b, 'no_show');
    const { rows } = await db.query(`SELECT 1 FROM public.notificaciones WHERE clave LIKE $1`, [`corregida:${b}:%`]);
    expect(rows).toHaveLength(1);
    await marcar(b, 'presente');                           // volver a presente no reenvía el resumen
    const { rows: r2 } = await db.query(`SELECT 1 FROM public.notificaciones WHERE clave = $1`, [`clase_realizada:${b}`]);
    expect(r2).toHaveLength(1);
  });

  it('recordatorios: 24 h y 3 h antes, sin duplicar, y con el estado del plazo de cancelación', async () => {
    await como(null, 'admin');
    const pronto = enHoras(2);                             // entre 2 y 3 horas → solo el de 3 h
    const manana = enHoras(20);                            // entre 20 y 21 horas → el de 24 h
    const lejos  = enHoras(30);                            // todavía no
    const a = await insertar(4, 4, pronto.fecha, pronto.hora, 'pendiente', '1:1 Individual', COACH.B);
    const b = await insertar(4, 4, manana.fecha, manana.hora, 'pendiente', '1:1 Individual', COACH.B);
    const c = await insertar(4, 4, lejos.fecha, lejos.hora, 'pendiente', '1:1 Individual', COACH.B);
    await rpc('public.nexa_encolar_recordatorios()');
    await rpc('public.nexa_encolar_recordatorios()');
    const claves = (await db.query<{ clave: string }>(
      `SELECT clave FROM public.notificaciones WHERE tipo = 'recordatorio_clase' ORDER BY clave`)).rows.map(r => r.clave);
    expect(claves).toContain(`recordatorio:3:${a}`);
    expect(claves).not.toContain(`recordatorio:24:${a}`);
    expect(claves).toContain(`recordatorio:24:${b}`);
    expect(claves.some(k => k.endsWith(`:${c}`))).toBe(false);
    const datos = (await notif(`recordatorio:3:${a}`)).datos as { horas: number; a_tiempo: boolean; limite: string };
    expect(datos.horas).toBe(3);
    expect(datos.a_tiempo).toBe(Date.now() <= new Date(datos.limite).getTime());
  });
});

describe('Requiere mi atención', () => {
  it('detecta asistencia sin registrar y la cierra sola al marcarla', async () => {
    await como(null, 'admin');
    await rpc('public.nexa_revisar_sistema()');
    const abierta = (await db.query<{ id: string; descripcion: string }>(
      `SELECT id, descripcion FROM public.incidencias WHERE tipo = 'asistencia_pendiente' AND estado = 'abierta' AND clave LIKE $1`,
      [`%:${sumar(HOY, -2)}`])).rows;
    expect(abierta).toHaveLength(1);
    expect(abierta[0].descripcion).toMatch(/Beto/);
    await db.query(`UPDATE public.reservas SET estado = 'presente'
      WHERE alumno_id = $1 AND estado = 'pendiente' AND fecha = $2::timestamp AT TIME ZONE 'UTC'`, [atl(2), sumar(HOY, -2)]);
    await rpc('public.nexa_revisar_sistema()');
    const { rows } = await db.query<{ estado: string }>(`SELECT estado FROM public.incidencias WHERE id = $1`, [abierta[0].id]);
    expect(rows[0].estado).toBe('resuelta');
  });

  it('detecta saldo negativo, plan en uso sin pago y correos sin email', async () => {
    await como(null, 'admin');
    await insertar(3, 3, sumar(HOY, -4), '18:00', 'presente');    // plan de 1 clase: ya tenía otra
    await db.query(`INSERT INTO public.notificaciones (atleta_id, tipo, clave, estado, error)
                    VALUES ($1, 'recordatorio_clase', 'prueba-sin-email', 'omitida', 'alumno sin email')`, [atl(4)]);
    await rpc('public.nexa_revisar_sistema()');
    const tipos = (await db.query<{ tipo: string }>(`SELECT DISTINCT tipo FROM public.incidencias WHERE estado = 'abierta'`)).rows.map(r => r.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['saldo_negativo', 'plan_sin_pago', 'notificacion_fallida']));
  });

  it('detecta reservas duplicadas y pagos registrados dos veces', async () => {
    await como(null, 'admin');
    const f = sumar(HOY, 8);
    await insertar(1, 1, f, '15:00', 'pendiente', 'Grupal', COACH.A);   // el trigger 1:1 no revisa grupales
    await insertar(1, 1, f, '15:00', 'pendiente', 'Grupal', COACH.B);
    await db.query(`INSERT INTO public.pagos (alumno_id, plan_id, monto, estado, fecha_pago)
                    VALUES ($1, $2, 150000, 'pagado', now()), ($1, $2, 150000, 'pagado', now())`, [atl(2), plan(2)]);
    await rpc('public.nexa_revisar_sistema()');
    const tipos = (await db.query<{ tipo: string }>(`SELECT DISTINCT tipo FROM public.incidencias WHERE estado = 'abierta'`)).rows.map(r => r.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['reserva_duplicada', 'pago_duplicado']));
  });

  it('una incidencia descartada con motivo no vuelve a aparecer; resolver exige permisos', async () => {
    await como(null, 'admin');
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM public.incidencias WHERE tipo = 'pago_duplicado' AND estado = 'abierta'`);
    expect(await rpc(`public.staff_resolver_incidencia($1::uuid, 'descartada', '')`, [rows[0].id])).toMatchObject({ ok: false, error: 'nota_requerida' });
    await como(1);
    expect(await rpc(`public.staff_resolver_incidencia($1::uuid, 'descartada', 'x')`, [rows[0].id])).toMatchObject({ ok: false, error: 'no_autorizado' });
    await como(null, 'admin');
    expect(await rpc(`public.staff_resolver_incidencia($1::uuid, 'descartada', 'Eran dos meses distintos')`, [rows[0].id])).toMatchObject({ ok: true });
    await rpc('public.nexa_revisar_sistema()');
    const { rows: r2 } = await db.query(`SELECT 1 FROM public.incidencias WHERE tipo = 'pago_duplicado' AND estado = 'abierta'`);
    expect(r2).toHaveLength(0);
    const h = await db.query<{ accion: string }>(`SELECT accion FROM public.incidencias_historial WHERE incidencia_id = $1 ORDER BY id`, [rows[0].id]);
    expect(h.rows.map(r => r.accion)).toEqual(['detectada', 'descartada']);
  });

  it('un profesor puede informar una incidencia; el historial de créditos cuadra', async () => {
    await como(9, 'profesor');
    expect(await rpc(`public.staff_reportar_incidencia('Máquina de remo averiada', 'No funciona la pantalla', NULL)`)).toMatchObject({ ok: true });
    await como(null, 'admin');
    await rpc('public.nexa_revisar_sistema()');
    const { rows } = await db.query(`SELECT 1 FROM public.incidencias WHERE tipo = 'descuadre_creditos' AND estado = 'abierta'`);
    expect(rows).toHaveLength(0);
  });

  it('la tarea programada corre de punta a punta', async () => {
    await como(null, null);
    const r = await rpc<{ recordatorios: number; revision: { detectadas: number } }>('public.nexa_tareas_programadas()');
    expect(r.revision.detectadas).toBeGreaterThan(0);
  });
});
