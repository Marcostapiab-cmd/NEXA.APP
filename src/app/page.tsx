import Link from 'next/link';
import { ArrowRight, CheckCircle, Users, Dumbbell, Calendar } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { clp } from '@/lib/format';

const SERVICIOS = [
  {
    icon: Users,
    titulo: 'Clases Grupales',
    desc: 'Barre, funcional, movilidad y más. Clases en grupos pequeños con atención personalizada. Reserva tu lugar en minutos.',
  },
  {
    icon: Dumbbell,
    titulo: 'Entrenamiento Personalizado',
    desc: 'Programas diseñados según tu cuerpo y tus objetivos. Coach dedicado, seguimiento semanal y ajustes constantes.',
  },
  {
    icon: Calendar,
    titulo: 'Horario Flexible',
    desc: 'Clases durante la semana en horarios adaptados a tu rutina. Reserva desde el celular con anticipación.',
  },
];

interface PlanGrupal {
  id:           string;
  nombre:       string;
  descripcion:  string | null;
  precio_clp:   number;
  num_clases:   number;
  validez_dias: number;
  destacado:    boolean;
}

export default async function LandingPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('planes_grupales')
    .select('id, nombre, descripcion, precio_clp, num_clases, validez_dias, destacado')
    .eq('activo', true)
    .order('orden');

  const packs: PlanGrupal[] = (data ?? []) as PlanGrupal[];

  return (
    <div style={{ background: 'var(--nexa-bg)', color: 'var(--nexa-text)', fontFamily: 'var(--font-inter, Inter, sans-serif)' }}>

      {/* ── Navbar ── */}
      <nav style={{
        borderBottom: '1px solid var(--nexa-border)',
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(248,248,248,0.92)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, background: 'var(--nexa-text)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#fff', letterSpacing: 2 }}>N</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.14em', color: 'var(--nexa-text)' }}>NEXA</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/login" style={{ fontSize: 13, color: 'var(--nexa-muted)', textDecoration: 'none', padding: '8px 16px' }}>
              Acceso staff
            </Link>
            <Link href="/reservar" style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--nexa-text)', textDecoration: 'none', padding: '9px 18px', borderRadius: 9 }}>
              Reservar clase
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(64px, 10vw, 120px) 24px clamp(48px, 8vw, 96px)', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)', borderRadius: 100, padding: '6px 14px', marginBottom: 32 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--nexa-success)' }} />
          <span style={{ fontSize: 12, color: 'var(--nexa-muted)', fontWeight: 500 }}>Clases grupales · Santiago</span>
        </div>

        <h1 style={{ fontSize: 'clamp(40px, 7vw, 80px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 24px', color: 'var(--nexa-text)' }}>
          Entrena diferente.<br />
          <span style={{ color: 'var(--nexa-muted)' }}>Avanza en serio.</span>
        </h1>

        <p style={{ fontSize: 18, color: 'var(--nexa-text-sub)', maxWidth: 500, margin: '0 auto 40px', lineHeight: 1.65 }}>
          Clases grupales y entrenamiento personalizado en un espacio diseñado para que logres resultados reales.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/reservar" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: '#fff', background: 'var(--nexa-text)', textDecoration: 'none', padding: '15px 30px', borderRadius: 12 }}>
            Agenda tu clase <ArrowRight size={16} />
          </Link>
          <a href="#planes" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--nexa-text-sub)', textDecoration: 'none', padding: '15px 30px', borderRadius: 12, border: '1px solid var(--nexa-border)' }}>
            Ver planes
          </a>
        </div>
      </section>

      {/* ── Servicios ── */}
      <section style={{ background: 'var(--nexa-surface)', borderTop: '1px solid var(--nexa-border)', borderBottom: '1px solid var(--nexa-border)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '80px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--nexa-muted)', margin: '0 0 12px' }}>Qué ofrecemos</p>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--nexa-text)', margin: 0 }}>
              Entrenamiento para todos los niveles
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {SERVICIOS.map(s => (
              <div key={s.titulo} style={{ background: 'var(--nexa-bg)', border: '1px solid var(--nexa-border)', borderRadius: 20, padding: 28 }}>
                <div style={{ width: 42, height: 42, background: 'var(--nexa-card)', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <s.icon size={18} color="var(--nexa-text-sub)" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--nexa-text)', margin: '0 0 10px' }}>{s.titulo}</h3>
                <p style={{ fontSize: 13, color: 'var(--nexa-muted)', margin: 0, lineHeight: 1.65 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Planes ── */}
      <section id="planes" style={{ maxWidth: 1080, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--nexa-muted)', margin: '0 0 12px' }}>Planes de clases grupales</p>
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--nexa-text)', margin: '0 0 12px' }}>
            Elige tu pack
          </h2>
          <p style={{ fontSize: 15, color: 'var(--nexa-muted)', maxWidth: 380, margin: '0 auto' }}>
            Reserva tu clase directamente desde el horario. Sin membresía mensual obligatoria.
          </p>
        </div>

        {packs.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--nexa-muted)', fontSize: 14 }}>
            Sin planes disponibles por el momento.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, alignItems: 'start' }}>
            {packs.map(plan => {
              const isMasElegido = plan.nombre === 'Pack Mensual';
              return (
                <div key={plan.id} style={{
                  background: isMasElegido ? 'var(--nexa-text)' : 'var(--nexa-card)',
                  border: `1px solid ${isMasElegido ? 'transparent' : 'var(--nexa-border)'}`,
                  borderRadius: 20,
                  padding: 28,
                  position: 'relative',
                }}>
                  {isMasElegido && (
                    <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'var(--nexa-bg)', border: '1px solid var(--nexa-border)', borderRadius: 100, padding: '4px 14px', fontSize: 10, fontWeight: 800, color: 'var(--nexa-text)', whiteSpace: 'nowrap', letterSpacing: '0.1em' }}>
                      MÁS ELEGIDO
                    </div>
                  )}
                  {plan.destacado && !isMasElegido && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ display: 'inline-block', background: 'var(--nexa-text)', color: '#fff', borderRadius: 100, padding: '3px 10px', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em' }}>
                        POPULAR
                      </span>
                    </div>
                  )}
                  <p style={{ fontSize: 12, fontWeight: 700, color: isMasElegido ? 'rgba(255,255,255,0.5)' : 'var(--nexa-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    {plan.num_clases} {plan.num_clases === 1 ? 'clase' : 'clases'}
                  </p>
                  <p style={{ fontSize: 18, fontWeight: 900, color: isMasElegido ? '#fff' : 'var(--nexa-text)', margin: '0 0 4px' }}>
                    {plan.nombre}
                  </p>
                  <p style={{ fontSize: 32, fontWeight: 900, color: isMasElegido ? '#fff' : 'var(--nexa-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
                    {clp(plan.precio_clp)}
                  </p>
                  <p style={{ fontSize: 13, color: isMasElegido ? 'rgba(255,255,255,0.6)' : 'var(--nexa-muted)', margin: '0 0 22px', lineHeight: 1.5 }}>
                    {plan.descripcion}
                  </p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: isMasElegido ? 'rgba(255,255,255,0.8)' : 'var(--nexa-text-sub)' }}>
                      <CheckCircle size={13} color={isMasElegido ? 'rgba(255,255,255,0.7)' : 'var(--nexa-text)'} style={{ flexShrink: 0 }} />
                      {plan.num_clases} {plan.num_clases === 1 ? 'clase grupal' : 'clases grupales'}
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: isMasElegido ? 'rgba(255,255,255,0.8)' : 'var(--nexa-text-sub)' }}>
                      <CheckCircle size={13} color={isMasElegido ? 'rgba(255,255,255,0.7)' : 'var(--nexa-text)'} style={{ flexShrink: 0 }} />
                      Vigencia {plan.validez_dias} días
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: isMasElegido ? 'rgba(255,255,255,0.8)' : 'var(--nexa-text-sub)' }}>
                      <CheckCircle size={13} color={isMasElegido ? 'rgba(255,255,255,0.7)' : 'var(--nexa-text)'} style={{ flexShrink: 0 }} />
                      Reserva en línea
                    </li>
                  </ul>

                  <Link href="/reservar" style={{
                    display: 'block', textAlign: 'center', textDecoration: 'none',
                    fontSize: 14, fontWeight: 700,
                    color: isMasElegido ? 'var(--nexa-text)' : '#fff',
                    background: isMasElegido ? '#fff' : 'var(--nexa-text)',
                    padding: '13px 20px', borderRadius: 11,
                  }}>
                    Reservar clase →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── CTA final ── */}
      <section style={{ background: 'var(--nexa-surface)', borderTop: '1px solid var(--nexa-border)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 44px)', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--nexa-text)', margin: '0 0 14px' }}>
            Tu primera clase, cuando quieras.
          </h2>
          <p style={{ fontSize: 15, color: 'var(--nexa-muted)', margin: '0 auto 32px', lineHeight: 1.65, maxWidth: 420 }}>
            Elige la clase, el día y el horario que más te acomode. Reserva en línea en menos de 2 minutos.
          </p>
          <Link href="/reservar" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: '#fff', background: 'var(--nexa-text)', textDecoration: 'none', padding: '15px 32px', borderRadius: 12 }}>
            Agenda tu clase <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid var(--nexa-border)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 26, height: 26, background: 'var(--nexa-text)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', letterSpacing: 2 }}>N</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--nexa-text)' }}>NEXA</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--nexa-muted)', margin: 0 }}>
            © {new Date().getFullYear()} NEXA Training Studio
          </p>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/reservar" style={{ fontSize: 12, color: 'var(--nexa-muted)', textDecoration: 'none' }}>Reservar</Link>
            <Link href="/login" style={{ fontSize: 12, color: 'var(--nexa-muted)', textDecoration: 'none' }}>Staff</Link>
            <Link href="/portal/login" style={{ fontSize: 12, color: 'var(--nexa-muted)', textDecoration: 'none' }}>Portal alumnos</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
