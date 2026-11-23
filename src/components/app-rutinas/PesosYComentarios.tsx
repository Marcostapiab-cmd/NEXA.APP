'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Dumbbell } from 'lucide-react';
import { comentariosCoach, registrosDeAlumno, type ComentarioConAlumno, type RegistroGuardado } from '@/lib/app-rutinas-datos';
import ComentarioCoach from './ComentarioCoach';

const fecha = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Ficha del alumno: lo que anotó en la app de rutinas y sus comentarios. */
export default function PesosYComentarios({ atletaId }: { atletaId: string }) {
  const [regs, setRegs] = useState<RegistroGuardado[] | null>(null);
  const [coms, setComs] = useState<ComentarioConAlumno[]>([]);
  const [error, setError] = useState(false);
  const [verTodo, setVerTodo] = useState(false);

  const cargar = useCallback(() => Promise.all([registrosDeAlumno(atletaId), comentariosCoach({ atletaId })])
    .then(([r, c]) => { setRegs(r); setComs(c); setError(false); })
    .catch(() => setError(true)), [atletaId]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Agrupado por fecha y ejercicio: "Sentadilla: 40×10 · 45×8"
  const porFecha = useMemo(() => {
    const m = new Map<string, Map<string, RegistroGuardado[]>>();
    for (const r of regs ?? []) {
      if (!m.has(r.fecha)) m.set(r.fecha, new Map());
      const e = m.get(r.fecha)!;
      if (!e.has(r.ejercicio_nombre)) e.set(r.ejercicio_nombre, []);
      e.get(r.ejercicio_nombre)!.push(r);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [regs]);
  const sinLeer = coms.filter(c => !c.leido_at).length;
  const SL = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5E5E5E]';

  return (
    <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-5">
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle className="h-3.5 w-3.5 text-[#5E5E5E]" />
        <p className={SL}>Comentarios de la app de rutinas</p>
        {sinLeer > 0 && <span className="rounded-full bg-[#B44040] px-2 py-0.5 text-[11px] font-bold text-white">{sinLeer} sin leer</span>}
      </div>
      {error && <p className="mb-3 text-sm text-[#B44040]">No se pudieron cargar los datos de la app. ¿Está aplicada la migración 055?</p>}
      {coms.length === 0
        ? <p className="mb-4 text-sm text-[#5E5E5E]">Sin comentarios.</p>
        : <ul className="mb-5 space-y-2">{coms.map(c => <ComentarioCoach key={c.id} c={c} onCambio={cargar} />)}</ul>}

      <div className="mb-3 flex items-center gap-2">
        <Dumbbell className="h-3.5 w-3.5 text-[#5E5E5E]" />
        <p className={SL}>Pesos anotados por el alumno</p>
      </div>
      {regs === null && !error ? <p className="text-sm text-[#5E5E5E]">Cargando…</p>
        : porFecha.length === 0 ? <p className="text-sm text-[#5E5E5E]">Todavía no anota pesos en la app.</p>
        : (
          <div className="space-y-3">
            {(verTodo ? porFecha : porFecha.slice(0, 5)).map(([f, ejercicios]) => (
              <div key={f} className="rounded-[8px] border border-[#CACACA] bg-[#E4E4E4] p-3">
                <p className="mb-1 text-xs font-semibold capitalize text-[#3E3E3E]">{fecha(f)}</p>
                {[...ejercicios.entries()].map(([nombre, series]) => (
                  <p key={nombre} className="text-sm text-[#121212]">
                    <b>{nombre}:</b>{' '}
                    {series.sort((a, b) => a.serie - b.serie).map(s => `${s.peso_kg ?? '–'} kg × ${s.reps ?? '–'}`).join(' · ')}
                  </p>
                ))}
              </div>
            ))}
            {porFecha.length > 5 && (
              <button onClick={() => setVerTodo(v => !v)} className="text-xs text-[#3E3E3E] underline">
                {verTodo ? 'Ver menos' : `Ver los ${porFecha.length} días`}
              </button>
            )}
          </div>
        )}
    </div>
  );
}
