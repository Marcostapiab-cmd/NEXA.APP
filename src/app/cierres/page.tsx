'use client';

// Cierres y ausencias (Fase 6). Feriados, cierres, mantenciones, eventos,
// horario reducido, vacaciones y ausencias de profesores. Al crear uno se ven
// las clases afectadas y se decide: suspender (el alumno conserva su crédito),
// buscar profesor sustituto o revisarlas una por una. También: lista de espera.
// Los profesores solo ven "Avisar una ausencia" y sus propias ausencias.

import { useCallback, useEffect, useState } from 'react';
import { CalendarOff, RefreshCw, Trash2, CheckCircle2, UserCheck, Ban, Check, Users, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { hoyLocal } from '@/lib/format';
import {
  TIPOS_CIERRE, aprobarAusencia, avisarAusencia, crearCierre, eliminarCierre, getCierres, getConfigOperacion,
  getListaEspera, resolverClase, saveConfigOperacion, vistaPrevia,
  type AccionCierre, type Cierre, type ClaseAfectada, type ClasePrevia, type ConfigOperacion, type Espera, type TipoCierre,
} from '@/lib/operacion';

interface Coach { id: string; nombre: string }

const fechaCorta = (f: string) => new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-CL', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
});
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago',
});
const rango = (c: { desde: string; hasta: string; hora_inicio: string | null; hora_fin: string | null }) =>
  `${fechaCorta(c.desde)}${c.hasta !== c.desde ? ` al ${fechaCorta(c.hasta)}` : ''}${c.hora_inicio ? ` · ${c.hora_inicio}–${c.hora_fin}` : ' · día completo'}`;

const ESTADO_CLASE: Record<ClaseAfectada['estado'], { label: string; color: string }> = {
  pendiente:           { label: 'Por resolver',          color: '#d97706' },
  sustituida:          { label: 'Con sustituto',          color: 'var(--nexa-success)' },
  suspendida:          { label: 'Suspendida (sin costo)', color: 'var(--nexa-muted)' },
  se_mantiene:         { label: 'Se mantiene',            color: 'var(--nexa-success)' },
  resuelta_por_alumno: { label: 'El alumno la movió',     color: 'var(--nexa-muted)' },
};

const inputCls = 'w-full rounded-[8px] px-3 py-2 text-sm outline-none';
const inputSty = { border: '1px solid var(--nexa-border)', background: 'var(--nexa-card)', color: 'var(--nexa-text)' } as const;
const btnSec = { border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)', background: 'var(--nexa-card)' } as const;

function Tarjeta({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="rounded-[12px] p-4 sm:p-5" style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--nexa-muted)' }}>{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Aviso({ tipo, children }: { tipo: 'ok' | 'error' | 'info'; children: React.ReactNode }) {
  const s = tipo === 'ok' ? { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }
          : tipo === 'error' ? { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }
          : { background: '#eff6ff', color: '#1e3a8a', border: '1px solid #bfdbfe' };
  return <div className="rounded-[10px] px-4 py-3 text-sm" style={s}>{children}</div>;
}

