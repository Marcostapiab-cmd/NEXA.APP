import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDown } from 'lucide-react';
import { getCatalogoPublico } from '@/lib/catalogo-server';
import { clp } from '@/lib/format';
import { esClaseDePrueba } from '@/lib/catalogo';
import SiteHeader from '@/components/publico/SiteHeader';
import SiteFooter from '@/components/publico/SiteFooter';
import HeroFoto from '@/components/publico/HeroFoto';
import PlanesExplorer from '@/components/publico/PlanesExplorer';

export const metadata: Metadata = {
  title: 'Planes · NEXA Performance',
  description: 'Packs de clases grupales y planes de entrenamiento 1:1 y 2:1. Compra en línea y reserva tu horario.',
};

// Precios y cupos cambian desde el panel admin: siempre datos frescos
export const dynamic = 'force-dynamic';

const PASOS = [
  { n: '01', t: 'Elige tu plan',        d: 'Abre cada plan para ver sus clases, vigencia y condiciones antes de comprar.' },
  { n: '02', t: 'Crea tu cuenta',       d: 'En clases grupales tu cuenta guarda tu saldo de clases y su vigencia.' },
  { n: '03', t: 'Elige tu horario',     d: 'Ves las fechas con cupos reales. En 1:1 y 2:1 eliges tus días y hora.' },
  { n: '04', t: 'Paga en línea',        d: 'Pago seguro en Flow. Tu plan queda activo cuando Flow confirma el pago.' },
];

