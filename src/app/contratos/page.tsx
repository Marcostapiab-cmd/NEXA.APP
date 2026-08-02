'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ContratosRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/alumnos'); }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p style={{ color: 'var(--nexa-muted)', fontSize: 14 }}>Redirigiendo…</p>
    </div>
  );
}
