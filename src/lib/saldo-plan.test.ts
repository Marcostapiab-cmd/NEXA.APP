// La regla de saldo del staff (cuentaEnPlan) debe coincidir con la de la base
// (nexa_cat_credito + nexa_resumen_plan de la migración 042), que es la que ve el alumno.
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { cuentaEnPlan } from './planes-supabase';
import { getClasesComprometidas, getClasesPorAgendar, type Plan } from './planes';

describe('saldo de clases: administración = MI NEXA', () => {
  it('cuentaEnPlan coincide con nexa_cat_credito para todos los estados y fechas', async () => {
    const db = new PGlite();
    const m041 = readFileSync('supabase/migrations/041_autogestion_alumno.sql', 'utf8');
    const m042 = readFileSync('supabase/migrations/042_creditos_asistencia.sql', 'utf8');
    const fn = (src: string, name: string) => {
      const i = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      return src.slice(i, src.indexOf('$$;', i) + 3);
    };
    await db.exec(fn(m041, 'nexa_estado_inactivo') + fn(m042, 'nexa_cat_credito'));
    const hoy = '2026-11-05';
    const estados = ['pendiente', 'confirmada', 'presente', 'no_show', 'cancelada_tarde', 'cancelada_tiempo',
      'cancelada_nexa', 'cancelada', 'reagendada', 'bloqueada', 'otro_estado'];
    for (const e of estados) {
      const cat = (await db.query<{ c: string | null }>(`SELECT public.nexa_cat_credito($1) c`, [e])).rows[0].c;
      for (const fecha of ['2026-11-01', hoy, '2026-11-20']) {
        const sql = cat === 'consumida' ? 'usada' : cat === 'libre' ? null
                  : fecha < hoy ? 'por_confirmar' : 'agendada';
        expect([e, fecha, cuentaEnPlan(e, fecha, hoy)]).toEqual([e, fecha, sql]);
      }
    }
    }, 60_000);

  it('las clases pasadas sin marcar no quedan disponibles para reservar', () => {
    const plan = { totalClases: 8, usedClases: 2, agendadasClases: 3, porConfirmarClases: 2 } as Plan;
    expect(getClasesComprometidas(plan)).toBe(7);
    expect(getClasesPorAgendar(plan)).toBe(1); // = 'disponibles' de nexa_resumen_plan
  });
});
