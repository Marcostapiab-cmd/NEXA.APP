import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexa-app-seven.vercel.app';

// Los buscadores pueden indexar solo las páginas públicas.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/planes', '/reglamento'],
      disallow: ['/api/', '/portal', '/grupales-alumno', '/dashboard', '/horario', '/alumnos', '/login'],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
