'use client';

import { useMemo, useState } from 'react';
import { athletes, routines } from '@/lib/mockData';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';

export default function EntrenamientoPage() {
  const [activeRoutineId, setActiveRoutineId] = useState(routines[0].id);
  const [selectedAthleteId, setSelectedAthleteId] = useState(athletes[0]?.id ?? '');
  const [completedExerciseIds, setCompletedExerciseIds] = useState<number[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignmentStatus, setAssignmentStatus] = useState('');
  const [assignmentError, setAssignmentError] = useState('');

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? athletes[0],
    [selectedAthleteId],
  );

  const activeRoutine = useMemo(
    () => routines.find((routine) => routine.id === activeRoutineId) ?? routines[0],
    [activeRoutineId],
  );

  const toggleExercise = (exerciseId: number) => {
    setCompletedExerciseIds((current) =>
      current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [...current, exerciseId],
    );
  };

  async function handleAssignRoutine() {
    if (!isSupabaseConfigured) {
      setAssignmentError('Supabase no está configurado correctamente en .env.local.');
      return;
    }

    setAssigning(true);
    setAssignmentStatus('');
    setAssignmentError('');

    const program = {
      id: activeRoutine.programId,
      title: activeRoutine.title,
      description: activeRoutine.description,
      level: 'Intermedio',
      duration_weeks: 4,
    };

    const profile = {
      id: selectedAthlete.profileId,
      email: selectedAthlete.email,
      full_name: selectedAthlete.name,
    };

    const athlete = {
      id: selectedAthlete.id,
      profile_id: selectedAthlete.profileId,
      fitness_goal: selectedAthlete.goal,
      experience_level: selectedAthlete.experience,
    };

    const startDate = new Date().toISOString().slice(0, 10);

    const { error: profileError } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' });
    if (profileError) {
      setAssignmentError('Error al crear el perfil del alumno.');
      setAssigning(false);
      return;
    }

    const { error: athleteError } = await supabase.from('athletes').upsert(athlete, { onConflict: 'id' });
    if (athleteError) {
      setAssignmentError('Error al guardar el alumno en Supabase.');
      setAssigning(false);
      return;
    }

    const { error: programError } = await supabase.from('programs').upsert(program, { onConflict: 'id' });
    if (programError) {
      setAssignmentError('Error al guardar la rutina en Supabase.');
      setAssigning(false);
      return;
    }

    const { error: assignError } = await supabase.from('athlete_programs').insert({
      athlete_id: selectedAthlete.id,
      program_id: activeRoutine.programId,
      start_date: startDate,
      status: 'active',
      progress_percent: 0,
    });

    if (assignError) {
      setAssignmentError('Error al asignar la rutina.');
      setAssigning(false);
      return;
    }

    setAssignmentStatus(`Rutina asignada a ${selectedAthlete.name} correctamente.`);
    setAssigning(false);
  }

  const completedCount = activeRoutine.exercises.filter((exercise) => completedExerciseIds.includes(exercise.id)).length;

  return (
    <main className="mx-auto min-h-[calc(100vh-96px)] max-w-6xl px-4 py-8 sm:px-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Entrenamiento</h1>
            <p className="mt-2 text-slate-600">Marca cada ejercicio a medida que lo completas.</p>
            <div className="mt-6 rounded-3xl bg-slate-100 p-4 text-slate-700">
              <p className="text-sm">Atleta seleccionado</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{selectedAthlete?.name}</p>
              <p className="text-sm text-slate-500">Meta: {selectedAthlete?.goal}</p>
              <p className="text-sm text-slate-500">Experiencia: {selectedAthlete?.experience}</p>
            </div>
          </div>
          <div className="space-y-2 rounded-3xl bg-slate-100 p-4 text-slate-700">
            <p className="text-sm">Rutina seleccionada:</p>
            <p className="text-xl font-semibold text-slate-900">{activeRoutine.title}</p>
            <p>{completedCount} / {activeRoutine.exercises.length} ejercicios completados</p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Seleccionar atleta</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-700">Alumno</label>
            <select
              value={selectedAthleteId}
              onChange={(event) => setSelectedAthleteId(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
            >
              {athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-8 rounded-3xl bg-slate-100 p-4 text-slate-700">
            <h3 className="text-sm font-semibold text-slate-900">Detalles</h3>
            <p className="mt-2 text-sm">Edad: {selectedAthlete?.age}</p>
            <p className="mt-1 text-sm">Objetivo: {selectedAthlete?.goal}</p>
            <p className="mt-1 text-sm">Experiencia: {selectedAthlete?.experience}</p>
            {selectedAthlete?.note ? (
              <p className="mt-1 text-sm text-slate-500">Nota: {selectedAthlete.note}</p>
            ) : null}
          </div>

          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Rutina asignada</p>
            <p className="mt-2">{activeRoutine.title}</p>
          </div>

          <button
            type="button"
            onClick={handleAssignRoutine}
            disabled={assigning}
            className="mt-4 w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {assigning ? 'Guardando asignación...' : 'Guardar asignación en Supabase'}
          </button>

          {assignmentStatus ? (
            <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{assignmentStatus}</p>
          ) : null}
          {assignmentError ? (
            <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{assignmentError}</p>
          ) : null}
        </aside>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">Ejercicios</h2>
          <div className="mt-6 space-y-4">
            {activeRoutine.exercises.map((exercise) => {
              const isDone = completedExerciseIds.includes(exercise.id);
              return (
                <div
                  key={exercise.id}
                  className="flex flex-col gap-4 rounded-3xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{exercise.name}</p>
                    <p className="mt-1 text-slate-600">{exercise.details}</p>
                    <p className="mt-2 text-sm text-slate-500">Músculo: {exercise.muscle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleExercise(exercise.id)}
                    className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
                      isDone
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-slate-900 text-white hover:bg-slate-700'
                    }`}
                  >
                    {isDone ? 'Completado' : 'Marcar hecho'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
