import { Check } from 'lucide-react';

/** Indicador de progreso de un flujo de compra (equivalente al 1-2-3 de la referencia). */
export default function Pasos({ pasos, actual }: { pasos: string[]; actual: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progreso">
      {pasos.map((p, i) => {
        const hecho  = i < actual;
        const activo = i === actual;
        return (
          <li key={p} className="flex min-w-0 flex-1 items-center gap-2" aria-current={activo ? 'step' : undefined}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
              style={{
                background: hecho || activo ? 'var(--nx-white)' : 'transparent',
                color:      hecho || activo ? 'var(--nx-black)' : 'var(--nx-muted)',
                border:     `1px solid ${hecho || activo ? 'var(--nx-white)' : 'var(--nx-line)'}`,
              }}>
              {hecho ? <Check size={14} strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className={`truncate text-[12px] font-semibold ${activo ? '' : 'hidden sm:inline'}`}
              style={{ color: activo ? 'var(--nx-white)' : 'var(--nx-muted)' }}>
              {p}<span className="sr-only">{hecho ? ' (completado)' : activo ? ' (paso actual)' : ''}</span>
            </span>
            {i < pasos.length - 1 && <span aria-hidden className="h-px flex-1" style={{ background: hecho ? 'var(--nx-silver)' : 'var(--nx-line)' }} />}
          </li>
        );
      })}
    </ol>
  );
}
