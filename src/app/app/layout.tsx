import type { Metadata, Viewport } from 'next';
import SwRegister from '@/components/SwRegister';

// App de rutinas del alumno: instalable en el celular, se abre a pantalla completa.
export const viewport: Viewport = {
  themeColor: '#0E0E0E',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'NEXA · Mi rutina',
  description: 'Tu rutina de entrenamiento NEXA',
  manifest: '/app/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'NEXA', statusBarStyle: 'black-translucent' },
  icons: { apple: [{ url: '/api/pwa-icon?size=180', sizes: '180x180', type: 'image/png' }] },
  other: { 'mobile-web-app-capable': 'yes', 'apple-mobile-web-app-capable': 'yes' },
  robots: { index: false, follow: false },
};

export default function AppRutinasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0E0E0E] text-white" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <SwRegister />
      {children}
    </div>
  );
}
