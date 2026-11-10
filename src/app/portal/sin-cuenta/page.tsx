'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { cerrarSesion } from '@/lib/cerrar-sesion';
export default function PortalSinCuentaPage() {
  const router = useRouter();

  async function handleLogout() {
    await cerrarSesion();
    router.push('/portal/login');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#D8D8D8] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F0F0F0] text-2xl">
          🏋️
        </div>
        <h1 className="font-bold text-[#121212]">Cuenta sin acceso</h1>
        <p className="mt-2 text-sm text-[#5E5E5E]">
          Tu cuenta todavía no tiene acceso a NEXA o no está asociada a un alumno. Contacta a tu coach o a administración para que activen tu acceso.
        </p>
        <button
          onClick={handleLogout}
          className="mt-6 w-full rounded-xl border border-[#D8D8D8] py-3 text-sm font-semibold text-[#5E5E5E] transition hover:border-[#121212] hover:text-[#121212]"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
