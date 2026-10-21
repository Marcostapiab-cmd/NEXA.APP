// Logotipo actual de NEXA (cuadro con "N" + wordmark), en versión para fondo oscuro.
export default function NexaLogo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const box  = size === 'sm' ? 'h-7 w-7 text-[11px] rounded-[6px]' : 'h-8 w-8 text-[12px] rounded-[7px]';
  const word = size === 'sm' ? 'text-[13px]' : 'text-[14px]';
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden className={`flex shrink-0 items-center justify-center font-black tracking-wider ${box}`}
        style={{ background: 'var(--nx-white)', color: 'var(--nx-black)' }}>
        N
      </span>
      <span className={`select-none font-black tracking-[0.2em] ${word}`} style={{ color: 'var(--nx-white)' }}>
        NEXA
      </span>
      <span className="sr-only">NEXA Performance</span>
    </span>
  );
}
