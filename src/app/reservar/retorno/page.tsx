import { Suspense } from 'react';
import RetornoContent from './_content';

export default function RetornoPage() {
  return (
    <Suspense fallback={
      <main style={{ background:'#090909', minHeight:'100vh' }}
        className="flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#C8E840] border-t-transparent" />
      </main>
    }>
      <RetornoContent />
    </Suspense>
  );
}
