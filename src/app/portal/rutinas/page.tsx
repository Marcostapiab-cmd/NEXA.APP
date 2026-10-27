'use client';
import { hoyLocal } from '@/lib/format';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getAtletaPortal } from '@/lib/portal';
import { ArrowLeft, ChevronDown, ChevronUp, Dumbbell, PlayCircle } from 'lucide-react';
import Link from 'next/link';

// Formato actual del editor del coach: un entrenamiento por fecha (sessions)
interface SesionEjercicio {
  id?: string;
  name?: string;
  series?: number;
  reps?: string;
  weight?: string;
  rest?: string;
  tempo?: string;
  notes?: string;
  youtubeUrl?: string;
}
interface Sesion { name?: string; exercises?: SesionEjercicio[] }

// Formato antiguo (bloques), se sigue mostrando por compatibilidad
interface Bloque {
  nombre?: string;
  name?: string;
  ejercicios?: { nombre: string; series?: number; reps?: string; peso?: string; descanso?: string; notas?: string; videoUrl?: string }[];
}

interface Dia { fecha: string; titulo: string; ejercicios: SesionEjercicio[] }

interface Rutina {
  id: string;
  nombre: string;
  startDate?: string;
  endDate?: string;
  dias: Dia[];
}

function normalizar(r: Record<string, unknown>): Rutina {
  const sessions = (r.sessions as Record<string, Sesion> | null) ?? {};
  const dias: Dia[] = Object.entries(sessions)
    .filter(([, s]) => (s?.exercises?.length ?? 0) > 0)
    .map(([fecha, s]) => ({ fecha, titulo: s.name ?? '', ejercicios: s.exercises ?? [] }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const blocks = (r.blocks as Bloque[] | null) ?? [];
  blocks.forEach((b, i) => {
    if (!b.ejercicios?.length) return;
    dias.push({
      fecha: '',
      titulo: b.nombre ?? b.name ?? `Bloque ${i + 1}`,
      ejercicios: b.ejercicios.map(e => ({
        name: e.nombre, series: e.series, reps: e.reps, weight: e.peso,
        rest: e.descanso, notes: e.notas, youtubeUrl: e.videoUrl,
      })),
    });
  });

  return {
    id:        String(r.id),
    nombre:    String(r.nombre ?? ''),
    startDate: r.start_date ? String(r.start_date) : undefined,
    endDate:   r.end_date   ? String(r.end_date)   : undefined,
    dias,
  };
}

function fechaLarga(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function PortalRutinasPage() {
  const router  = useRouter();
  const hoy     = hoyLocal();
  const [rutinas,      setRutinas]      = useState<Rutina[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [verAnteriores, setVerAnteriores] = useState(false);

  useEffect(() => {
    async function load() {
      const atleta = await getAtletaPortal();
      if (atleta === undefined) { router.push('/portal/login'); return; }
      if (!atleta) { router.push('/portal/sin-cuenta'); return; }

      const aid = atleta.id;

      const { data: rutinasData, error: err } = await supabase
        .from('rutinas')
        .select('id, nombre, start_date, end_date, sessions, blocks')
        // alumno_ids es jsonb: el filtro necesita JSON ("[...]"), no el formato {..} de arreglos
        .filter('alumno_ids', 'cs', JSON.stringify([aid]))
        .order('created_at', { ascending: false });

      if (err) { setError(true); setLoading(false); return; }

      const lista = (rutinasData ?? [])
        .map(r => normalizar(r as Record<string, unknown>))
        // Rutinas vigentes (o sin fechas) que tengan algo que mostrar
        .filter(r => r.dias.length > 0 && (!r.endDate || r.endDate >= hoy));

      setRutinas(lista);
      // Abre automáticamente el entrenamiento de hoy o el próximo
      for (const r of lista) {
        const prox = r.dias.find(d => d.fecha && d.fecha >= hoy) ?? r.dias.find(d => !d.fecha);
        if (prox) { setExpanded(`${r.id}-${prox.fecha || prox.titulo}`); break; }
      }
      setLoading(false);
    }
    load();
  }, [router, hoy]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="sticky top-0 z-10 border-b border-[#D8D8D8] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/portal" aria-label="Volver" className="rounded-lg border border-[#CACACA] p-2.5 text-[#5E5E5E] hover:text-[#121212]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="font-bold text-[#121212]">Mis rutinas</h1>
            <p className="text-xs text-[#5E5E5E]">Entrenamientos asignados por tu coach</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        {error ? (
          <div className="rounded-2xl border border-[#B44040]/20 bg-[#FAEAEA] p-5 text-center text-sm text-[#B44040]">
            No pudimos cargar tus rutinas. Revisa tu conexión y vuelve a intentar.
            <button onClick={() => window.location.reload()} className="mt-3 block w-full rounded-xl bg-[#121212] py-2.5 text-sm font-bold text-white">
              Reintentar
            </button>
          </div>
        ) : rutinas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D8D8D8] bg-white py-16 text-center">
            <Dumbbell className="mx-auto mb-3 h-8 w-8 text-[#CACACA]" />
            <p className="font-semibold text-[#5E5E5E]">Sin rutinas activas</p>
            <p className="mt-1 px-6 text-sm text-[#9B9B9B]">Tu coach aún no te ha asignado una rutina.</p>
          </div>
        ) : (
          rutinas.map(rutina => {
            const anteriores = rutina.dias.filter(d => d.fecha && d.fecha < hoy);
            const visibles   = rutina.dias.filter(d => !d.fecha || d.fecha >= hoy || verAnteriores);
            return (
              <div key={rutina.id} className="overflow-hidden rounded-2xl border border-[#D8D8D8] bg-white">
                <div className="p-5">
                  <h2 className="break-words font-bold text-[#121212]">{rutina.nombre || 'Mi programa'}</h2>
                  {rutina.startDate && rutina.endDate && (
                    <p className="mt-0.5 text-xs text-[#5E5E5E]">
                      {new Date(rutina.startDate + 'T12:00:00').toLocaleDateString('es-CL')} →{' '}
                      {new Date(rutina.endDate   + 'T12:00:00').toLocaleDateString('es-CL')}
                    </p>
                  )}
                  {anteriores.length > 0 && (
                    <button onClick={() => setVerAnteriores(v => !v)}
                      className="mt-2 text-xs font-semibold text-[#5E5E5E] underline">
                      {verAnteriores ? 'Ocultar días anteriores' : `Ver ${anteriores.length} día${anteriores.length !== 1 ? 's' : ''} anterior${anteriores.length !== 1 ? 'es' : ''}`}
                    </button>
                  )}
                </div>

                <div className="border-t border-[#EBEBEB]">
                  {visibles.length === 0 && (
                    <p className="px-5 py-6 text-center text-sm text-[#9B9B9B]">No hay entrenamientos próximos.</p>
                  )}
                  {visibles.map(dia => {
                    const key  = `${rutina.id}-${dia.fecha || dia.titulo}`;
                    const open = expanded === key;
                    const esHoy = dia.fecha === hoy;
                    return (
                      <div key={key} className="border-b border-[#EBEBEB] last:border-b-0">
                        <button
                          onClick={() => setExpanded(open ? null : key)}
                          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition active:bg-[#F8F8F8]"
                        >
                          <div className="min-w-0">
                            {dia.fecha && (
                              <p className={`text-[11px] font-bold uppercase tracking-[0.1em] ${esHoy ? 'text-[#121212]' : 'text-[#9B9B9B]'}`}>
                                {esHoy ? 'Hoy · ' : ''}{fechaLarga(dia.fecha)}
                              </p>
                            )}
                            <p className="break-words font-semibold text-[#121212]">{dia.titulo || 'Entrenamiento'}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-[#9B9B9B]">{dia.ejercicios.length} ej.</span>
                            {open ? <ChevronUp className="h-4 w-4 text-[#5E5E5E]" /> : <ChevronDown className="h-4 w-4 text-[#5E5E5E]" />}
                          </div>
                        </button>

                        {open && (
                          <div className="space-y-3 bg-[#F8F8F8] px-4 pb-4 pt-1 sm:px-5">
                            {dia.ejercicios.map((ej, ei) => (
                              <div key={ej.id ?? ei} className="rounded-xl border border-[#E0E0E0] bg-white p-4">
                                <p className="break-words font-semibold text-[#121212]">
                                  <span className="mr-1.5 font-mono text-xs text-[#9B9B9B]">{ei + 1}.</span>
                                  {ej.name}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {ej.series ? <Chip>{ej.series} series</Chip> : null}
                                  {ej.reps && <Chip>{ej.reps} reps</Chip>}
                                  {ej.weight && <Chip>{ej.weight} kg</Chip>}
                                  {ej.rest && <Chip>Descanso {ej.rest}</Chip>}
                                  {ej.tempo && <Chip>Tempo {ej.tempo}</Chip>}
                                </div>
                                {ej.notes && (
                                  <p className="mt-2 break-words text-xs italic text-[#5E5E5E]">{ej.notes}</p>
                                )}
                                {ej.youtubeUrl && (
                                  <a href={ej.youtubeUrl} target="_blank" rel="noopener noreferrer"
                                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#D8D8D8] py-2.5 text-sm font-semibold text-[#121212] active:bg-[#F0F0F0]">
                                    <PlayCircle className="h-4 w-4" /> Ver video
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
            );
          })
        )}
      </main>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[#EBEBEB] bg-[#F5F5F5] px-2.5 py-0.5 text-xs text-[#5E5E5E]">
      {children}
    </span>
  );
}
