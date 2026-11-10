import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexa-app-seven.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`,           changeFrequency: 'weekly',  priority: 1 },
    { url: `${BASE}/planes`,     changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${BASE}/reglamento`, changeFrequency: 'monthly', priority: 0.4 },
  ];
}
