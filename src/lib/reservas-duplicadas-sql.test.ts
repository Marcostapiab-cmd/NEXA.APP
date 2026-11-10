// Prueba la migración 051 (un alumno, una clase activa por día y hora) en PGlite.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { SQL_BASE, MIGRACIONES } from './sql-test-base';

const COACH = { A: '00000000-0000-0000-0000-00000000000a', B: '00000000-0000-0000-0000-00000000000b' };
const A1 = '20000000-0000-0000-0000-000000000001';
const A2 = '20000000-0000-0000-0000-000000000002';
const A3 = '20000000-0000-0000-0000-000000000003';
const D = '2030-03-04'; // lunes futuro
let db: PGlite;

const ins = (alumno: string, hora: string, coach: string, tipo = '1:1 Individual', estado = 'pendiente') =>
  db.query<{ id: number }>(
    `INSERT INTO public.reservas (alumno_id, fecha, hora, estado, tipo_clase, coach_id)
     VALUES ($1, $2::timestamp AT TIME ZONE 'UTC', $3, $4, $5, $6) RETURNING id`,
    [alumno, D, hora, estado, tipo, coach]).then(r => r.rows[0].id);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SQL_BASE);
  for (const m of MIGRACIONES) await db.exec(readFileSync(`supabase/migrations/${m}`, 'utf8'));
  await db.exec(`INSERT INTO public.coaches VALUES ('${COACH.A}','A',true),('${COACH.B}','B',true);
    INSERT INTO public.atletas (id, nombre) VALUES ('${A1}','Uno'),('${A2}','Dos'),('${A3}','Tres');`);
  // Duplicado histórico creado ANTES de la migración: debe informarse, no borrarse
  await ins(A3, '08:00', COACH.A);
  await ins(A3, '08:00', COACH.B);
  await db.exec(readFileSync('supabase/migrations/051_reservas_sin_duplicados.sql', 'utf8'));
}, 60_000);

describe('051 — reservas duplicadas', () => {
  it('impide al mismo alumno dos clases a la misma hora, aun con otro profesor', async () => {
    await ins(A1, '10:00', COACH.A);
    await expect(ins(A1, '10:00', COACH.B)).rejects.toThrow(/Reserva duplicada/);
  });

  it('el error es unique_violation (la compra en línea lo omite y avisa, sin perder el pago)', async () => {
    await expect(ins(A1, '10:00', COACH.B)).rejects.toMatchObject({ code: '23505' });
  });

  it('permite alumnos distintos en la misma clase si hay cupo (2:1)', async () => {
    await ins(A1, '11:00', COACH.A, '2:1 Duo');
    await ins(A2, '11:00', COACH.A, '2:1 Duo');
  });

  it('protege la edición: mover una reserva encima de otra del mismo alumno', async () => {
    const id = await ins(A1, '12:00', COACH.B);
    await expect(db.query(`UPDATE public.reservas SET hora = '10:00' WHERE id = $1`, [id])).rejects.toThrow(/duplicada/);
    // cambiar algo que no es el horario sí se puede
    await db.query(`UPDATE public.reservas SET obs = 'ok' WHERE id = $1`, [id]);
  });

  it('protege la reactivación de una reserva cancelada', async () => {
    const id = await ins(A2, '15:00', COACH.A);
    await db.query(`UPDATE public.reservas SET estado = 'cancelada_tiempo' WHERE id = $1`, [id]);
    await ins(A2, '15:00', COACH.B); // el horario quedó libre para el alumno
    await expect(db.query(`UPDATE public.reservas SET estado = 'pendiente' WHERE id = $1`, [id])).rejects.toThrow(/duplicada/);
  });

  it('una reserva cancelada no bloquea volver a reservar', async () => {
    const id = await ins(A2, '16:00', COACH.A);
    await db.query(`UPDATE public.reservas SET estado = 'cancelada_nexa' WHERE id = $1`, [id]);
    await ins(A2, '16:00', COACH.A);
  });

  it('los duplicados históricos se informan sin borrarse', async () => {
    const dups = (await db.query<{ hora: string; reservas: number[] }>(`SELECT * FROM public.nexa_reservas_duplicadas()`)).rows;
    expect(dups).toHaveLength(1);
    expect(dups[0].hora).toBe('08:00');
    expect((await db.query(`SELECT 1 FROM public.reservas WHERE alumno_id = $1`, [A3])).rows).toHaveLength(2);
    const inc = (await db.query<{ automatica: boolean }>(`SELECT automatica FROM public.incidencias WHERE tipo = 'reserva_duplicada'`)).rows;
    expect(inc).toEqual([{ automatica: false }]);
  });

  it('staff_reservas_duplicadas solo responde al staff', async () => {
    await db.query(`SELECT set_config('test.rol', 'alumno', false)`);
    expect((await db.query(`SELECT * FROM public.staff_reservas_duplicadas()`)).rows).toHaveLength(0);
    await db.query(`SELECT set_config('test.rol', 'admin', false)`);
    expect((await db.query(`SELECT * FROM public.staff_reservas_duplicadas()`)).rows).toHaveLength(1);
  });
});
