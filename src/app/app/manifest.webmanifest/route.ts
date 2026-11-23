// Manifest de la app de rutinas (independiente del portal MI NEXA).
export const dynamic = 'force-static';

export function GET() {
  return Response.json({
    name: 'NEXA',
    short_name: 'NEXA',
    description: 'Tu rutina de entrenamiento NEXA',
    id: '/app',
    start_url: '/app',
    scope: '/app',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0E0E0E',
    theme_color: '#0E0E0E',
    lang: 'es-CL',
    categories: ['health', 'fitness'],
    icons: [
      { src: '/api/pwa-icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json' } });
}
