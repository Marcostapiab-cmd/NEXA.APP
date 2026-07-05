// Biblioteca de ejercicios — solo datos BASE del ejercicio.
// Series, repeticiones, peso, descanso y tempo NO pertenecen aquí.
// Esos datos van en el WorkoutExercise (rutina) o en el PerformanceLog (sesión).

import { USER_EXERCISE_LIBRARY } from './userExercises';

export interface EjBiblioteca {
  id: string;
  nombre: string;
  grupo: string;
  // Campos editables por el coach (guardados en localStorage como overlay):
  equipamiento?: string;
  videoUrl?: string;
  notas?: string;
}

export const EQUIPAMIENTO_OPTIONS = [
  'Barra', 'Mancuernas', 'Kettlebell', 'Cable', 'Máquina',
  'Peso corporal', 'Bandas', 'TRX', 'Disco', 'Banco',
] as const;

export type Equipamiento = (typeof EQUIPAMIENTO_OPTIONS)[number];

export const GRUPOS_MUSCULARES = [
  'Pecho', 'Espalda', 'Piernas', 'Glúteos', 'Hombros',
  'Bíceps', 'Tríceps', 'Core', 'Cardio',
] as const;

export type GrupoMuscular = (typeof GRUPOS_MUSCULARES)[number];

// ─── Datos base (sin series ni reps) ───────────────────────────────────────────

export const BIBLIOTECA_EJERCICIOS: EjBiblioteca[] = USER_EXERCISE_LIBRARY;

// ─── Storage helpers para customizaciones del coach ───────────────────────────

export interface BibliotecaCustom {
  videoUrl?: string;
  equipamiento?: string;
  notas?: string;
  nombre?: string;
}

export function getBibliotecaCustoms(): Record<string, BibliotecaCustom> {
  try {
    const s = localStorage.getItem('nexa_biblioteca_custom');
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

export function saveBibliotecaCustom(id: string, custom: BibliotecaCustom): void {
  const all = getBibliotecaCustoms();
  all[id] = custom;
  localStorage.setItem('nexa_biblioteca_custom', JSON.stringify(all));
}

export function getMergedEjercicios(): EjBiblioteca[] {
  const customs = getBibliotecaCustoms();
  return BIBLIOTECA_EJERCICIOS.map(e => {
    const c = customs[e.id];
    if (!c) return e;
    return { ...e, ...c, nombre: c.nombre ?? e.nombre };
  });
}

// ─── Ejercicios propios del coach (creados desde la UI) ───────────────────────

const PROPIOS_KEY = 'nexa_ejercicios_propios';

export function getEjerciciosPropios(): EjBiblioteca[] {
  try {
    const s = localStorage.getItem(PROPIOS_KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

export function saveEjercicioPropio(ej: EjBiblioteca): void {
  const all = getEjerciciosPropios();
  const idx = all.findIndex(e => e.id === ej.id);
  if (idx >= 0) all[idx] = ej;
  else all.push(ej);
  localStorage.setItem(PROPIOS_KEY, JSON.stringify(all));
}

export function deleteEjercicioPropio(id: string): void {
  const all = getEjerciciosPropios().filter(e => e.id !== id);
  localStorage.setItem(PROPIOS_KEY, JSON.stringify(all));
}

// ─── Helpers de acceso unificado ──────────────────────────────────────────────

/** Retorna todos los ejercicios disponibles: biblioteca base + overlays + propios del coach. */
export function getAllEjercicios(): EjBiblioteca[] {
  return [...getMergedEjercicios(), ...getEjerciciosPropios()];
}

/**
 * Busca el videoUrl de un ejercicio desde la biblioteca.
 * Primero intenta por exerciseLibraryId (ejercicios nuevos), luego por nombre (retrocompatibilidad).
 */
export function getVideoUrlForExercise(exerciseLibraryId?: string, nombre?: string): string {
  const all = getAllEjercicios();
  if (exerciseLibraryId) {
    const found = all.find(e => e.id === exerciseLibraryId);
    if (found?.videoUrl) return found.videoUrl;
  }
  if (nombre) {
    const found = all.find(e => e.nombre.toLowerCase() === nombre.toLowerCase());
    if (found?.videoUrl) return found.videoUrl;
  }
  return '';
}
