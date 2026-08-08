// Reglas de negocio para exclusividad de horarios 1:1 / 2:1.
// Funciones puras — sin side effects, testables sin red ni DB.

export type TipoSesion = '1:1' | '2:1' | 'Grupal';

export interface ReservaExistente {
  tipo_clase: string | null | undefined;
}

export interface ResultadoValidacion {
  ok:     boolean;
  error?: string;
}

function parseTipo(tipoClase: string | null | undefined): TipoSesion {
  const s = (tipoClase ?? '').toLowerCase();
  if (s.includes('2:1') || s.includes('duo') || s.includes('dúo')) return '2:1';
  if (s.includes('grupal') || s.includes('group'))                  return 'Grupal';
  return '1:1';
}

/**
 * Valida si se puede agendar `nuevoTipo` dado el conjunto de reservas
 * individuales ya existentes en ese horario (para el mismo coach).
 *
 * Reglas:
 *  - 1:1 requiere horario vacío (exclusivo).
 *  - 2:1 no puede convivir con un 1:1 ya agendado.
 *  - 2:1 admite como máximo 2 alumnos en total.
 *  - Las sesiones Grupales son ignoradas (pool de cupos diferente).
 */
export function validarConflictoTipo(
  nuevoTipo: TipoSesion,
  existentes: ReservaExistente[],
): ResultadoValidacion {
  if (nuevoTipo === 'Grupal') return { ok: true };

  const individuales = existentes.filter(
    r => parseTipo(r.tipo_clase) !== 'Grupal',
  );

  const count    = individuales.length;
  const tiene1a1 = individuales.some(r => parseTipo(r.tipo_clase) === '1:1');

  if (nuevoTipo === '1:1') {
    if (count > 0) {
      return {
        ok:    false,
        error: 'Este horario ya tiene otra sesión activa. Un 1:1 requiere horario exclusivo.',
      };
    }
  } else {
    // nuevoTipo === '2:1'
    if (tiene1a1) {
      return {
        ok:    false,
        error: 'Este horario tiene una sesión 1:1. No se puede mezclar 1:1 con 2:1.',
      };
    }
    if (count >= 2) {
      return {
        ok:    false,
        error: 'Este horario 2:1 ya está lleno (2/2 alumnos). No quedan cupos.',
      };
    }
  }

  return { ok: true };
}
