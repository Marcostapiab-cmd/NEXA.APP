'use client';

import { useEffect, useEffectEvent, useId, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal accesible: rol dialog, foco atrapado, Esc para cerrar, bloqueo del
 * scroll de fondo y devolución del foco al cerrar. En móvil se muestra como
 * hoja inferior de alto completo; en escritorio como ventana centrada.
 * Si `confirmarCierre` es true (hay datos a medio llenar), pide confirmación.
 */
export default function Modal({ abierto, onCerrar, titulo, subtitulo, confirmarCierre = false, bloqueado = false, children, pie }: {
  abierto:          boolean;
  onCerrar:         () => void;
  titulo:           string;
  subtitulo?:       string;
  confirmarCierre?: boolean;
  bloqueado?:       boolean; // p. ej. mientras se redirige al pago
  children:         React.ReactNode;
  pie?:             React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  function intentarCerrar() {
    if (bloqueado) return;
    if (confirmarCierre && !window.confirm('¿Cerrar? Se perderá lo que llevas seleccionado.')) return;
    onCerrar();
  }
  const cerrarConEsc = useEffectEvent(() => intentarCerrar());

  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const primero = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    primero?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); cerrarConEsc(); return; }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last  = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previo?.focus?.();
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div aria-hidden className="nx-anim-fade absolute inset-0" style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={intentarCerrar} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={tituloId}
        className="nx-anim-sheet relative flex max-h-[100dvh] w-full flex-col overflow-hidden sm:max-h-[min(860px,92dvh)] sm:max-w-[640px] sm:rounded-[22px]"
        style={{ background: 'var(--nx-graphite)', border: '1px solid var(--nx-line)', height: 'auto', minHeight: 'min(100dvh, 520px)' }}>
        <div className="flex items-start justify-between gap-4 border-b px-5 pb-4 pt-5 sm:px-7"
          style={{ borderColor: 'var(--nx-line)' }}>
          <div className="min-w-0">
            <h2 id={tituloId} className="nx-display text-[20px] leading-tight sm:text-[22px]" style={{ color: 'var(--nx-white)' }}>
              {titulo}
            </h2>
            {subtitulo && <p className="mt-1 text-[13px]" style={{ color: 'var(--nx-muted)' }}>{subtitulo}</p>}
          </div>
          <button type="button" onClick={intentarCerrar} aria-label="Cerrar" disabled={bloqueado}
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/5 disabled:opacity-30"
            style={{ color: 'var(--nx-sub)' }}>
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">{children}</div>
        {pie && (
          <div className="border-t px-5 py-4 sm:px-7" style={{ borderColor: 'var(--nx-line)', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            {pie}
          </div>
        )}
      </div>
    </div>
  );
}
