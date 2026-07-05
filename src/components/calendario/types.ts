export type MuscleGroup = 'Piernas' | 'Espalda' | 'Pecho' | 'Hombros' | 'Bíceps' | 'Tríceps' | 'Core' | 'Cardio' | 'Glúteos';
export type BloqueWorkout = 'N/A' | 'A' | 'B' | 'C' | 'D' | 'E';
export type TipoReps = 'reps' | 'time' | 'meters' | 'calories';

export const MUSCLES: MuscleGroup[] = ['Piernas', 'Espalda', 'Pecho', 'Hombros', 'Bíceps', 'Tríceps', 'Core', 'Cardio', 'Glúteos'];
export const BLOQUES: BloqueWorkout[] = ['N/A', 'A', 'B', 'C', 'D', 'E'];

export const MUSCLE_HEX: Record<string, string> = {
  Piernas:  '#3b82f6',
  Espalda:  '#8b5cf6',
  Pecho:    '#D4AF37',
  Hombros:  '#eab308',
  Bíceps:   '#22c55e',
  Tríceps:  '#10b981',
  Core:     '#ec4899',
  Glúteos:  '#14b8a6',
  Cardio:   '#ef4444',
};

export const BLOQUE_HEX: Record<BloqueWorkout, string> = {
  'N/A': '#444444',
  A:     '#3b82f6',
  B:     '#22c55e',
  C:     '#8b5cf6',
  D:     '#eab308',
  E:     '#ef4444',
};

export const TIPO_REPS_LABEL: Record<TipoReps, string> = {
  reps:     'Reps',
  time:     'Tiempo',
  meters:   'Metros',
  calories: 'Calorías',
};

export interface Exercise {
  id: string;
  name: string;
  muscle?: MuscleGroup;
  series: number;
  reps: string;
  weight?: string;          // Peso ya no se define en planificación — se registra en Weightroom
  rest: string;
  youtubeUrl?: string;      // Viene de la Biblioteca; no se pide al agregar a rutina
  exerciseLibraryId?: string; // Referencia al ejercicio en la Biblioteca (fuente de verdad)
  // Enhanced fields
  bloque?: BloqueWorkout;
  tempo?: string;
  eachSide?: boolean;
  notas?: string;
  completionLift?: boolean;
  bodyWeight?: boolean;
  coachCompletion?: boolean;
  disableMaxTracking?: boolean;
  forceMaxPR?: boolean;
  trackRepCount?: boolean;
  trackVolumeLoad?: boolean;
}

export interface CalSession {
  name: string;
  exercises: Exercise[];
}

export interface Routine {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  alumnoIds: string[];
  sessions: Record<string, CalSession>;
}

export interface Alumno {
  id: string;
  nombre: string;
  apellido?: string;
  email?: string;
  foto?: string;
}

export function getMuscleGroups(exercises: Exercise[]): string[] {
  if (!exercises.length) return [];
  const counts: Record<string, number> = {};
  for (const ex of exercises) if (ex.muscle) counts[ex.muscle] = (counts[ex.muscle] ?? 0) + ex.series;
  return [...new Set(exercises.map(e => e.muscle).filter(Boolean) as string[])].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
}

export function buildMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const cur = new Date(first);
  cur.setDate(1 - startDow);
  const rows: Date[][] = [];
  while (rows.length < 6) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    rows.push(week);
    if (rows.length >= 4 && new Date(cur) > lastDay) break;
  }
  return rows;
}

export function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

export const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const DOW_LABEL = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const DOW_LONG  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// Input/label style constants
export const IC = 'w-full rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 py-2.5 text-sm text-white placeholder-[#444444] outline-none transition focus:border-[#444444]';
export const LC = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#555555]';
