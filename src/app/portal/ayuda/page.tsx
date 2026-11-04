'use client';

// Centro de Ayuda de MI NEXA: respuestas con los datos reales del alumno y, si
// no basta, una consulta que llega a "Requiere mi atención" del staff.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Search, ChevronDown, CheckCircle2, AlertCircle, Info, MessageCircle, Send, Clock, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getAtletaPortal } from '@/lib/portal';
import { getMisClases, getPoliticaAlumno, type ClaseAlumno } from '@/lib/reservas-alumno';
import { POLITICA_DEFAULT } from '@/lib/politica-cancelacion';
import {
  armarRespuestas, buscarRespuestas, fechaLarga, TEMAS_AYUDA,
  type DatosAyuda, type PlanAyuda, type Respuesta, type TemaAyuda, type Tono,
} from '@/lib/centro-ayuda';
import { getInfoAyuda, getMisSolicitudes, solicitarAyuda, type Solicitud } from '@/lib/ayuda-alumno';
import HojaPortal from '@/components/portal/HojaPortal';

interface Carga {
  redirigir?:  string;
  datos?:      DatosAyuda;
  solicitudes: Solicitud[] | null;
  abiertas:    number;
}

async function obtener(): Promise<Carga> {
  const atleta = await getAtletaPortal();
  if (atleta === undefined) return { redirigir: '/portal/login', solicitudes: null, abiertas: 0 };
  if (!atleta) return { redirigir: '/portal/sin-cuenta', solicitudes: null, abiertas: 0 };
  const [plan, clases, politica, info, solicitudes] = await Promise.all([
    supabase.rpc('alumno_mi_plan').then(({ data, error }) => (error ? null : ((data ?? { vigente: false }) as PlanAyuda))),
    getMisClases().catch(() => null),
    getPoliticaAlumno().catch(() => POLITICA_DEFAULT),
    getInfoAyuda(),
    getMisSolicitudes(),
  ]);
  return {
    datos: { plan, clases, politica, info, ahora: new Date() },
    solicitudes,
    abiertas: info?.solicitudesAbiertas ?? (solicitudes ?? []).filter(s => s.estado === 'abierta').length,
  };
}

const TONO: Record<Tono, { bg: string; border: string; color: string; Icon: React.ElementType }> = {
  ok:     { bg: '#F0FDF4', border: '#BBE5C8', color: '#166534', Icon: CheckCircle2 },
  aviso:  { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E', Icon: AlertCircle },
  normal: { bg: '#F5F5F5', border: '#EBEBEB', color: '#121212', Icon: Info },
};

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago',
});

