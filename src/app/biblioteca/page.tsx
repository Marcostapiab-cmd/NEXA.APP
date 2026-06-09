'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { BIBLIOTECA_EJERCICIOS, GRUPOS_MUSCULARES } from '@/lib/ejercicios';

const SL = 'text-xs font-medium uppercase tracking-[0.1em] text-[#888888]';

export default function BibliotecaPage() {
  const [busqueda, setBusqueda] = useState('');
  const [grupo, setGrupo]       = useState<string>('Todos');

  const filtrados = BIBLIOTECA_EJERCICIOS.filter(e => {
    const matchGrupo  = grupo === 'Todos' || e.grupo === grupo;
    const matchSearch = e.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchGrupo && matchSearch;
  });

  const porGrupo = GRUPOS_MUSCULARES.reduce<Record<string, typeof filtrados>>((acc, g) => {
    acc[g] = filtrados.filter(e => e.grupo === g);
    return acc;
  }, {} as Record<string, typeof filtrados>);

  return (
    <main className="mx-auto min-h-[calc(100vh-57px)] max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white">Biblioteca de ejercicios</h1>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">
          {BIBLIOTECA_EJERCICIOS.length} ejercicios precargados
        </p>
      </div>

      {/* Search + filter */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#444444]" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar ejercicio..."
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-3 pl-10 pr-4 text-sm text-white placeholder-[#444444] outline-none transition focus:border-[#444444]" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['Todos', ...GRUPOS_MUSCULARES].map(g => (
            <button key={g} onClick={() => setGrupo(g)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                grupo === g
                  ? 'border-white bg-white text-black'
                  : 'border-[#2a2a2a] text-[#888888] hover:border-[#444444] hover:text-white'
              }`}>
              {g}
            </button>
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#2a2a2a] py-20 text-center">
          <p className="text-sm text-[#888888]">No se encontraron ejercicios.</p>
        </div>
      ) : grupo !== 'Todos' ? (
        /* Single group view */
        <ExerciseGrid exercises={filtrados} />
      ) : (
        /* All groups */
        <div className="space-y-8">
          {GRUPOS_MUSCULARES.map(g => {
            const exs = porGrupo[g];
            if (!exs.length) return null;
            return (
              <div key={g}>
                <div className="mb-3 flex items-baseline gap-3">
                  <h2 className="font-semibold text-white">{g}</h2>
                  <span className="text-xs text-[#888888]">{exs.length} ejercicios</span>
                </div>
                <ExerciseGrid exercises={exs} />
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function ExerciseGrid({ exercises }: { exercises: typeof BIBLIOTECA_EJERCICIOS }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {exercises.map(e => (
        <div key={e.id}
          className="flex flex-col gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 transition hover:border-[#333333]">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-white leading-snug">{e.nombre}</p>
            <span className="shrink-0 rounded-md border border-[#2a2a2a] bg-[#111111] px-2 py-0.5 text-xs text-[#888888]">
              {e.grupo}
            </span>
          </div>
          {(e.series || e.reps) && (
            <div className="flex gap-2">
              {e.series && (
                <span className="rounded-md bg-[#111111] px-2 py-1 text-xs text-[#888888]">
                  {e.series} series
                </span>
              )}
              {e.reps && (
                <span className="rounded-md bg-[#111111] px-2 py-1 text-xs text-[#888888]">
                  {e.reps} reps
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
