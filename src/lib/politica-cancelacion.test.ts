import { describe, it, expect } from 'vitest';
import { horaChile, limiteCancelacion, puedeCancelarATiempo, POLITICA_DEFAULT } from './politica-cancelacion';

// Chile en octubre 2026 está en horario de verano (UTC-3); en julio, invierno (UTC-4).
const chile = (fecha: string, hora: string) => horaChile(fecha, hora);
const masMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);

describe('horaChile', () => {
  it('convierte con el horario de verano (UTC-3)', () => {
    expect(chile('2026-11-04', '10:00').toISOString()).toBe('2026-11-04T13:00:00.000Z');
  });
  it('convierte con el horario de invierno (UTC-4)', () => {
    expect(chile('2026-07-15', '10:00').toISOString()).toBe('2026-07-15T14:00:00.000Z');
  });
});

describe('Regla A — clases hasta las 12:00', () => {
  it('miércoles 10:00 se cancela hasta el martes 22:00', () => {
    expect(limiteCancelacion('2026-11-04', '10:00').getTime()).toBe(chile('2026-11-03', '22:00').getTime());
  });
  it('clase a las 12:00 en punto usa la regla A', () => {
    expect(limiteCancelacion('2026-11-04', '12:00').getTime()).toBe(chile('2026-11-03', '22:00').getTime());
  });
  it('justo a las 22:00 es a tiempo, a las 22:01 ya no', () => {
    const lim = chile('2026-11-03', '22:00');
    expect(puedeCancelarATiempo('2026-11-04', '10:00', lim)).toBe(true);
    expect(puedeCancelarATiempo('2026-11-04', '10:00', masMin(lim, 1))).toBe(false);
  });
  it('el límite del lunes cae el domingo anterior (cambio de mes incluido)', () => {
    expect(limiteCancelacion('2026-12-01', '07:00').getTime()).toBe(chile('2026-11-30', '22:00').getTime());
  });
});

describe('Regla B — clases después de las 12:00 (6 horas)', () => {
  const casos: [string, string][] = [['15:00', '09:00'], ['17:00', '11:00'], ['18:00', '12:00'], ['20:00', '14:00']];
  for (const [clase, tope] of casos) {
    it(`clase ${clase} → hasta las ${tope}`, () => {
      expect(limiteCancelacion('2026-11-06', clase).getTime()).toBe(chile('2026-11-06', tope).getTime());
    });
  }
  it('clase a las 12:01 usa la regla de 6 horas (hasta 06:01)', () => {
    expect(limiteCancelacion('2026-11-06', '12:01').getTime()).toBe(chile('2026-11-06', '06:01').getTime());
  });
  it('justo en el límite es a tiempo; un minuto después, fuera de plazo', () => {
    const lim = chile('2026-11-06', '11:00');
    expect(puedeCancelarATiempo('2026-11-06', '17:00', lim)).toBe(true);
    expect(puedeCancelarATiempo('2026-11-06', '17:00', masMin(lim, 1))).toBe(false);
  });
});

describe('Cambios de hora de Chile', () => {
  // 2026: el horario de verano empieza el domingo 6 de septiembre y termina el domingo 5 de abril.
  it('clase del lunes después del inicio del horario de verano', () => {
    const lim = limiteCancelacion('2026-09-07', '10:00');
    expect(lim.toISOString()).toBe('2026-09-07T01:00:00.000Z'); // domingo 22:00 UTC-3
  });
  it('clase del domingo al terminar el horario de verano (6 h reales)', () => {
    const lim = limiteCancelacion('2026-04-05', '18:00');
    expect(chile('2026-04-05', '18:00').getTime() - lim.getTime()).toBe(6 * 3_600_000);
  });
  it('usa la política configurada', () => {
    const pol = { ...POLITICA_DEFAULT, cancelHorasAvisoPm: 3 };
    expect(limiteCancelacion('2026-11-06', '17:00', pol).getTime()).toBe(chile('2026-11-06', '14:00').getTime());
  });
});
