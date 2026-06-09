// MEV = Minimum Effective Volume, MRV = Maximum Recoverable Volume
// Based on Renaissance Periodization guidelines (weekly sets per muscle group)
export interface RangoVolumen {
  grupo: string;
  mev: number;   // mínimo para estimular adaptación
  mrv: number;   // máximo recuperable sin sobre-entrenamiento
  optimo: [number, number]; // rango óptimo (MAV)
}

export const MEV_MRV: Record<string, RangoVolumen> = {
  Pecho:    { grupo: 'Pecho',    mev: 8,  mrv: 20, optimo: [10, 16] },
  Espalda:  { grupo: 'Espalda',  mev: 10, mrv: 25, optimo: [14, 22] },
  Piernas:  { grupo: 'Piernas',  mev: 8,  mrv: 20, optimo: [12, 18] },
  Glúteos:  { grupo: 'Glúteos',  mev: 0,  mrv: 20, optimo: [4,  12] },
  Hombros:  { grupo: 'Hombros',  mev: 6,  mrv: 26, optimo: [16, 22] },
  Bíceps:   { grupo: 'Bíceps',   mev: 8,  mrv: 26, optimo: [14, 20] },
  Tríceps:  { grupo: 'Tríceps',  mev: 4,  mrv: 18, optimo: [10, 14] },
  Core:     { grupo: 'Core',     mev: 0,  mrv: 25, optimo: [16, 20] },
  Cardio:   { grupo: 'Cardio',   mev: 0,  mrv: 10, optimo: [2,  6]  },
};

export function getEstado(series: number, rango: RangoVolumen): 'bajo' | 'optimo' | 'alto' | 'ok' {
  if (series < rango.mev)            return 'bajo';
  if (series > rango.mrv)            return 'alto';
  if (series >= rango.optimo[0] && series <= rango.optimo[1]) return 'optimo';
  return 'ok';
}

// Epley 1RM formula
export function calc1RM(peso: number, reps: number): number | null {
  if (!peso || !reps || reps < 1) return null;
  if (reps === 1) return peso;
  return Math.round(peso * (1 + reps / 30));
}

export function parseReps(reps: string): number | null {
  const n = parseInt(reps);
  return isNaN(n) ? null : n;
}

export function parsePeso(peso: string): number | null {
  const n = parseFloat(peso);
  return isNaN(n) ? null : n;
}
