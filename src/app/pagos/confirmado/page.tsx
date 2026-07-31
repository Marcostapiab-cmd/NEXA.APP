'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function PagoConfirmadoPage() {
  const params = useSearchParams();
  const token  = params.get('token');

  const [estado, setEstado] = useState<'cargando' | 'ok' | 'rechazado' | 'error'>('cargando');

  useEffect(() => {
    if (!token) { setEstado('error'); return; }

    // Flow redirige aquí con ?token=XXX; verificamos el estado
    const verificar = async () => {
      try {
        const res  = await fetch(`/api/pagos/estado?token=${token}`);
        const data = await res.json() as { status?: number };
        if (data.status === 2) setEstado('ok');
        else if (data.status === 3 || data.status === 4) setEstado('rechazado');
        else setEstado('error');
      } catch {
        setEstado('error');
      }
    };

    // Pequeña espera para que el webhook ya haya procesado
    const t = setTimeout(verificar, 1200);
    return () => clearTimeout(t);
  }, [token]);

  if (estado === 'cargando') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F5F5]">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#121212]" />
          <p className="mt-4 text-sm text-[#777777]">Verificando pago...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#D8D8D8] bg-white p-8 text-center shadow-sm">
        {estado === 'ok' ? (
          <>
            <CheckCircle className="mx-auto h-14 w-14 text-green-500" />
            <h1 className="mt-4 text-xl font-bold text-[#121212]">¡Pago recibido!</h1>
            <p className="mt-2 text-sm text-[#777777]">
              Tu pago fue procesado exitosamente. El equipo de NEXA confirmará tu reserva.
            </p>
          </>
        ) : estado === 'rechazado' ? (
          <>
            <XCircle className="mx-auto h-14 w-14 text-red-400" />
            <h1 className="mt-4 text-xl font-bold text-[#121212]">Pago rechazado</h1>
            <p className="mt-2 text-sm text-[#777777]">
              El pago fue rechazado o anulado. Intenta nuevamente o contacta a tu entrenador.
            </p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-14 w-14 text-amber-400" />
            <h1 className="mt-4 text-xl font-bold text-[#121212]">No se pudo verificar</h1>
            <p className="mt-2 text-sm text-[#777777]">
              No pudimos confirmar el estado de tu pago. Contacta a tu entrenador.
            </p>
          </>
        )}
        <Link
          href="/"
          className="mt-6 block rounded-xl bg-[#121212] py-3 text-sm font-bold text-white transition hover:brightness-110"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
