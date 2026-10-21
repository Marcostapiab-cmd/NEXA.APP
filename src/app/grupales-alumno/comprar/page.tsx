import { redirect } from 'next/navigation';

// La compra de packs ahora ocurre en /planes. Se mantiene la ruta por compatibilidad.
export default async function ComprarPage({ searchParams }: { searchParams: Promise<{ pack?: string }> }) {
  const { pack } = await searchParams;
  redirect(pack ? `/planes?comprar=${encodeURIComponent(pack)}#grupales` : '/planes#grupales');
}
