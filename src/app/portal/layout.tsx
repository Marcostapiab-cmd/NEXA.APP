import type { Metadata, Viewport } from 'next';
import SwRegister from '@/components/SwRegister';

export const viewport: Viewport = {
  themeColor: '#121212',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'NEXA Portal',
  description: 'Tu portal de entrenamiento personal',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'NEXA',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: [
      { url: '/api/pwa-icon?size=180', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SwRegister />
      {children}
    </>
  );
}
