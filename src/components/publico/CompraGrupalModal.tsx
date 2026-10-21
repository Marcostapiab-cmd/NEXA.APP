'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarCheck, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { clp, DIAS_LARGO, MESES_LARGO } from '@/lib/format';
import { esClaseDePrueba, etiquetaClases, etiquetaDias, type PlanGrupal } from '@/lib/catalogo';
import Modal from './Modal';
import Pasos from './Pasos';
import CuentaGrupalForm from './CuentaGrupalForm';
import SelectorSesion, { type SesionElegida } from './SelectorSesion';

const PASOS = ['Tu cuenta', 'Primera clase', 'Pago'];

function fechaLarga(f: string) {
  const d = new Date(`${f}T12:00:00`);
  return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`;
}

export default function CompraGrupalModal({ plan, onCerrar }: { plan: PlanGrupal; onCerrar: () => void }) {
  const [paso,      setPaso]      = useState<number | null>(null); // null = verificando sesión
  const [email,     setEmail]     = useState('');
  const [sesion,    setSesion]    = useState<SesionElegida | null>(null);
  const [despues,   setDespues]   = useState(false);
  const [pagando,   setPagando]   = useState(false);
  const [error,     setError]     = useState('');

  function revisarSesion() {
    supabase.auth.getUser()
      .then(({ data }) => {
        const ok = data.user?.user_metadata?.rol === 'grupales';
        setEmail(ok ? data.user?.email ?? '' : '');
        setPaso(ok ? 1 : 0);
      })
      .catch(() => setPaso(0));
  }
  useEffect(revisarSesion, []);

  // Vigencia máxima para la primera clase: corre desde el pago (hoy)
  const hasta = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + plan.validez_dias);
    return d;
  }, [plan.validez_dias]);

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
          primera: !despues && sesion ? { clase_id: sesion.clase_id, fecha: sesion.fecha, hora: sesion.hora } : null,
        }),
      });
      const json = await res.json().catch(() => ({})) as { payUrl?: string; error?: string };
      if (res.status === 401) { setPaso(0); setError(json.error ?? 'Inicia sesión para continuar.'); setPagando(false); return; }
      if (!res.ok || !json.payUrl) {
        setError(json.error ?? 'No pudimos iniciar el pago. Intenta de nuevo.');
        if (res.status === 409 && sesion) setPaso(1); // la clase se quedó sin cupo: volver a elegir
        setPagando(false);
        return;
      }
      window.location.assign(json.payUrl); // se mantiene "pagando" hasta salir de la página
    } catch {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
      setPagando(false);
    }
  }

  const puedeSeguirPaso1 = despues || sesion !== null;

  const pie = paso === 1 ? (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[13px]" style={{ color: 'var(--nx-sub)' }}>
        <input type="checkbox" checked={despues} onChange={e => { setDespues(e.target.checked); if (e.target.checked) setSesion(null); }} />
        Prefiero reservar después
      </label>
      <button type="button" className="nx-btn nx-btn-primary" disabled={!puedeSeguirPaso1}
        onClick={() => { setError(''); setPaso(2); }}>
        Continuar
      </button>
    </div>
  ) : paso === 2 ? (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" className="nx-btn nx-btn-ghost" onClick={() => setPaso(1)} disabled={pagando}>
        <ArrowLeft size={16} aria-hidden /> Volver
      </button>
      <button type="button" className="nx-btn nx-btn-primary" onClick={pagar} disabled={pagando} aria-busy={pagando}>
        {pagando && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {pagando ? 'Redirigiendo a Flow…' : `Pagar ${clp(plan.precio_clp)}`}
      </button>
    </div>
  ) : null;

  return (
    <Modal abierto onCerrar={onCerrar} titulo={plan.nombre}
      subtitulo={`${etiquetaClases(plan.num_clases)} · válido por ${etiquetaDias(plan.validez_dias)} · ${clp(plan.precio_clp)}`}
      confirmarCierre={sesion !== null || paso === 2} bloqueado={pagando} pie={pie}>
      {paso === null ? (
        <div className="flex justify-center py-16" aria-busy="true"><Loader2 className="animate-spin" style={{ color: 'var(--nx-muted)' }} /></div>
      ) : (
        <>
          <Pasos pasos={PASOS} actual={paso} />

          {error && <p role="alert" className="nx-alert nx-alert-error mb-4">{error}</p>}

          {paso === 0 && (
            <>
              <p className="mb-5 text-[14px] leading-relaxed" style={{ color: 'var(--nx-sub)' }}>
                Con tu cuenta ves tu saldo de clases, su vigencia y reservas tus horarios cuando quieras.
              </p>
              <CuentaGrupalForm modoInicial="registro" onListo={() => { setError(''); revisarSesion(); }} compacto />
            </>
          )}

          {paso === 1 && (
            <>
              <p className="mb-5 text-[14px] leading-relaxed" style={{ color: 'var(--nx-sub)' }}>
                Elige tu primera clase. El cupo se asegura cuando el pago queda confirmado.
              </p>
              {despues
                ? <p className="nx-alert nx-alert-info">Podrás reservar tus clases desde tu cuenta cuando quieras, dentro de la vigencia del plan.</p>
                : <SelectorSesion valor={sesion} onCambio={setSesion} dias={Math.min(30, plan.validez_dias)} hasta={hasta} />}
            </>
          )}

          {paso === 2 && (
            <div className="space-y-5">
              <dl className="nx-card divide-y" style={{ borderColor: 'var(--nx-line)' }}>
                {[
                  ['Plan', plan.nombre],
                  ['Clases', etiquetaClases(plan.num_clases)],
                  ['Vigencia', `${etiquetaDias(plan.validez_dias)} desde la confirmación del pago`],
                  ['Primera clase', sesion && !despues ? `${sesion.nombre} · ${fechaLarga(sesion.fecha)} · ${sesion.hora}` : 'La reservas después desde tu cuenta'],
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
              {esClaseDePrueba(plan) && (
                <p className="nx-alert nx-alert-info">La clase de prueba se puede tomar una sola vez por persona.</p>
              )}
              <ul className="space-y-2 text-[13px]" style={{ color: 'var(--nx-muted)' }}>
                <li className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />Pagas en Flow con tarjeta, débito o transferencia. NEXA no guarda los datos de tu tarjeta.</li>
                <li className="flex gap-2"><CalendarCheck size={16} className="mt-0.5 shrink-0" aria-hidden />Tus clases se cargan cuando Flow confirma el pago. Te mostramos el resultado al volver.</li>
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
