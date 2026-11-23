'use client';

import { useCallback, useEffect, useState } from 'react';
import { comentariosCoach, type ComentarioConAlumno } from '@/lib/app-rutinas-datos';
import { rolActual } from '@/lib/rol-cliente';
import ComentarioCoach from '@/components/app-rutinas/ComentarioCoach';

// Comentarios que los alumnos dejan en la app de rutinas (coach y admin).
export default function ComentariosPage() {
  const [soloSinLeer, setSoloSinLeer] = useState(true);
  const [lista, setLista] = useState<ComentarioConAlumno[] | null>(null);
  const [error, setError] = useState(false);
  const [puedeVerFicha, setPuedeVerFicha] = useState(false);

  const cargar = useCallback(() => comentariosCoach({ soloSinLeer })
    .then(l => { setLista(l); setError(false); window.dispatchEvent(new Event('nexa:comentarios')); })
    .catch(() => setError(true)), [soloSinLeer]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => { rolActual().then(r => setPuedeVerFicha(r === 'admin' || r === 'host')).catch(() => {}); }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="text-[20px] font-bold tracking-tight text-[#121212]">Comentarios de alumnos</h1>
      <p className="mt-1 text-[13px] text-[#5E5E5E]">Lo que tus alumnos te escriben desde la app de rutinas sobre cada ejercicio.</p>
      <div className="my-5 flex w-fit gap-1 rounded-xl border border-[#CACACA] bg-[#F0F0F0] p-1">
        {[true, false].map(v => (
          <button key={String(v)} onClick={() => setSoloSinLeer(v)} aria-pressed={soloSinLeer === v}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={soloSinLeer === v ? { background: '#121212', color: '#FFFFFF' } : { color: '#5E5E5E' }}>
            {v ? 'Sin leer' : 'Todos'}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-[#B44040]">No se pudieron cargar los comentarios.</p>}
      {!error && lista === null && <p className="text-sm text-[#5E5E5E]">Cargando…</p>}
      {lista?.length === 0 && <p className="text-sm text-[#5E5E5E]">{soloSinLeer ? 'No hay comentarios sin leer.' : 'Todavía no hay comentarios.'}</p>}
      {!!lista?.length && (
        <ul className="space-y-2">
          {lista.map(c => <ComentarioCoach key={c.id} c={c} conAlumno enlaceFicha={puedeVerFicha} onCambio={cargar} />)}
        </ul>
      )}
    </div>
  );
}
