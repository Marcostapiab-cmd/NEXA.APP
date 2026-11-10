'use client';

/** Aviso cuando no se pudieron cargar datos del servidor (no se muestran copias locales). */
export default function AvisoErrorCarga({ texto }: { texto?: string }) {
  return (
    <div role="alert" className="mx-4 my-3 flex items-center gap-3 rounded-xl border px-4 py-3 text-[13px] sm:mx-6"
      style={{ background: 'rgba(196,58,58,0.06)', borderColor: 'rgba(196,58,58,0.3)', color: '#9B2C2C' }}>
      <span>{texto ?? 'No pudimos cargar los datos. Revisa tu conexión.'}</span>
      <button onClick={() => window.location.reload()}
        className="ml-auto shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-semibold"
        style={{ borderColor: 'rgba(196,58,58,0.4)' }}>
        Reintentar
      </button>
    </div>
  );
}