function Item({ r, abierto, onToggle, onSolicitar }: {
  r: Respuesta; abierto: boolean; onToggle: () => void; onSolicitar: (t: TemaAyuda) => void;
}) {
  const t = r.destacado ? TONO[r.destacado.tono] : null;
  return (
    <li id={r.id} className="scroll-mt-4 rounded-2xl border border-[#D8D8D8] bg-white">
      <button onClick={onToggle} aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
        <span className="font-semibold text-[#121212]">{r.pregunta}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#9B9B9B] transition ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="space-y-3 border-t border-[#EEEEEE] px-4 pb-4 pt-3 text-sm">
          {r.destacado && t && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 font-semibold"
              style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.color }}>
              <t.Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{r.destacado.texto}</span>
            </div>
          )}
          {r.lista && r.lista.length > 0 && (
            <ul className="space-y-1.5 pl-1">
              {r.lista.map((x, i) => (
                <li key={i} className="flex gap-2 text-[#121212]">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#121212]" />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          )}
          {r.parrafos.map((p, i) => <p key={i} className="text-[#5E5E5E]">{p}</p>)}
          {r.acciones.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {r.acciones.map((a, i) => a.href ? (
                <Link key={i} href={a.href}
                  className={`rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${i === 0
                    ? 'bg-[#121212] text-white hover:bg-black' : 'border border-[#D8D8D8] text-[#121212] hover:border-[#121212]'}`}>
                  {a.texto}
                </Link>
              ) : (
                <button key={i} onClick={() => a.solicitar && onSolicitar(a.solicitar)}
                  className={`rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${i === 0
                    ? 'bg-[#121212] text-white hover:bg-black' : 'border border-[#D8D8D8] text-[#121212] hover:border-[#121212]'}`}>
                  {a.texto}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function PortalAyudaPage() {
  const router = useRouter();
  const [carga, setCarga]       = useState<Carga | null>(null);
  const [q, setQ]               = useState('');
  const [abierto, setAbierto]   = useState<string | null>(null);
  const [hoja, setHoja]         = useState(false);
  const [tema, setTema]         = useState<TemaAyuda | null>(null);
  const [claseId, setClaseId]   = useState<number | ''>('');
  const [mensaje, setMensaje]   = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorHoja, setErrorHoja] = useState<string | null>(null);
  const [aviso, setAviso]       = useState<string | null>(null);

  const aplicar = useCallback((c: Carga) => {
    if (c.redirigir) { router.push(c.redirigir); return; }
    setCarga(c);
  }, [router]);

  useEffect(() => {
    let vivo = true;
    obtener().then(c => {
      if (!vivo) return;
      aplicar(c);
      // Enlace directo a la consulta: /portal/ayuda?solicitar=excepcion&clase=123
      const qs = new URLSearchParams(window.location.search);
      const sol = qs.get('solicitar') as TemaAyuda | null;
      if (sol && TEMAS_AYUDA.some(t => t.id === sol)) {
        setTema(sol); setMensaje(''); setErrorHoja(null);
        setClaseId(Number(qs.get('clase')) || ''); setHoja(true);
      }
      // Enlace directo a una pregunta: /portal/ayuda#no-puedo-reagendar
      const h = window.location.hash.slice(1);
      if (h) { setAbierto(h); setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: 'smooth' }), 50); }
    });
    return () => { vivo = false; };
  }, [aplicar]);

  const respuestas = useMemo(() => (carga?.datos ? armarRespuestas(carga.datos) : []), [carga]);
  const resultados = useMemo(() => buscarRespuestas(respuestas, q), [respuestas, q]);
  const buscando = q.trim().length > 0;

  const abrirSolicitud = useCallback((t: TemaAyuda | null = null) => {
    setTema(t); setMensaje(''); setClaseId(''); setErrorHoja(null); setHoja(true);
  }, []);
  const cerrarHoja = useCallback(() => setHoja(false), []);

  async function enviar() {
    if (!tema || enviando) return;
    setEnviando(true); setErrorHoja(null);
    const r = await solicitarAyuda(tema, mensaje, claseId === '' ? undefined : claseId);
    setEnviando(false);
    if (!r.ok) { setErrorHoja(r.mensaje); return; }
    setHoja(false);
    setAviso('Recibimos tu consulta. Te responderemos por correo y también la verás aquí abajo, en "Mis consultas".');
    aplicar(await obtener());
  }

  if (!carga) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" />
      </div>
    );
  }

  const categorias = ['Mi plan', 'Clases', 'Pagos', 'General'] as const;
  const clasesActivas: ClaseAlumno[] = (carga.datos?.clases ?? []).filter(c => c.activa);
  const solicitudes = carga.solicitudes ?? [];
  const limite = carga.abiertas >= 3;

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="border-b border-[#D8D8D8] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/portal" className="rounded-lg border border-[#CACACA] p-2 text-[#5E5E5E] hover:text-[#121212]" aria-label="Volver a MI NEXA">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-bold text-[#121212]">Centro de Ayuda</h1>
            <p className="text-xs text-[#5E5E5E]">Respuestas con los datos de tu cuenta</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6">
        {aviso && (
          <div role="status" className="flex items-start gap-2 rounded-2xl border border-[#BBE5C8] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{aviso}</span>
            <button onClick={() => setAviso(null)} className="text-xs font-semibold">OK</button>
          </div>
        )}

        <label className="flex items-center gap-2 rounded-2xl border border-[#D8D8D8] bg-white px-4 py-3 focus-within:border-[#121212]">
          <Search className="h-4 w-4 shrink-0 text-[#9B9B9B]" />
          <input value={q} onChange={e => setQ(e.target.value)} type="search" enterKeyHint="search"
            placeholder="Escribe tu duda, por ejemplo: cancelar"
            className="w-full bg-transparent text-base text-[#121212] outline-none placeholder:text-[#9B9B9B]" />
        </label>

        {buscando ? (
          resultados.length ? (
            <ul className="space-y-2">
              {resultados.map(r => (
                <Item key={r.id} r={r} abierto={abierto === r.id || resultados.length === 1}
                  onToggle={() => setAbierto(abierto === r.id ? null : r.id)} onSolicitar={abrirSolicitud} />
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-[#D8D8D8] bg-white p-5 text-center text-sm text-[#5E5E5E]">
              No encontramos una respuesta para “{q}”.
              <button onClick={() => abrirSolicitud('otro')} className="mt-3 block w-full rounded-xl bg-[#121212] px-4 py-3 font-bold text-white">
                Enviar una consulta
              </button>
            </div>
          )
        ) : (
          categorias.map(cat => {
            const items = respuestas.filter(r => r.categoria === cat);
            if (!items.length) return null;
            return (
              <section key={cat}>
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">{cat}</p>
                <ul className="space-y-2">
                  {items.map(r => (
                    <Item key={r.id} r={r} abierto={abierto === r.id}
                      onToggle={() => setAbierto(abierto === r.id ? null : r.id)} onSolicitar={abrirSolicitud} />
                  ))}
                </ul>
              </section>
            );
          })
        )}

        {/* Consulta al equipo */}
        <div className="rounded-2xl bg-[#121212] p-5 text-white">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            <p className="font-bold">¿No encontraste tu respuesta?</p>
          </div>
          <p className="mt-1 text-sm text-white/70">Envíanos tu consulta desde aquí. Te respondemos por correo y la respuesta queda guardada en tu cuenta.</p>
          <button onClick={() => abrirSolicitud()} disabled={limite}
            className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#121212] disabled:opacity-50">
            Enviar una consulta
          </button>
          {limite && <p className="mt-2 text-xs text-white/70">Tienes 3 consultas abiertas. Espera la respuesta antes de enviar otra.</p>}
        </div>

        {/* Mis consultas */}
        {solicitudes.length > 0 && (
          <section>
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">Mis consultas</p>
            <ul className="space-y-2">
              {solicitudes.map(s => (
                <li key={s.id} className="rounded-2xl border border-[#D8D8D8] bg-white p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-[#121212]">{s.tema}</p>
                    {s.estado === 'abierta'
                      ? <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#FFFBEB] px-2.5 py-1 text-[11px] font-bold text-[#92400E]"><Clock className="h-3 w-3" /> En revisión</span>
                      : <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#F0FDF4] px-2.5 py-1 text-[11px] font-bold text-[#166534]"><CheckCircle2 className="h-3 w-3" /> Respondida</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-[#5E5E5E]">{s.mensaje}</p>
                  <p className="mt-1 text-[11px] text-[#9B9B9B]">Enviada el {fechaHora(s.creadaAt)}</p>
                  {s.estado !== 'abierta' && (
                    <div className="mt-3 rounded-xl bg-[#F5F5F5] px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5E5E5E]">Respuesta de NEXA</p>
                      <p className="mt-1 whitespace-pre-line text-[#121212]">{s.respuesta || 'Tu consulta fue revisada y cerrada.'}</p>
                      {s.respondidaAt && <p className="mt-1 text-[11px] text-[#9B9B9B]">{fechaHora(s.respondidaAt)}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link href="/reglamento" className="flex items-center justify-between rounded-2xl border border-[#D8D8D8] bg-white px-4 py-3 text-sm font-semibold text-[#121212]">
          Reglamento y condiciones NEXA <ChevronRight className="h-4 w-4 text-[#9B9B9B]" />
        </Link>
      </main>

      <HojaPortal abierto={hoja} onCerrar={cerrarHoja} bloqueado={enviando}
        titulo="Enviar una consulta" subtitulo="Llega directo al equipo de NEXA"
        pie={
          <button onClick={enviar} disabled={!tema || mensaje.trim().length < 5 || enviando}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#121212] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-40">
            <Send className="h-4 w-4" /> {enviando ? 'Enviando…' : 'Enviar consulta'}
          </button>
        }>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-[#5E5E5E]">Tema</p>
            <div className="flex flex-wrap gap-2">
              {TEMAS_AYUDA.map(t => (
                <button key={t.id} type="button" onClick={() => setTema(t.id)} aria-pressed={tema === t.id}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${tema === t.id
                    ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#D8D8D8] text-[#121212]'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {clasesActivas.length > 0 && (tema === 'clases' || tema === 'excepcion') && (
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-[#5E5E5E]">¿Sobre qué clase? (opcional)</span>
              <select value={claseId} onChange={e => setClaseId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-xl border border-[#D8D8D8] bg-white px-3 py-3 text-base text-[#121212]">
                <option value="">Ninguna en particular</option>
                {clasesActivas.map(c => (
                  <option key={c.id} value={c.id}>{fechaLarga(c.fecha)}{c.hora ? ` · ${c.hora}` : ''}</option>
                ))}
              </select>
            </label>
          )}
          {tema === 'excepcion' && (
            <p className="rounded-xl bg-[#FFFBEB] px-3 py-2.5 text-xs text-[#92400E]">
              Cuéntanos qué pasó. Las excepciones se revisan caso a caso y no se aplican de forma automática.
            </p>
          )}
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-[#5E5E5E]">Tu consulta</span>
            <textarea value={mensaje} onChange={e => setMensaje(e.target.value.slice(0, 1000))} rows={5}
              placeholder="Escribe aquí tu consulta"
              className="w-full rounded-xl border border-[#D8D8D8] px-3 py-3 text-base text-[#121212] outline-none focus:border-[#121212]" />
            <span className="mt-1 block text-right text-[11px] text-[#9B9B9B]">{mensaje.length}/1000</span>
          </label>
          {errorHoja && (
            <p role="alert" className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5 text-sm text-[#991B1B]">{errorHoja}</p>
          )}
        </div>
      </HojaPortal>
    </div>
  );
}
