import { describe, it, expect } from 'vitest';
import { armarRespuestas, buscarRespuestas, motivosNoReagendar, type DatosAyuda } from './centro-ayuda';
import { POLITICA_DEFAULT } from './politica-cancelacion';
import type { ClaseAlumno } from './reservas-alumno';

const clase = (p: Partial<ClaseAlumno>): ClaseAlumno => ({
  id: 1, fecha: '2026-11-10', hora: '10:00', estado: 'pendiente', modalidad: '1:1', aTiempo: true, activa: true, ...p,
});

const base: DatosAyuda = {
  plan: {
    vigente: true, nombre: 'Personalizado 1:1', modalidad: '1:1', fin: '2026-11-30', dias_restantes: 26,
    contratadas: 12, realizadas: 8, agendadas: 2, disponibles: 2, pendientes: 4, inasistencias: 1, tardias: 0, por_confirmar: 0,
  },
  clases: [
    clase({ id: 1, fecha: '2026-11-09', limite: '2026-11-09T01:00:00Z' }),  // lunes
    clase({ id: 2, fecha: '2026-11-16' }),
  ],
  politica: POLITICA_DEFAULT,
  info: { reagendasUsadas: 0, maxReagendas: null, reagendaValidezDias: 30, antelacionMinutos: 60 },
  ahora: new Date('2026-11-04T12:00:00Z'),
};
const r = (d: DatosAyuda, id: string) => armarRespuestas(d).find(x => x.id === id)!;

describe('Centro de Ayuda', () => {
  it('muestra el saldo real del plan', () => {
    const x = r(base, 'cuantas-clases');
    expect(x.destacado?.texto).toBe('Te quedan 4 clases por realizar');
    expect(x.lista).toContain('2 disponibles para reservar ahora');
    expect(x.lista).toContain('1 descontada por inasistencia o cancelación tardía');
  });

  it('muestra la fecha exacta de vencimiento', () => {
    expect(r(base, 'vence').destacado?.texto).toMatch(/30 de noviembre.*en 26 días/);
  });

  it('sin plan vigente no inventa datos', () => {
    const d = { ...base, plan: { vigente: false } };
    expect(r(d, 'cuantas-clases').destacado?.texto).toBe('No tienes un plan vigente');
    expect(motivosNoReagendar(d).general[0]).toMatch(/plan vigente/);
  });

  it('si no se pudo consultar la cuenta, lo dice', () => {
    const d = { ...base, plan: null, clases: null };
    expect(r(d, 'cuantas-clases').parrafos[0]).toMatch(/No pudimos consultar/);
    expect(r(d, 'no-puedo-reagendar').parrafos[0]).toMatch(/No pudimos consultar/);
  });

  it('explica la regla concreta que impide reagendar', () => {
    const d = { ...base, clases: [clase({ id: 7, fecha: '2026-11-05', aTiempo: false, limite: '2026-11-05T01:00:00Z' })] };
    const x = r(d, 'no-puedo-reagendar');
    expect(x.destacado?.tono).toBe('aviso');
    expect(x.lista?.[0]).toMatch(/el plazo terminó el miércoles 4 a las 22:00/);
    expect(x.acciones.some(a => a.solicitar === 'excepcion')).toBe(true);
  });

  it('avisa cuando se alcanzó el máximo de reagendamientos', () => {
    const d = { ...base, info: { ...base.info!, reagendasUsadas: 2, maxReagendas: 2 } };
    expect(motivosNoReagendar(d).general[0]).toMatch(/2 reagendamientos/);
  });

  it('si todo está en plazo, indica hasta cuándo se puede mover la próxima clase', () => {
    const x = r(base, 'no-puedo-reagendar');
    expect(x.destacado?.tono).toBe('ok');
    expect(x.parrafos[0]).toMatch(/hasta el domingo 8 a las 22:00/);
  });

  it('política de cancelación con los valores configurados', () => {
    const x = r({ ...base, politica: { limiteHoraAm: '12:00', corteCancelacionAm: '21:00', cancelHorasAvisoPm: 4 } }, 'cancelar');
    expect(x.lista).toEqual([
      'Clases que empiezan hasta las 12:00: puedes cancelar o reagendar hasta las 21:00 del día anterior.',
      'Clases que empiezan después de las 12:00: hasta 4 horas antes.',
    ]);
  });

  it('lista los horarios fijos actuales', () => {
    expect(r(base, 'horarios-fijos').lista).toEqual(['Lunes a las 10:00']);
  });

  it('solo muestra "por confirmar" cuando hay clases sin marcar', () => {
    expect(armarRespuestas(base).some(x => x.id === 'por-confirmar')).toBe(false);
    const d = { ...base, plan: { ...base.plan!, por_confirmar: 1 } };
    expect(r(d, 'por-confirmar').destacado?.texto).toBe('1 clase esperando confirmación');
  });

  it('el buscador entiende preguntas naturales y sin tildes', () => {
    const todas = armarRespuestas(base);
    expect(buscarRespuestas(todas, '¿por qué no puedo reagendar?')[0].id).toBe('no-puedo-reagendar');
    expect(buscarRespuestas(todas, 'cancele tarde')[0].id).toBe('cancelar');
    expect(buscarRespuestas(todas, 'donde veo mi boleta')[0].id).toBe('pagos');
    expect(buscarRespuestas(todas, 'xyzxyz')).toEqual([]);
    expect(buscarRespuestas(todas, '')).toHaveLength(todas.length);
  });
});
