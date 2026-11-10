import { describe, it, expect } from 'vitest';
import { alumnosQueEntrenan, fechaChile, semanaChile } from './contadores';

describe('contadores del panel', () => {
  it('Entrenan hoy: alumnos únicos con reservas activas de hoy', () => {
    const hoy = '2026-11-05';
    const r = [
      { alumnoId: 'a', estado: 'pendiente', fecha: '2026-11-05T00:00:00+00:00' },
      { alumnoId: 'a', estado: 'confirmada', fecha: '2026-11-05' },       // misma persona, otra clase
      { alumnoId: 'b', estado: 'presente', fecha: '2026-11-05' },
      { alumnoId: 'c', estado: 'cancelada_tiempo', fecha: '2026-11-05' }, // cancelada: no cuenta
      { alumnoId: 'd', estado: 'reagendada', fecha: '2026-11-05' },
      { alumnoId: 'e', estado: 'pendiente', fecha: '2026-11-06' },        // otro día
      { alumnoId: null, estado: 'pendiente', fecha: '2026-11-05' },
    ];
    expect(alumnosQueEntrenan(r, hoy)).toBe(2);
    expect(alumnosQueEntrenan([], hoy)).toBe(0);
  });

  it('usa la hora de Chile: a las 22:30 de Chile sigue siendo el mismo día', () => {
    // 2026-11-06 01:30 UTC = 2026-11-05 22:30 en Chile (UTC-3 en verano)
    expect(fechaChile(new Date('2026-11-06T01:30:00Z'))).toBe('2026-11-05');
  });

  it('semana de lunes a domingo en Chile', () => {
    expect(semanaChile(new Date('2026-11-05T15:00:00Z'))).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' });
    // Domingo: pertenece a la semana que empezó el lunes anterior
    expect(semanaChile(new Date('2026-11-08T15:00:00Z'))).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' });
    // Lunes 00:30 en Chile = lunes 03:30 UTC
    expect(semanaChile(new Date('2026-11-09T03:30:00Z'))).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' });
  });
});
