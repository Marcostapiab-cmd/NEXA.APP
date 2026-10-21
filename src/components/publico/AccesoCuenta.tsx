'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import CuentaGrupalForm from './CuentaGrupalForm';

// Solo se aceptan rutas internas como destino (evita redirecciones abiertas)
function destinoSeguro(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/grupales-alumno/dashboard';
  return raw;
}

export default function AccesoCuenta({ modo }: { modo: 'login' | 'registro' }) {
  const router  = useRouter();
  const destino = destinoSeguro(useSearchParams().get('redirect'));

  return (
    <div className="nx-container flex justify-center">
      <div className="w-full max-w-[460px]">
        <p className="nx-eyebrow mb-3">Mi cuenta</p>
        <h1 className="nx-display text-[32px] leading-tight sm:text-[40px]" style={{ color: 'var(--nx-white)' }}>
          {modo === 'login' ? 'Bienvenido de vuelta.' : 'Crea tu cuenta.'}
        </h1>
        <p className="mb-8 mt-3 text-[15px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>
          Tu saldo de clases grupales, su vigencia y tus reservas, en un solo lugar.
        </p>
        <div className="nx-card p-5 sm:p-7">
          <CuentaGrupalForm modoInicial={modo} onListo={() => { router.replace(destino); router.refresh(); }} />
        </div>
        <p className="mt-6 text-center text-[13px]" style={{ color: 'var(--nx-muted)' }}>
          ¿Todavía no tienes plan? <Link href="/planes#grupales" className="underline underline-offset-2 hover:text-white">Ver planes</Link>
        </p>
      </div>
    </div>
  );
}
