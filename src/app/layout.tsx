import type { Metadata } from 'next';
import { Inter, Manrope } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
});

// Tipografía de títulos de las páginas públicas (clase .nx-display)
const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
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
