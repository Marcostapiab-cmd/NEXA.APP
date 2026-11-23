import Link from 'next/link';

export const metadata = { title: 'Instalar NEXA en tu celular' };

const PASO = 'flex gap-3 rounded-2xl bg-white/5 p-4 text-[16px] leading-snug';
const NUM = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[15px] font-bold text-[#0E0E0E]';

// Instrucciones para agregar la app a la pantalla de inicio (pública, sin datos).
export default function InstalarPage() {
  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <h1 className="text-2xl font-black">Instala NEXA en tu celular</h1>
      <p className="mt-2 text-[16px] text-white/75">
        Así tienes tu rutina a un toque, a pantalla completa, como cualquier otra app. No ocupa espacio.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-[18px] font-bold">iPhone (Safari)</h2>
        <ol className="space-y-2">
          <li className={PASO}><span className={NUM}>1</span><span>Abre el link de NEXA en <b>Safari</b> (no en Instagram ni WhatsApp: si se abre ahí, toca los tres puntos y elige “Abrir en Safari”).</span></li>
          <li className={PASO}><span className={NUM}>2</span><span>Toca el botón <b>Compartir</b> (el cuadrado con una flecha hacia arriba) en la barra de abajo.</span></li>
          <li className={PASO}><span className={NUM}>3</span><span>Baja y toca <b>“Agregar a pantalla de inicio”</b>.</span></li>
          <li className={PASO}><span className={NUM}>4</span><span>Toca <b>“Agregar”</b>. Listo: aparece el ícono de NEXA.</span></li>
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[18px] font-bold">Android (Chrome)</h2>
        <ol className="space-y-2">
          <li className={PASO}><span className={NUM}>1</span><span>Abre el link de NEXA en <b>Chrome</b>.</span></li>
          <li className={PASO}><span className={NUM}>2</span><span>Toca el menú <b>⋮</b> (tres puntos, arriba a la derecha).</span></li>
          <li className={PASO}><span className={NUM}>3</span><span>Toca <b>“Instalar app”</b> o <b>“Agregar a pantalla principal”</b>.</span></li>
          <li className={PASO}><span className={NUM}>4</span><span>Confirma con <b>“Instalar”</b>. Listo: aparece el ícono de NEXA.</span></li>
        </ol>
      </section>

      <p className="mt-8 text-[15px] text-white/70">
        La primera vez entra con el correo y la clave que te dio tu coach. Después la app recuerda tu sesión.
      </p>
      <Link href="/app" className="mt-6 flex h-14 items-center justify-center rounded-2xl bg-white text-[17px] font-bold text-[#0E0E0E]">
        Ir a mi rutina
      </Link>
    </main>
  );
}
