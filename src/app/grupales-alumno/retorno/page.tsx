'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';

type Estado = 'cargando' | 'pagado' | 'pendiente' | 'fallido';

function RetornoContent() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') ?? '';
  const [estado, setEstado] = useState<Estado>('cargando');
  const [pack,   setPack]   = useState('');
  const [clases, setClases] = useState(0);

  useEffect(() => {
    if (!token) { router.replace('/grupales-alumno/dashboard'); return; }

    let intentos = 0;
    const MAX = 15;
    let cancelled = false;

    async function checkEstado() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/grupales-alumno/estado?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          if (!cancelled) setEstado('fallido');
          return;
        }
        const data = await res.json() as {
          estado_pago?: string; clases_totales?: number;
          grupales_packs?: { nombre: string } | null;
        };
        if (cancelled) return;
        const ep = data.estado_pago;
        if (ep === 'pagado') {
          setPack(data.grupales_packs?.nombre ?? 'Pack');
          setClases(data.clases_totales ?? 0);
          setEstado('pagado');
          return;
        }
        if (ep === 'fallido' || ep === 'cancelado') {
          setEstado('fallido');
          return;
        }
        intentos++;
        if (intentos >= MAX) { setEstado('pendiente'); return; }
        setTimeout(checkEstado, 2000);
      } catch {
        if (!cancelled) setEstado('fallido');
      }
    }

    checkEstado();
    return () => { cancelled = true; };
  }, [token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--nexa-bg)' }}>
      <div className="w-full max-w-sm text-center">

        {estado === 'cargando' && (
          <>
            <Loader2 size={48} className="mx-auto animate-spin mb-4" style={{ color: 'var(--nexa-muted)' }} />
            <p className="text-[14px] font-semibold" style={{ color: 'var(--nexa-text)' }}>Verificando tu pago…</p>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>Esto puede tardar unos segundos</p>
          </>
        )}

        {estado === 'pagado' && (
          <>
            <CheckCircle2 size={56} className="mx-auto mb-4" style={{ color: 'var(--nexa-success)' }} />
            <h2 className="text-[22px] font-black" style={{ color: 'var(--nexa-text)' }}>¡Pago confirmado!</h2>
            <p className="mt-2 text-[14px]" style={{ color: 'var(--nexa-text-sub)' }}>
              Se cargaron <strong>{clases} clases</strong> a tu cuenta.
            </p>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>{pack}</p>
            <Link href="/grupales-alumno/reservar"
              className="nexa-btn-primary mt-6 inline-block w-full py-3 text-[14px]">
              Reservar una clase ahora
            </Link>
            <Link href="/grupales-alumno/dashboard"
              className="mt-3 inline-block text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
              Ver mi saldo
            </Link>
          </>
        )}

        {estado === 'pendiente' && (
          <>
            <Clock size={56} className="mx-auto mb-4" style={{ color: 'var(--nexa-warning)' }} />
            <h2 className="text-[22px] font-black" style={{ color: 'var(--nexa-text)' }}>Pago en proceso</h2>
            <p className="mt-2 text-[13px]" style={{ color: 'var(--nexa-muted)' }}>
              Tu pago está siendo procesado. Cuando se confirme, las clases aparecerán en tu cuenta.
            </p>
            <Link href="/grupales-alumno/dashboard"
              className="nexa-btn-primary mt-6 inline-block w-full py-3 text-[14px]">
              Ir a mi cuenta
            </Link>
          </>
        )}

        {estado === 'fallido' && (
          <>
            <XCircle size={56} className="mx-auto mb-4" style={{ color: 'var(--nexa-danger)' }} />
            <h2 className="text-[22px] font-black" style={{ color: 'var(--nexa-text)' }}>Pago no completado</h2>
            <p className="mt-2 text-[13px]" style={{ color: 'var(--nexa-muted)' }}>
              El pago fue rechazado o cancelado. Puedes intentarlo de nuevo.
            </p>
            <Link href="/grupales-alumno/comprar"
              className="nexa-btn-primary mt-6 inline-block w-full py-3 text-[14px]">
              Intentar de nuevo
            </Link>
          </>
        )}

      </div>
    </div>
  );
}

export default function RetornoPage() {
  return <Suspense><RetornoContent /></Suspense>;
}
