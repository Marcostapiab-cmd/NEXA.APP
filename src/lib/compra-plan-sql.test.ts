// Prueba la migración 049: activar el plan 1:1 / 2:1 después del pago (confirmar_pedido_plan_pago).
import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { SQL_BASE, MIGRACIONES } from './sql-test-base';
const m033 = readFileSync('supabase/migrations/033_planes_1a1_precios_y_pedidos.sql', 'utf8');
const pedidos = m033.slice(m033.indexOf('CREATE TABLE IF NOT EXISTS public.pedidos_planes'), m033.indexOf('ALTER TABLE public.pedidos_planes'));
it('activa el plan pagado: alumno por email o RUT, choques como crédito + aviso', async () => {
  const db = new PGlite();
  await db.exec(SQL_BASE);
  for (const m of MIGRACIONES.filter(x => !x.startsWith('047'))) await db.exec(readFileSync(`supabase/migrations/${m}`, 'utf8'));
  await db.exec(`ALTER TABLE public.atletas ADD COLUMN IF NOT EXISTS telefono text, ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true, ALTER COLUMN id SET DEFAULT gen_random_uuid();
    DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN others THEN NULL; END $$;` + pedidos);
  await db.exec(readFileSync('supabase/migrations/049_fix_confirmar_pedido_plan.sql', 'utf8').replace("NOTIFY pgrst, 'reload schema';", ''));
  await db.exec(`INSERT INTO public.atletas (nombre, email, telefono, rut) VALUES ('marcos', NULL, '569111', '17475465-7')`);
  const ins = (tok: string, email: string, rut: string, hora: string) => db.exec(`INSERT INTO public.pedidos_planes (modalidad, frecuencia_semanal, tipo, dias_semana, hora, nombre, apellido, email, telefono, rut, monto_clp, estado, flow_token)
    VALUES ('1:1', 2, 'trimestral', '{1,3}', '${hora}', 'Cata', 'Prueba', '${email}', '569111', '${rut}', 660000, 'procesando', '${tok}')`);
  const conf = async (t: string) => (await db.query<{ ok: boolean; plan_id: string; atleta_id: string }>(`SELECT * FROM public.confirmar_pedido_plan_pago('${t}')`)).rows[0];
  const cuenta = async (plan: string) => (await db.query<{ n: number }>(`SELECT count(*)::int n FROM public.reservas WHERE plan_id = '${plan}'`)).rows[0].n;
  const marcos = (await db.query<{ id: string }>(`SELECT id FROM public.atletas WHERE nombre = 'marcos'`)).rows[0].id;
  // mismo teléfono, otro correo y RUT: alumno nuevo
  await ins('t1', 'cata@x.cl', '19.996.183-7', '12:00');
  const r1 = await conf('t1');
  expect(r1.ok).toBe(true); expect(r1.atleta_id).not.toBe(marcos); expect(await cuenta(r1.plan_id)).toBe(24);
  expect((await conf('t1')) as unknown).toMatchObject({ ok: true }); expect(await cuenta(r1.plan_id)).toBe(24);
  // mismo RUT con otro formato: reutiliza a marcos
  await ins('t2', 'otro@x.cl', '174754657', '15:00');
  expect((await conf('t2')).atleta_id).toBe(marcos);
  // mismo correo en mayúsculas: reutiliza a cata; mismo horario: plan activo sin clases + aviso
  await ins('t3', 'CATA@X.CL', '', '12:00');
  const r3 = await conf('t3');
  expect(r3.atleta_id).toBe(r1.atleta_id); expect(await cuenta(r3.plan_id)).toBe(0);
  expect((await db.query(`SELECT 1 FROM public.incidencias WHERE tipo = 'compra_clases_sin_agendar'`)).rows.length).toBe(1);
}, 60000);
