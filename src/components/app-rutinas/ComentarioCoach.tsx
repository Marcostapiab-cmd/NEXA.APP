'use client';

import { useState } from 'react';
import Link from 'next/link';
import { marcarLeido, responderComentario, type ComentarioConAlumno } from '@/lib/app-rutinas-datos';

const cuando = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
const dia = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Un comentario de un alumno, con "marcar como leído" y "responder" (coach/admin). */
export default function ComentarioCoach({ c, conAlumno, enlaceFicha, onCambio }: {
  c: ComentarioConAlumno; conAlumno?: boolean; enlaceFicha?: boolean; onCambio: () => void;
}) {
  const [respuesta, setRespuesta] = useState(c.respuesta ?? '');
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function hacer(f: () => Promise<void>) {
    setGuardando(true); setError('');
    try { await f(); setAbierto(false); onCambio(); }
    catch { setError('No se pudo guardar.'); }
    finally { setGuardando(false); }
  }

  return (
    <li className={`rounded-[8px] border p-3 ${c.leido_at ? 'border-[#CACACA] bg-[#E4E4E4]' : 'border-[#121212] bg-white'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-[#121212]">
          {conAlumno && (enlaceFicha
            ? <Link href={`/alumnos/${c.atleta_id}`} className="underline underline-offset-2">{c.alumno}</Link>
            : c.alumno)}
          {conAlumno && ' · '}{c.ejercicio_nombre}
        </p>
        <p className="text-xs text-[#5E5E5E]">{cuando(c.created_at)} · rutina del {dia(c.dia)}</p>
      </div>
      <p className="mt-1 text-sm text-[#121212]">{c.texto}</p>
      {c.respuesta && !abierto && <p className="mt-2 rounded-md bg-[#F0F0F0] px-3 py-2 text-sm text-[#3E3E3E]"><b>Tu respuesta:</b> {c.respuesta}</p>}
      {abierto && (
        <div className="mt-2 space-y-2">
          <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)} maxLength={1000} rows={3} autoFocus
            placeholder="Escribe tu respuesta…" className="w-full rounded-md border border-[#CACACA] bg-white p-2 text-sm text-[#121212] outline-none focus:border-[#121212]" />
          <div className="flex gap-2">
            <button disabled={guardando || !respuesta.trim()} onClick={() => hacer(() => responderComentario(c.id, respuesta))}
              className="rounded-md bg-[#121212] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">{guardando ? 'Enviando…' : 'Enviar respuesta'}</button>
            <button onClick={() => setAbierto(false)} className="rounded-md px-3 py-1.5 text-xs text-[#5E5E5E]">Cancelar</button>
          </div>
        </div>
      )}
      {!abierto && (
        <div className="mt-2 flex flex-wrap gap-2">
          {!c.leido_at && (
            <button disabled={guardando} onClick={() => hacer(() => marcarLeido(c.id))}
              className="rounded-md border border-[#CACACA] bg-white px-3 py-1.5 text-xs font-semibold text-[#121212]">Marcar como leído</button>
          )}
          <button onClick={() => setAbierto(true)} className="rounded-md bg-[#121212] px-3 py-1.5 text-xs font-semibold text-white">
            {c.respuesta ? 'Editar respuesta' : 'Responder'}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-[#B44040]">{error}</p>}
    </li>
  );
}
