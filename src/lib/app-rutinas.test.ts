import { describe, it, expect } from 'vitest';
import { idYoutube, mesDe, normalizarRutina, numeroAnotado, rutinaVigente, semanaDe, ultimaVez, type Registro } from './app-rutinas';

const fila = (id: string, inicio: string, fin: string) => normalizarRutina({
  id, nombre: id, start_date: inicio, end_date: fin,
  sessions: {
    '2026-11-23': { name: 'Piernas', exercises: [{ id: 'e1', name: 'Sentadilla', series: 4, reps: '8-10', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', notas: 'Bajar lento' }] },
    '2026-11-24': { name: 'Vacío', exercises: [] },
  },
});

describe('app de rutinas', () => {
  it('normaliza la rutina del planificador y descarta días vacíos', () => {
    const r = fila('a', '2026-11-01', '2026-12-31');
    expect(r.dias).toHaveLength(1);
    expect(r.dias[0].ejercicios[0]).toMatchObject({ id: 'e1', nombre: 'Sentadilla', series: 4, reps: '8-10', notas: 'Bajar lento' });
  });

  it('elige la rutina vigente (la más reciente que cubre hoy), o la próxima', () => {
    const vieja = fila('vieja', '2026-09-01', '2026-10-31');
    const actual = fila('actual', '2026-11-01', '2026-12-31');
    const nueva = fila('nueva', '2026-11-20', '2027-01-20');
    const futura = fila('futura', '2027-02-01', '2027-03-31');
    expect(rutinaVigente([vieja, actual, nueva], '2026-11-23')?.id).toBe('nueva');
    expect(rutinaVigente([vieja, actual], '2026-11-23')?.id).toBe('actual');
    expect(rutinaVigente([vieja, futura], '2026-11-23')?.id).toBe('futura');
    expect(rutinaVigente([vieja], '2026-11-23')).toBeNull();
  });

  it('semana de lunes a domingo y mes con relleno', () => {
    expect(semanaDe('2026-11-23')).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    expect(semanaDe('2026-11-29')[0]).toBe('2026-11-23'); // domingo
    const nov = mesDe('2026-11-23');
    expect(nov.filter(Boolean)).toHaveLength(30);
    expect(nov.indexOf('2026-11-01')).toBe(6); // 1-nov-2026 es domingo
  });

  it('reconoce enlaces de YouTube', () => {
    for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://m.youtube.com/watch?feature=x&v=dQw4w9WgXcQ']) {
      expect(idYoutube(u)).toBe('dQw4w9WgXcQ');
    }
    expect(idYoutube('https://vimeo.com/1')).toBeNull();
  });

  it('muestra lo anotado la última vez en ese ejercicio', () => {
    const regs: Registro[] = [
      { serie: 2, peso_kg: 45, reps: 8, fecha: '2026-11-16', ejercicio_nombre: 'Sentadilla' },
      { serie: 1, peso_kg: 40, reps: 10, fecha: '2026-11-16', ejercicio_nombre: 'sentadilla ' },
      { serie: 1, peso_kg: 35, reps: 10, fecha: '2026-11-09', ejercicio_nombre: 'Sentadilla' },
      { serie: 1, peso_kg: 50, reps: 8, fecha: '2026-11-23', ejercicio_nombre: 'Sentadilla' }, // hoy: no cuenta
      { serie: 1, peso_kg: 20, reps: 12, fecha: '2026-11-20', ejercicio_nombre: 'Remo' },
    ];
    const u = ultimaVez(regs, 'Sentadilla', '2026-11-23');
    expect(u?.fecha).toBe('2026-11-16');
    expect(u?.series.map(s => s.peso_kg)).toEqual([40, 45]);
    expect(ultimaVez(regs, 'Press', '2026-11-23')).toBeNull();
  });

  it('acepta pesos con coma y rechaza valores imposibles', () => {
    expect(numeroAnotado('42,5', 1000)).toBe(42.5);
    expect(numeroAnotado('', 1000)).toBeNull();
    expect(numeroAnotado('-3', 1000)).toBe('invalido');
    expect(numeroAnotado('abc', 1000)).toBe('invalido');
    expect(numeroAnotado('2000', 1000)).toBe('invalido');
  });
});
