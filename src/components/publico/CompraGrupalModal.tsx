'use client';

import { useEffect, useState } from 'react';
import { rolActual } from '@/lib/rol-cliente';
import { CalendarCheck, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { clp } from '@/lib/format';
import { etiquetaDias, type PlanGrupal } from '@/lib/catalogo';
import Modal from './Modal';
import Pasos from './Pasos';
import CuentaGrupalForm from './CuentaGrupalForm';

// Compra de la Clase de Prueba (evaluación inicial). NEXA no tiene clases
// grupales por ahora, así que no se elige una clase del horario grupal:
// el equipo coordina el día y la hora de la evaluación después del pago.
const PASOS = ['Tu cuenta', 'Pago'];

export default function CompraGrupalModal({ plan, onCerrar }: { plan: PlanGrupal; onCerrar: () => void }) {
  const [paso,      setPaso]      = useState<number | null>(null); // null = verificando sesión
  const [email,     setEmail]     = useState('');
  const [pagando,   setPagando]   = useState(false);
  const [error,     setError]     = useState('');

  function revisarSesion() {
    supabase.auth.getUser()
      .then(async ({ data }) => {
        const ok = !!data.user && (await rolActual(data.user)) === 'grupales';
        setEmail(ok ? data.user?.email ?? '' : '');
        setPaso(ok ? 1 : 0);
      })
      .catch(() => setPaso(0));
  }
  useEffect(revisarSesion, []);

  async function pagar() {
    if (pagando) return;
    setError('');
    setPagando(true);
    try {
      const res = await fetch('/api/grupales-alumno/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: plan.id,
          primera: null,
        }),
      });
      const json = await res.json().catch(() => ({})) as { payUrl?: string; error?: string };
      if (res.status === 401) { setPaso(0); setError(json.error ?? 'Inicia sesión para continuar.'); setPagando(false); return; }
      if (!res.ok || !json.payUrl) {
        setError(json.error ?? 'No pudimos iniciar el pago. Intenta de nuevo.');
        setPagando(false);
        return;
      }
      window.location.assign(json.payUrl); // se mantiene "pagando" hasta salir de la página
    } catch {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
      setPagando(false);
    }
  }

  const pie = paso === 1 ? (
    <div className="flex justify-end">
      <button type="button" className="nx-btn nx-btn-primary" onClick={pagar} disabled={pagando} aria-busy={pagando}>
        {pagando && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {pagando ? 'Redirigiendo a Flow…' : `Pagar ${clp(plan.precio_clp)}`}
      </button>
    </div>
  ) : null;

  return (
    <Modal abierto onCerrar={onCerrar} titulo={plan.nombre}
      subtitulo={`Evaluación inicial · válida por ${etiquetaDias(plan.validez_dias)} · ${clp(plan.precio_clp)}`}
      confirmarCierre={paso === 1} bloqueado={pagando} pie={pie}>
      {paso === null ? (
        <div className="flex justify-center py-16" aria-busy="true"><Loader2 className="animate-spin" style={{ color: 'var(--nx-muted)' }} /></div>
      ) : (
        <>
          <Pasos pasos={PASOS} actual={paso} />

          {error && <p role="alert" className="nx-alert nx-alert-error mb-4">{error}</p>}

          {paso === 0 && (
            <>
              <p className="mb-5 text-[14px] leading-relaxed" style={{ color: 'var(--nx-sub)' }}>
                Crea tu cuenta para comprar tu evaluación inicial. Con ella te contactamos para coordinar el día y la hora.
              </p>
              <CuentaGrupalForm modoInicial="registro" onListo={() => { setError(''); revisarSesion(); }} compacto />
            </>
          )}

          {paso === 1 && (
            <div className="space-y-5">
              <dl className="nx-card divide-y" style={{ borderColor: 'var(--nx-line)' }}>
                {[
                  ['Plan', plan.nombre],
                  ['Incluye', 'Sesión de evaluación con un coach de NEXA'],
                  ['Vigencia', `${etiquetaDias(plan.validez_dias)} desde la confirmación del pago`],
                  ['Día y hora', 'NEXA te contacta para coordinarlos'],
                  ['Cuenta', email || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-6" style={{ borderColor: 'var(--nx-line)' }}>
                    <dt className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--nx-muted)' }}>{k}</dt>
                    <dd className="text-[14px] sm:text-right" style={{ color: 'var(--nx-white)' }}>{v}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-4" style={{ borderColor: 'var(--nx-line)' }}>
                  <dt className="text-[13px] font-semibold" style={{ color: 'var(--nx-sub)' }}>Total</dt>
                  <dd className="nx-display text-[26px]" style={{ color: 'var(--nx-white)' }}>{clp(plan.precio_clp)}</dd>
                </div>
              </dl>
              <p className="nx-alert nx-alert-info">La clase de prueba se puede tomar una sola vez por persona. Después de tu evaluación puedes contratar tu plan 1:1 o 2:1 en línea.</p>
              <ul className="space-y-2 text-[13px]" style={{ color: 'var(--nx-muted)' }}>
                <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />Pagas en Flow con tarjeta, débito o transferencia. NEXA no guarda los datos de tu tarjeta.</li>
                <li className="flex gap-2"><CalendarCheck size={16} className="mt-0.5 shrink-0" aria-hidden />Tu evaluación queda confirmada cuando Flow confirma el pago. Te mostramos el resultado al volver.</li>
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
