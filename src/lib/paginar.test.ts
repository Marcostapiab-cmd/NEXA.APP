import { describe, it, expect } from 'vitest';
import { todasLasFilas } from './paginar';

describe('todasLasFilas', () => {
  const filas = Array.from({ length: 2350 }, (_, i) => i);
  it('junta todas las páginas (más de 1000 filas)', async () => {
    const r = await todasLasFilas((d, h) => Promise.resolve({ data: filas.slice(d, h + 1), error: null }));
    expect(r).toHaveLength(2350);
    expect(r[2349]).toBe(2349);
  });
  it('justo 1000 filas: pide una página más y termina', async () => {
    let llamadas = 0;
    const r = await todasLasFilas((d, h) => { llamadas++; return Promise.resolve({ data: filas.slice(0, 1000).slice(d, h + 1), error: null }); });
    expect(r).toHaveLength(1000);
    expect(llamadas).toBe(2);
  });
  it('si falla una página, falla todo (nunca un total incompleto)', async () => {
    await expect(todasLasFilas((d) => Promise.resolve(d === 0
      ? { data: filas.slice(0, 1000), error: null }
      : { data: null, error: new Error('se cortó') }))).rejects.toThrow('se cortó');
  });
});
