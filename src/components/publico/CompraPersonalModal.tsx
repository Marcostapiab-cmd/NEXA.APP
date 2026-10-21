'use client';

import { useState } from 'react';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { clp } from '@/lib/format';
import {
  DIAS_POR_TIPO, EMAIL_RE, MODALIDAD_INFO, TIPO_LABEL, formatearRut, sesionesTotalesPlan, validarRut,
  type Modalidad, type TipoPlan,
} from '@/lib/catalogo';
import Modal from './Modal';
import Pasos from './Pasos';

const DIAS_SEMANA = [
  { n: 1, corto: 'Lun', largo: 'Lunes' }, { n: 2, corto: 'Mar', largo: 'Martes' },
  { n: 3, corto: 'Mié', largo: 'Miércoles' }, { n: 4, corto: 'Jue', largo: 'Jueves' },
  { n: 5, corto: 'Vie', largo: 'Viernes' }, { n: 6, corto: 'Sáb', largo: 'Sábado' },
];
const PASOS = ['Días y hora', 'Tus datos', 'Pago'];

export interface SeleccionPersonal {
  modalidad:  Modalidad;
  frecuencia: number;
  tipo:       TipoPlan;
  precioMes:  number;  // ya con el descuento de la duración
  total:      number;
}

export default function CompraPersonalModal({ sel, onCerrar }: { sel: SeleccionPersonal; onCerrar: () => void }) {
  const [paso,    setPaso]    = useState(0);
  const [dias,    setDias]    = useState<number[]>([]);
  const [hora,    setHora]    = useState('');
  const [f,       setF]       = useState({ nombre: '', apellido: '', email: '', telefono: '', rut: '' });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error,   setError]   = useState('');
  const [pagando, setPagando] = useState(false);

  const sesiones = sesionesTotalesPlan(sel.frecuencia, sel.tipo);
  const diasOk   = dias.length === sel.frecuencia;
  const horaOk   = /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
  const sucio    = dias.length > 0 || Object.values(f).some(v => v.trim() !== '');

  function toggleDia(n: number) {
    setDias(prev => prev.includes(n) ? prev.filter(d => d !== n)
      : prev.length >= sel.frecuencia ? prev : [...prev, n].sort((a, b) => a - b));
  }

  function validarDatos(): boolean {
    const e: Record<string, string> = {};
    if (!f.nombre.trim())   e.nombre   = 'Ingresa tu nombre.';
    if (!f.apellido.trim()) e.apellido = 'Ingresa tu apellido.';
    if (!EMAIL_RE.test(f.email.trim())) e.email = 'Ingresa un email válido.';
    if (f.rut.trim() && !validarRut(f.rut)) e.rut = 'El RUT no es válido.';
    setErrores(e);
    return Object.keys(e).length === 0;
  }

  async function pagar() {
    if (pagando) return;
    setError('');
    setPagando(true);
    try {
      const res = await fetch('/api/reservar/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modalidad: sel.modalidad, frecuenciaSemanal: sel.frecuencia, tipo: sel.tipo,
          diasSemana: dias, hora,
          nombre: f.nombre.trim(), apellido: f.apellido.trim(), email: f.email.trim(),
          telefono: f.telefono.trim() || null, rut: f.rut.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({})) as { payUrl?: string; error?: string };
      if (!res.ok || !json.payUrl) {
        setError(json.error ?? 'No pudimos iniciar el pago. Intenta de nuevo.');
        setPagando(false);
        return;
      }
      window.location.assign(json.payUrl);
    } catch {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
      setPagando(false);
    }
  }

  const campo = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, opcional = false) => (
    <div>
      <label htmlFor={`cp-${k}`} className="nx-label">
        {label}{opcional && <span style={{ color: 'var(--nx-muted)' }}> (opcional)</span>}
      </label>
      <input id={`cp-${k}`} className="nexa-input" value={f[k]}
        aria-invalid={Boolean(errores[k])} aria-describedby={errores[k] ? `cp-${k}-err` : undefined}
        onChange={e => setF(p => ({ ...p, [k]: e.target.value }))} {...props} />
      {errores[k] && <p id={`cp-${k}-err`} className="mt-1.5 text-[12px]" style={{ color: 'var(--nexa-danger)' }}>{errores[k]}</p>}
    </div>
  );

  const pie = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      {paso > 0
        ? <button type="button" className="nx-btn nx-btn-ghost" onClick={() => setPaso(p => p - 1)} disabled={pagando}><ArrowLeft size={16} aria-hidden /> Volver</button>
        : <span className="text-[13px]" style={{ color: 'var(--nx-muted)' }}>{dias.length}/{sel.frecuencia} días elegidos</span>}
      {paso === 0 && <button type="button" className="nx-btn nx-btn-primary" disabled={!diasOk || !horaOk} onClick={() => setPaso(1)}>Continuar</button>}
      {paso === 1 && <button type="submit" form="cp-datos" className="nx-btn nx-btn-primary">Revisar compra</button>}
      {paso === 2 && (
        <button type="button" className="nx-btn nx-btn-primary" onClick={pagar} disabled={pagando} aria-busy={pagando}>
          {pagando && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {pagando ? 'Redirigiendo a Flow…' : `Pagar ${clp(sel.total)}`}
        </button>
      )}
    </div>
  );

  return (
    <Modal abierto onCerrar={onCerrar}
      titulo={`${MODALIDAD_INFO[sel.modalidad].titulo} · ${sel.frecuencia}x por semana`}
      subtitulo={`${TIPO_LABEL[sel.tipo]} · ${sesiones} sesiones · ${clp(sel.total)}`}
      confirmarCierre={sucio} bloqueado={pagando} pie={pie}>
      <Pasos pasos={PASOS} actual={paso} />
      {error && <p role="alert" className="nx-alert nx-alert-error mb-4">{error}</p>}

      {paso === 0 && (
        <div className="space-y-6">
          <fieldset>
            <legend className="nx-label">Elige {sel.frecuencia} {sel.frecuencia === 1 ? 'día' : 'días'} de la semana</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {DIAS_SEMANA.map(d => {
                const on = dias.includes(d.n);
                return (
                  <button key={d.n} type="button" aria-pressed={on} aria-label={d.largo}
                    disabled={!on && dias.length >= sel.frecuencia}
                    onClick={() => toggleDia(d.n)} className="nx-chip">
                    {d.corto}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div>
            <label htmlFor="cp-hora" className="nx-label">Hora preferida</label>
            <input id="cp-hora" type="time" step={900} className="nexa-input max-w-[200px]" value={hora}
              onChange={e => setHora(e.target.value)} />
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>
              Tus sesiones quedan agendadas en estos días y hora. El equipo de NEXA asigna tu coach después del pago.
            </p>
          </div>
        </div>
      )}

      {paso === 1 && (
        <form id="cp-datos" className="space-y-4" noValidate onSubmit={e => { e.preventDefault(); if (validarDatos()) setPaso(2); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            {campo('nombre', 'Nombre', { autoComplete: 'given-name', 'data-autofocus': true } as React.InputHTMLAttributes<HTMLInputElement>)}
            {campo('apellido', 'Apellido', { autoComplete: 'family-name' })}
          </div>
          {campo('email', 'Email', { type: 'email', inputMode: 'email', autoComplete: 'email' })}
          <div className="grid gap-4 sm:grid-cols-2">
            {campo('telefono', 'Teléfono', { type: 'tel', inputMode: 'tel', autoComplete: 'tel', placeholder: '+56 9 ...' }, true)}
            {campo('rut', 'RUT', { placeholder: '12.345.678-9', onBlur: () => f.rut.trim() && setF(p => ({ ...p, rut: formatearRut(p.rut) })) }, true)}
          </div>
        </form>
      )}

      {paso === 2 && (
        <div className="space-y-5">
          <dl className="nx-card divide-y" style={{ borderColor: 'var(--nx-line)' }}>
            {[
              ['Modalidad', MODALIDAD_INFO[sel.modalidad].titulo],
              ['Frecuencia', `${sel.frecuencia} ${sel.frecuencia === 1 ? 'vez' : 'veces'} por semana`],
              ['Duración', `${TIPO_LABEL[sel.tipo]} · ${DIAS_POR_TIPO[sel.tipo]} días`],
              ['Sesiones', `${sesiones} sesiones`],
              ['Días y hora', `${dias.map(n => DIAS_SEMANA.find(d => d.n === n)?.corto).join(' · ')} · ${hora}`],
              ['Titular', `${f.nombre.trim()} ${f.apellido.trim()} · ${f.email.trim()}`],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-6" style={{ borderColor: 'var(--nx-line)' }}>
                <dt className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--nx-muted)' }}>{k}</dt>
                <dd className="break-words text-[14px] sm:text-right" style={{ color: 'var(--nx-white)' }}>{v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-4" style={{ borderColor: 'var(--nx-line)' }}>
              <dt className="text-[13px] font-semibold" style={{ color: 'var(--nx-sub)' }}>
                Total {sel.tipo !== 'mensual' && <span className="block text-[12px] font-normal" style={{ color: 'var(--nx-muted)' }}>{clp(sel.precioMes)} por mes</span>}
              </dt>
              <dd className="nx-display text-[26px]" style={{ color: 'var(--nx-white)' }}>{clp(sel.total)}</dd>
            </div>
          </dl>
          <p className="flex gap-2 text-[13px]" style={{ color: 'var(--nx-muted)' }}>
            <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
            Pagas en Flow con tarjeta, débito o transferencia. Tu plan y tus sesiones se crean cuando Flow confirma el pago.
          </p>
        </div>
      )}
    </Modal>
  );
}
