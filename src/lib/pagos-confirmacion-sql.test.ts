// Prueba la migración 052 (confirmación de pagos en línea) en PGlite. No toca la base real.
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { SQL_BASE, MIGRACIONES } from './sql-test-base';

const m033 = readFileSync('supabase/migrations/033_planes_1a1_precios_y_pedidos.sql', 'utf8');
const PEDIDOS = m033.slice(m033.indexOf('CREATE TABLE IF NOT EXISTS public.pedidos_planes'), m033.indexOf('ALTER TABLE public.pedidos_planes'));

let db: PGlite;
type Res = { ok: boolean; codigo?: string; ya_procesado?: boolean; plan_id?: string; atleta_id?: string; clases_sin_agendar?: number };

const confirmar = async (tok: string, monto: number, moneda = 'CLP', orden: string | null = `orden-${tok}`) =>
  (await db.query<{ r: Res }>(`SELECT public.nexa_confirmar_pago_plan($1, $2, $3, $4) r`, [tok, monto, moneda, orden])).rows[0].r;
const pedido = (tok: string, hora = '07:00', email = `${tok}@x.cl`) => db.query(
  `INSERT INTO public.pedidos_planes (modalidad, frecuencia_semanal, tipo, dias_semana, hora, nombre, apellido, email, monto_clp, estado, flow_token, commerce_order)
   VALUES ('1:1', 2, 'mensual', '{1,3}', $2, 'Ana', 'Test', $3, 225000, 'procesando', $1, 'orden-' || $1)`, [tok, hora, email]);
const contar = async (sql: string, p: unknown[] = []) => (await db.query<{ n: number }>(`SELECT count(*)::int n FROM ${sql}`, p)).rows[0].n;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SQL_BASE);
  for (const m of MIGRACIONES.filter(x => !x.startsWith('047'))) await db.exec(readFileSync(`supabase/migrations/${m}`, 'utf8'));
  await db.exec(`ALTER TABLE public.atletas ADD COLUMN IF NOT EXISTS telefono text, ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
      ADD CONSTRAINT pagos_metodo_check_viejo CHECK (metodo IN ('stripe','transferencia','efectivo'));
    DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN others THEN NULL; END $$;` + PEDIDOS);
  await db.exec(readFileSync('supabase/migrations/051_reservas_sin_duplicados.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/052_pagos_confirmacion.sql', 'utf8'));
}, 60_000);

