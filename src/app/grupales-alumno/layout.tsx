import type { Metadata } from 'next';
import SiteHeader from '@/components/publico/SiteHeader';

export const metadata: Metadata = {
  title: 'Mi cuenta · NEXA Performance',
  description: 'Tu saldo de clases grupales, reservas y compras en NEXA Performance.',
};

export default function GrupalesAlumnoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="nx-dark flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 pb-20 pt-24 md:pt-28">{children}</main>
    </div>
  );
}
