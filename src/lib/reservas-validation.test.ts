import { describe, it, expect } from 'vitest';
import { validarConflictoTipo } from './reservas-validation';

// Helpers
const slot1a1 = { tipo_clase: '1:1 Individual' };
const slot2a1 = { tipo_clase: '2:1 Duo' };
const slotGrupal = { tipo_clase: 'Grupal' };

describe('validarConflictoTipo — 1:1', () => {
  it('permite un 1:1 en horario vacío', () => {
    expect(validarConflictoTipo('1:1', [])).toMatchObject({ ok: true });
  });

  it('rechaza un 1:1 cuando ya hay otro 1:1', () => {
    const r = validarConflictoTipo('1:1', [slot1a1]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/exclusivo/i);
  });

  it('rechaza un 1:1 cuando ya hay un 2:1 con cupo', () => {
    const r = validarConflictoTipo('1:1', [slot2a1]);
    expect(r.ok).toBe(false);
  });

  it('rechaza un 1:1 cuando el horario 2:1 ya está lleno', () => {
    const r = validarConflictoTipo('1:1', [slot2a1, slot2a1]);
    expect(r.ok).toBe(false);
  });
});

describe('validarConflictoTipo — 2:1', () => {
  it('permite un 2:1 en horario vacío', () => {
    expect(validarConflictoTipo('2:1', [])).toMatchObject({ ok: true });
  });

  it('rechaza un 2:1 cuando ya existe un 1:1', () => {
    const r = validarConflictoTipo('2:1', [slot1a1]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/mezclar/i);
  });

  it('permite agregar un segundo 2:1 (cupo disponible)', () => {
    expect(validarConflictoTipo('2:1', [slot2a1])).toMatchObject({ ok: true });
  });

  it('rechaza un tercer alumno cuando el 2:1 ya está lleno', () => {
    const r = validarConflictoTipo('2:1', [slot2a1, slot2a1]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/lleno/i);
  });
});

describe('validarConflictoTipo — Grupal', () => {
  it('siempre permite grupales (usan pool de cupos propio)', () => {
    expect(validarConflictoTipo('Grupal', [slot1a1, slot2a1])).toMatchObject({ ok: true });
  });
});

describe('validarConflictoTipo — ignorar sesiones grupales al contar', () => {
  it('no bloquea un 1:1 si solo hay grupales en el mismo horario', () => {
    expect(validarConflictoTipo('1:1', [slotGrupal])).toMatchObject({ ok: true });
  });

  it('no bloquea un 2:1 si solo hay grupales en el mismo horario', () => {
    expect(validarConflictoTipo('2:1', [slotGrupal])).toMatchObject({ ok: true });
  });
});
