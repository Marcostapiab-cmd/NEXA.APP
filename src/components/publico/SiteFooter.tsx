import Link from 'next/link';
import NexaLogo from './NexaLogo';

// Solo enlaces y datos que existen en el proyecto (no se agregan
// direcciones, teléfonos ni redes que NEXA no haya definido).
const linkCls = 'inline-flex min-h-10 items-center hover:text-white';

export default function SiteFooter() {
  return (
    <footer style={{ background: '#070707', borderTop: '1px solid var(--nx-line)' }}>
      <div className="nx-container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-2">
          <NexaLogo />
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>
            Clases grupales y entrenamiento personalizado 1:1 y 2:1. Compra tu plan y reserva en línea.
          </p>
        </div>
        <nav aria-label="Planes">
          <p className="nx-eyebrow mb-4">Planes</p>
          <ul className="space-y-1 text-[14px]" style={{ color: 'var(--nx-sub)' }}>
            <li><Link className={linkCls} href="/planes#grupales">Clases grupales</Link></li>
            <li><Link className={linkCls} href="/planes#personalizado">Entrenamiento 1:1 y 2:1</Link></li>
            <li><Link className={linkCls} href="/planes#faq">Preguntas frecuentes</Link></li>
          </ul>
        </nav>
        <nav aria-label="Cuenta">
          <p className="nx-eyebrow mb-4">Cuenta</p>
          <ul className="space-y-1 text-[14px]" style={{ color: 'var(--nx-sub)' }}>
            <li><Link className={linkCls} href="/grupales-alumno/login">Mi cuenta de clases</Link></li>
            <li><Link className={linkCls} href="/portal/login">Portal alumnos</Link></li>
            <li><Link className={linkCls} href="/login">Acceso staff</Link></li>
          </ul>
        </nav>
      </div>
      <div className="nx-container flex flex-col gap-2 border-t py-6 text-[12px] sm:flex-row sm:justify-between"
        style={{ borderColor: 'var(--nx-line)', color: 'var(--nexa-faint)' }}>
        <p>© {new Date().getFullYear()} NEXA Performance</p>
        <p>Pagos procesados por Flow</p>
      </div>
    </footer>
  );
}
