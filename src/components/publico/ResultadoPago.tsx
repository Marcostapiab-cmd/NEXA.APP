import Link from 'next/link';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';

export type VistaPago = 'cargando' | 'pagado' | 'pendiente' | 'error';

/** Marco visual común para el resultado de un pago con Flow. */
export default function ResultadoPago({ vista, titulo, children, acciones }: {
  vista:     VistaPago;
  titulo:    string;
  children?: React.ReactNode;
  acciones?: { href: string; label: string; primario?: boolean }[];
}) {
  const Icono = vista === 'pagado' ? CheckCircle2 : vista === 'error' ? XCircle : vista === 'pendiente' ? Clock : Loader2;
  const color = vista === 'pagado' ? 'var(--nexa-success)' : vista === 'error' ? 'var(--nexa-danger)' : 'var(--nx-sub)';
  return (
    <div className="nx-container flex justify-center">
      <div className="w-full max-w-[560px]" role={vista === 'cargando' ? undefined : 'status'} aria-live="polite" aria-busy={vista === 'cargando'}>
        <div className="nx-card p-6 text-center sm:p-10">
          <Icono size={44} className={`mx-auto ${vista === 'cargando' ? 'animate-spin' : ''}`} style={{ color }} aria-hidden />
          <h1 className="nx-display mt-5 text-[28px] leading-tight sm:text-[34px]" style={{ color: 'var(--nx-white)' }}>{titulo}</h1>
          {children && <div className="mt-4 text-left">{children}</div>}
          {acciones && acciones.length > 0 && (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              {acciones.map(a => (
                <Link key={a.href + a.label} href={a.href} className={`nx-btn ${a.primario ? 'nx-btn-primary' : 'nx-btn-outline'}`}>{a.label}</Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FilasResumen({ filas }: { filas: [string, string][] }) {
  return (
    <dl className="divide-y rounded-[14px] border" style={{ borderColor: 'var(--nx-line)' }}>
      {filas.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-6" style={{ borderColor: 'var(--nx-line)' }}>
          <dt className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--nx-muted)' }}>{k}</dt>
          <dd className="text-[14px] sm:text-right" style={{ color: 'var(--nx-white)' }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
