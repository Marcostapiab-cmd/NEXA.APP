'use client';

import { useSearchParams } from 'next/navigation';
import { clp, DIAS_LARGO, MESES_LARGO } from '@/lib/format';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

const D = {
  bg:    'var(--nexa-surface)',
  card:  'var(--nexa-card)',
  border:'var(--nexa-border)',
  text:  'var(--nexa-text)',
  sub:   'var(--nexa-text-sub)',
  muted: 'var(--nexa-muted)',
  lime:  'var(--nexa-text)',
  red:   'var(--nexa-danger)',
  redDim:'var(--nexa-danger-bg)',
} as const;

function fechaLarga(f: string) {
  const d = new Date(f + 'T12:00:00');
  return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`;
}

interface EstadoRes {
  id:       string;
  estado:   string;
  nombre:   string;
  apellido: string;
  fecha:    string;
  hora:     string;
  montoCLP: number;
  clase:    string | null;
  plan:     string | null;
}

type Vista = 'cargando' | 'pagado' | 'pendiente' | 'error';



export default function RetornoContent() {
  const params = useSearchParams();
  const token  = params.get('token');
  const [vista,   setVista]   = useState<Vista>('cargando');
  const [datos,   setDatos]   = useState<EstadoRes|null>(null);
  const [intentos, setIntentos] = useState(0);

  useEffect(() => {
    if (!token) { setVista('error'); return; }

    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      if (!mounted) return;
      try {
        const res = await fetch(`/api/reservar/estado?token=${encodeURIComponent(token!)}`);
        if (!res.ok) { if (mounted) setVista('error'); return; }
        const d = await res.json() as EstadoRes;
        if (!mounted) return;

        if (d.estado === 'pagado') {
          setDatos(d);
          setVista('pagado');
        } else if (d.estado === 'fallido' || d.estado === 'cancelado') {
          setVista('error');
        } else {
          // Pendiente/procesando: reintentar hasta 30s
          setIntentos(prev => {
            const n = prev + 1;
            if (n >= 15) { setVista('pendiente'); return n; }
            timer = setTimeout(check, 2000);
            return n;
          });
        }
      } catch {
        if (mounted) setVista('error');
      }
    }

    check();
    return () => { mounted = false; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Suppress unused warning
  void intentos;

  return (
    <main style={{ background: D.bg, minHeight: '100vh' }}>
      <div className="mx-auto max-w-md px-5 py-12">

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="flex h-9 w-9 items-center justify-center rounded-[8px]"
            style={{ background: 'var(--nexa-text)' }}>
            <span className="select-none text-[13px] font-black tracking-widest" style={{ color:'#fff' }}>N</span>
          </div>
          <span className="select-none text-[15px] font-black tracking-[0.2em]" style={{ color: D.text }}>
            NEXA
          </span>
        </div>

        {/* CARGANDO */}
        {vista === 'cargando' && (
          <div className="flex flex-col items-center text-center py-12">
            <div className="h-14 w-14 animate-spin rounded-full border-[3px] border-current border-t-transparent mb-6"
              style={{ color: D.lime }} />
            <h2 className="text-[20px] font-black mb-1" style={{ color: D.text }}>
              Verificando tu pago...
            </h2>
            <p className="text-[13px]" style={{ color: D.sub }}>Esto puede tomar unos segundos.</p>
          </div>
        )}

        {/* ÉXITO */}
        {vista === 'pagado' && datos && (
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center justify-center w-20 h-20 rounded-full mb-6"
              style={{ background: 'var(--nexa-success-bg)' }}>
              <CheckCircle2 size={46} strokeWidth={1.75} style={{ color: 'var(--nexa-success)' }} />
            </div>
            <h2 className="text-[26px] font-black tracking-tight mb-1" style={{ color: D.text }}>
              ¡Listo, {datos.nombre}!
            </h2>
            <p className="text-[13px] mb-8" style={{ color: D.sub }}>
              Tu reserva está confirmada y el pago fue procesado.
            </p>

            <div className="w-full rounded-2xl overflow-hidden mb-8"
              style={{ background: D.card, border: `1px solid ${D.border}` }}>
              {[
                ['Clase',      datos.clase ?? '—'],
                ['Fecha',      fechaLarga(datos.fecha)],
                ['Hora',       datos.hora],
                ['Pack',       datos.plan ?? '—'],
                ['Total pagado', clp(datos.montoCLP)],
              ].map(([k,v], i, arr) => (
                <div key={k} className="flex items-center justify-between px-5 py-3.5"
                  style={{ borderBottom: i < arr.length-1 ? `1px solid ${D.border}` : 'none' }}>
                  <p className="text-[11px]" style={{ color: D.muted }}>{k}</p>
                  <p className="text-[13px] font-semibold capitalize" style={{ color: i===arr.length-1 ? D.lime : D.text }}>
                    {v}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-[12px] mb-6 text-center" style={{ color: D.sub }}>
              Recibirás un email de confirmación en breve.<br/>¡Te esperamos en el estudio!
            </p>

            <Link href="/reservar"
              className="text-[13px] font-semibold underline underline-offset-4"
              style={{ color: D.sub }}>
              Reservar otra clase
            </Link>
          </div>
        )}

        {/* PENDIENTE (timeout) */}
        {vista === 'pendiente' && (
          <div className="flex flex-col items-center text-center py-8">
            <div className="flex items-center justify-center w-16 h-16 rounded-full mb-6"
              style={{ background: 'rgba(255,183,64,0.12)' }}>
              <Clock size={36} strokeWidth={1.75} style={{ color: '#E8A830' }} />
            </div>
            <h2 className="text-[22px] font-black mb-1" style={{ color: D.text }}>
              Pago en proceso
            </h2>
            <p className="text-[13px] mb-6" style={{ color: D.sub }}>
              Tu pago está siendo procesado. Si fue exitoso, recibirás un email de confirmación.
            </p>
            <Link href="/reservar"
              className="text-[13px] font-semibold underline underline-offset-4"
              style={{ color: D.sub }}>
              Volver al inicio
            </Link>
          </div>
        )}

        {/* ERROR */}
        {vista === 'error' && (
          <div className="flex flex-col items-center text-center py-8">
            <div className="flex items-center justify-center w-16 h-16 rounded-full mb-6"
              style={{ background: D.redDim }}>
              <XCircle size={36} strokeWidth={1.75} style={{ color: D.red }} />
            </div>
            <h2 className="text-[22px] font-black mb-1" style={{ color: D.text }}>
              Pago no completado
            </h2>
            <p className="text-[13px] mb-6" style={{ color: D.sub }}>
              El pago fue cancelado o rechazado. No se realizó ningún cobro.
            </p>
            <Link href="/reservar"
              className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-[14px] font-black"
              style={{ background: 'var(--nexa-text)', color: '#fff' }}>
              Intentar nuevamente
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
