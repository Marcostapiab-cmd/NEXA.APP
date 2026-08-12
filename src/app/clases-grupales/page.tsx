'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Check, Loader2 } from 'lucide-react';
import { DIAS_CORTO, MESES_CORTO, MESES_LARGO } from '@/lib/format';

// ── Tipos ────────────────────────────────────────────────────

interface Plan {
  id:           string;
  nombre:       string;
  descripcion:  string | null;
  precio_clp:   number;
  num_clases:   number;
  validez_dias: number;
  destacado:    boolean;
}

interface Sesion {
  clase_id:     string;
  nombre:       string;
  hora:         string;
  dia_semana:   number;
  capacidad:    number;
  disponibles:  number;
  fecha:        string;
  bloqueada:    boolean;
  coach_nombre: string;
}

// ── Helpers ──────────────────────────────────────────────────

function fechaChip(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return { dia: DIAS_CORTO[d.getDay()], num: d.getDate(), mes: MESES_CORTO[d.getMonth()] };
}

function fechaLarga(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS_CORTO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`;
}

function formatPrecio(n: number) {
  return `$${n.toLocaleString('es-CL')}`;
}

// ── Componentes base ─────────────────────────────────────────

function StepTitle({ n, label, active }: { n: number; label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-black"
        style={{ background: active ? 'var(--nexa-text)' : 'var(--nexa-border)', color: active ? '#fff' : 'var(--nexa-muted)' }}>
        {n}
      </div>
      <p className="text-[15px] font-black" style={{ color: active ? 'var(--nexa-text)' : 'var(--nexa-muted)' }}>
        {label}
      </p>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────

export default function ClasesGrupalesPage() {
  const [planes,   setPlanes]   = useState<Plan[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [cargando, setCargando] = useState(true);

  const [planSel,   setPlanSel]   = useState<Plan   | null>(null);
  const [claseNom,  setClaseNom]  = useState<string | null>(null);
  const [fechaSel,  setFechasSel] = useState<string | null>(null);
  const [sesionSel, setSesionSel] = useState<Sesion | null>(null);

  const [form, setForm] = useState({ nombre: '', apellido: '', email: '', telefono: '', rut: '' });
  const [paying,  setPaying]  = useState(false);
  const [error,   setError]   = useState('');
  const [exito,   setExito]   = useState(false);

  const paso2Ref = useRef<HTMLDivElement>(null);
  const paso3Ref = useRef<HTMLDivElement>(null);
  const paso4Ref = useRef<HTMLDivElement>(null);

  // Cargar planes y sesiones al inicio
  useEffect(() => {
    async function init() {
      const [{ data: pl }, { data: ses }] = await Promise.all([
        supabase.from('planes_grupales').select('*').eq('activo', true).order('orden'),
        supabase.rpc('get_sesiones_publicas', { p_dias: 21 }),
      ]);
      setPlanes((pl ?? []) as Plan[]);
      setSesiones((ses ?? []).filter((s: Sesion) => !s.bloqueada && s.disponibles > 0) as Sesion[]);
      setCargando(false);
    }
    init();
  }, []);

  // Tipos de clase únicos
  const clasesUnicas: { nombre: string; duracion_min?: number }[] = [];
  const _nombres = new Set<string>();
  for (const s of sesiones) {
    if (!_nombres.has(s.nombre)) { _nombres.add(s.nombre); clasesUnicas.push({ nombre: s.nombre }); }
  }

  // Sesiones filtradas por clase seleccionada
  const sesionesFiltradas = claseNom ? sesiones.filter(s => s.nombre === claseNom) : [];

  // Fechas únicas de esas sesiones
  const fechasUnicas: string[] = [];
  const _fechas = new Set<string>();
  for (const s of sesionesFiltradas) {
    if (!_fechas.has(s.fecha)) { _fechas.add(s.fecha); fechasUnicas.push(s.fecha); }
  }

  // Sesiones del día seleccionado
  const sesionesDelDia = fechaSel ? sesionesFiltradas.filter(s => s.fecha === fechaSel) : [];

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function selPlan(p: Plan) {
    setPlanSel(p);
    setClaseNom(null); setFechasSel(null); setSesionSel(null);
    scrollTo(paso2Ref);
  }

  function selClase(nombre: string) {
    setClaseNom(nombre);
    setFechasSel(fechasUnicas[0] ?? null);
    setSesionSel(null);
    scrollTo(paso3Ref);
  }

  function selFecha(f: string) {
    setFechasSel(f);
    setSesionSel(null);
  }

  function selSesion(s: Sesion) {
    setSesionSel(s);
    scrollTo(paso4Ref);
  }

  const set = useCallback((k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value })),
  []);

  async function handlePagar(e: React.FormEvent) {
    e.preventDefault();
    if (!planSel || !sesionSel) return;
    if (!form.nombre.trim() || !form.apellido.trim()) { setError('Nombre y apellido son obligatorios.'); return; }
    if (!form.email.trim()) { setError('El email es obligatorio para el pago.'); return; }
    setError('');
    setPaying(true);

    try {
      const res = await fetch('/api/reservar/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId:   planSel.id,
          claseId:  sesionSel.clase_id,
          fecha:    sesionSel.fecha,
          hora:     sesionSel.hora,
          nombre:   form.nombre.trim(),
          apellido: form.apellido.trim(),
          email:    form.email.trim(),
          telefono: form.telefono.trim() || null,
          rut:      form.rut.trim()      || null,
        }),
      });

      const json = await res.json() as { payUrl?: string; error?: string };
      if (!res.ok || !json.payUrl) {
        setError(json.error ?? 'Error al procesar el pago. Intenta de nuevo.');
        setPaying(false);
        return;
      }
      window.location.href = json.payUrl;
    } catch {
      setError('No se pudo conectar para procesar el pago. Revisa tu conexión e intenta de nuevo.');
      setPaying(false);
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--nexa-muted)' }} />
      </div>
    );
  }

  if (exito) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full"
            style={{ background: 'var(--nexa-success-bg)' }}>
            <Check size={40} strokeWidth={2.5} style={{ color: 'var(--nexa-success)' }} />
          </div>
          <h2 className="text-[24px] font-black" style={{ color: 'var(--nexa-text)' }}>¡Reserva confirmada!</h2>
          <p className="mt-2 text-[14px]" style={{ color: 'var(--nexa-muted)' }}>Tu cupo está guardado.</p>
          <button onClick={() => setExito(false)}
            className="mt-6 text-[13px] underline" style={{ color: 'var(--nexa-muted)' }}>
            Reservar otra clase
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--nexa-bg)' }}>
      <div className="mx-auto max-w-md px-4 py-8 pb-20 space-y-8">

        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: 'var(--nexa-text)' }}>
            <span className="text-[11px] font-black" style={{ color: '#fff' }}>N</span>
          </div>
          <span className="text-[14px] font-black tracking-[0.16em]" style={{ color: 'var(--nexa-text)' }}>NEXA</span>
        </div>

        {/* Título */}
        <div>
          <h1 className="text-[26px] font-black leading-tight" style={{ color: 'var(--nexa-text)' }}>
            Agenda tu clase
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--nexa-muted)' }}>
            Elige tu pack, la clase y el horario que más te acomode.
          </p>
        </div>

        {/* ── PASO 1: Elige el plan ────────────────────────── */}
        <section>
          <StepTitle n={1} label="Elige tu pack" active={true} />
          <div className="space-y-2.5">
            {planes.map(p => {
              const sel = planSel?.id === p.id;
              return (
                <button key={p.id} onClick={() => selPlan(p)}
                  className="w-full rounded-2xl p-4 text-left transition-all"
                  style={{
                    background: sel ? 'var(--nexa-text)' : 'var(--nexa-card)',
                    border:     `1.5px solid ${sel ? 'var(--nexa-text)' : 'var(--nexa-border)'}`,
                  }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {p.destacado && !sel && (
                        <span className="mb-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide"
                          style={{ background: 'var(--nexa-text)', color: '#fff' }}>
                          Popular
                        </span>
                      )}
                      <p className="text-[15px] font-black" style={{ color: sel ? '#fff' : 'var(--nexa-text)' }}>
                        {p.nombre}
                      </p>
                      <p className="mt-0.5 text-[12px]" style={{ color: sel ? 'rgba(255,255,255,0.65)' : 'var(--nexa-muted)' }}>
                        {p.num_clases} {p.num_clases === 1 ? 'clase' : 'clases'} · válido por {p.validez_dias} días
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[20px] font-black" style={{ color: sel ? '#fff' : 'var(--nexa-text)' }}>
                        {formatPrecio(p.precio_clp)}
                      </p>
                      {sel && (
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                          <Check size={11} /> Seleccionado
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── PASO 2: Elige la clase ───────────────────────── */}
        {planSel && (
          <section ref={paso2Ref}>
            <StepTitle n={2} label="Elige la clase" active={true} />
            {clasesUnicas.length === 0 ? (
              <p className="text-[13px]" style={{ color: 'var(--nexa-muted)' }}>Sin clases disponibles.</p>
            ) : (
              <div className="space-y-2">
                {clasesUnicas.map(c => {
                  const sel = claseNom === c.nombre;
                  return (
                    <button key={c.nombre} onClick={() => selClase(c.nombre)}
                      className="w-full rounded-2xl px-4 py-3.5 text-left transition-all"
                      style={{
                        background: sel ? 'var(--nexa-text)' : 'var(--nexa-card)',
                        border:     `1.5px solid ${sel ? 'var(--nexa-text)' : 'var(--nexa-border)'}`,
                      }}>
                      <p className="text-[14px] font-bold" style={{ color: sel ? '#fff' : 'var(--nexa-text)' }}>
                        {c.nombre}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── PASO 3: Elige el horario ─────────────────────── */}
        {planSel && claseNom && (
          <section ref={paso3Ref}>
            <StepTitle n={3} label="Elige el horario" active={true} />

            {fechasUnicas.length === 0 ? (
              <div className="rounded-2xl px-4 py-6 text-center"
                style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
                <p className="text-[13px]" style={{ color: 'var(--nexa-muted)' }}>
                  No hay horarios disponibles para {claseNom} en las próximas 3 semanas.
                </p>
              </div>
            ) : (
              <>
                {/* Chips de fecha */}
                <div className="flex gap-2 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: 'none' }}>
                  {fechasUnicas.map(f => {
                    const { dia, num, mes } = fechaChip(f);
                    const sel = fechaSel === f;
                    return (
                      <button key={f} onClick={() => selFecha(f)}
                        className="shrink-0 flex flex-col items-center rounded-xl px-3 py-2 transition-all"
                        style={{
                          background: sel ? 'var(--nexa-text)' : 'var(--nexa-card)',
                          border:     `1.5px solid ${sel ? 'var(--nexa-text)' : 'var(--nexa-border)'}`,
                          minWidth:   56,
                        }}>
                        <span className="text-[9px] font-bold uppercase" style={{ color: sel ? 'rgba(255,255,255,0.7)' : 'var(--nexa-muted)' }}>{dia}</span>
                        <span className="text-[18px] font-black leading-tight" style={{ color: sel ? '#fff' : 'var(--nexa-text)' }}>{num}</span>
                        <span className="text-[9px] uppercase" style={{ color: sel ? 'rgba(255,255,255,0.7)' : 'var(--nexa-muted)' }}>{mes}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Horarios del día */}
                {fechaSel && (
                  <div className="space-y-2">
                    {sesionesDelDia.map(s => {
                      const sel = sesionSel?.hora === s.hora && sesionSel?.fecha === s.fecha;
                      return (
                        <button key={`${s.fecha}|${s.hora}`} onClick={() => selSesion(s)}
                          className="w-full rounded-2xl px-4 py-4 text-left transition-all"
                          style={{
                            background: sel ? 'var(--nexa-text)' : 'var(--nexa-card)',
                            border:     `1.5px solid ${sel ? 'var(--nexa-text)' : 'var(--nexa-border)'}`,
                          }}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[18px] font-black" style={{ color: sel ? '#fff' : 'var(--nexa-text)' }}>
                                {s.hora}
                              </p>
                              <p className="text-[11px] mt-0.5" style={{ color: sel ? 'rgba(255,255,255,0.65)' : 'var(--nexa-muted)' }}>
                                {s.nombre}{s.coach_nombre ? ` · ${s.coach_nombre}` : ''}
                              </p>
                            </div>
                            <span className="text-[12px] font-semibold"
                              style={{ color: s.disponibles <= 3 ? (sel ? '#fca5a5' : 'var(--nexa-danger)') : (sel ? 'rgba(255,255,255,0.7)' : 'var(--nexa-muted)') }}>
                              {s.disponibles} cupo{s.disponibles !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ── PASO 4: Tus datos ────────────────────────────── */}
        {planSel && claseNom && sesionSel && (
          <section ref={paso4Ref}>
            <StepTitle n={4} label="Tus datos" active={true} />

            <form onSubmit={handlePagar} className="space-y-4">
              {/* Resumen */}
              <div className="rounded-2xl p-4 space-y-1.5"
                style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
                <div className="flex items-start gap-2 text-[12px]">
                  <span style={{ color: 'var(--nexa-muted)' }}>📅</span>
                  <span style={{ color: 'var(--nexa-text-sub)' }}>
                    {fechaLarga(sesionSel.fecha)} · {sesionSel.hora}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-[12px]">
                  <span style={{ color: 'var(--nexa-muted)' }}>🏋️</span>
                  <span style={{ color: 'var(--nexa-text-sub)' }}>
                    {sesionSel.nombre}{sesionSel.coach_nombre ? ` · ${sesionSel.coach_nombre}` : ''}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-[12px]">
                  <span style={{ color: 'var(--nexa-muted)' }}>💳</span>
                  <span style={{ color: 'var(--nexa-text-sub)' }}>
                    {planSel.nombre} · {formatPrecio(planSel.precio_clp)}
                  </span>
                </div>
              </div>

              {/* Campos */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--nexa-muted)' }}>Nombre *</label>
                  <input type="text" required value={form.nombre} onChange={set('nombre')} placeholder="Tu nombre"
                    className="nexa-input w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--nexa-muted)' }}>Apellido *</label>
                  <input type="text" required value={form.apellido} onChange={set('apellido')} placeholder="Tu apellido"
                    className="nexa-input w-full" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--nexa-muted)' }}>Email *</label>
                <input type="email" required value={form.email} onChange={set('email')} placeholder="tu@email.com"
                  className="nexa-input w-full" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--nexa-muted)' }}>Teléfono</label>
                  <input type="tel" value={form.telefono} onChange={set('telefono')} placeholder="+56 9 ..."
                    className="nexa-input w-full" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--nexa-muted)' }}>RUT</label>
                  <input type="text" value={form.rut} onChange={set('rut')} placeholder="12.345.678-9"
                    className="nexa-input w-full" />
                </div>
              </div>

              {error && (
                <div className="rounded-xl px-4 py-3 text-[13px]"
                  style={{ background: 'var(--nexa-danger-bg)', color: 'var(--nexa-danger)' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={paying}
                className="nexa-btn-primary flex w-full items-center justify-center gap-2 py-4 text-[15px]">
                {paying
                  ? <><Loader2 size={16} className="animate-spin" /> Redirigiendo a Flow…</>
                  : `Continuar al pago · ${formatPrecio(planSel.precio_clp)}`}
              </button>

              <p className="text-center text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                Pago seguro con Flow · Tarjeta, débito o transferencia
              </p>
            </form>
          </section>
        )}

      </div>
    </main>
  );
}
