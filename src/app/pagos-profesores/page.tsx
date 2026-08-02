'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PagosProfesoresRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/pagos?tab=profesores'); }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p style={{ color: 'var(--nexa-muted)', fontSize: 14 }}>Redirigiendo…</p>
    </div>
  );
}
