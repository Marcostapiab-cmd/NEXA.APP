import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NEXA Performance',
  description: 'Plataforma de entrenamiento para coaches',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${inter.variable} h-full`}>
      <body
        className="min-h-full antialiased"
        style={{ background: 'var(--nexa-bg)', color: 'var(--nexa-text)' }}
      >
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-h-screen lg:ml-[220px] pb-20 lg:pb-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
