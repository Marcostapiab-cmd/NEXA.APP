'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { clp, DIAS_LARGO, MESES_CORTO, MESES_LARGO } from '@/lib/format';
import { etiquetaClases } from '@/lib/catalogo';
import ResultadoPago, { FilasResumen, type VistaPago } from '@/components/publico/ResultadoPago';

interface Estado {
  estado_pago:    string;
  plan?:          string;
  clases_totales?: number;
  fecha_expira?:  string | null;
  monto_clp?:     number;
  primera?: { clase: string; fecha: string; hora: string | null; estado: string | null } | null;
}

const fechaLarga = (f: string) => { const d = new Date(`${f}T12:00:00`); return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`; };
const fechaCorta = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MESES_CORTO[d.getMonth()]} ${d.getFullYear()}`; };
const MAX_INTENTOS = 15; // ~30 segundos

function Contenido() {
  const token = useSearchParams().get('token');
  const [vista, setVista] = useState<VistaPago>(token ? 'cargando' : 'error');
  const [datos, setDatos] = useState<Estado | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    let intentos = 0;

    async function consultar() {
      try {
        const res = await fetch(`/api/grupales-alumno/estado?token=${encodeURIComponent(token!)}`, { cache: 'no-store' });
        if (!vivo) return;
        if (!res.ok) { setVista('error'); return; }
        const d = await res.json() as Estado;
        setDatos(d);
        if (d.estado_pago === 'pagado') { setVista('pagado'); return; }
        if (d.estado_pago === 'fallido' || d.estado_pago === 'cancelado') { setVista('error'); return; }
        intentos += 1;
        if (intentos >= MAX_INTENTOS) { setVista('pendiente'); return; }
        timer = setTimeout(consultar, 2000);
      } catch {
        if (vivo) setVista('pendiente');
      }
    }
    consultar();
    return () => { vivo = false; clearTimeout(timer); };
  }, [token]);

  if (vista === 'cargando') {
    return <ResultadoPago vista="cargando" titulo="Confirmando tu pago…">
      <p className="text-center text-[14px]" style={{ color: 'var(--nx-muted)' }}>Esperamos la confirmación de Flow. No cierres esta página.</p>
    </ResultadoPago>;
  }

  if (vista === 'pagado' && datos) {
    const p = datos.primera;
    return (
      <ResultadoPago vista="pagado" titulo="¡Pago confirmado!"
        acciones={[
          p?.estado === 'reservada'
            ? { href: '/grupales-alumno/dashboard', label: 'Ir a mi cuenta', primario: true }
            : { href: '/grupales-alumno/reservar', label: 'Reservar clase', primario: true },
          { href: '/grupales-alumno/dashboard', label: 'Ver mi saldo' },
        ].filter((a, i, arr) => arr.findIndex(b => b.label === a.label) === i)}>
        <FilasResumen filas={[
          ['Plan', datos.plan ?? 'Pack de clases'],
          ['Clases', etiquetaClases(datos.clases_totales ?? 0)],
          ...(datos.fecha_expira ? [['Vigente hasta', fechaCorta(datos.fecha_expira)] as [string, string]] : []),
          ...(datos.monto_clp ? [['Pagado', clp(datos.monto_clp)] as [string, string]] : []),
        ]} />
        {p?.estado === 'reservada' && p.hora && (
          <p className="nx-alert nx-alert-success mt-4">
            Tu primera clase quedó reservada: <strong>{p.clase}</strong>, {fechaLarga(p.fecha)} a las {p.hora}.
          </p>
        )}
        {p?.estado === 'no_disponible' && (
          <p className="nx-alert nx-alert-info mt-4">
            La clase que elegiste ya no tenía cupo al confirmarse el pago, así que no se reservó y no se descontó ninguna clase. Elige otro horario desde tu cuenta.
          </p>
        )}
      </ResultadoPago>
    );
  }

  if (vista === 'pendiente') {
    return (
      <ResultadoPago vista="pendiente" titulo="Tu pago se está procesando"
        acciones={[{ href: '/grupales-alumno/dashboard', label: 'Ir a mi cuenta', primario: true }]}>
        <p className="text-center text-[14px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>
          Flow todavía no nos confirma el pago. Cuando lo haga, tus clases aparecerán en tu cuenta. Si se rechaza, no se cobrará nada.
        </p>
      </ResultadoPago>
    );
  }

  return (
    <ResultadoPago vista="error" titulo="El pago no se completó"
      acciones={[{ href: '/planes#grupales', label: 'Volver a planes', primario: true }, { href: '/grupales-alumno/dashboard', label: 'Mi cuenta' }]}>
      <p className="text-center text-[14px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>
        {token ? 'Flow informó que el pago fue rechazado o anulado. No se cargaron clases.' : 'No encontramos la referencia del pago.'}
      </p>
    </ResultadoPago>
  );
}

export default function RetornoGrupal() {
  return <Suspense><Contenido /></Suspense>;
}
