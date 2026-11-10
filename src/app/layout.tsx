import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import AppShell from '@/components/AppShell';

// Fuentes incluidas en el proyecto (src/app/fonts, licencia SIL OFL) en vez de
// descargarlas de Google al compilar: Google Fonts empezó a entregar direcciones
// sin extensión que hacen fallar el cargador de next/font/google (Next 16.2.7),
// y eso rompía la compilación. Mismas familias y pesos que antes.
const inter = localFont({
  src: './fonts/inter-latin-variable.woff2',
  variable: '--font-inter',
  weight: '300 900',
  display: 'swap',
});

// Tipografía de títulos de las páginas públicas (clase .nx-display)
const manrope = localFont({
  src: './fonts/manrope-latin-variable.woff2',
  variable: '--font-manrope',
  weight: '600 800',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NEXA Performance',
  description: 'Plataforma de entrenamiento para coaches',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${inter.variable} ${manrope.variable} h-full`}>
      <body
        className="min-h-full antialiased"
        style={{ background: 'var(--nexa-bg)', color: 'var(--nexa-text)' }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
