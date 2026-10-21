'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clp } from '@/lib/format';
import { MODALIDAD_INFO, TIPO_LABEL, type Modalidad, type TipoPlan } from '@/lib/catalogo';
import ResultadoPago, { FilasResumen, type VistaPago } from '@/components/publico/ResultadoPago';

interface EstadoRes {
  id:                string;
  estado:            string;
  nombre:            string;
  apellido:          string;
  modalidad:         string;
  tipo:              string;
  frecuenciaSemanal: number;
  montoCLP:          number;
}

const MAX_INTENTOS = 15; // ~30 segundos

export default function RetornoContent() {
  const token = useSearchParams().get('token');
  const [vista, setVista] = useState<VistaPago>(token ? 'cargando' : 'error');
  const [datos, setDatos] = useState<EstadoRes | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    let intentos = 0;

    async function consultar() {
      try {
        const res = await fetch(`/api/reservar/estado?token=${encodeURIComponent(token!)}`, { cache: 'no-store' });
        if (!vivo) return;
        if (!res.ok) { setVista('error'); return; }
        const d = await res.json() as EstadoRes;
        if (d.estado === 'pagado') { setDatos(d); setVista('pagado'); return; }
        if (d.estado === 'fallido' || d.estado === 'cancelado') { setVista('error'); return; }
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
    return (
      <ResultadoPago vista="cargando" titulo="Confirmando tu pago…">
        <p className="text-center text-[14px]" style={{ color: 'var(--nx-muted)' }}>Esperamos la confirmación de Flow. No cierres esta página.</p>
      </ResultadoPago>
    );
  }

  if (vista === 'pagado' && datos) {
    const titulo = MODALIDAD_INFO[datos.modalidad as Modalidad]?.titulo ?? datos.modalidad;
    return (
      <ResultadoPago vista="pagado" titulo={`¡Listo, ${datos.nombre}!`}
        acciones={[{ href: '/planes', label: 'Volver a planes', primario: true }]}>
        <p className="mb-4 text-center text-[14px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>
          Tu pago está confirmado y tu plan quedó agendado. El equipo de NEXA te asignará un coach y se pondrá en contacto contigo.
        </p>
        <FilasResumen filas={[
          ['Modalidad', titulo],
          ['Frecuencia', `${datos.frecuenciaSemanal} ${datos.frecuenciaSemanal === 1 ? 'vez' : 'veces'} por semana`],
          ['Duración', TIPO_LABEL[datos.tipo as TipoPlan] ?? datos.tipo],
          ['Total pagado', clp(datos.montoCLP)],
        ]} />
      </ResultadoPago>
    );
  }

  if (vista === 'pendiente') {
    return (
      <ResultadoPago vista="pendiente" titulo="Tu pago se está procesando"
        acciones={[{ href: '/planes', label: 'Volver a planes', primario: true }]}>
        <p className="text-center text-[14px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>
          Flow todavía no nos confirma el pago. Cuando lo haga, tu plan quedará agendado automáticamente. Si se rechaza, no se cobrará nada.
        </p>
      </ResultadoPago>
    );
  }

  return (
    <ResultadoPago vista="error" titulo="El pago no se completó"
      acciones={[{ href: '/planes#personalizado', label: 'Volver a planes', primario: true }]}>
      <p className="text-center text-[14px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>
        {token ? 'Flow informó que el pago fue rechazado o anulado. No se agendó ningún plan.' : 'No encontramos la referencia del pago.'}
      </p>
    </ResultadoPago>
  );
}
