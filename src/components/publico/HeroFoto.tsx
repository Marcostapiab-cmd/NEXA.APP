import Image from 'next/image';
import heroFoto from '../../../public/nexa-hero.jpg';

/**
 * Fotografía principal a pantalla completa con capas oscuras para legibilidad.
 * Import estático: Next conoce el tamaño (sin saltos de diseño), genera un
 * placeholder borroso y sirve AVIF/WebP del ancho adecuado.
 * Encuadre: en móvil se centra en el atleta (lado derecho de la foto);
 * en escritorio se deja el lado izquierdo, más oscuro, para el texto.
 */
export default function HeroFoto({ children, alto = 'pantalla' }: {
  children: React.ReactNode;
  alto?: 'pantalla' | 'media';
}) {
  return (
    <section
      className={`relative isolate flex w-full items-end overflow-hidden ${alto === 'pantalla' ? 'min-h-[100svh]' : 'min-h-[72svh]'}`}
      style={{ background: 'var(--nx-black)' }}>
      <Image
        src={heroFoto}
        alt="Deportista entrenando con barra en NEXA Performance"
        fill
        preload
        sizes="100vw"
        placeholder="blur"
        className="-z-20 object-cover object-[68%_center] md:object-[center_35%]"
      />
      {/* Oscurecido general + degradados: legibilidad del texto y unión con la página */}
      <div aria-hidden className="absolute inset-0 -z-10" style={{
        background: [
          'linear-gradient(180deg, rgba(10,10,10,0.72) 0%, rgba(10,10,10,0.15) 22%, rgba(10,10,10,0.25) 55%, #0A0A0A 100%)',
          'linear-gradient(90deg, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0.45) 45%, rgba(10,10,10,0.05) 80%)',
        ].join(', '),
      }} />
      <div className="nx-container relative w-full pb-14 pt-28 md:pb-20">
        {children}
      </div>
    </section>
  );
}
