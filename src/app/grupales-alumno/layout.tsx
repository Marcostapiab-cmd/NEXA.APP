import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NEXA · Portal Clases',
  description: 'Tu cuenta de clases grupales NEXA',
};

export default function GrupalesAlumnoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--nexa-surface)' }}>
      {children}
    </div>
  );
}
