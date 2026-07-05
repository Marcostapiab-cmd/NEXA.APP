export type Exercise = {
  id: number;
  name: string;
  details: string;
  muscle: string;
};

export type Routine = {
  id: number;
  programId: string;
  title: string;
  description: string;
  exercises: Exercise[];
};

export type Athlete = {
  id: string;
  profileId: string;
  email: string;
  name: string;
  age: number;
  goal: string;
  experience: string;
  note?: string;
};

export const routines: Routine[] = [
  {
    id: 1,
    programId: 'a5c9f2d0-2b45-4f4c-bc41-33f9eaf4986d',
    title: 'Fuerza de tren superior',
    description: 'Rutina enfocada en pecho, hombros y brazos.',
    exercises: [
      { id: 101, name: 'Flexiones', details: '3 series x 12 repeticiones', muscle: 'Pecho' },
      { id: 102, name: 'Fondos en paralelas', details: '3 series x 10 repeticiones', muscle: 'Tríceps' },
      { id: 103, name: 'Remo con mancuernas', details: '3 series x 12 repeticiones', muscle: 'Espalda' },
    ],
  },
  {
    id: 2,
    programId: 'dbf2d2d7-0db4-4d2e-9d6b-75e762b9c6ed',
    title: 'Piernas y core',
    description: 'Rutina para piernas, glúteos y abdomen.',
    exercises: [
      { id: 201, name: 'Sentadillas', details: '3 series x 15 repeticiones', muscle: 'Piernas' },
      { id: 202, name: 'Zancadas', details: '3 series x 12 repeticiones por pierna', muscle: 'Glúteos' },
      { id: 203, name: 'Plancha', details: '3 series x 45 segundos', muscle: 'Core' },
    ],
  },
  {
    id: 3,
    programId: '7f8ea1c3-1f1d-4b2d-a657-1cc75f4e9faa',
    title: 'Cardio rápido',
    description: 'Circuito para aumentar ritmo cardiaco y quemar calorías.',
    exercises: [
      { id: 301, name: 'Jumping jacks', details: '4 series x 30 segundos', muscle: 'Cardio' },
      { id: 302, name: 'Burpees', details: '3 series x 10 repeticiones', muscle: 'Cardio' },
      { id: 303, name: 'Mountain climbers', details: '4 series x 20 segundos', muscle: 'Cardio' },
    ],
  },
];

export const athletes: Athlete[] = [
  {
    id: '9d2f6d4f-0f3d-4d2d-8f5c-1b7a0d9c0612',
    profileId: '87c675a6-3f01-4c38-92c3-df4edad0f6ef',
    email: 'laura.martinez@nexa.com',
    name: 'Laura Martínez',
    age: 28,
    goal: 'Ganar fuerza y definir',
    experience: 'Intermedio',
    note: 'Prefiere rutinas con poco salto',
  },
  {
    id: 'eb7a1311-d2f5-45be-925b-9f3dba2e7194',
    profileId: 'b9d29ec0-1a4b-4c8e-b0a3-689f05cf7b17',
    email: 'carlos.sanchez@nexa.com',
    name: 'Carlos Sánchez',
    age: 34,
    goal: 'Mejorar resistencia',
    experience: 'Principiante',
    note: 'Necesita ejercicios suaves para rodillas',
  },
  {
    id: 'b2354c57-5848-4a1a-8c6c-703004b7a2f8',
    profileId: 'f56c1a72-4a4b-4fb5-8f94-7aa957c0f2fa',
    email: 'mariana.lopez@nexa.com',
    name: 'Mariana López',
    age: 22,
    goal: 'Tonificar piernas',
    experience: 'Intermedio',
    note: 'Entrena 4 días por semana',
  },
  {
    id: 'c7d8f888-6de2-4a62-9c80-2fabe0e5b7b5',
    profileId: 'd94a0db6-3f18-4d8a-9db5-c6dd0c0bb9f1',
    email: 'david.ortega@nexa.com',
    name: 'David Ortega',
    age: 30,
    goal: 'Perder grasa corporal',
    experience: 'Intermedio',
    note: 'Le gusta el cardio en circuito',
  },
];

export const progressSummary = {
  totalSessions: 0,
  completedSessions: 0,
  consistency: '0%',
  caloriesBurned: 0,
  personalBest: '—',
};
