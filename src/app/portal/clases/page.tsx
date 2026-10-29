'use client';
import { hoyLocal } from '@/lib/format';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getAtletaPortal, soloFecha } from '@/lib/portal';
import { ArrowLeft, CheckCircle2, Clock, XCircle, RefreshCw, Calendar, CalendarPlus, Repeat, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { MENSAJE_FUERA_DE_PLAZO, textoLimite } from '@/lib/politica-cancelacion';
import {
  cancelarClase, getMiPlan, getMisClases, getPoliticaAlumno, reagendarClase, reservarClase,
  type ClaseAlumno, type HorarioDisponible, type MiPlan, type PoliticaAlumno,
} from '@/lib/reservas-alumno';
import HojaPortal from '@/components/portal/HojaPortal';
import SelectorHorario from '@/components/portal/SelectorHorario';

interface Pasada {
  id: string;
  fecha: string;
  hora?: string;
  estado: string;
  descripcion?: string;
}

const ESTADO: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pendiente:        { label: 'Reservada',  icon: Clock,        color: '#2563eb', bg: '#eff6ff' },
  confirmada:       { label: 'Confirmada', icon: CheckCircle2, color: '#2563eb', bg: '#eff6ff' },
  presente:         { label: 'Asistió',    icon: CheckCircle2, color: '#16a34a', bg: '#f0fdf4' },
  no_show:          { label: 'No asistió', icon: XCircle,      color: '#dc2626', bg: '#fef2f2' },
  cancelada_tarde:  { label: 'Cancelada tarde', icon: XCircle, color: '#dc2626', bg: '#fef2f2' },
  cancelada_tiempo: { label: 'Cancelada',  icon: XCircle,      color: '#9B9B9B', bg: '#f9fafb' },
  cancelada_nexa:   { label: 'Cancelada',  icon: XCircle,      color: '#9B9B9B', bg: '#f9fafb' },
  reagendada:       { label: 'Reagendada', icon: RefreshCw,    color: '#6b7280', bg: '#f9fafb' },
};

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function fechaCorta(f: string) {
  return new Date(`${f}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function Fecha({ fecha, destacar }: { fecha: string; destacar?: boolean }) {
  const d = new Date(`${fecha}T12:00:00`);
  return (
    <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-xl py-1"
      style={{ background: destacar ? '#121212' : '#F5F5F5' }}>
      <span className="text-[10px] font-bold uppercase" style={{ color: destacar ? '#fff' : '#9B9B9B' }}>
        {d.toLocaleDateString('es-CL', { month: 'short' })}
      </span>
      <span className="text-xl font-black leading-none" style={{ color: destacar ? '#fff' : '#121212' }}>{d.getDate()}</span>
      <span className="text-[10px]" style={{ color: destacar ? '#ccc' : '#9B9B9B' }}>
        {d.toLocaleDateString('es-CL', { weekday: 'short' })}
      </span>
    </div>
  );
}

function Estado({ estado }: { estado: string }) {
  const cfg = ESTADO[estado] ?? ESTADO.pendiente;
  const Icn = cfg.icon;
  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color: cfg.color, background: cfg.bg }}>
      <Icn className="h-3 w-3" /> {cfg.label}
    </div>
  );
}

/** Horarios fijos = mismo día de la semana y hora que se repite en las próximas clases. */
function horariosFijos(clases: ClaseAlumno[]) {
  const m = new Map<string, { dia: number; hora: string; profesor?: string; n: number }>();
  for (const c of clases) {
    if (!c.activa || !c.hora) continue;
    const dia = new Date(`${c.fecha}T12:00:00`).getDay();
    const k = `${dia}|${c.hora}`;
    const x = m.get(k) ?? { dia, hora: c.hora, profesor: c.profesor, n: 0 };
    x.n++; m.set(k, x);
  }
  return [...m.values()].filter(x => x.n >= 2).sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7) || a.hora.localeCompare(b.hora));
}

interface Datos {
  redirigir?: string;
  proximas:   ClaseAlumno[];
  sinSistema: boolean;
  plan:       MiPlan | null;
  politica:   PoliticaAlumno | null;
  pasadas:    Pasada[];
}

async function obtenerDatos(): Promise<Datos> {
  const vacio = { proximas: [], sinSistema: false, plan: null, politica: null, pasadas: [] };
  const atleta = await getAtletaPortal();
  if (atleta === undefined) return { ...vacio, redirigir: '/portal/login' };
  if (!atleta) return { ...vacio, redirigir: '/portal/sin-cuenta' };

  const hoy = hoyLocal();
  const [clases, plan, politica, { data: hist }] = await Promise.all([
    getMisClases().catch(() => null),
    getMiPlan().catch(() => null),
    getPoliticaAlumno().catch(() => null),
    supabase.from('reservas').select('id, fecha, hora, estado, descripcion, tipo_clase')
      .eq('alumno_id', atleta.id).lt('fecha', hoy).order('fecha', { ascending: false }).limit(100),
  ]);

  let proximas = clases;
  if (!proximas) {
    // Sin la migración 041 aplicada: se muestran las clases, sin acciones.
    const { data } = await supabase.from('reservas').select('id, fecha, hora, estado, tipo_clase')
      .eq('alumno_id', atleta.id).gte('fecha', hoy).order('fecha', { ascending: true }).limit(200);
    proximas = (data ?? []).map((r: Record<string, unknown>) => ({
      id: Number(r.id), fecha: soloFecha(r.fecha), hora: r.hora ? String(r.hora).slice(0, 5) : undefined,
      estado: String(r.estado ?? 'pendiente'),
      modalidad: /2:1|duo/i.test(String(r.tipo_clase ?? '')) ? '2:1' as const : '1:1' as const,
      aTiempo: false, activa: false,
    }));
  }
  return {
    proximas, sinSistema: !clases, plan, politica,
    pasadas: (hist ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), fecha: soloFecha(r.fecha), hora: r.hora ? String(r.hora).slice(0, 5) : undefined,
      estado: String(r.estado ?? 'pendiente'),
      descripcion: r.descripcion ? String(r.descripcion) : r.tipo_clase ? `Clase ${String(r.tipo_clase)}` : undefined,
    })),
  };
}

type Hoja =
  | { tipo: 'reagendar'; clase: ClaseAlumno; paso: 2 | 3 }
  | { tipo: 'cancelar';  clase: ClaseAlumno }
  | { tipo: 'fuera';     clase: ClaseAlumno }
  | { tipo: 'reservar';  paso: 2 | 3 };

export default function PortalClasesPage() {
  const router = useRouter();
  const [proximas,  setProximas]  = useState<ClaseAlumno[]>([]);
  const [pasadas,   setPasadas]   = useState<Pasada[]>([]);
  const [plan,      setPlan]      = useState<MiPlan | null>(null);
  const [politica,  setPolitica]  = useState<PoliticaAlumno | null>(null);
  const [sinSistema, setSinSistema] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [filtro,    setFiltro]    = useState<'proximas' | 'historial'>('proximas');
  const [hoja,      setHoja]      = useState<Hoja | null>(null);
  const [elegido,   setElegido]   = useState<HorarioDisponible | null>(null);
  const [enviando,  setEnviando]  = useState(false);
  const [errorHoja, setErrorHoja] = useState<string | null>(null);
  const [selectorKey, setSelectorKey] = useState(0);
  const [aviso,     setAviso]     = useState<string | null>(null);

  const aplicar = useCallback((d: Datos | null) => {
    if (!d) return;
    if (d.redirigir) { router.push(d.redirigir); return; }
    setProximas(d.proximas); setSinSistema(d.sinSistema); setPlan(d.plan);
    setPolitica(d.politica); setPasadas(d.pasadas); setLoading(false);
  }, [router]);

  const cargar = useCallback(async () => { aplicar(await obtenerDatos()); }, [aplicar]);

  useEffect(() => {
    let vivo = true;
    obtenerDatos().then(d => { if (vivo) aplicar(d); });
    return () => { vivo = false; };
  }, [aplicar]);

  const cerrarHoja = useCallback(() => { setHoja(null); setElegido(null); setErrorHoja(null); }, []);

  function abrir(clase: ClaseAlumno, accion: 'reagendar' | 'cancelar') {
    setErrorHoja(null); setElegido(null);
    // El servidor vuelve a validar el plazo al confirmar; esto solo evita un paso inútil.
    if (!clase.aTiempo) { setHoja({ tipo: 'fuera', clase }); return; }
    setHoja(accion === 'reagendar' ? { tipo: 'reagendar', clase, paso: 2 } : { tipo: 'cancelar', clase });
  }

  async function confirmar() {
    if (!hoja || enviando) return;
    setEnviando(true); setErrorHoja(null);
    try {
      let r;
      if (hoja.tipo === 'cancelar') r = await cancelarClase(hoja.clase.id);
      else if (hoja.tipo === 'reagendar' && elegido) r = await reagendarClase(hoja.clase.id, elegido);
      else if (hoja.tipo === 'reservar' && elegido) r = await reservarClase(elegido);
      else return;

      if (!r.ok) {
        if (r.error === 'fuera_de_plazo' && hoja.tipo !== 'reservar') { setHoja({ tipo: 'fuera', clase: hoja.clase }); return; }
        setErrorHoja(r.mensaje);
        if (r.error === 'sin_cupo' && hoja.tipo !== 'cancelar') {
          // Otro alumno tomó el cupo: volver a elegir con horarios actualizados.
          setElegido(null); setSelectorKey(k => k + 1);
          setHoja(hoja.tipo === 'reagendar' ? { ...hoja, paso: 2 } : { tipo: 'reservar', paso: 2 });
        }
        return;
      }
      const texto = hoja.tipo === 'cancelar'
        ? 'Clase cancelada. Conservas tu crédito para reservar otro horario.'
        : hoja.tipo === 'reagendar'
          ? `Clase reagendada para el ${fechaCorta(elegido!.fecha)} a las ${elegido!.hora}.`
          : `Clase reservada para el ${fechaCorta(elegido!.fecha)} a las ${elegido!.hora}.`;
      cerrarHoja();
      setAviso(texto);
      setLoading(true);
      await cargar();
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" />
      </div>
    );
  }

  const hoy = hoyLocal();
  const activas = proximas.filter(c => c.activa);
  const fijos = horariosFijos(proximas);
  const puedeReservar = !sinSistema && plan?.vigente && (plan.disponibles ?? 0) > 0;

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="border-b border-[#D8D8D8] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/portal" className="rounded-lg border border-[#CACACA] p-2 text-[#5E5E5E] hover:text-[#121212]" aria-label="Volver a MI NEXA">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-bold text-[#121212]">Mis clases</h1>
            <p className="text-xs text-[#5E5E5E]">Reserva, reagenda o cancela sin escribirnos</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        {aviso && (
          <div role="status" className="mb-4 flex items-start gap-2 rounded-2xl border border-[#BBE5C8] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{aviso}</span>
            <button onClick={() => setAviso(null)} className="text-xs font-semibold">OK</button>
          </div>
        )}
        {sinSistema && (
          <div className="mb-4 flex items-start gap-2 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            La gestión de clases en línea aún no está activa. Para cambios, escríbenos.
          </div>
        )}

        {/* Plan y créditos */}
        {plan?.vigente && (
          <div className="mb-5 rounded-2xl border border-[#D8D8D8] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[#121212]">{plan.nombre}</p>
                <p className="text-xs text-[#5E5E5E]">Modalidad {plan.modalidad} · vence el {plan.fin ? fechaCorta(plan.fin) : '—'}</p>
              </div>
              {puedeReservar && (
                <button onClick={() => { setElegido(null); setErrorHoja(null); setHoja({ tipo: 'reservar', paso: 2 }); }}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#121212] px-3 py-2 text-xs font-bold text-white">
                  <CalendarPlus className="h-4 w-4" /> Reservar clase
                </button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {([['Contratadas', plan.contratadas], ['Usadas', plan.usadas], ['Reservadas', plan.reservadas], ['Disponibles', plan.disponibles]] as const).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-[#F5F5F5] py-2">
                  <p className="text-lg font-black text-[#121212]">{v ?? 0}</p>
                  <p className="text-[10px] text-[#5E5E5E]">{k}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Horarios fijos */}
        {fijos.length > 0 && (
          <div className="mb-5 rounded-2xl border border-[#D8D8D8] bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#9B9B9B]">
              <Repeat className="h-3 w-3" /> Mis horarios fijos
            </p>
            <div className="flex flex-wrap gap-2">
              {fijos.map(f => (
                <span key={`${f.dia}|${f.hora}`} className="rounded-full bg-[#F5F5F5] px-3 py-1.5 text-xs font-semibold text-[#121212]">
                  {DIAS[f.dia]} {f.hora}{f.profesor ? ` · ${f.profesor}` : ''}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[#9B9B9B]">Cancelar o mover una clase no cambia tus horarios fijos de las otras semanas.</p>
          </div>
        )}

        {/* Filtros */}
        <div className="mb-4 flex gap-2">
          {(['proximas', 'historial'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
              style={filtro === f ? { background: '#121212', color: '#fff' } : { background: '#fff', color: '#5E5E5E', border: '1px solid #D8D8D8' }}>
              {f === 'proximas' ? `Próximas (${activas.length})` : 'Historial'}
            </button>
          ))}
        </div>

        {filtro === 'proximas' ? (
          proximas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D8D8D8] bg-white py-16 text-center">
              <Calendar className="mx-auto mb-3 h-8 w-8 text-[#CACACA]" />
              <p className="font-semibold text-[#5E5E5E]">Sin clases programadas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {proximas.map(c => {
                const esHoy = c.fecha === hoy;
                return (
                  <div key={c.id} className="rounded-2xl border bg-white px-4 py-3.5" style={{ borderColor: esHoy ? '#121212' : '#D8D8D8', opacity: c.activa || sinSistema ? 1 : 0.6 }}>
                    <div className="flex items-center gap-4">
                      <Fecha fecha={c.fecha} destacar={esHoy} />
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-black leading-tight text-[#121212]">{c.hora ?? '—'}</p>
                        <p className="truncate text-xs text-[#5E5E5E]">
                          {c.modalidad === '2:1' ? 'Semipersonalizado 2:1' : 'Personalizado 1:1'}{c.profesor ? ` · ${c.profesor}` : ''}
                        </p>
                      </div>
                      <Estado estado={c.estado} />
                    </div>
                    {c.activa && !sinSistema && (
                      <div className="mt-3 border-t border-[#EEEEEE] pt-3">
                        <p className="mb-2 text-[11px] text-[#5E5E5E]">
                          {c.aTiempo && c.limite
                            ? <>Puedes cancelar o reagendar hasta el <strong className="text-[#121212]">{textoLimite(new Date(c.limite))}</strong></>
                            : <span className="text-[#B91C1C]">Plazo de cancelación vencido</span>}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => abrir(c, 'reagendar')}
                            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#121212] py-2.5 text-xs font-bold text-white">
                            <RefreshCw className="h-3.5 w-3.5" /> Reagendar
                          </button>
                          <button onClick={() => abrir(c, 'cancelar')}
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-[#D8D8D8] py-2.5 text-xs font-bold text-[#121212]">
                            <XCircle className="h-3.5 w-3.5" /> Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : pasadas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D8D8D8] bg-white py-16 text-center">
            <Calendar className="mx-auto mb-3 h-8 w-8 text-[#CACACA]" />
            <p className="font-semibold text-[#5E5E5E]">Sin historial aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pasadas.map(r => (
              <div key={r.id} className="flex items-center gap-4 rounded-2xl border border-[#D8D8D8] bg-white px-4 py-3.5">
                <Fecha fecha={r.fecha} />
                <div className="flex-1">
                  {r.hora && <p className="text-xs text-[#5E5E5E]">{r.hora}</p>}
                  <p className="font-semibold text-[#121212]">{r.descripcion || 'Clase'}</p>
                </div>
                <Estado estado={r.estado} />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Hojas ───────────────────────────────────────────── */}
      {hoja?.tipo === 'fuera' && (
        <HojaPortal abierto onCerrar={cerrarHoja} titulo="Fuera de plazo"
          pie={<button onClick={cerrarHoja} className="w-full rounded-xl bg-[#121212] py-3 text-sm font-bold text-white">Entendido</button>}>
          <div className="flex gap-3 rounded-2xl bg-[#FEF2F2] p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#B91C1C]" />
            <p className="text-sm text-[#7F1D1D]">{MENSAJE_FUERA_DE_PLAZO}</p>
          </div>
          {hoja.clase.limite && (
            <p className="mt-3 text-xs text-[#5E5E5E]">El plazo para esta clase terminó el {textoLimite(new Date(hoja.clase.limite))}.</p>
          )}
        </HojaPortal>
      )}

      {hoja?.tipo === 'cancelar' && (
        <HojaPortal abierto onCerrar={cerrarHoja} bloqueado={enviando} titulo="Cancelar clase"
          subtitulo={`${fechaCorta(hoja.clase.fecha)} · ${hoja.clase.hora}`}
          pie={
            <div className="grid grid-cols-2 gap-2">
              <button onClick={cerrarHoja} disabled={enviando} className="rounded-xl border border-[#D8D8D8] py-3 text-sm font-bold text-[#121212]">Volver</button>
              <button onClick={confirmar} disabled={enviando} className="rounded-xl bg-[#121212] py-3 text-sm font-bold text-white disabled:opacity-50">
                {enviando ? 'Cancelando…' : 'Cancelar clase'}
              </button>
            </div>
          }>
          <p className="text-sm text-[#121212]">Estás dentro del plazo: <strong>conservas el crédito</strong> de esta clase y puedes usarlo para reservar otro horario.</p>
          <p className="mt-2 text-xs text-[#5E5E5E]">Tus horarios fijos de las otras semanas no cambian. Si quieres moverla a otro día, usa “Reagendar”.</p>
          {errorHoja && <p className="mt-3 rounded-xl bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">{errorHoja}</p>}
        </HojaPortal>
      )}

      {(hoja?.tipo === 'reagendar' || hoja?.tipo === 'reservar') && (
        <HojaPortal abierto onCerrar={cerrarHoja} bloqueado={enviando}
          titulo={hoja.tipo === 'reagendar' ? 'Reagendar clase' : 'Reservar clase'}
          subtitulo={hoja.tipo === 'reagendar'
            ? `${hoja.paso === 2 ? 'Paso 2 de 3 · Elige el nuevo horario' : 'Paso 3 de 3 · Confirma'} — actual: ${fechaCorta(hoja.clase.fecha)} ${hoja.clase.hora}`
            : hoja.paso === 2 ? 'Elige un horario disponible' : 'Confirma tu reserva'}
          pie={hoja.paso === 2 ? (
            <button disabled={!elegido} onClick={() => setHoja({ ...hoja, paso: 3 })}
              className="w-full rounded-xl bg-[#121212] py-3 text-sm font-bold text-white disabled:opacity-40">
              {elegido ? `Continuar con ${elegido.hora}` : 'Elige un horario'}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setHoja({ ...hoja, paso: 2 })} disabled={enviando} className="rounded-xl border border-[#D8D8D8] py-3 text-sm font-bold text-[#121212]">Atrás</button>
              <button onClick={confirmar} disabled={enviando} className="rounded-xl bg-[#121212] py-3 text-sm font-bold text-white disabled:opacity-50">
                {enviando ? 'Confirmando…' : 'Confirmar'}
              </button>
            </div>
          )}>
          {errorHoja && <p className="mb-3 rounded-xl bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">{errorHoja}</p>}
          {hoja.paso === 2 ? (
            <SelectorHorario key={selectorKey} reservaId={hoja.tipo === 'reagendar' ? hoja.clase.id : undefined}
              politica={politica} seleccionado={elegido} onElegir={setElegido} />
          ) : elegido && (
            <div className="space-y-3">
              {hoja.tipo === 'reagendar' && (
                <div className="rounded-2xl bg-[#F5F5F5] p-4 text-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9B9B9B]">Se libera</p>
                  <p className="font-semibold capitalize text-[#5E5E5E] line-through">{fechaCorta(hoja.clase.fecha)} · {hoja.clase.hora}</p>
                </div>
              )}
              <div className="rounded-2xl border-2 border-[#121212] p-4 text-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9B9B9B]">{hoja.tipo === 'reagendar' ? 'Nuevo horario' : 'Tu clase'}</p>
                <p className="text-lg font-black capitalize text-[#121212]">{fechaCorta(elegido.fecha)} · {elegido.hora}</p>
                <p className="text-xs text-[#5E5E5E]">{elegido.modalidad} · {elegido.profesor}</p>
              </div>
              <p className="text-xs text-[#5E5E5E]">
                {hoja.tipo === 'reagendar'
                  ? 'Se usa el mismo crédito: no se descuenta una clase extra. Tus horarios fijos de las otras semanas no cambian.'
                  : 'Se usará 1 crédito de tu plan. Puedes cancelar o reagendar dentro del plazo sin perderlo.'}
              </p>
            </div>
          )}
        </HojaPortal>
      )}
    </div>
  );
}
