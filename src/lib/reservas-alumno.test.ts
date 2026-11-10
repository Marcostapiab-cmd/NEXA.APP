import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabase: {} }));
const { resultado } = await import('./reservas-alumno');

describe('mensajes al alumno al reservar o reagendar', () => {
  it('una falta de cupo real se muestra como horario ocupado', () => {
    const r = resultado({ ok: false, error: 'sin_cupo', detalle: 'Conflicto 1:1: el horario 2026-11-09 06:00 ya tiene otra sesión activa.' }, null);
    expect(r).toMatchObject({ ok: false, error: 'sin_cupo' });
  });

  it('un error del sistema no se disfraza de horario ocupado', () => {
    const r = resultado({ ok: false, error: 'sin_cupo', detalle: 'null value in column "creada_at" of relation "reagendas" violates not-null constraint' }, null);
    expect(r).toMatchObject({ ok: false, error: 'error_sistema' });
    if (!r.ok) expect(r.mensaje).toMatch(/no se modificó/);
  });

  it('sin detalle se mantiene el código original', () => {
    expect(resultado({ ok: false, error: 'sin_cupo' }, null)).toMatchObject({ error: 'sin_cupo' });
    expect(resultado({ ok: true, reserva_id: 7 }, null)).toEqual({ ok: true, reservaId: 7 });
  });

  it('si ya tiene clase a esa hora, se le dice claramente', () => {
    const r = resultado({ ok: false, error: 'sin_cupo', detalle: 'Reserva duplicada: el alumno ya tiene una clase activa el 2026-11-09 a las 10:00 (reserva 12).' }, null);
    expect(r).toMatchObject({ ok: false, error: 'duplicada' });
    if (!r.ok) expect(r.mensaje).toMatch(/misma hora/);
  });
});
