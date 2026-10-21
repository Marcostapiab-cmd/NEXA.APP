import Link from 'next/link';
import { ArrowRight, Calendar, Dumbbell, Users } from 'lucide-react';
import { clp } from '@/lib/format';
import { getCatalogoPublico } from '@/lib/catalogo-server';
import { MODALIDAD_INFO } from '@/lib/catalogo';
import SiteHeader from '@/components/publico/SiteHeader';
import SiteFooter from '@/components/publico/SiteFooter';
import HeroFoto from '@/components/publico/HeroFoto';

export const dynamic = 'force-dynamic';

const SERVICIOS = [
  {
    icon: Users,
    titulo: 'Clases grupales',
    desc: 'Barre, funcional, movilidad y más. Clases en grupos pequeños con atención personalizada. Reserva tu lugar en minutos.',
  },
  {
    icon: Dumbbell,
    titulo: 'Entrenamiento 1:1',
    desc: 'Programa diseñado según tu cuerpo y tus objetivos. Coach dedicado, seguimiento semanal y ajustes constantes.',
  },
  {
    icon: Calendar,
    titulo: 'Entrenamiento 2:1',
    desc: 'La misma atención personalizada, compartiendo el cupo con otra persona. Mismo nivel de exigencia, menor costo.',
  },
];

export default async function LandingPage() {
  const { grupales, precios } = await getCatalogoPublico();

  const desde = (xs: number[]) => (xs.length ? Math.min(...xs) : null);
  const lineas = [
    {
      titulo: 'Clases grupales',
      desc:   `${grupales.length} packs, desde 1 clase. Reservas cada horario según cupos.`,
      precio: desde(grupales.map(p => p.precio_clp)),
      sufijo: '',
      href:   '/planes#grupales',
    },
    ...(['1:1', '2:1'] as const).map(m => ({
      titulo: MODALIDAD_INFO[m].titulo,
      desc:   '1 a 5 veces por semana. Mensual, trimestral o semestral.',
      precio: desde(precios.filter(p => p.modalidad === m).map(p => p.precio_mes_clp)),
      sufijo: ' / mes',
      href:   '/planes#personalizado',
    })),
  ].filter(l => l.precio !== null);

  return (
    <div className="nx-dark">
      <SiteHeader transparente />

      <main>
        <HeroFoto>
          <p className="nx-eyebrow mb-5" style={{ color: 'var(--nx-silver)' }}>NEXA Performance · Santiago</p>
          <h1 className="nx-display max-w-4xl text-[46px] leading-[1.02] sm:text-[68px] lg:text-[88px]" style={{ color: 'var(--nx-white)' }}>
            Entrena diferente.<br />
            <span style={{ color: 'var(--nx-muted)' }}>Avanza en serio.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed sm:text-[18px]" style={{ color: 'var(--nx-sub)' }}>
            Clases grupales y entrenamiento personalizado 1:1 y 2:1 en un espacio diseñado para que logres resultados reales.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/planes#planes" className="nx-btn nx-btn-primary">Ver planes <ArrowRight size={16} aria-hidden /></Link>
            <Link href="/grupales-alumno/login" className="nx-btn nx-btn-outline">Mi cuenta</Link>
          </div>
        </HeroFoto>

        <section aria-labelledby="servicios-t" className="py-20 sm:py-28">
          <div className="nx-container">
            <p className="nx-eyebrow mb-4">Qué ofrecemos</p>
            <h2 id="servicios-t" className="nx-display mb-12 max-w-2xl text-[32px] leading-[1.08] sm:text-[46px]" style={{ color: 'var(--nx-white)' }}>
              Entrenamiento para todos los niveles.
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {SERVICIOS.map(s => (
                <article key={s.titulo} className="nx-card p-7">
                  <span className="mb-6 flex h-11 w-11 items-center justify-center rounded-full" style={{ border: '1px solid var(--nx-line)' }}>
                    <s.icon size={18} strokeWidth={1.75} style={{ color: 'var(--nx-silver)' }} aria-hidden />
                  </span>
                  <h3 className="text-[18px] font-bold" style={{ color: 'var(--nx-white)' }}>{s.titulo}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>{s.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {lineas.length > 0 && (
          <section id="planes" aria-labelledby="planes-t" className="border-y py-20 sm:py-28"
            style={{ background: 'var(--nx-graphite)', borderColor: 'var(--nx-line)' }}>
            <div className="nx-container">
              <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="nx-eyebrow mb-4">Planes</p>
                  <h2 id="planes-t" className="nx-display text-[32px] sm:text-[46px]" style={{ color: 'var(--nx-white)' }}>Elige tu forma de entrenar.</h2>
                </div>
                <Link href="/planes#planes" className="nx-btn nx-btn-outline self-start sm:self-auto">Todos los planes</Link>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {lineas.map(l => (
                  <Link key={l.titulo} href={l.href} className="nx-card nx-card-interactive group flex flex-col p-7" style={{ background: 'var(--nx-black)' }}>
                    <h3 className="text-[18px] font-bold" style={{ color: 'var(--nx-white)' }}>{l.titulo}</h3>
                    <p className="mt-2 flex-1 text-[14px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>{l.desc}</p>
                    <p className="mt-8 text-[12px] uppercase tracking-[0.16em]" style={{ color: 'var(--nx-muted)' }}>Desde</p>
                    <p className="nx-display mt-1 text-[32px]" style={{ color: 'var(--nx-white)' }}>
                      {clp(l.precio!)}<span className="text-[15px] font-semibold" style={{ color: 'var(--nx-muted)' }}>{l.sufijo}</span>
                    </p>
                    <span className="mt-6 inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] transition-transform group-hover:translate-x-1" style={{ color: 'var(--nx-white)' }}>
                      Ver detalle <ArrowRight size={15} aria-hidden />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section aria-label="Comenzar" className="py-24">
          <div className="nx-container text-center">
            <h2 className="nx-display mx-auto max-w-2xl text-[32px] sm:text-[46px]" style={{ color: 'var(--nx-white)' }}>Tu plan, a tu medida.</h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed" style={{ color: 'var(--nx-muted)' }}>
              Elige tu plan, reserva tu horario y paga en línea en pocos minutos.
            </p>
            <Link href="/planes#planes" className="nx-btn nx-btn-primary mt-8">Comenzar <ArrowRight size={16} aria-hidden /></Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
