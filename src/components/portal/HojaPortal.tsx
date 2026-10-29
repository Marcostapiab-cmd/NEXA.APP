'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/** Hoja inferior (móvil) / ventana centrada (escritorio) con el estilo claro del portal. */
export default function HojaPortal({ abierto, onCerrar, titulo, subtitulo, bloqueado = false, children, pie }: {
  abierto:    boolean;
  onCerrar:   () => void;
  titulo:     string;
  subtitulo?: string;
  bloqueado?: boolean;
  children:   React.ReactNode;
  pie?:       React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();

  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus], button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !bloqueado) onCerrar(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; previo?.focus?.(); };
  }, [abierto, bloqueado, onCerrar]);

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div aria-hidden className="absolute inset-0 bg-black/50" onClick={() => !bloqueado && onCerrar()} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={tituloId}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#EEEEEE] px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 id={tituloId} className="text-lg font-bold text-[#121212]">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-xs text-[#5E5E5E]">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} disabled={bloqueado} aria-label="Cerrar"
            className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#5E5E5E] hover:bg-[#F5F5F5] disabled:opacity-30">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {pie && (
          <div className="border-t border-[#EEEEEE] px-5 py-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            {pie}
          </div>
        )}
      </div>
    </div>
  );
}