export default async function PlanesPage({ searchParams }: { searchParams: Promise<{ comprar?: string }> }) {
  const [catalogo, { comprar }] = await Promise.all([getCatalogoPublico(), searchParams]);

  const desdeGrupal = catalogo.grupales.length ? Math.min(...catalogo.grupales.map(p => p.precio_clp)) : null;
  const prueba = catalogo.grupales.find(p => esClaseDePrueba(p));

  const FAQ = [
    {
      p: '¿Cómo pago mi plan?',
      r: 'En línea a través de Flow, con tarjeta de crédito, débito o transferencia. NEXA no recibe ni guarda los datos de tu tarjeta.',
    },
    {
      p: '¿Desde cuándo corre la vigencia?',
      r: 'Desde que Flow confirma tu pago. Cada plan indica sus días de vigencia; las clases que no reserves dentro de ese plazo vencen.',
    },
    {
      p: '¿Cómo reservo mis clases grupales?',
      r: 'Puedes elegir tu primera clase al comprar. Después reservas desde tu cuenta: ves las fechas y horarios con cupos disponibles y cada reserva descuenta una clase de tu saldo.',
    },
    {
      p: '¿Qué pasa si la clase que elegí se llena mientras pago?',
      r: 'Tu pago y tus clases quedan cargados igual, y eliges otro horario desde tu cuenta. Nunca reservamos una clase sin cupo.',
    },
    ...(prueba ? [{
      p: '¿Puedo tomar la clase de prueba más de una vez?',
      r: 'No. La clase de prueba se puede comprar una sola vez por persona.',
    }] : []),
    {
      p: '¿Cómo funcionan los planes 1:1 y 2:1?',
      r: 'Eliges cuántas veces por semana entrenas, los días y la hora. Al confirmarse el pago se agenda tu plan completo y el equipo de NEXA te asigna un coach.',
    },
  ];

  return (
    <div className="nx-dark">
      <SiteHeader transparente />

      <main>
        <HeroFoto>
          <p className="nx-eyebrow mb-5" style={{ color: 'var(--nx-silver)' }}>Planes NEXA Performance</p>
          <h1 className="nx-display max-w-3xl text-[44px] leading-[1.02] sm:text-[64px] lg:text-[84px]" style={{ color: 'var(--nx-white)' }}>
            Encuentra tu plan.
          </h1>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed sm:text-[18px]" style={{ color: 'var(--nx-sub)' }}>
            Clases grupales por pack o entrenamiento personalizado 1:1 y 2:1. Compra en línea y reserva tu horario en minutos.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="#planes" className="nx-btn nx-btn-primary">
              Ver planes <ArrowDown size={16} aria-hidden />
            </Link>
            <Link href="/grupales-alumno/login" className="nx-btn nx-btn-outline">Ya tengo cuenta</Link>
          </div>
          {desdeGrupal !== null && (
            <p className="mt-10 text-[13px]" style={{ color: 'var(--nx-muted)' }}>
              Clases grupales desde <span style={{ color: 'var(--nx-white)', fontWeight: 600 }}>{clp(desdeGrupal)}</span>
            </p>
          )}
        </HeroFoto>

        <section id="planes" aria-labelledby="planes-titulo" className="scroll-mt-16 py-20 sm:py-28">
          <div className="nx-container">
            <p className="nx-eyebrow mb-4">Planes</p>
            <h2 id="planes-titulo" className="nx-display max-w-3xl text-[32px] leading-[1.08] sm:text-[48px]" style={{ color: 'var(--nx-white)' }}>
              Elige cómo quieres entrenar.
            </h2>
            <p className="mb-14 mt-4 max-w-xl text-[15px] leading-relaxed sm:text-[16px]" style={{ color: 'var(--nx-muted)' }}>
              Toca un plan para ver lo que incluye. Los precios son los vigentes en el sistema de NEXA.
            </p>
            <PlanesExplorer catalogo={catalogo} comprarInicial={comprar} />
          </div>
        </section>

        <section id="como-funciona" aria-labelledby="cf-titulo" className="scroll-mt-16 border-y py-20 sm:py-24"
          style={{ background: 'var(--nx-graphite)', borderColor: 'var(--nx-line)' }}>
          <div className="nx-container">
            <p className="nx-eyebrow mb-4">Cómo funciona</p>
            <h2 id="cf-titulo" className="nx-display mb-12 text-[30px] sm:text-[40px]" style={{ color: 'var(--nx-white)' }}>
              De la elección a tu primera clase.
            </h2>
            <ol className="grid gap-px overflow-hidden rounded-[18px] sm:grid-cols-2 lg:grid-cols-4" style={{ background: 'var(--nx-line)' }}>
              {PASOS.map(s => (
                <li key={s.n} className="p-6 sm:p-7" style={{ background: 'var(--nx-graphite)' }}>
                  <span className="nx-display text-[14px]" style={{ color: 'var(--nx-silver)' }}>{s.n}</span>
                  <h3 className="mt-4 text-[17px] font-bold" style={{ color: 'var(--nx-white)' }}>{s.t}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-titulo" className="scroll-mt-16 py-20 sm:py-28">
          <div className="nx-container grid gap-10 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <p className="nx-eyebrow mb-4">Preguntas frecuentes</p>
              <h2 id="faq-titulo" className="nx-display text-[30px] sm:text-[40px]" style={{ color: 'var(--nx-white)' }}>
                Lo que necesitas saber antes de comprar.
              </h2>
            </div>
            <div className="border-t" style={{ borderColor: 'var(--nx-line)' }}>
              {FAQ.map(q => (
                <details key={q.p} className="group border-b" style={{ borderColor: 'var(--nx-line)' }}>
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-semibold [&::-webkit-details-marker]:hidden"
                    style={{ color: 'var(--nx-white)' }}>
                    {q.p}
                    <span aria-hidden className="text-[22px] font-light transition-transform group-open:rotate-45" style={{ color: 'var(--nx-muted)' }}>+</span>
                  </summary>
                  <p className="pb-5 pr-8 text-[15px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>{q.r}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="Comenzar" className="pb-24">
          <div className="nx-container">
            <div className="nx-card flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center sm:p-12">
              <div>
                <h2 className="nx-display text-[28px] sm:text-[36px]" style={{ color: 'var(--nx-white)' }}>Tu próximo entrenamiento empieza aquí.</h2>
                <p className="mt-2 text-[15px]" style={{ color: 'var(--nx-muted)' }}>Elige tu plan y reserva tu horario en línea.</p>
              </div>
              <Link href="#planes" className="nx-btn nx-btn-primary shrink-0">Elegir plan</Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
