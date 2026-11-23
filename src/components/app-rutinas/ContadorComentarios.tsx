'use client';

import { useEffect, useState } from 'react';
import { contarSinLeer } from '@/lib/app-rutinas-datos';

/** Número de comentarios de alumnos sin leer (se actualiza cada minuto). */
export default function ContadorComentarios() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    const leer = () => contarSinLeer().then(x => { if (vivo) setN(x); }).catch(() => {});
    leer();
    const t = setInterval(leer, 60_000);
    window.addEventListener('nexa:comentarios', leer);
    return () => { vivo = false; clearInterval(t); window.removeEventListener('nexa:comentarios', leer); };
  }, []);
  if (!n) return null;
  return (
    <span aria-label={`${n} sin leer`} className="ml-auto rounded-full px-1.5 text-[10px] font-bold leading-[18px] text-white" style={{ background: '#B44040' }}>
      {n > 99 ? '99+' : n}
    </span>
  );
}
