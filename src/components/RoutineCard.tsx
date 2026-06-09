import type { Routine } from '@/lib/mockData';
import Link from 'next/link';

export default function RoutineCard({ routine }: { routine: Routine }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{routine.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{routine.description}</p>
        </div>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
          {routine.exercises.length} ejercicios
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {routine.exercises.slice(0, 3).map((exercise) => (
          <span
            key={exercise.id}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
          >
            {exercise.name}
          </span>
        ))}
      </div>
      <Link
        href="/entrenamiento"
        className="mt-6 inline-flex rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Comenzar rutina
      </Link>
    </article>
  );
}
