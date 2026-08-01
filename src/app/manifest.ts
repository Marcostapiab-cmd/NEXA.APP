import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NEXA Performance',
    short_name: 'NEXA',
    description: 'Tu portal de entrenamiento personal',
    start_url: '/portal',
    scope: '/portal',
    display: 'standalone',
    background_color: '#121212',
    theme_color: '#121212',
    orientation: 'portrait',
    categories: ['health', 'fitness'],
    icons: [
      {
        src: '/api/pwa-icon?size=192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/api/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/api/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/nexa.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
