import { describe, expect, it } from 'vitest';
import {
  alternarSesion, conflictosSesiones, evaluarCelda, fechasDelDia, lunesDe, moverSesion,
  repetirDia, repetirSemana, tipoClaseDeModalidad, type SesionPlan,
} from './agenda-plan';

// Plan mensual que parte el lunes 2 de noviembre de 2026 (30 días → hasta 2 dic)
const INICIO = '2026-11-02';
const FIN    = '2026-12-02';

describe('fechas', () => {
  it('lista los miércoles del plan con tope de semanas', () => {
    expect(fechasDelDia(3, INICIO, FIN, 4)).toEqual(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']);
    expect(fechasDelDia(3, INICIO, FIN)).toHaveLength(5); // sin tope incluye el 2 dic
  });
  it('lunes de la semana', () => {
    expect(lunesDe('2026-11-07')).toBe('2026-11-02');
  });
});

describe('repetir y mover sin borrar otros días', () => {
  it('cada día puede tener una hora distinta', () => {
    let s: SesionPlan[] = [];
    s = alternarSesion(s, '2026-11-02', '08:00'); // lunes
    s = alternarSesion(s, '2026-11-04', '18:00'); // miércoles
    s = repetirDia(s, 1, '08:00', INICIO, FIN, 4);
    s = repetirDia(s, 3, '18:00', INICIO, FIN, 4);
    expect(s).toHaveLength(8);
    expect(s.filter(x => x.hora === '08:00')).toHaveLength(4);
    expect(s.filter(x => x.hora === '18:00')).toHaveLength(4);
  });

  it('mover una clase no toca las demás y repetir de nuevo la respeta', () => {
    let s = repetirDia([], 3, '18:00', INICIO, FIN, 4);
    s = moverSesion(s, '2026-11-18', '2026-11-19', '07:00'); // mié 18 → jue 19 a las 07:00
    expect(s.map(x => `${x.fecha} ${x.hora}`)).toEqual([
      '2026-11-04 18:00', '2026-11-11 18:00', '2026-11-19 07:00', '2026-11-25 18:00',
    ]);
    s = repetirDia(s, 3, '19:00', INICIO, FIN, 4); // cambia la hora de los miércoles repetidos
    expect(s.find(x => x.fecha === '2026-11-19')?.hora).toBe('07:00');   // la movida a mano se mantiene
    expect(s.find(x => x.fecha === '2026-11-25')?.hora).toBe('19:00');
    expect(s.find(x => x.fecha === '2026-11-18')?.hora).toBe('19:00');   // vuelve a llenarse el hueco
  });

  it('una clase cambiada a mano no se pisa al repetir', () => {
    let s = repetirDia([], 5, '10:00', INICIO, FIN, 4);
    s = alternarSesion(s, '2026-11-13', '12:00');
    s = repetirDia(s, 5, '09:00', INICIO, FIN, 4);
    expect(s.find(x => x.fecha === '2026-11-13')?.hora).toBe('12:00');
    expect(s.filter(x => x.hora === '09:00')).toHaveLength(3);
  });

  it('copiar la semana replica cada día con su propia hora', () => {
    let s: SesionPlan[] = [];
    s = alternarSesion(s, '2026-11-03', '07:00');
    s = alternarSesion(s, '2026-11-05', '20:00');
    s = repetirSemana(s, '2026-11-02', INICIO, FIN, 4);
    expect(s).toHaveLength(8);
    expect(s.filter(x => x.hora === '20:00').every(x => new Date(`${x.fecha}T12:00`).getDay() === 4)).toBe(true);
  });

  it('volver a tocar la misma hora quita solo esa fecha', () => {
    const s = alternarSesion(repetirDia([], 2, '08:00', INICIO, FIN, 4), '2026-11-10', '08:00');
    expect(s).toHaveLength(3);
  });
});

describe('cupos 1:1 / 2:1', () => {
  const ocupado1a1 = [{ fecha: '2026-11-04', hora: '18:00', tipo_clase: '1:1 Individual' }];
  const uno2a1     = [{ fecha: '2026-11-04', hora: '18:00', tipo_clase: '2:1 Duo' }];
  const dos2a1     = [...uno2a1, { fecha: '2026-11-04', hora: '18:00', tipo_clase: '2:1 Duo' }];

  it('un 2:1 se puede sumar a otro 2:1', () => {
    expect(evaluarCelda('2026-11-04', '18:00', '2:1', uno2a1, []).estado).toBe('compartible');
  });
  it('un 2:1 no entra con un 1:1 ni con 2:1 lleno', () => {
    expect(evaluarCelda('2026-11-04', '18:00', '2:1', ocupado1a1, []).estado).toBe('ocupado');
    expect(evaluarCelda('2026-11-04', '18:00', '2:1', dos2a1, []).estado).toBe('ocupado');
  });
  it('un 1:1 necesita el horario libre', () => {
    expect(evaluarCelda('2026-11-04', '18:00', '1:1', uno2a1, []).estado).toBe('ocupado');
    expect(evaluarCelda('2026-11-04', '19:00', '1:1', uno2a1, []).estado).toBe('libre');
  });
  it('detecta bloqueos y fechas fuera del plan', () => {
    const c = conflictosSesiones(
      [{ fecha: '2026-11-04', hora: '18:00', origen: 'manual' }, { fecha: '2026-12-20', hora: '09:00', origen: 'manual' }],
      '1:1', [], [{ fecha: '2026-11-04' }], INICIO, FIN,
    );
    expect(Object.keys(c)).toEqual(['2026-11-04', '2026-12-20']);
  });
  it('guarda el tipo de clase según la modalidad', () => {
    expect(tipoClaseDeModalidad('2:1')).toBe('2:1 Duo');
    expect(tipoClaseDeModalidad('1:1')).toBe('1:1 Individual');
  });
});
