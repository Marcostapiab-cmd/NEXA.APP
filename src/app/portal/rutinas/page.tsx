'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ArrowLeft, ChevronDown, ChevronUp, Dumbbell } from 'lucide-react';
import Link from 'next/link';

interface Bloque {
  id?: string;
  nombre?: string;
  name?: string;
  ejercicios?: Ejercicio[];
}

interface Ejercicio {
  id?: string;
  nombre: string;
  series?: number;
  reps?: string;
  peso?: string;
  descanso?: string;
  notas?: string;
  videoUrl?: string;
}

interface Rutina {
  id: string;
  nombre: string;
  startDate?: string;
  endDate?: string;
  blocks: Bloque[];
}

export default function PortalRutinasPage() {
  const router  = useRouter();
  const [rutinas,  setRutinas]  = useState<Rutina[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/portal/login'); return; }

      const { data: atletaData } = await supabase
        .from('atletas')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!atletaData) { router.push('/portal/sin-cuenta'); return; }

      const aid = (atletaData as { id: string }).id;
      const hoy = new Date().toISOString().slice(0, 10);

      // Rutinas donde el alumno_ids contiene el id del atleta y están activas
      const { data: rutinasData } = await supabase
        .from('rutinas')
        .select('id, nombre, start_date, end_date, blocks')
        .contains('alumno_ids', [aid])
        .lte('start_date', hoy)
        .gte('end_date', hoy)
        .order('start_date', { ascending: false });

      setRutinas((rutinasData ?? []).map((r: Record<string, unknown>) => ({
        id:        String(r.id),
        nombre:    String(r.nombre ?? ''),
        startDate: r.start_date ? String(r.start_date) : undefined,
        endDate:   r.end_date   ? String(r.end_date)   : undefined,
        blocks:    (r.blocks as Bloque[]) ?? [],
      })));
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="border-b border-[#D8D8D8] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/portal" className="rounded-lg border border-[#CACACA] p-2 text-[#5E5E5E] hover:text-[#121212]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-bold text-[#121212]">Mis rutinas</h1>
            <p className="text-xs text-[#5E5E5E]">Rutinas activas asignadas por tu coach</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
        {rutinas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D8D8D8] bg-white py-16 text-center">
            <Dumbbell className="mx-auto mb-3 h-8 w-8 text-[#CACACA]" />
            <p className="font-semibold text-[#5E5E5E]">Sin rutinas activas</p>
            <p className="mt-1 text-sm text-[#9B9B9B]">Tu coach aún no te ha asignado una rutina.</p>
          </div>
        ) : (
          rutinas.map(rutina => (
            <div key={rutina.id} className="overflow-hidden rounded-2xl border border-[#D8D8D8] bg-white">
              <div className="p-5">
                <h2 className="font-bold text-[#121212]">{rutina.nombre}</h2>
                {rutina.startDate && rutina.endDate && (
                  <p className="mt-0.5 text-xs text-[#5E5E5E]">
                    {new Date(rutina.startDate + 'T12:00:00').toLocaleDateString('es-CL')} →{' '}
                    {new Date(rutina.endDate   + 'T12:00:00').toLocaleDateString('es-CL')}
                  </p>
                )}
              </div>

              <div className="border-t border-[#EBEBEB]">
                {rutina.blocks.map((bloque, bi) => {
                  const key  = `${rutina.id}-${bi}`;
                  const open = expanded === key;
                  const nombreBloque = bloque.nombre ?? bloque.name ?? `Bloque ${bi + 1}`;
                  return (
                    <div key={key} className="border-b border-[#EBEBEB] last:border-b-0">
                      <button
                        onClick={() => setExpanded(open ? null : key)}
                        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-[#F8F8F8]"
                      >
                        <span className="font-semibold text-[#121212]">{nombreBloque}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#9B9B9B]">{bloque.ejercicios?.length ?? 0} ejercicios</span>
                          {open ? <ChevronUp className="h-4 w-4 text-[#5E5E5E]" /> : <ChevronDown className="h-4 w-4 text-[#5E5E5E]" />}
                        </div>
                      </button>

                      {open && bloque.ejercicios && bloque.ejercicios.length > 0 && (
                        <div className="space-y-3 bg-[#F8F8F8] px-5 pb-4">
                          {bloque.ejercicios.map((ej, ei) => (
                            <div key={ei} className="rounded-xl border border-[#E0E0E0] bg-white p-4">
                              <p className="font-semibold text-[#121212]">{ej.nombre}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {ej.series && (
                                  <span className="rounded-full border border-[#EBEBEB] bg-[#F5F5F5] px-2.5 py-0.5 text-xs text-[#5E5E5E]">
                                    {ej.series} series
                                  </span>
                                )}
                                {ej.reps && (
                                  <span className="rounded-full border border-[#EBEBEB] bg-[#F5F5F5] px-2.5 py-0.5 text-xs text-[#5E5E5E]">
                                    {ej.reps} reps
                                  </span>
                                )}
                                {ej.peso && (
                                  <span className="rounded-full border border-[#EBEBEB] bg-[#F5F5F5] px-2.5 py-0.5 text-xs text-[#5E5E5E]">
                                    {ej.peso} kg
                                  </span>
                                )}
                                {ej.descanso && (
                                  <span className="rounded-full border border-[#EBEBEB] bg-[#F5F5F5] px-2.5 py-0.5 text-xs text-[#5E5E5E]">
                                    {ej.descanso}s descanso
                                  </span>
                                )}
                                {!ej.series && !ej.reps && !ej.peso && !ej.descanso && (
                                  <span className="text-xs italic text-[#9B9B9B]">Sin detalles — consulta a tu coach</span>
                                )}
                              </div>
                              {ej.notas && (
                                <p className="mt-2 text-xs italic text-[#9B9B9B]">{ej.notas}</p>
                              )}
                              {ej.videoUrl && (
                                <a href={ej.videoUrl} target="_blank" rel="noreferrer"
                                  className="mt-2 inline-block text-xs font-semibold text-[#121212] underline">
                                  Ver video →
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