// ── Formulario: nuevo cierre (administración) ──────────────────────────────
function NuevoCierre({ coaches, onCreado }: { coaches: Coach[]; onCreado: (msg: string) => void }) {
  const hoy = hoyLocal();
  const [tipo, setTipo]       = useState<TipoCierre>('feriado');
  const [coach, setCoach]     = useState('');
  const [desde, setDesde]     = useState(hoy);
  const [hasta, setHasta]     = useState(hoy);
  const [completo, setCompleto] = useState(true);
  const [hi, setHi]           = useState('09:00');
  const [hf, setHf]           = useState('13:00');
  const [motivo, setMotivo]   = useState('');
  const [accionElegida, setAccion] = useState<AccionCierre | null>(null);
  const [previaGuardada, setPreviaGuardada] = useState<{ clave: string; clases: ClasePrevia[] } | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const esProfesor = TIPOS_CIERRE.find(t => t.id === tipo)?.profesor ?? false;
  const coachId = esProfesor ? coach || null : null;
  const horas = completo && tipo !== 'horario_reducido' ? [null, null] as const : [hi, hf] as const;

  // Cualquier cambio en los datos invalida la vista previa
  const clave = [tipo, coach, desde, hasta, completo, hi, hf].join('|');
  const previa = previaGuardada?.clave === clave ? previaGuardada.clases : null;
  const setPrevia = (c: ClasePrevia[] | null) => setPreviaGuardada(c ? { clave, clases: c } : null);
  // "Sustituto" solo existe para ausencias de un profesor
  const accion: AccionCierre = accionElegida && !(accionElegida === 'sustituir' && !esProfesor)
    ? accionElegida : esProfesor ? 'sustituir' : 'suspender';

  async function revisar() {
    setError(null);
    if (esProfesor && !coach) { setError('Elige el profesor.'); return; }
    if (hasta < desde) { setError('La fecha de término debe ser igual o posterior a la de inicio.'); return; }
    setTrabajando(true);
    const r = await vistaPrevia(desde, hasta, horas[0], horas[1], coachId);
    setTrabajando(false);
    if (!r.ok) { setError(r.mensaje); return; }
    setPrevia(r.clases);
  }

  async function guardar() {
    setError(null); setTrabajando(true);
    const r = await crearCierre({ tipo, desde, hasta, horaInicio: horas[0], horaFin: horas[1], coach: coachId, motivo, accion });
    setTrabajando(false);
    if (!r.ok) { setError(r.mensaje); return; }
    const partes = [
      r.suspendidas ? `${r.suspendidas} suspendida(s) sin costo para el alumno` : '',
      r.sustituidas ? `${r.sustituidas} con profesor sustituto` : '',
      r.pendientes ? `${r.pendientes} por resolver` : '',
    ].filter(Boolean);
    onCreado(`Cierre guardado. ${r.afectadas ? `Clases afectadas: ${r.afectadas} (${partes.join(', ')}). A los alumnos se les avisó por correo.` : 'No había clases agendadas en ese horario.'}`);
    setMotivo(''); setPrevia(null);
  }

  return (
    <Tarjeta titulo="Nuevo cierre o ausencia">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
          Tipo
          <select value={tipo} onChange={e => setTipo(e.target.value as TipoCierre)} className={`${inputCls} mt-1`} style={inputSty}>
            {TIPOS_CIERRE.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        {esProfesor && (
          <label className="block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
            Profesor
            <select value={coach} onChange={e => setCoach(e.target.value)} className={`${inputCls} mt-1`} style={inputSty}>
              <option value="">Elige…</option>
              {coaches.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
          Desde
          <input type="date" value={desde} min={hoy} onChange={e => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value); }}
            className={`${inputCls} mt-1`} style={inputSty} />
        </label>
        <label className="block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
          Hasta
          <input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} className={`${inputCls} mt-1`} style={inputSty} />
        </label>
      </div>

      <div className="mt-3">
        {tipo !== 'horario_reducido' && (
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--nexa-text)' }}>
            <input type="checkbox" checked={completo} onChange={e => setCompleto(e.target.checked)} /> Día completo
          </label>
        )}
        {(!completo || tipo === 'horario_reducido') && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
              {tipo === 'horario_reducido' ? 'Sin atención desde' : 'Desde las'}
              <input type="time" step={3600} value={hi} onChange={e => setHi(e.target.value)} className={`${inputCls} mt-1`} style={inputSty} />
            </label>
            <label className="block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
              Hasta las
              <input type="time" step={3600} value={hf} onChange={e => setHf(e.target.value)} className={`${inputCls} mt-1`} style={inputSty} />
            </label>
          </div>
        )}
      </div>

      <label className="mt-3 block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
        Motivo (lo verá el alumno en el correo)
        <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={140}
          placeholder={esProfesor ? 'Ej.: licencia médica' : 'Ej.: Feriado nacional'} className={`${inputCls} mt-1`} style={inputSty} />
      </label>

      {error && <div className="mt-3"><Aviso tipo="error">{error}</Aviso></div>}

      {!previa ? (
        <button onClick={revisar} disabled={trabajando}
          className="mt-4 rounded-[8px] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--nexa-text)' }}>
          {trabajando ? 'Revisando…' : 'Ver clases afectadas'}
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          {previa.length === 0 ? (
            <Aviso tipo="info">No hay clases agendadas en ese horario. Se bloqueará para nuevas reservas.</Aviso>
          ) : (
            <>
              <p className="text-sm font-semibold" style={{ color: 'var(--nexa-text)' }}>{previa.length} clase(s) afectada(s):</p>
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-[8px] p-2" style={{ border: '1px solid var(--nexa-border)' }}>
                {previa.map(c => (
                  <li key={c.reserva_id} className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-sm">
                    <span style={{ color: 'var(--nexa-text)' }}>{fechaCorta(c.fecha)} · {c.hora} · {c.alumno ?? '—'} <span style={{ color: 'var(--nexa-muted)' }}>({c.modalidad}, {c.profesor ?? 'sin profesor'})</span></span>
                    {esProfesor && (
                      <span className="text-xs" style={{ color: c.sustitutos.length ? 'var(--nexa-success)' : '#d97706' }}>
                        {c.sustitutos.length ? `Libres: ${c.sustitutos.map(s => s.nombre).join(', ')}` : 'Sin profesor libre'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>¿Qué hacemos con estas clases?</legend>
                {([
                  esProfesor && ['sustituir', 'Asignar un profesor sustituto', 'Se mantiene la clase con un profesor libre a esa hora. Si no hay ninguno, queda por resolver.'],
                  ['suspender', 'Suspender todas', 'El alumno no pierde el crédito y recibe un correo para reservar otro horario.'],
                  ['revisar', 'Decidir una por una', 'Quedan "por resolver" abajo y en Requiere atención.'],
                ].filter(Boolean) as [AccionCierre, string, string][]).map(([id, t, d]) => (
                  <label key={id} className="flex cursor-pointer gap-2 rounded-[8px] p-2 text-sm"
                    style={{ border: `1px solid ${accion === id ? 'var(--nexa-text)' : 'var(--nexa-border)'}` }}>
                    <input type="radio" name="accion" checked={accion === id} onChange={() => setAccion(id)} className="mt-1" />
                    <span><span className="font-semibold" style={{ color: 'var(--nexa-text)' }}>{t}</span>
                      <span className="block text-xs" style={{ color: 'var(--nexa-text-sub)' }}>{d}</span></span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={guardar} disabled={trabajando}
              className="rounded-[8px] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--nexa-text)' }}>
              {trabajando ? 'Guardando…' : 'Guardar cierre'}
            </button>
            <button onClick={() => setPrevia(null)} disabled={trabajando} className="rounded-[8px] px-4 py-2.5 text-sm font-semibold" style={btnSec}>
              Volver
            </button>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}

// ── Tarjeta de un cierre con sus clases ────────────────────────────────────
function FilaClase({ c, staff, onCambio, onError }: {
  c: ClaseAfectada; staff: boolean; onCambio: () => void; onError: (m: string) => void;
}) {
  const [sust, setSust] = useState(c.sustitutos[0]?.id ?? '');
  const [trab, setTrab] = useState(false);
  const est = ESTADO_CLASE[c.estado];

  async function hacer(accion: 'sustituir' | 'suspender' | 'mantener') {
    if (accion === 'suspender' && !confirm('¿Suspender esta clase? El alumno conserva su crédito y recibe un correo.')) return;
    setTrab(true);
    const r = await resolverClase(c.id, accion, accion === 'sustituir' ? sust : undefined);
    setTrab(false);
    if (!r.ok) onError(r.mensaje); else onCambio();
  }

  return (
    <li className="rounded-[8px] px-3 py-2" style={{ background: 'var(--nexa-card-alt, #f8f8f8)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span style={{ color: 'var(--nexa-text)' }}>
          {fechaCorta(c.fecha)} · <strong>{c.hora}</strong> · {c.alumno ?? '—'}
          <span style={{ color: 'var(--nexa-muted)' }}> ({c.modalidad}{c.profesor ? `, ${c.profesor}` : ''})</span>
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: est.color }}>{est.label}</span>
      </div>
      {c.solucion && c.estado !== 'pendiente' && <p className="mt-0.5 text-xs" style={{ color: 'var(--nexa-text-sub)' }}>{c.solucion}</p>}
      {c.estado === 'pendiente' && staff && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {c.sustitutos.length > 0 ? (
            <>
              <select value={sust} onChange={e => setSust(e.target.value)} className="rounded-[8px] px-2 py-1.5 text-xs" style={inputSty} aria-label="Profesor sustituto">
                {c.sustitutos.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <button onClick={() => hacer('sustituir')} disabled={trab || !sust}
                className="flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50" style={{ background: 'var(--nexa-success)' }}>
                <UserCheck size={12} /> Asignar
              </button>
            </>
          ) : (
            <span className="text-xs" style={{ color: '#d97706' }}>Sin profesor libre a esa hora</span>
          )}
          <button onClick={() => hacer('suspender')} disabled={trab} className="flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-xs font-semibold" style={btnSec}>
            <Ban size={12} /> Suspender
          </button>
          <button onClick={() => hacer('mantener')} disabled={trab} className="flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-xs font-semibold" style={btnSec}>
            <Check size={12} /> Mantener
          </button>
        </div>
      )}
    </li>
  );
}

function TarjetaCierre({ c, staff, onCambio, onError }: { c: Cierre; staff: boolean; onCambio: () => void; onError: (m: string) => void }) {
  const pend = c.clases.filter(x => x.estado === 'pendiente').length;
  const [abierta, setAbierta] = useState(pend > 0);

  async function quitar() {
    if (!confirm('¿Quitar este cierre? El horario vuelve a quedar disponible. Las clases que ya se suspendieron no se reactivan.')) return;
    const r = await eliminarCierre(c.grupo_id);
    if (!r.ok) onError(r.mensaje); else onCambio();
  }
  async function aprobar() {
    const r = await aprobarAusencia(c.grupo_id);
    if (!r.ok) onError(r.mensaje); else onCambio();
  }

  return (
    <li className="rounded-[12px]" style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)', borderLeft: `3px solid ${pend ? '#d97706' : 'var(--nexa-border)'}` }}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <button onClick={() => setAbierta(!abierta)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-x-2">
            <p className="font-semibold" style={{ color: 'var(--nexa-text)' }}>{c.tipo_nombre}{c.profesor ? ` · ${c.profesor}` : ''}</p>
            {c.estado === 'por_aprobar' && <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#d97706' }}>Avisada por el profesor</span>}
          </div>
          <p className="text-sm" style={{ color: 'var(--nexa-text-sub)' }}>{rango(c)}{c.motivo ? ` · ${c.motivo}` : ''}</p>
          <p className="mt-0.5 text-xs" style={{ color: pend ? '#d97706' : 'var(--nexa-faint)' }}>
            {c.clases.length === 0 ? 'Sin clases afectadas' : `${c.clases.length} clase(s) afectada(s)${pend ? ` · ${pend} por resolver` : ' · todas resueltas'}`}
          </p>
        </button>
        {staff && (
          <div className="flex gap-2">
            {c.estado === 'por_aprobar' && (
              <button onClick={aprobar} className="flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-xs font-semibold text-white" style={{ background: 'var(--nexa-success)' }}>
                <CheckCircle2 size={12} /> Tomar conocimiento
              </button>
            )}
            <button onClick={quitar} aria-label="Quitar cierre" className="rounded-[8px] p-2" style={btnSec}><Trash2 size={13} /></button>
          </div>
        )}
      </div>
      {abierta && c.clases.length > 0 && (
        <ul className="space-y-1.5 px-4 pb-4">
          {c.clases.map(x => <FilaClase key={x.id} c={x} staff={staff} onCambio={onCambio} onError={onError} />)}
        </ul>
      )}
    </li>
  );
}

// ── Profesor: avisar ausencia ──────────────────────────────────────────────
function AvisarAusencia({ onAvisada }: { onAvisada: (m: string) => void }) {
  const hoy = hoyLocal();
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [completo, setCompleto] = useState(true);
  const [hi, setHi] = useState('09:00');
  const [hf, setHf] = useState('13:00');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [trab, setTrab] = useState(false);

  async function enviar() {
    setError(null); setTrab(true);
    const r = await avisarAusencia(desde, hasta, completo ? null : hi, completo ? null : hf, motivo);
    setTrab(false);
    if (!r.ok) { setError(r.mensaje); return; }
    setMotivo('');
    onAvisada(r.afectadas
      ? `Ausencia registrada. Tienes ${r.afectadas} clase(s) en ese horario: ${r.sustituidas ? `${r.sustituidas} ya tienen sustituto` : 'administración las va a resolver'}${r.pendientes && r.sustituidas ? ` y ${r.pendientes} quedan por resolver` : ''}.`
      : 'Ausencia registrada. No tenías clases en ese horario.');
  }

  return (
    <Tarjeta titulo="Avisar una ausencia">
      <p className="mb-3 text-sm" style={{ color: 'var(--nexa-text-sub)' }}>
        Ese horario se bloquea para nuevas reservas y administración decide qué hacer con tus clases. Tus alumnos nunca pierden su crédito.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Desde
          <input type="date" value={desde} min={hoy} onChange={e => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value); }} className={`${inputCls} mt-1`} style={inputSty} />
        </label>
        <label className="block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Hasta
          <input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} className={`${inputCls} mt-1`} style={inputSty} />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--nexa-text)' }}>
        <input type="checkbox" checked={completo} onChange={e => setCompleto(e.target.checked)} /> Día completo
      </label>
      {!completo && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <input type="time" step={3600} value={hi} onChange={e => setHi(e.target.value)} className={inputCls} style={inputSty} aria-label="Desde las" />
          <input type="time" step={3600} value={hf} onChange={e => setHf(e.target.value)} className={inputCls} style={inputSty} aria-label="Hasta las" />
        </div>
      )}
      <label className="mt-3 block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Motivo
        <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={140} placeholder="Ej.: control médico" className={`${inputCls} mt-1`} style={inputSty} />
      </label>
      {error && <div className="mt-3"><Aviso tipo="error">{error}</Aviso></div>}
      <button onClick={enviar} disabled={trab || !motivo.trim()}
        className="mt-4 rounded-[8px] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--nexa-text)' }}>
        {trab ? 'Enviando…' : 'Avisar ausencia'}
      </button>
    </Tarjeta>
  );
}

// ── Lista de espera y política ─────────────────────────────────────────────
function ListaEspera({ lista, config, onGuardado }: { lista: Espera[]; config: ConfigOperacion | null; onGuardado: (m: string | null, err?: string) => void }) {
  const [c, setC] = useState<ConfigOperacion | null>(config);
  const [trab, setTrab] = useState(false);

  async function guardar() {
    if (!c) return;
    setTrab(true);
    const e = await saveConfigOperacion(c);
    setTrab(false);
    onGuardado(e ? null : 'Configuración guardada.', e ?? undefined);
  }

  return (
    <div className="space-y-4">
      {c && (
        <Tarjeta titulo="Reglas">
          <div className="space-y-3 text-sm" style={{ color: 'var(--nexa-text)' }}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={c.listaEsperaActiva} onChange={e => setC({ ...c, listaEsperaActiva: e.target.checked })} />
              Lista de espera activa (botón “Avisarme si se libera un cupo”)
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Cómo avisar
                <select value={c.listaEsperaModo} onChange={e => setC({ ...c, listaEsperaModo: e.target.value as ConfigOperacion['listaEsperaModo'] })} className={`${inputCls} mt-1`} style={inputSty}>
                  <option value="todos">A todos a la vez (el primero que reserva)</option>
                  <option value="turnos">Por turnos (de a uno)</option>
                </select>
              </label>
              <label className="block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Tiempo de cada turno (minutos)
                <input type="number" min={5} step={5} value={c.listaEsperaMinutos} disabled={c.listaEsperaModo !== 'turnos'}
                  onChange={e => setC({ ...c, listaEsperaMinutos: Number(e.target.value) })} className={`${inputCls} mt-1 disabled:opacity-50`} style={inputSty} />
              </label>
              <label className="block text-xs font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Prioridad
                <select value={c.listaEsperaPrioridad} onChange={e => setC({ ...c, listaEsperaPrioridad: e.target.value as ConfigOperacion['listaEsperaPrioridad'] })} className={`${inputCls} mt-1`} style={inputSty}>
                  <option value="llegada">Orden de llegada</option>
                  <option value="mover_primero">Primero quien quiere mover una clase</option>
                </select>
              </label>
            </div>
            <p className="text-xs" style={{ color: 'var(--nexa-text-sub)' }}>
              El aviso nunca reserva el cupo: el alumno debe confirmarlo en MI NEXA. Por turnos, si no reserva a tiempo, se avisa al siguiente (se revisa cada hora).
            </p>
            <label className="flex items-start gap-2 border-t pt-3" style={{ borderColor: 'var(--nexa-border)' }}>
              <input type="checkbox" className="mt-1" checked={c.sustitutoRequiereAprobacion} onChange={e => setC({ ...c, sustitutoRequiereAprobacion: e.target.checked })} />
              <span>Cuando un profesor avisa una ausencia, administración aprueba el sustituto
                <span className="block text-xs" style={{ color: 'var(--nexa-text-sub)' }}>Si lo desmarcas, el sistema asigna solo un profesor libre y avisa al alumno.</span></span>
            </label>
            <button onClick={guardar} disabled={trab} className="rounded-[8px] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--nexa-text)' }}>
              {trab ? 'Guardando…' : 'Guardar reglas'}
            </button>
          </div>
        </Tarjeta>
      )}
      <Tarjeta titulo={`Esperando cupo (${lista.length})`}>
        {lista.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--nexa-muted)' }}>Nadie está esperando cupo.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--nexa-border)' }}>
            {lista.map(e => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span style={{ color: 'var(--nexa-text)' }}>
                  <strong>{e.alumno}</strong> · {fechaCorta(e.fecha)} · {e.hora}{e.hora_hasta ? `–${e.hora_hasta}` : ''} · {e.modalidad}
                  {e.mover_clase && <span style={{ color: 'var(--nexa-muted)' }}> · quiere mover una clase</span>}
                </span>
                <span className="flex items-center gap-1 text-xs" style={{ color: e.estado === 'notificada' ? 'var(--nexa-success)' : 'var(--nexa-muted)' }}>
                  <Clock size={12} />
                  {e.estado === 'notificada'
                    ? `Avisado ${e.notificada_at ? fechaHora(e.notificada_at) : ''}${e.turno_hasta ? ` · turno hasta ${fechaHora(e.turno_hasta)}` : ''}`
                    : `Esperando desde ${fechaHora(e.creada_at)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────
export default function CierresPage() {
  const [rol, setRol]           = useState<string | null>(null);
  const [cierres, setCierres]   = useState<Cierre[]>([]);
  const [espera, setEspera]     = useState<Espera[]>([]);
  const [config, setConfig]     = useState<ConfigOperacion | null>(null);
  const [coaches, setCoaches]   = useState<Coach[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinMigracion, setSinMigracion] = useState(false);
  const [tab, setTab]           = useState<'cierres' | 'espera'>('cierres');
  const [ok, setOk]             = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const staff = rol !== null && rol !== 'profesor';

  const cargar = useCallback(async () => {
    const { data: r } = await supabase.rpc('get_my_role');
    const miRol = typeof r === 'string' ? r : null;
    setRol(miRol);
    const esStaff = miRol !== 'profesor';
    const [cs, es, cfg, co] = await Promise.all([
      getCierres(),
      esStaff ? getListaEspera() : Promise.resolve([] as Espera[]),
      esStaff ? getConfigOperacion() : Promise.resolve(null),
      esStaff ? supabase.from('coaches').select('id, nombre').eq('activo', true).order('nombre') : Promise.resolve({ data: [] }),
    ]);
    setSinMigracion(cs === null);
    setCierres(cs ?? []);
    setEspera(es ?? []);
    setConfig(cfg);
    setCoaches(((co as { data: Coach[] | null }).data ?? []) as Coach[]);
    setCargando(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(cargar); }, [cargar]);

  const mostrarOk = (m: string) => { setOk(m); setError(null); void cargar(); };
  const mostrarError = (m: string) => { setError(m); setOk(null); };
  const pendientes = cierres.reduce((n, c) => n + c.clases.filter(x => x.estado === 'pendiente').length, 0);

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--nexa-muted)' }}>{staff ? 'Operación' : 'Profesor'}</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold" style={{ color: 'var(--nexa-text)' }}>
            <CalendarOff size={22} /> {staff ? 'Cierres y ausencias' : 'Mis ausencias'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--nexa-text-sub)' }}>
            {staff
              ? 'Feriados, cierres, mantenciones y ausencias de profesores. Las clases afectadas se resuelven aquí y a los alumnos se les avisa solos.'
              : 'Avisa cuando no puedas hacer clases. Administración se encarga de tus alumnos.'}
          </p>
        </div>
        <button onClick={() => { setCargando(true); void cargar(); }} className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-xs font-semibold" style={btnSec}>
          <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </header>

      {sinMigracion && !cargando && <Aviso tipo="error">Esta sección aún no está activa: falta aplicar la migración 048 en Supabase.</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {staff && (
        <div className="flex gap-2">
          {([['cierres', `Cierres${pendientes ? ` · ${pendientes} por resolver` : ''}`, CalendarOff], ['espera', `Lista de espera (${espera.length})`, Users]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold"
              style={tab === id ? { background: 'var(--nexa-text)', color: '#fff' } : btnSec}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      )}

      {!cargando && !sinMigracion && (tab === 'cierres' || !staff) && (
        <>
          {staff ? <NuevoCierre coaches={coaches} onCreado={mostrarOk} /> : <AvisarAusencia onAvisada={mostrarOk} />}
          <Tarjeta titulo={staff ? 'Próximos cierres' : 'Mis ausencias'}>
            {cierres.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--nexa-muted)' }}>No hay cierres ni ausencias desde hoy.</p>
            ) : (
              <ul className="space-y-2">
                {cierres.map(c => <TarjetaCierre key={c.grupo_id} c={c} staff={staff} onCambio={() => mostrarOk('Cambios guardados.')} onError={mostrarError} />)}
              </ul>
            )}
          </Tarjeta>
        </>
      )}

      {!cargando && !sinMigracion && staff && tab === 'espera' && (
        <ListaEspera key={JSON.stringify(config)} lista={espera} config={config} onGuardado={(m, e) => (e ? mostrarError(e) : m && mostrarOk(m))} />
      )}
    </main>
  );
}
