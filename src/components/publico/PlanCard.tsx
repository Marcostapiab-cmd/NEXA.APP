'use client';

import { useId } from 'react';
import { Plus, Minus } from 'lucide-react';

/**
 * Tarjeta de plan tipo acordeón: cerrada muestra nombre y precio; abierta
 * muestra condiciones, descripción y el botón de compra.
 */
export default function PlanCard({ titulo, precio, precioNota, etiqueta, detalles, descripcion, abierto, onToggle, onComprar, ctaLabel = 'Comprar plan' }: {
  titulo:       string;
  precio:       string;
  precioNota?:  string;
  etiqueta?:    string;
  detalles:     string[];
  descripcion?: string | null;
  abierto:      boolean;
  onToggle:     () => void;
  onComprar:    () => void;
  ctaLabel?:    string;
}) {
  const panelId = useId();
  return (
    <article className="nx-card nx-card-interactive flex flex-col" data-open={abierto}>
      <h4 className="m-0">
        <button type="button" onClick={onToggle} aria-expanded={abierto} aria-controls={panelId}
          className="flex w-full flex-col gap-4 rounded-[18px] p-5 text-left sm:p-6">
          <span className="flex w-full items-start justify-between gap-3">
            <span className="nx-display text-[19px] leading-snug sm:text-[20px]" style={{ color: 'var(--nx-white)', fontWeight: 700 }}>
              {titulo}
            </span>
            {etiqueta && <span className="nx-badge mt-0.5">{etiqueta}</span>}
          </span>
          <span className="flex w-full items-end justify-between gap-3">
            <span>
              <span className="nx-display block text-[28px] leading-none sm:text-[30px]" style={{ color: 'var(--nx-white)' }}>{precio}</span>
              {precioNota && <span className="mt-1.5 block text-[12px]" style={{ color: 'var(--nx-muted)' }}>{precioNota}</span>}
            </span>
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors"
              style={{ border: '1px solid var(--nx-line)', color: abierto ? 'var(--nx-white)' : 'var(--nx-muted)' }}>
              {abierto ? <Minus size={16} /> : <Plus size={16} />}
            </span>
          </span>
          <span className="sr-only">{abierto ? 'Ocultar detalles' : 'Ver detalles'}</span>
        </button>
      </h4>

      {abierto && (
        <div id={panelId} className="nx-anim-fade px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="nx-hairline mb-4" />
          <ul className="space-y-2.5">
            {detalles.map(d => (
              <li key={d} className="flex gap-3 text-[14px] leading-snug" style={{ color: 'var(--nx-sub)' }}>
                <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: 'var(--nx-silver)' }} />
                {d}
              </li>
            ))}
          </ul>
          {descripcion && (
            <p className="mt-4 text-[13px] italic leading-relaxed" style={{ color: 'var(--nx-muted)' }}>{descripcion}</p>
          )}
          <button type="button" onClick={onComprar} className="nx-btn nx-btn-primary nx-btn-block mt-5">
            {ctaLabel}
          </button>
        </div>
      )}
    </article>
  );
}
