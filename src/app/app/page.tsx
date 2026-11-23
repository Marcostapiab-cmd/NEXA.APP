'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, LogOut, MessageCircle, PlayCircle, Check, X, Download } from 'lucide-react';
import { fechaChile } from '@/lib/contadores';
import { cerrarSesion } from '@/lib/cerrar-sesion';
import {
  idYoutube, mesDe, numeroAnotado, rutinaVigente, semanaDe, sumarDias, ultimaVez,
  type DiaRutina, type EjercicioRutina, type RutinaApp,
} from '@/lib/app-rutinas';
import {
  enviarComentario, guardarSeries, miFicha, misComentarios, misRegistros, misRutinas,
  type Comentario, type FichaAlumno, type RegistroGuardado,
} from '@/lib/app-rutinas-datos';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const fechaLarga = (f: string) => {
  const t = new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return t.charAt(0).toUpperCase() + t.slice(1); // "Lunes, 23 de noviembre"
};
const fechaCorta = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const mesNombre = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

type Vista = 'hoy' | 'semana' | 'mes';
type Estado = 'cargando' | 'listo' | 'sin_ficha' | 'error';

export default function AppRutinaPage() {
  const hoy = fechaChile();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [ficha, setFicha] = useState<FichaAlumno | null>(null);
  const [rutina, setRutina] = useState<RutinaApp | null>(null);
  const [registros, setRegistros] = useState<RegistroGuardado[]>([]);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [vista, setVista] = useState<Vista>('hoy');
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const [mesVisto, setMesVisto] = useState(hoy);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof cargarDatos>>) => {
    if (r.estado !== 'listo') { setEstado(r.estado); return; }
    setFicha(r.ficha); setRutina(rutinaVigente(r.rutinas, hoy)); setRegistros(r.registros); setComentarios(r.comentarios);
    setEstado('listo');
  }, [hoy]);
  const cargar = useCallback(() => cargarDatos().then(aplicar), [aplicar]);

  useEffect(() => { cargarDatos().then(aplicar); }, [aplicar]);

  const porFecha = useMemo(() => new Map((rutina?.dias ?? []).map(d => [d.fecha, d])), [rutina]);
  const proximo = useMemo(() => (rutina?.dias ?? []).find(d => d.fecha > hoy), [rutina, hoy]);

  if (estado === 'cargando') return <Centro><p className="text-[17px] text-white/70">Cargando tu rutina…</p></Centro>;
  if (estado === 'error') return (
    <Centro>
      <p className="text-[17px]">No pudimos cargar tu rutina.</p>
      <p className="mt-1 text-[15px] text-white/60">Revisa tu conexión a internet.</p>
      <button onClick={() => { setEstado('cargando'); void cargar(); }} className="mt-6 h-14 w-full rounded-2xl bg-white text-[17px] font-bold text-[#0E0E0E]">Reintentar</button>
    </Centro>
  );
  if (estado === 'sin_ficha') return (
    <Centro>
      <p className="text-[17px]">Tu cuenta todavía no está ligada a tu ficha de alumno.</p>
      <p className="mt-1 text-[15px] text-white/60">Avísale a tu coach para que lo revise.</p>
      <BotonSalir />
    </Centro>
  );

  const dia = diaAbierto ? porFecha.get(diaAbierto) ?? null : null;

  return (
    <main className="mx-auto max-w-lg pb-16">
      {/* Encabezado */}
      <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <p className="text-[14px] text-white/60">Hola, {ficha?.nombre}</p>
          <h1 className="truncate text-[22px] font-black">{rutina?.nombre || 'Mi rutina'}</h1>
          {rutina && <p className="text-[14px] text-white/60">{fechaCorta(rutina.inicio)} → {fechaCorta(rutina.fin)}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/app/instalar" aria-label="Instalar la app" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Download size={20} /></Link>
          <BotonSalir icono />
        </div>
      </header>

      {!rutina ? (
        <div className="mx-5 mt-6 rounded-3xl bg-white/5 p-6 text-center">
          <p className="text-[18px] font-bold">Todavía no tienes una rutina asignada</p>
          <p className="mt-2 text-[15px] text-white/60">Cuando tu coach la cargue, aparecerá aquí.</p>
        </div>
      ) : dia || diaAbierto ? (
        <VistaDia
          fecha={diaAbierto!} dia={dia} hoy={hoy} rutinaId={rutina.id} atletaId={ficha!.id}
          registros={registros} comentarios={comentarios}
          onVolver={() => setDiaAbierto(null)} onCambio={cargar}
          anterior={rutina.dias.filter(d => d.fecha < diaAbierto!).at(-1)?.fecha}
          siguiente={rutina.dias.find(d => d.fecha > diaAbierto!)?.fecha}
          onIr={setDiaAbierto}
        />
      ) : (
        <>
          {/* Hoy / Semana / Mes */}
          <nav className="mx-5 mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-white/10 p-1" aria-label="Vista">
            {(['hoy', 'semana', 'mes'] as const).map(v => (
              <button key={v} onClick={() => setVista(v)} aria-pressed={vista === v}
                className={`h-12 rounded-xl text-[16px] font-bold ${vista === v ? 'bg-white text-[#0E0E0E]' : 'text-white/80'}`}>
                {v === 'hoy' ? 'Hoy' : v === 'semana' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </nav>

          {vista === 'hoy' && (porFecha.get(hoy) ? (
            <VistaDia fecha={hoy} dia={porFecha.get(hoy)!} hoy={hoy} rutinaId={rutina.id} atletaId={ficha!.id}
              registros={registros} comentarios={comentarios} onCambio={cargar} />
          ) : (
            <div className="mx-5 rounded-3xl bg-white/5 p-6 text-center">
              <p className="text-[18px] font-bold">Hoy es día de descanso</p>
              {proximo ? (
                <button onClick={() => setDiaAbierto(proximo.fecha)} className="mt-5 h-14 w-full rounded-2xl bg-white text-[17px] font-bold text-[#0E0E0E]">
                  Ver próximo: {fechaLarga(proximo.fecha)}
                </button>
              ) : <p className="mt-2 text-[15px] text-white/60">No hay más entrenamientos en esta rutina.</p>}
            </div>
          ))}

          {vista === 'semana' && (
            <ul className="mx-5 space-y-2">
              {semanaDe(hoy).map(f => {
                const d = porFecha.get(f);
                const fueraDeRutina = (rutina.inicio && f < rutina.inicio) || (rutina.fin && f > rutina.fin);
                return (
                  <li key={f}>
                    <button disabled={!d} onClick={() => setDiaAbierto(f)}
                      className={`flex min-h-[64px] w-full items-center gap-4 rounded-2xl px-4 text-left ${d ? 'bg-white/10' : 'bg-white/[0.03] text-white/40'} ${f === hoy ? 'ring-2 ring-white' : ''}`}>
                      <span className="w-12 shrink-0 text-center">
                        <span className="block text-[13px] font-semibold uppercase">{DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]}</span>
                        <span className="block text-[20px] font-black">{Number(f.slice(8))}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px] font-bold">{d ? d.titulo || 'Entrenamiento' : fueraDeRutina ? 'Fuera de la rutina' : 'Descanso'}</span>
                        {d && <span className="block text-[14px] text-white/60">{d.ejercicios.length} {d.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'}</span>}
                      </span>
                      {d && <ChevronRight size={20} className="shrink-0 text-white/50" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {vista === 'mes' && (
            <section className="mx-5">
              <div className="mb-3 flex items-center justify-between">
                <button aria-label="Mes anterior" onClick={() => setMesVisto(sumarDias(`${mesVisto.slice(0, 7)}-01`, -1))} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><ChevronLeft /></button>
                <p className="text-[17px] font-bold capitalize">{mesNombre(mesVisto)}</p>
                <button aria-label="Mes siguiente" onClick={() => setMesVisto(sumarDias(`${mesVisto.slice(0, 7)}-28`, 5))} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><ChevronRight /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[13px] font-semibold text-white/50">
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i} className="py-1">{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {mesDe(mesVisto).map((f, i) => {
                  if (!f) return <span key={i} />;
                  const d = porFecha.get(f);
                  return (
                    <button key={f} disabled={!d} onClick={() => setDiaAbierto(f)} aria-label={d ? `${fechaLarga(f)}: ${d.titulo || 'entrenamiento'}` : fechaLarga(f)}
                      className={`flex aspect-square flex-col items-center justify-center rounded-xl text-[16px] ${d ? 'bg-white/15 font-bold' : 'text-white/35'} ${f === hoy ? 'ring-2 ring-white' : ''}`}>
                      {Number(f.slice(8))}
                      {d && <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-white" />}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[14px] text-white/60">Los días con punto tienen entrenamiento. Tócalos para verlo.</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

/** Todo lo que necesita la app, en una sola carga. */
async function cargarDatos() {
  try {
    const ficha = await miFicha();
    if (!ficha) return { estado: 'sin_ficha' as const };
    const [rutinas, registros, comentarios] = await Promise.all([misRutinas(ficha.id), misRegistros(ficha.id), misComentarios(ficha.id)]);
    return { estado: 'listo' as const, ficha, rutinas, registros, comentarios };
  } catch {
    return { estado: 'error' as const };
  }
}

function Centro({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 text-center">{children}</main>;
}

function BotonSalir({ icono = false }: { icono?: boolean }) {
  const salir = async () => { await cerrarSesion(); window.location.assign('/app/login'); };
  return icono
    ? <button onClick={salir} aria-label="Cerrar sesión" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><LogOut size={20} /></button>
    : <button onClick={salir} className="mt-6 h-14 w-full rounded-2xl bg-white/10 text-[17px] font-bold">Cerrar sesión</button>;
}

// ── Un día de la rutina ─────────────────────────────────────

function VistaDia(p: {
  fecha: string; dia: DiaRutina | null; hoy: string; rutinaId: string; atletaId: string;
  registros: RegistroGuardado[]; comentarios: Comentario[]; onCambio: () => Promise<void>;
  onVolver?: () => void; anterior?: string; siguiente?: string; onIr?: (f: string) => void;
}) {
  return (
    <section>
      {p.onVolver && (
        <div className="mx-5 mb-3 flex items-center gap-2">
          <button onClick={p.onVolver} className="flex h-12 items-center gap-1 rounded-2xl bg-white/10 px-4 text-[16px] font-semibold"><ChevronLeft size={20} />Volver</button>
          <div className="ml-auto flex gap-2">
            <button aria-label="Entrenamiento anterior" disabled={!p.anterior} onClick={() => p.anterior && p.onIr?.(p.anterior)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 disabled:opacity-30"><ChevronLeft /></button>
            <button aria-label="Entrenamiento siguiente" disabled={!p.siguiente} onClick={() => p.siguiente && p.onIr?.(p.siguiente)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 disabled:opacity-30"><ChevronRight /></button>
          </div>
        </div>
      )}
      <div className="mx-5 mb-3">
        <p className="text-[15px] text-white/60">{p.fecha === p.hoy ? `Hoy · ${fechaLarga(p.fecha).toLowerCase()}` : fechaLarga(p.fecha)}</p>
        <h2 className="text-[20px] font-black">{p.dia?.titulo || 'Entrenamiento'}</h2>
      </div>
      {!p.dia ? (
        <p className="mx-5 text-[16px] text-white/60">Este día no tiene entrenamiento.</p>
      ) : (
        <ol className="space-y-3">
          {p.dia.ejercicios.map((e, i) => (
            <TarjetaEjercicio key={e.id} n={i + 1} ej={e} dia={p.fecha} hoy={p.hoy} rutinaId={p.rutinaId} atletaId={p.atletaId}
              registros={p.registros} comentarios={p.comentarios.filter(c => c.rutina_id === p.rutinaId && c.dia === p.fecha && c.ejercicio_id === e.id)}
              onCambio={p.onCambio} />
          ))}
        </ol>
      )}
    </section>
  );
}

// ── Un ejercicio: video, última vez, series y comentario ────

function TarjetaEjercicio(p: {
  n: number; ej: EjercicioRutina; dia: string; hoy: string; rutinaId: string; atletaId: string;
  registros: RegistroGuardado[]; comentarios: Comentario[]; onCambio: () => Promise<void>;
}) {
  const { ej } = p;
  const [fecha, setFecha] = useState(p.hoy);
  const guardados = p.registros.filter(r => r.rutina_id === p.rutinaId && r.dia === p.dia && r.ejercicio_id === ej.id && r.fecha === fecha);
  const inicial = () => Array.from({ length: ej.series }, (_, i) => {
    const g = guardados.find(r => r.serie === i + 1);
    return { kg: g?.peso_kg != null ? String(g.peso_kg) : '', reps: g?.reps != null ? String(g.reps) : '' };
  });
  const [series, setSeries] = useState(inicial);
  const [claveFecha, setClaveFecha] = useState(`${fecha}|${guardados.length}`);
  if (claveFecha !== `${fecha}|${guardados.length}`) { setClaveFecha(`${fecha}|${guardados.length}`); setSeries(inicial()); }
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [video, setVideo] = useState(false);
  const [comentando, setComentando] = useState(false);
  const ultima = ultimaVez(p.registros, ej.nombre, fecha);

  async function guardar() {
    const datos = series.map((s, i) => ({ serie: i + 1, peso_kg: numeroAnotado(s.kg, 1000), reps: numeroAnotado(s.reps, 300) }));
    if (datos.some(d => d.peso_kg === 'invalido' || d.reps === 'invalido')) {
      setAviso({ tipo: 'error', texto: 'Revisa los números: solo valores positivos (ej. 42,5 kg y 10 reps).' }); return;
    }
    setGuardando(true); setAviso(null);
    try {
      await guardarSeries({
        atletaId: p.atletaId, rutinaId: p.rutinaId, dia: p.dia, ejercicioId: ej.id, ejercicioNombre: ej.nombre, fecha,
        series: datos.map(d => ({ serie: d.serie, peso_kg: d.peso_kg as number | null, reps: d.reps === null ? null : Math.round(d.reps as number) })),
      });
      await p.onCambio();
      setAviso({ tipo: 'ok', texto: 'Guardado' });
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.' });
    } finally { setGuardando(false); }
  }

  const input = 'h-14 w-full rounded-xl border border-white/15 bg-white/5 text-center text-[20px] font-bold text-white outline-none focus:border-white';
  return (
    <li className="mx-3 rounded-3xl bg-white/[0.06] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[16px] font-black text-[#0E0E0E]">{p.n}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[19px] font-bold leading-tight">{ej.nombre}</h3>
          <p className="mt-1 text-[16px] text-white/80">
            {ej.series} {ej.series === 1 ? 'serie' : 'series'}{ej.reps ? ` × ${ej.reps} reps` : ''}{ej.cadaLado ? ' (cada lado)' : ''}
          </p>
          {(ej.descanso || ej.tempo) && <p className="text-[14px] text-white/60">{[ej.descanso && `Descanso ${ej.descanso}`, ej.tempo && `Tempo ${ej.tempo}`].filter(Boolean).join(' · ')}</p>}
          {ej.notas && <p className="mt-2 rounded-xl bg-white/5 px-3 py-2 text-[15px] text-white/85">{ej.notas}</p>}
        </div>
      </div>

      {ej.video && (
        <button onClick={() => setVideo(true)} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 text-[16px] font-semibold">
          <PlayCircle size={20} /> Ver video
        </button>
      )}

      <div className="mt-3 rounded-2xl bg-black/30 px-3 py-2 text-[15px]">
        {ultima
          ? <p><span className="text-white/60">La última vez ({fechaCorta(ultima.fecha)}): </span>
              <b>{ultima.series.map(s => `${s.peso_kg ?? '–'} kg × ${s.reps ?? '–'}`).join(' · ')}</b></p>
          : <p className="text-white/60">{guardados.length ? 'Primera vez que anotas este ejercicio.' : 'Aún no anotas este ejercicio.'}</p>}
      </div>

      {/* Series */}
      <div className="mt-3">
        <div className="mb-1 grid grid-cols-[56px_1fr_1fr] gap-2 px-1 text-[13px] font-semibold uppercase text-white/50">
          <span>Serie</span><span className="text-center">Kg</span><span className="text-center">Reps</span>
        </div>
        <div className="space-y-2">
          {series.map((s, i) => (
            <div key={i} className="grid grid-cols-[56px_1fr_1fr] items-center gap-2">
              <span className="text-center text-[18px] font-bold text-white/80">{i + 1}</span>
              <input aria-label={`Kilos serie ${i + 1}`} inputMode="decimal" value={s.kg} placeholder="kg"
                onChange={e => { setAviso(null); setSeries(v => v.map((x, j) => j === i ? { ...x, kg: e.target.value } : x)); }} className={input} />
              <input aria-label={`Repeticiones serie ${i + 1}`} inputMode="numeric" value={s.reps} placeholder="reps"
                onChange={e => { setAviso(null); setSeries(v => v.map((x, j) => j === i ? { ...x, reps: e.target.value } : x)); }} className={input} />
            </div>
          ))}
        </div>
        <label className="mt-3 flex items-center justify-between gap-3 text-[15px] text-white/70">
          Fecha en que lo hiciste
          <input type="date" value={fecha} max={p.hoy} onChange={e => { if (e.target.value) { setAviso(null); setFecha(e.target.value); } }}
            className="h-12 rounded-xl border border-white/15 bg-white/5 px-3 text-[16px] text-white [color-scheme:dark]" />
        </label>
        <button onClick={guardar} disabled={guardando}
          className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[17px] font-bold text-[#0E0E0E] disabled:opacity-50">
          {guardando ? 'Guardando…' : aviso?.tipo === 'ok' ? <><Check size={20} /> Guardado</> : 'Guardar pesos'}
        </button>
        {aviso?.tipo === 'error' && <p role="alert" className="mt-2 rounded-xl bg-red-500/15 px-3 py-2 text-[15px] text-red-300">{aviso.texto}</p>}
      </div>

      {/* Comentarios para el coach */}
      {p.comentarios.length > 0 && (
        <ul className="mt-3 space-y-2">
          {p.comentarios.map(c => (
            <li key={c.id} className="rounded-2xl bg-white/5 p-3 text-[15px]">
              <p><span className="text-white/60">Tú: </span>{c.texto}</p>
              {c.respuesta
                ? <p className="mt-2 rounded-xl bg-white/10 px-3 py-2"><span className="font-semibold">Coach: </span>{c.respuesta}</p>
                : <p className="mt-1 text-[13px] text-white/50">{c.leido_at ? 'Visto por tu coach' : 'Enviado'}</p>}
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => setComentando(true)} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/20 text-[16px] font-semibold">
        <MessageCircle size={19} /> Comentar a mi coach
      </button>

      {video && ej.video && <ModalVideo url={ej.video} titulo={ej.nombre} onCerrar={() => setVideo(false)} />}
      {comentando && (
        <ModalComentario ejercicio={ej.nombre} onCerrar={() => setComentando(false)}
          onEnviar={async texto => {
            await enviarComentario({ atletaId: p.atletaId, rutinaId: p.rutinaId, dia: p.dia, ejercicioId: ej.id, ejercicioNombre: ej.nombre, texto });
            await p.onCambio();
          }} />
      )}
    </li>
  );
}

function ModalVideo({ url, titulo, onCerrar }: { url: string; titulo: string; onCerrar: () => void }) {
  const id = idYoutube(url);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Video: ${titulo}`} className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[17px] font-bold">{titulo}</p>
        <button onClick={onCerrar} aria-label="Cerrar video" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><X /></button>
      </div>
      {id ? (
        <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: '9 / 16', maxHeight: '75dvh' }}>
          <iframe className="absolute inset-0 h-full w-full" src={`https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`}
            title={titulo} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex h-14 items-center justify-center rounded-2xl bg-white text-[17px] font-bold text-[#0E0E0E]">Abrir video</a>
      )}
    </div>
  );
}

function ModalComentario({ ejercicio, onEnviar, onCerrar }: { ejercicio: string; onEnviar: (t: string) => Promise<void>; onCerrar: () => void }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  async function enviar() {
    setEnviando(true); setError('');
    try { await onEnviar(texto); onCerrar(); }
    catch { setError('No se pudo enviar. Revisa tu conexión.'); setEnviando(false); }
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Comentario para tu coach" className="fixed inset-0 z-50 flex items-end bg-black/70">
      <div className="w-full rounded-t-3xl bg-[#1A1A1A] p-5" style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        <p className="text-[15px] text-white/60">Comentario sobre</p>
        <p className="text-[18px] font-bold">{ejercicio}</p>
        <textarea autoFocus value={texto} maxLength={1000} onChange={e => setTexto(e.target.value)} rows={4}
          placeholder="Ej.: me duele el hombro, ¿lo puedo cambiar?"
          className="mt-3 w-full rounded-2xl border border-white/15 bg-white/5 p-4 text-[17px] text-white outline-none focus:border-white" />
        {error && <p role="alert" className="mt-2 text-[15px] text-red-300">{error}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onCerrar} className="h-14 rounded-2xl bg-white/10 text-[17px] font-bold">Cancelar</button>
          <button onClick={enviar} disabled={enviando || !texto.trim()} className="h-14 rounded-2xl bg-white text-[17px] font-bold text-[#0E0E0E] disabled:opacity-40">
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
