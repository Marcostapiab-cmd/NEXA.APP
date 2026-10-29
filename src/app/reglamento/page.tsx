'use client';

// Reglamento y condiciones (público). Muestra la versión publicada y permite
// consultar las anteriores. El admin ve además el borrador y puede publicarlo.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import Markdown from '@/components/Markdown';

interface Version { version: number; titulo: string; contenido: string; estado: string; publicado_at: string | null }

const fecha = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' }) : '';

export default function ReglamentoPage() {
  const [versiones, setVersiones] = useState<Version[]>([]);
  const [elegida, setElegida]     = useState<number | null>(null);
  const [rol, setRol]             = useState<string | null>(null);
  const [cargando, setCargando]   = useState(true);
  const [mensaje, setMensaje]     = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data }, { data: r }] = await Promise.all([
      supabase.from('reglamentos').select('version, titulo, contenido, estado, publicado_at').order('version', { ascending: false }),
      supabase.rpc('get_my_role'),
    ]);
    const vs = (data ?? []) as Version[];
    setVersiones(vs);
    setRol((r as string | null) ?? null);
    setElegida(v => v ?? (vs.find(x => x.estado === 'publicado') ?? vs[0])?.version ?? null);
    setCargando(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(cargar); }, [cargar]);

  async function publicar(version: number) {
    if (!confirm(`¿Publicar la versión ${version}? Desde ese momento los alumnos deberán aceptarla para contratar o renovar, y ya no se podrá editar.`)) return;
    const { data, error } = await supabase.rpc('staff_publicar_reglamento', { p_version: version });
    setMensaje(error || !data?.ok ? `No se pudo publicar (${error?.message ?? data?.error})` : 'Reglamento publicado.');
    await cargar();
  }

  const v = versiones.find(x => x.version === elegida);
  const esAdmin = rol === 'admin' || rol === 'host';

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="border-b border-[#D8D8D8] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/portal" className="rounded-lg border border-[#CACACA] p-2 text-[#5E5E5E] hover:text-[#121212]" aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] text-[#5E5E5E]">NEXA PERFORMANCE</p>
            <h1 className="font-bold text-[#121212]">Reglamento y condiciones</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        {cargando ? (
          <div className="h-64 animate-pulse rounded-2xl bg-white" />
        ) : !v ? (
          <div className="rounded-2xl border border-[#D8D8D8] bg-white p-6 text-sm text-[#5E5E5E]">El reglamento se publicará pronto.</div>
        ) : (
          <>
            {versiones.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {versiones.map(x => (
                  <button key={x.version} onClick={() => setElegida(x.version)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${x.version === elegida ? 'bg-[#121212] text-white' : 'border border-[#D8D8D8] bg-white text-[#5E5E5E]'}`}>
                    Versión {x.version}{x.estado === 'publicado' ? ' · vigente' : x.estado === 'borrador' ? ' · borrador' : ''}
                  </button>
                ))}
              </div>
            )}
            {v.estado === 'borrador' && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">Borrador — solo lo ve la administración.</p>
                <p className="mt-1">Revísalo (idealmente con un asesor legal, sobre todo el punto 15) antes de publicarlo. Una vez publicado no se puede editar: los cambios se hacen en una versión nueva.</p>
                {esAdmin && (
                  <button onClick={() => publicar(v.version)} className="mt-3 rounded-lg bg-[#121212] px-4 py-2 text-xs font-bold text-white">
                    Publicar versión {v.version}
                  </button>
                )}
              </div>
            )}
            {mensaje && <p className="mb-3 text-sm text-[#5E5E5E]">{mensaje}</p>}
            <article className="rounded-2xl border border-[#D8D8D8] bg-white p-5 text-[15px] text-[#121212] sm:p-8">
              <h2 className="text-xl font-black">{v.titulo}</h2>
              <p className="mt-1 text-xs text-[#5E5E5E]">
                Versión {v.version}{v.publicado_at ? ` · vigente desde el ${fecha(v.publicado_at)}` : ''}
                {v.estado === 'reemplazado' ? ' · reemplazada por una versión posterior' : ''}
              </p>
              <Markdown texto={v.contenido} className="mt-2" />
            </article>
          </>
        )}
      </main>
    </div>
  );
}
