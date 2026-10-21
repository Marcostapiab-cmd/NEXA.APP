import { Suspense } from 'react';
import SiteHeader from '@/components/publico/SiteHeader';
import RetornoContent from './_content';

export default function RetornoPage() {
  return (
    <div className="nx-dark flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 pb-20 pt-24 md:pt-28">
        <Suspense>
          <RetornoContent />
        </Suspense>
      </main>
    </div>
  );
}
