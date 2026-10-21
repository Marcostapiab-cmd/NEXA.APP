import { redirect } from 'next/navigation';

// El armador de planes 1:1 / 2:1 ahora vive en /planes (misma API de pago).
// Se mantiene esta ruta para no romper enlaces existentes.
export default function ClasesGrupalesPage() {
  redirect('/planes#personalizado');
}
