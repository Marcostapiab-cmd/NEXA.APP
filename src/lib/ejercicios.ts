export interface EjBiblioteca {
  id: string;
  nombre: string;
  grupo: string;
  descripcion?: string;
  series?: number;
  reps?: string;
  youtubeUrl?: string;
}

export const BIBLIOTECA_EJERCICIOS: EjBiblioteca[] = [
  // ─── PECHO ───────────────────────────────────────────────────────
  { id: 'p01', nombre: 'Press de banca plano con barra',    grupo: 'Pecho',   series: 4, reps: '6-10' },
  { id: 'p02', nombre: 'Press de banca inclinado con barra',grupo: 'Pecho',   series: 3, reps: '8-12' },
  { id: 'p03', nombre: 'Press de banca declinado',          grupo: 'Pecho',   series: 3, reps: '8-12' },
  { id: 'p04', nombre: 'Press inclinado con mancuernas',    grupo: 'Pecho',   series: 3, reps: '10-12' },
  { id: 'p05', nombre: 'Aperturas con mancuernas (plano)',  grupo: 'Pecho',   series: 3, reps: '12-15' },
  { id: 'p06', nombre: 'Aperturas en cable cruzado',        grupo: 'Pecho',   series: 3, reps: '12-15' },
  { id: 'p07', nombre: 'Fondos en paralelas (pecho)',       grupo: 'Pecho',   series: 3, reps: '8-12' },
  { id: 'p08', nombre: 'Press en máquina de pecho',         grupo: 'Pecho',   series: 3, reps: '10-15' },
  { id: 'p09', nombre: 'Pullover con mancuerna',            grupo: 'Pecho',   series: 3, reps: '12-15' },

  // ─── ESPALDA ─────────────────────────────────────────────────────
  { id: 'e01', nombre: 'Dominadas agarre supino',           grupo: 'Espalda', series: 4, reps: '6-10' },
  { id: 'e02', nombre: 'Dominadas agarre prono',            grupo: 'Espalda', series: 4, reps: '6-10' },
  { id: 'e03', nombre: 'Remo con barra',                    grupo: 'Espalda', series: 4, reps: '6-10' },
  { id: 'e04', nombre: 'Remo con mancuerna',                grupo: 'Espalda', series: 3, reps: '10-12' },
  { id: 'e05', nombre: 'Jalón al pecho (agarre ancho)',     grupo: 'Espalda', series: 3, reps: '10-12' },
  { id: 'e06', nombre: 'Remo en polea baja',                grupo: 'Espalda', series: 3, reps: '10-12' },
  { id: 'e07', nombre: 'Remo invertido (barra)',            grupo: 'Espalda', series: 3, reps: '10-15' },
  { id: 'e08', nombre: 'Pull-over en polea',                grupo: 'Espalda', series: 3, reps: '12-15' },
  { id: 'e09', nombre: 'Peso muerto convencional',          grupo: 'Espalda', series: 4, reps: '4-8'  },
  { id: 'e10', nombre: 'Good morning con barra',            grupo: 'Espalda', series: 3, reps: '10-12' },

  // ─── PIERNAS ─────────────────────────────────────────────────────
  { id: 'l01', nombre: 'Sentadilla trasera con barra',      grupo: 'Piernas', series: 4, reps: '5-8'  },
  { id: 'l02', nombre: 'Sentadilla frontal con barra',      grupo: 'Piernas', series: 3, reps: '6-10' },
  { id: 'l03', nombre: 'Prensa de piernas 45°',             grupo: 'Piernas', series: 4, reps: '10-15' },
  { id: 'l04', nombre: 'Extensión de cuádriceps en máquina',grupo: 'Piernas', series: 3, reps: '12-15' },
  { id: 'l05', nombre: 'Curl de isquiotibiales tumbado',    grupo: 'Piernas', series: 3, reps: '10-12' },
  { id: 'l06', nombre: 'Sentadilla hack',                   grupo: 'Piernas', series: 3, reps: '10-12' },
  { id: 'l07', nombre: 'Zancadas con mancuernas',           grupo: 'Piernas', series: 3, reps: '10-12' },
  { id: 'l08', nombre: 'Sentadilla goblet',                 grupo: 'Piernas', series: 3, reps: '12-15' },
  { id: 'l09', nombre: 'Romanian deadlift',                 grupo: 'Piernas', series: 3, reps: '8-12' },
  { id: 'l10', nombre: 'Elevación de gemelos de pie',       grupo: 'Piernas', series: 4, reps: '15-20' },
  { id: 'l11', nombre: 'Elevación de gemelos sentado',      grupo: 'Piernas', series: 3, reps: '15-20' },

  // ─── GLÚTEOS ─────────────────────────────────────────────────────
  { id: 'g01', nombre: 'Hip thrust con barra',              grupo: 'Glúteos', series: 4, reps: '8-12' },
  { id: 'g02', nombre: 'Patada de glúteo en cable',         grupo: 'Glúteos', series: 3, reps: '12-15' },
  { id: 'g03', nombre: 'Abducción de cadera en máquina',    grupo: 'Glúteos', series: 3, reps: '15-20' },
  { id: 'g04', nombre: 'Sentadilla sumo con mancuerna',     grupo: 'Glúteos', series: 3, reps: '10-15' },
  { id: 'g05', nombre: 'Bulgarian split squat',             grupo: 'Glúteos', series: 3, reps: '8-12' },
  { id: 'g06', nombre: 'Step-up con mancuernas',            grupo: 'Glúteos', series: 3, reps: '10-12' },

  // ─── HOMBROS ─────────────────────────────────────────────────────
  { id: 'h01', nombre: 'Press militar con barra de pie',    grupo: 'Hombros', series: 4, reps: '6-10' },
  { id: 'h02', nombre: 'Press con mancuernas de pie',       grupo: 'Hombros', series: 3, reps: '10-12' },
  { id: 'h03', nombre: 'Elevaciones laterales con mancuernas', grupo: 'Hombros', series: 3, reps: '12-15' },
  { id: 'h04', nombre: 'Elevaciones laterales en cable',    grupo: 'Hombros', series: 3, reps: '12-15' },
  { id: 'h05', nombre: 'Elevaciones frontales con barra',   grupo: 'Hombros', series: 3, reps: '10-12' },
  { id: 'h06', nombre: 'Pájaro / Crucifixión invertida',    grupo: 'Hombros', series: 3, reps: '12-15' },
  { id: 'h07', nombre: 'Press Arnold',                      grupo: 'Hombros', series: 3, reps: '10-12' },
  { id: 'h08', nombre: 'Face pull en polea',                grupo: 'Hombros', series: 3, reps: '15-20' },

  // ─── BÍCEPS ──────────────────────────────────────────────────────
  { id: 'b01', nombre: 'Curl con barra recta',              grupo: 'Bíceps',  series: 3, reps: '8-12' },
  { id: 'b02', nombre: 'Curl con barra EZ',                 grupo: 'Bíceps',  series: 3, reps: '10-12' },
  { id: 'b03', nombre: 'Curl con mancuernas alterno',       grupo: 'Bíceps',  series: 3, reps: '10-12' },
  { id: 'b04', nombre: 'Curl martillo',                     grupo: 'Bíceps',  series: 3, reps: '10-12' },
  { id: 'b05', nombre: 'Curl predicador (Scott)',           grupo: 'Bíceps',  series: 3, reps: '10-12' },
  { id: 'b06', nombre: 'Curl en cable polea baja',          grupo: 'Bíceps',  series: 3, reps: '12-15' },
  { id: 'b07', nombre: 'Curl concentrado',                  grupo: 'Bíceps',  series: 2, reps: '12-15' },

  // ─── TRÍCEPS ─────────────────────────────────────────────────────
  { id: 't01', nombre: 'Press francés con barra EZ',        grupo: 'Tríceps', series: 3, reps: '8-12' },
  { id: 't02', nombre: 'Extensión en polea alta (barra)',   grupo: 'Tríceps', series: 3, reps: '10-15' },
  { id: 't03', nombre: 'Pushdown con cuerda',               grupo: 'Tríceps', series: 3, reps: '12-15' },
  { id: 't04', nombre: 'Fondos tríceps en banco',           grupo: 'Tríceps', series: 3, reps: '10-15' },
  { id: 't05', nombre: 'Kickbacks con mancuerna',           grupo: 'Tríceps', series: 3, reps: '12-15' },
  { id: 't06', nombre: 'Extensión sobre la cabeza en polea',grupo: 'Tríceps', series: 3, reps: '10-12' },
  { id: 't07', nombre: 'Press cerrado en banca',            grupo: 'Tríceps', series: 3, reps: '8-12' },

  // ─── CORE ────────────────────────────────────────────────────────
  { id: 'c01', nombre: 'Plancha frontal',                   grupo: 'Core',    series: 3, reps: '30-60s' },
  { id: 'c02', nombre: 'Plancha lateral',                   grupo: 'Core',    series: 3, reps: '30-45s' },
  { id: 'c03', nombre: 'Crunch abdominal',                  grupo: 'Core',    series: 3, reps: '15-20' },
  { id: 'c04', nombre: 'Crunch inverso',                    grupo: 'Core',    series: 3, reps: '15-20' },
  { id: 'c05', nombre: 'Russian twist',                     grupo: 'Core',    series: 3, reps: '20' },
  { id: 'c06', nombre: 'Leg raise tumbado',                 grupo: 'Core',    series: 3, reps: '12-15' },
  { id: 'c07', nombre: 'Ab wheel (rueda abdominal)',        grupo: 'Core',    series: 3, reps: '8-12' },
  { id: 'c08', nombre: 'Bird dog',                          grupo: 'Core',    series: 3, reps: '10-12' },

  // ─── CARDIO ──────────────────────────────────────────────────────
  { id: 'ca1', nombre: 'Caminadora inclinada',              grupo: 'Cardio',  series: 1, reps: '20-40min' },
  { id: 'ca2', nombre: 'Bicicleta estática',                grupo: 'Cardio',  series: 1, reps: '20-30min' },
  { id: 'ca3', nombre: 'Remo ergómetro',                    grupo: 'Cardio',  series: 1, reps: '15-20min' },
  { id: 'ca4', nombre: 'Escaladora (stairmaster)',          grupo: 'Cardio',  series: 1, reps: '15-25min' },
  { id: 'ca5', nombre: 'Salto de cuerda',                   grupo: 'Cardio',  series: 5, reps: '2min' },
  { id: 'ca6', nombre: 'HIIT en bicicleta',                 grupo: 'Cardio',  series: 8, reps: '20s/10s' },
];

export const GRUPOS_MUSCULARES = ['Pecho','Espalda','Piernas','Glúteos','Hombros','Bíceps','Tríceps','Core','Cardio'] as const;
