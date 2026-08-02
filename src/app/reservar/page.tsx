'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Clock, Users, ArrowRight, Star, Calendar,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

// ── Design tokens (NEXA blanco/negro) ────────────────────────────────────────
const D = {
  bg:       'var(--nexa-bg)',
  surface:  'var(--nexa-surface)',
  card:     'var(--nexa-card)',
  cardHov:  'var(--nexa-card-alt)',
  border:   'var(--nexa-border)',
  text:     'var(--nexa-text)',
  sub:      'var(--nexa-text-sub)',
  muted:    'var(--nexa-muted)',
  lime:     'var(--nexa-text)',
  limeDim:  'var(--nexa-accent-sub)',
  limeBord: 'var(--nexa-accent-glow)',
  red:      'var(--nexa-danger)',
  redDim:   'var(--nexa-danger-bg)',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlanGrupal {
  id:          string;
  nombre:      string;
  descripcion: string | null;
  precio_clp:  number;
  num_clases:  number;
  validez_dias: number;
  destacado:   boolean;
}

interface ClaseTipo {
  id:          string;
  nombre:      string;
  duracion_min: number;
}

interface SesionDisponible {
  clase_id:    string;
  nombre:      string;
  duracion_min: number;
  hora:        string;
  dia_semana:  number;
  capacidad:   number;
  disponibles: number;
  fecha:       string;
  bloqueada:   boolean;
  coach_nombre: string;
}

interface Datos {
  nombre:   string;
  apellido: string;
  email:    string;
  telefono: string;
  rut:      string;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

const DIAS_C = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_L = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES_C = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                 'septiembre','octubre','noviembre','diciembre'];

function clp(n: number) {
  return new Intl.NumberFormat('es-CL',{ style:'currency', currency:'CLP', minimumFractionDigits:0 }).format(n);
}

function parseFecha(f: string) {
  const d = new Date(f + 'T12:00:00');
  return { dia: DIAS_C[d.getDay()], num: d.getDate(), mes: MESES_C[d.getMonth()] };
}

function fechaLarga(f: string) {
  const d = new Date(f + 'T12:00:00');
  return `${DIAS_L[d.getDay()]} ${d.getDate()} de ${MESES_L[d.getMonth()]}`;
}

function validarRut(rut: string) {
  const s = rut.replace(/[^0-9kK]/g,'').toUpperCase();
  if (s.length < 2) return false;
  const body = s.slice(0,-1);
  const dv   = s.slice(-1);
  let sum = 0, factor = 2;
  for (let i = body.length-1; i >= 0; i--) {
    sum += parseInt(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const exp = 11 - (sum % 11);
  return dv === (exp===11?'0': exp===10?'K': String(exp));
}

function fmtRut(raw: string) {
  const s = raw.replace(/[^0-9kK]/g,'').toUpperCase();
  if (s.length < 2) return s;
  const body = s.slice(0,-1).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return `${body}-${s.slice(-1)}`;
}

const EMOJIS: Record<string,string> = {
  gap:'🍑', barre:'🩰', hyrox:'🔥', funcional:'💪',
  crossfit:'🏋️', yoga:'🧘', pilates:'🌀', boxing:'🥊',
};
function emoji(n: string) {
  const k = n.toLowerCase();
  for (const [key,v] of Object.entries(EMOJIS)) if (k.includes(key)) return v;
  return '⚡';
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function Logo() {
  return (
    <div className="flex items-center gap-2.5 mb-8">
      <div className="flex h-9 w-9 items-center justify-center rounded-[8px]"
        style={{ background: 'var(--nexa-text)' }}>
        <span className="select-none text-[13px] font-black tracking-widest" style={{ color:'#fff' }}>N</span>
      </div>
      <span className="select-none text-[15px] font-black tracking-[0.2em]" style={{ color: D.text }}>
        NEXA
      </span>
    </div>
  );
}

function PasoBar({ paso }: { paso: number }) {
  return (
    <div className="flex gap-1.5 mb-8">
      {[1,2,3,4].map(n => (
        <div key={n} className="flex-1 h-1 rounded-full transition-all duration-300"
          style={{ background: n <= paso ? D.lime : D.border }} />
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
        style={{ color: D.lime }} />
    </div>
  );
}

function Volver({ onClick }: { onClick:()=>void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 mb-6 text-[12px] font-semibold"
      style={{ color: D.muted }}>
      <ChevronLeft size={14} strokeWidth={2.5} /> Volver
    </button>
  );
}

function BtnNext({ label='Continuar', disabled, onClick, loading=false }: {
  label?: string; disabled: boolean; onClick:()=>void; loading?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-black tracking-wide transition-all"
      style={{
        background: (disabled||loading) ? D.card : 'var(--nexa-text)',
        color:      (disabled||loading) ? D.muted : '#fff',
      }}>
      {loading
        ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Procesando...</>
        : <>{label} <ChevronRight size={15} strokeWidth={2.5} /></>}
    </button>
  );
}

function Campo({ label, required=false, type='text', value, onChange, placeholder, error }:{
  label:string; required?:boolean; type?:string;
  value:string; onChange:(v:string)=>void; placeholder?:string; error?:string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.1em]"
        style={{ color: D.muted }}>
        {label}{required && <span style={{ color: D.lime }}> *</span>}
      </label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl px-4 py-3 text-[14px] outline-none transition"
        style={{
          background: D.card,
          border: `1px solid ${error ? D.red : D.border}`,
          color: D.text,
        }} />
      {error && <p className="text-[11px]" style={{ color: D.red }}>{error}</p>}
    </div>
  );
}

// ── Step 1: Plan ──────────────────────────────────────────────────────────────

function PasoPlan({ planes, loading, sel, onSel, onNext }: {
  planes: PlanGrupal[]; loading: boolean;
  sel: PlanGrupal|null; onSel:(p:PlanGrupal)=>void; onNext:()=>void;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: D.lime }}>
        Paso 1 de 4
      </p>
      <h1 className="text-[24px] font-black tracking-tight leading-tight mb-1" style={{ color: D.text }}>
        Elige tu pack
      </h1>
      <p className="text-[13px] mb-6" style={{ color: D.sub }}>
        Clases de prueba para conocer el estudio.
      </p>

      {loading ? <Spinner /> : planes.length === 0 ? (
        <p className="text-center py-8 text-[13px]" style={{ color: D.muted }}>
          No hay packs disponibles por el momento.
        </p>
      ) : (
        <div className="space-y-3 mb-8">
          {planes.map(p => {
            const active = sel?.id === p.id;
            return (
              <button key={p.id} onClick={() => onSel(p)}
                className="w-full text-left rounded-2xl p-4 transition-all duration-150 relative"
                style={{
                  background: active ? D.limeDim : D.card,
                  border: `1.5px solid ${active ? D.lime : D.border}`,
                }}>
                {p.destacado && (
                  <span className="absolute -top-2.5 left-4 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black"
                    style={{ background: D.lime, color:'#000' }}>
                    <Star size={9} fill="currentColor" /> Popular
                  </span>
                )}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-[16px] font-black mb-0.5" style={{ color: D.text }}>{p.nombre}</p>
                    {p.descripcion && (
                      <p className="text-[12px] mb-2" style={{ color: D.sub }}>{p.descripcion}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: D.border, color: D.sub }}>
                        {p.num_clases} {p.num_clases===1?'clase':'clases'}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: D.border, color: D.sub }}>
                        Válido {p.validez_dias} días
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[22px] font-black leading-none"
                      style={{ color: active ? D.lime : D.text }}>
                      {clp(p.precio_clp)}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: D.muted }}>CLP</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <BtnNext disabled={!sel} onClick={onNext} />
    </div>
  );
}

// ── Step 2: Clase ─────────────────────────────────────────────────────────────

function PasoClase({ clases, loading, sel, onSel, onNext, onBack }: {
  clases: ClaseTipo[]; loading: boolean;
  sel: ClaseTipo|null; onSel:(c:ClaseTipo)=>void; onNext:()=>void; onBack:()=>void;
}) {
  return (
    <div>
      <Volver onClick={onBack} />
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: D.lime }}>
        Paso 2 de 4
      </p>
      <h1 className="text-[24px] font-black tracking-tight leading-tight mb-1" style={{ color: D.text }}>
        ¿Qué clase quieres probar?
      </h1>
      <p className="text-[13px] mb-6" style={{ color: D.sub }}>
        Elige la disciplina que más te llame.
      </p>

      {loading ? <Spinner /> : clases.length === 0 ? (
        <p className="text-center py-8 text-[13px]" style={{ color: D.muted }}>
          No hay clases disponibles.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-8">
          {clases.map(c => {
            const active = sel?.nombre === c.nombre;
            return (
              <button key={c.id} onClick={() => onSel(c)}
                className="text-left rounded-2xl p-4 transition-all duration-150"
                style={{
                  background: active ? D.limeDim : D.card,
                  border: `1.5px solid ${active ? D.lime : D.border}`,
                }}>
                <div className="text-[26px] mb-2">{emoji(c.nombre)}</div>
                <p className="text-[14px] font-black" style={{ color: D.text }}>{c.nombre}</p>
                <p className="text-[11px] mt-0.5" style={{ color: D.sub }}>{c.duracion_min} min</p>
              </button>
            );
          })}
        </div>
      )}

      <BtnNext disabled={!sel} onClick={onNext} />
    </div>
  );
}

// ── Step 3: Horario ───────────────────────────────────────────────────────────

function PasoHorario({ sesiones, loading, sel, onSel, onNext, onBack }: {
  sesiones: SesionDisponible[]; loading: boolean;
  sel: SesionDisponible|null; onSel:(s:SesionDisponible|null)=>void;
  onNext:()=>void; onBack:()=>void;
}) {
  const fechasDisp = [...new Set(
    sesiones.filter(s => !s.bloqueada && s.disponibles > 0).map(s => s.fecha)
  )];

  const [fechaSel, setFechaSel] = useState<string>(fechasDisp[0] ?? '');

  useEffect(() => {
    if (fechasDisp.length > 0 && !fechasDisp.includes(fechaSel)) {
      setFechaSel(fechasDisp[0]);
    }
  }, [fechasDisp, fechaSel]);

  const slotsHoy = sesiones.filter(s => s.fecha === fechaSel);

  function cambiarFecha(f: string) {
    setFechaSel(f);
    onSel(null);
  }

  return (
    <div>
      <Volver onClick={onBack} />
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: D.lime }}>
        Paso 3 de 4
      </p>
      <h1 className="text-[24px] font-black tracking-tight leading-tight mb-1" style={{ color: D.text }}>
        Elige tu horario
      </h1>
      <p className="text-[13px] mb-5" style={{ color: D.sub }}>
        Selecciona el día y la hora que más te acomoden.
      </p>

      {loading ? <Spinner /> : fechasDisp.length === 0 ? (
        <div className="rounded-2xl py-14 text-center mb-8"
          style={{ background: D.card, border: `1px solid ${D.border}` }}>
          <Calendar size={32} strokeWidth={1.5} style={{ color: D.muted }} className="mx-auto mb-3" />
          <p className="text-[14px] font-semibold" style={{ color: D.sub }}>Sin disponibilidad próxima</p>
          <p className="mt-1 text-[12px]" style={{ color: D.muted }}>
            Contacta al estudio para más opciones.
          </p>
        </div>
      ) : (
        <>
          {/* Date chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth:'none' }}>
            {fechasDisp.map(f => {
              const { dia, num, mes } = parseFecha(f);
              const active = fechaSel === f;
              return (
                <button key={f} onClick={() => cambiarFecha(f)}
                  className="shrink-0 rounded-xl px-3 py-2.5 text-center transition-all"
                  style={{
                    background: active ? D.lime : D.card,
                    border: `1.5px solid ${active ? D.lime : D.border}`,
                    minWidth: '58px',
                  }}>
                  <p className="text-[9px] font-bold uppercase tracking-wide"
                    style={{ color: active ? '#000' : D.muted }}>{dia}</p>
                  <p className="text-[21px] font-black leading-none my-0.5"
                    style={{ color: active ? '#000' : D.text }}>{num}</p>
                  <p className="text-[9px] uppercase"
                    style={{ color: active ? '#000' : D.muted }}>{mes}</p>
                </button>
              );
            })}
          </div>

          {/* Time slots */}
          <div className="space-y-2.5 mb-8">
            {slotsHoy.map(s => {
              const active = sel?.clase_id === s.clase_id && sel?.fecha === s.fecha;
              const lleno  = s.disponibles === 0 || s.bloqueada;
              return (
                <button key={`${s.clase_id}-${s.fecha}`}
                  disabled={lleno}
                  onClick={() => onSel(s)}
                  className="w-full text-left rounded-2xl p-4 transition-all duration-150"
                  style={{
                    background: active ? D.limeDim : D.card,
                    border: `1.5px solid ${active ? D.lime : D.border}`,
                    opacity: lleno ? 0.4 : 1,
                    cursor:  lleno ? 'not-allowed' : 'pointer',
                  }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <Clock size={12} style={{ color: active ? D.lime : D.muted }} />
                        <p className="text-[17px] font-black" style={{ color: D.text }}>{s.hora}</p>
                      </div>
                      {s.coach_nombre && (
                        <p className="text-[12px]" style={{ color: D.sub }}>{s.coach_nombre}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {lleno ? (
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: D.redDim, color: D.red }}>Llena</span>
                      ) : (
                        <>
                          <div className="flex items-center gap-1 justify-end">
                            <Users size={11} style={{ color: active ? D.lime : D.sub }} />
                            <p className="text-[18px] font-black leading-none"
                              style={{ color: active ? D.lime : D.text }}>{s.disponibles}</p>
                          </div>
                          <p className="text-[9px] uppercase tracking-wide"
                            style={{ color: D.muted }}>de {s.capacidad}</p>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <BtnNext disabled={!sel} onClick={onNext} />
    </div>
  );
}

// ── Step 4: Datos + Resumen ───────────────────────────────────────────────────

function PasoDatos({ plan, sesion, datos, setDatos, onPagar, onBack, loading, error }: {
  plan: PlanGrupal; sesion: SesionDisponible;
  datos: Datos; setDatos:(d:Datos)=>void;
  onPagar:()=>void; onBack:()=>void;
  loading: boolean; error: string;
}) {
  const [rutErr, setRutErr] = useState('');

  function handleRut(v: string) {
    setDatos({ ...datos, rut: fmtRut(v) });
    setRutErr('');
  }

  const valid = datos.nombre.trim() && datos.apellido.trim() && datos.email.trim()
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email) && !rutErr;

  return (
    <div>
      <Volver onClick={onBack} />
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: D.lime }}>
        Paso 4 de 4
      </p>
      <h1 className="text-[24px] font-black tracking-tight leading-tight mb-1" style={{ color: D.text }}>
        Tus datos
      </h1>
      <p className="text-[13px] mb-5" style={{ color: D.sub }}>
        Completa tu información para confirmar la reserva.
      </p>

      {/* Resumen */}
      <div className="rounded-2xl p-4 mb-5" style={{ background: D.card, border: `1px solid ${D.border}` }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: D.muted }}>
          Resumen de tu reserva
        </p>
        <div className="space-y-2">
          {[
            ['Clase',   sesion.nombre],
            ['Fecha',   fechaLarga(sesion.fecha)],
            ['Hora',    sesion.hora],
            ...(sesion.coach_nombre ? [['Profesor', sesion.coach_nombre]] : []),
            ['Pack',    `${plan.nombre} · ${plan.num_clases} clase${plan.num_clases>1?'s':''}`],
          ].map(([k,v]) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <p className="text-[11px] shrink-0" style={{ color: D.muted }}>{k}</p>
              <p className="text-[12px] font-semibold text-right capitalize" style={{ color: D.text }}>{v}</p>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2.5 mt-0.5"
            style={{ borderTop: `1px solid ${D.border}` }}>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: D.muted }}>
              Total a pagar
            </p>
            <p className="text-[20px] font-black" style={{ color: D.lime }}>{clp(plan.precio_clp)}</p>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div className="space-y-3 mb-5">
        <Campo label="Nombre" required value={datos.nombre}
          onChange={v => setDatos({ ...datos, nombre: v })} placeholder="Tu nombre" />
        <Campo label="Apellido" required value={datos.apellido}
          onChange={v => setDatos({ ...datos, apellido: v })} placeholder="Tu apellido" />
        <Campo label="Email" required type="email" value={datos.email}
          onChange={v => setDatos({ ...datos, email: v })} placeholder="tu@email.com" />

        {/* Teléfono con prefijo */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: D.muted }}>Teléfono</label>
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 shrink-0 rounded-xl px-3 text-[13px] font-semibold"
              style={{ background: D.card, border:`1px solid ${D.border}`, color:D.text, height:'46px' }}>
              🇨🇱 <span>+56</span>
            </div>
            <input type="tel" value={datos.telefono}
              onChange={e => setDatos({ ...datos, telefono: e.target.value })}
              placeholder="9 1234 5678"
              className="flex-1 rounded-xl px-4 text-[14px] outline-none"
              style={{ background: D.card, border:`1px solid ${D.border}`, color:D.text, height:'46px' }} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: D.muted }}>RUT <span style={{ color: D.muted }}>(opcional)</span></label>
          <input type="text" value={datos.rut}
            onChange={e => handleRut(e.target.value)}
            onBlur={() => datos.rut && !validarRut(datos.rut) ? setRutErr('RUT inválido') : setRutErr('')}
            placeholder="12.345.678-9"
            className="w-full rounded-xl px-4 py-3 text-[14px] outline-none"
            style={{ background: D.card, border:`1px solid ${rutErr ? D.red : D.border}`, color:D.text }} />
          {rutErr && <p className="text-[11px]" style={{ color: D.red }}>{rutErr}</p>}
        </div>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-[13px] font-medium mb-4"
          style={{ background: D.redDim, border:`1px solid rgba(180,64,64,0.25)`, color: D.red }}>
          {error}
        </div>
      )}

      <BtnNext label="Continuar al pago" disabled={!valid} onClick={onPagar} loading={loading} />

      <div className="flex items-center justify-center gap-2 mt-4">
        <span className="text-[11px]" style={{ color: D.muted }}>🔒</span>
        <p className="text-[11px]" style={{ color: D.muted }}>
          Pago seguro a través de Flow
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Paso = 1 | 2 | 3 | 4;

export default function ReservarPage() {
  const [paso,      setPaso]      = useState<Paso>(1);
  const [planes,    setPlanes]    = useState<PlanGrupal[]>([]);
  const [clases,    setClases]    = useState<ClaseTipo[]>([]);
  const [sesiones,  setSesiones]  = useState<SesionDisponible[]>([]);
  const [loadP,     setLoadP]     = useState(true);
  const [loadC,     setLoadC]     = useState(false);
  const [loadS,     setLoadS]     = useState(false);
  const [plan,      setPlan]      = useState<PlanGrupal|null>(null);
  const [clase,     setClase]     = useState<ClaseTipo|null>(null);
  const [sesion,    setSesion]    = useState<SesionDisponible|null>(null);
  const [datos,     setDatos]     = useState<Datos>({ nombre:'', apellido:'', email:'', telefono:'', rut:'' });
  const [paying,    setPaying]    = useState(false);
  const [payError,  setPayError]  = useState('');

  // Load plans on mount
  useEffect(() => {
    supabase.from('planes_grupales').select('*').eq('activo',true).order('orden')
      .then(({ data }) => { setPlanes((data ?? []) as PlanGrupal[]); setLoadP(false); });
  }, []);

  const cargarClases = useCallback(async () => {
    setLoadC(true);
    const { data } = await supabase
      .from('clases_grupales')
      .select('id, nombre, duracion_min')
      .eq('activa', true)
      .order('nombre');
    // Deduplicate by nombre (same class can have multiple schedules)
    const seen = new Set<string>();
    const uniq: ClaseTipo[] = [];
    for (const c of (data ?? []) as ClaseTipo[]) {
      if (!seen.has(c.nombre)) { seen.add(c.nombre); uniq.push({ ...c, duracion_min: c.duracion_min ?? 50 }); }
    }
    setClases(uniq);
    setLoadC(false);
  }, []);

  const cargarSesiones = useCallback(async (nombre: string) => {
    setLoadS(true);
    const { data } = await supabase.rpc('get_sesiones_publicas', { p_dias: 21 });
    setSesiones(((data ?? []) as SesionDisponible[]).filter(s => s.nombre === nombre));
    setLoadS(false);
  }, []);

  function irPaso2() { if (!plan) return; cargarClases(); setPaso(2); }
  function irPaso3() { if (!clase) return; cargarSesiones(clase.nombre); setPaso(3); }
  function irPaso4() { if (!sesion) return; setPaso(4); }

  async function handlePagar() {
    if (!plan || !clase || !sesion) return;
    setPaying(true);
    setPayError('');
    try {
      const res = await fetch('/api/reservar/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId:   plan.id,
          claseId:  sesion.clase_id,
          fecha:    sesion.fecha,
          hora:     sesion.hora,
          nombre:   datos.nombre.trim(),
          apellido: datos.apellido.trim(),
          email:    datos.email.trim(),
          telefono: datos.telefono.trim() || null,
          rut:      datos.rut.trim()      || null,
        }),
      });
      const json = await res.json() as { payUrl?: string; error?: string };
      if (!res.ok || !json.payUrl) {
        setPayError(json.error ?? 'Error al procesar el pago. Inténtalo nuevamente.');
        setPaying(false);
        return;
      }
      // Redirect to Flow (navigate away, spinner keeps showing)
      window.location.href = json.payUrl;
    } catch {
      setPayError('Error de conexión. Verifica tu internet e inténtalo nuevamente.');
      setPaying(false);
    }
  }

  return (
    <main style={{ background: 'var(--nexa-surface)', minHeight: '100vh' }}>
      <div className="mx-auto max-w-md px-5 py-8 pb-16">
        <Logo />
        <PasoBar paso={paso} />

        {paso === 1 && (
          <PasoPlan planes={planes} loading={loadP}
            sel={plan} onSel={setPlan} onNext={irPaso2} />
        )}
        {paso === 2 && (
          <PasoClase clases={clases} loading={loadC}
            sel={clase} onSel={setClase}
            onNext={irPaso3} onBack={() => setPaso(1)} />
        )}
        {paso === 3 && clase && (
          <PasoHorario sesiones={sesiones} loading={loadS}
            sel={sesion} onSel={setSesion}
            onNext={irPaso4} onBack={() => setPaso(2)} />
        )}
        {paso === 4 && plan && sesion && (
          <PasoDatos plan={plan} sesion={sesion}
            datos={datos} setDatos={setDatos}
            onPagar={handlePagar} onBack={() => setPaso(3)}
            loading={paying} error={payError} />
        )}
      </div>
    </main>
  );
}
