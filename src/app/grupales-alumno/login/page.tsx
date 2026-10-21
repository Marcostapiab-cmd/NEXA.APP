import { Suspense } from 'react';
import AccesoCuenta from '@/components/publico/AccesoCuenta';

export default function Page() {
  return (
    <Suspense>
      <AccesoCuenta modo="login" />
    </Suspense>
  );
}