describe('052 — confirmación de pagos', () => {
  let planId = '';
  it('pago correcto: activa el plan, agenda las clases y registra el pago (método flow)', async () => {
    await pedido('t1');
    const r = await confirmar('t1', 225000);
    expect(r).toMatchObject({ ok: true, ya_procesado: false, clases_sin_agendar: 0 });
    planId = r.plan_id!;
    expect(await contar(`public.reservas WHERE plan_id = $1`, [planId])).toBe(8);
    const pagos = (await db.query<{ estado: string; metodo: string; monto: number; plan_id: string }>(
      `SELECT estado, metodo, monto, plan_id FROM public.pagos WHERE referencia_pago = 't1'`)).rows;
    expect(pagos).toEqual([{ estado: 'pagado', metodo: 'flow', monto: 225000, plan_id: planId }]);
    const plan = (await db.query<{ estado_pago: string; precio_clp: number }>(`SELECT estado_pago, precio_clp FROM public.planes WHERE id = $1`, [planId])).rows[0];
    expect(plan).toEqual({ estado_pago: 'pagado', precio_clp: 225000 });
  });

  it('confirmación repetida: no duplica pago, plan ni reservas', async () => {
    const r = await confirmar('t1', 225000);
    expect(r).toMatchObject({ ok: true, ya_procesado: true, plan_id: planId });
    expect(await contar(`public.pagos WHERE referencia_pago = 't1'`)).toBe(1);
    expect(await contar(`public.planes`)).toBe(1);
    expect(await contar(`public.reservas WHERE plan_id = $1`, [planId])).toBe(8);
  });

  for (const [caso, args, codigo] of [
    ['monto distinto', [1000, 'CLP', 'orden-t2'], 'monto_distinto'],
    ['moneda distinta', [225000, 'USD', 'orden-t2'], 'moneda_distinta'],
    ['orden distinta', [225000, 'CLP', 'orden-otra'], 'orden_distinta'],
  ] as const) {
    it(`${caso}: no activa nada, queda en revisión y avisa al staff`, async () => {
      await db.exec(`DELETE FROM public.pedidos_planes WHERE flow_token = 't2'; DELETE FROM public.incidencias WHERE tipo = 'pago_no_coincide';`);
      await pedido('t2');
      const [monto, moneda, orden] = args;
      expect(await confirmar('t2', monto, moneda, orden)).toMatchObject({ ok: false, codigo });
      expect((await db.query<{ estado: string }>(`SELECT estado FROM public.pedidos_planes WHERE flow_token = 't2'`)).rows[0].estado).toBe('revision');
      expect(await contar(`public.pagos WHERE referencia_pago = 't2'`)).toBe(0);
      expect(await contar(`public.planes`)).toBe(1);
      expect(await contar(`public.incidencias WHERE tipo = 'pago_no_coincide'`)).toBe(1);
      // un reintento posterior con datos correctos no lo activa solo: requiere revisión
      expect(await confirmar('t2', 225000)).toMatchObject({ ok: false, codigo: 'en_revision' });
    });
  }

  it('token desconocido: no encontrado', async () => {
    expect(await confirmar('nada', 1)).toMatchObject({ ok: false, codigo: 'no_encontrado' });
  });

  it('pagado pero sin horario: el pago y el plan quedan; las clases faltantes se informan', async () => {
    // mismo alumno (mismo email) y misma hora que t1: todas sus clases chocan con las suyas
    await pedido('t3', '07:00', 't1@x.cl');
    const r = await confirmar('t3', 225000);
    expect(r.ok).toBe(true);
    expect(r.clases_sin_agendar).toBe(8);
    expect(await contar(`public.pagos WHERE referencia_pago = 't3' AND estado = 'pagado'`)).toBe(1);
    expect(await contar(`public.incidencias WHERE tipo = 'compra_clases_sin_agendar'`)).toBe(1);
    expect((await db.query<{ clases_sin_agendar: number }>(`SELECT clases_sin_agendar FROM public.pedidos_planes WHERE flow_token = 't3'`)).rows[0].clases_sin_agendar).toBe(8);
  });

  it('cobro manual: solo se marca pagado si monto y moneda coinciden, y una sola vez', async () => {
    const atleta = (await db.query<{ id: string }>(`SELECT id FROM public.atletas LIMIT 1`)).rows[0].id;
    await db.query(`INSERT INTO public.pagos (alumno_id, monto, estado, metodo, stripe_checkout_session_id) VALUES ($1, 50000, 'pendiente', 'stripe', 'nexa-abc')`, [atleta]);
    const cobro = async (monto: number, moneda = 'CLP') =>
      (await db.query<{ r: Res }>(`SELECT public.nexa_confirmar_cobro_manual('nexa-abc', $1, $2, 'tok-m') r`, [monto, moneda])).rows[0].r;
    expect(await cobro(40000)).toMatchObject({ ok: false, codigo: 'no_coincide' });
    expect(await cobro(50000)).toMatchObject({ ok: true, ya_procesado: false });
    expect(await cobro(50000)).toMatchObject({ ok: true, ya_procesado: true });
    expect(await contar(`public.pagos WHERE stripe_checkout_session_id = 'nexa-abc' AND estado = 'pagado'`)).toBe(1);
  });

  it('solo el servidor puede ejecutar las confirmaciones', async () => {
    const puede = async (rol: string, fn: string) =>
      (await db.query<{ ok: boolean }>(`SELECT has_function_privilege($1, $2, 'EXECUTE') ok`, [rol, fn])).rows[0].ok;
    for (const fn of ['public.nexa_confirmar_pago_plan(text,int,text,text)', 'public.nexa_confirmar_cobro_manual(text,int,text,text)']) {
      expect(await puede('anon', fn)).toBe(false);
      expect(await puede('authenticated', fn)).toBe(false);
      expect(await puede('service_role', fn)).toBe(true);
    }
  });
});
