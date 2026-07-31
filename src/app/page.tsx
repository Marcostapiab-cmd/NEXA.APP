import Link from 'next/link';
import { Users, Calendar, Dumbbell, CreditCard, FileText, BarChart3, CheckCircle, ArrowRight, Smartphone } from 'lucide-react';

const FEATURES = [
  { icon: Users,       title: 'Gestión de alumnos',     desc: 'Ficha completa, historial médico, métricas corporales y seguimiento CRM en un solo lugar.' },
  { icon: Dumbbell,    title: 'Rutinas personalizadas',  desc: 'Crea y asigna rutinas por bloques con videos de referencia. Tus alumnos las ven en su portal.' },
  { icon: Calendar,    title: 'Horario y reservas',      desc: 'Agenda de clases, reservas por plan, reagendas y control de asistencia con check-in.' },
  { icon: CreditCard,  title: 'Pagos integrados',        desc: 'Genera links de cobro vía Flow.cl (WebPay, Khipu). Historial de pagos por alumno.' },
  { icon: FileText,    title: 'Contratos digitales',     desc: 'Genera contratos precompletados con los datos del alumno. Imprímelos o expórtalos a PDF.' },
  { icon: Smartphone,  title: 'Portal del alumno',       desc: 'Tus alumnos acceden a sus rutinas, clases y pagos desde cualquier dispositivo.' },
];

const PLANS = [
  {
    name: 'Starter',
    price: '29.990',
    desc: 'Para estudios pequeños que recién comienzan.',
    features: ['Hasta 50 alumnos', 'Rutinas y reservas', 'Portal del alumno', 'Soporte por email'],
    cta: 'Comenzar gratis 14 días',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '59.990',
    desc: 'Para gimnasios con operación diaria consolidada.',
    features: ['Alumnos ilimitados', 'Todo de Starter', 'Pagos Flow.cl integrados', 'Contratos digitales', 'Múltiples profesores', 'Soporte prioritario'],
    cta: 'Comenzar gratis 14 días',
    highlight: true,
  },
  {
    name: 'Business',
    price: 'Contactar',
    desc: 'Para cadenas y multi-sucursal.',
    features: ['Todo de Pro', 'Multi-sede', 'Acceso API', 'Onboarding dedicado', 'SLA garantizado'],
    cta: 'Hablar con ventas',
    highlight: false,
  },
];

const STATS = [
  { value: '500+', label: 'Alumnos gestionados' },
  { value: '98%',  label: 'Uptime garantizado' },
  { value: '< 2s', label: 'Tiempo de carga' },
  { value: '24/7', label: 'Disponibilidad' },
];

export default function LandingPage() {
  return (
    <div style={{ background: '#0d0f10', color: '#f5f4f0', fontFamily: 'var(--font-inter, Inter, sans-serif)' }}>

      {/* ── Navbar ── */}
      <nav style={{ borderBottom: '1px solid #1f2528', position: 'sticky', top: 0, zIndex: 50, background: 'rgba(13,15,16,0.92)', backdropFilter: 'blur(12px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, background: '#f3f1ec', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#0d0f10', letterSpacing: 2 }}>N</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.14em', color: '#f5f4f0' }}>NEXA</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/login" style={{ fontSize: 13, color: '#b8bdc0', textDecoration: 'none', padding: '8px 16px', borderRadius: 8, border: '1px solid #1f2528', transition: 'all 150ms' }}>
              Iniciar sesión
            </Link>
            <a href="#precios" style={{ fontSize: 13, fontWeight: 600, color: '#0d0f10', background: '#f3f1ec', textDecoration: 'none', padding: '8px 18px', borderRadius: 8, transition: 'all 150ms' }}>
              Ver planes
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '100px 24px 80px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#141819', border: '1px solid #282e31', borderRadius: 100, padding: '6px 14px', marginBottom: 32 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6f9a79' }} />
          <span style={{ fontSize: 12, color: '#b8bdc0', fontWeight: 500 }}>Software de gestión para gimnasios y entrenadores</span>
        </div>

        <h1 style={{ fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 900, lineHeight: 1.08, letterSpacing: '-0.03em', margin: '0 0 24px', color: '#f5f4f0' }}>
          Gestiona tu gym.<br />
          <span style={{ color: '#858b8e' }}>Sin complicaciones.</span>
        </h1>

        <p style={{ fontSize: 18, color: '#b8bdc0', maxWidth: 540, margin: '0 auto 40px', lineHeight: 1.6 }}>
          NEXA centraliza alumnos, rutinas, reservas, pagos y contratos en una sola plataforma diseñada para entrenadores profesionales.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="#precios" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#0d0f10', background: '#f3f1ec', textDecoration: 'none', padding: '14px 28px', borderRadius: 12 }}>
            Probar gratis 14 días <ArrowRight size={16} />
          </a>
          <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#b8bdc0', background: 'transparent', textDecoration: 'none', padding: '14px 28px', borderRadius: 12, border: '1px solid #282e31' }}>
            Ver demo
          </Link>
        </div>
      </section>

      {/* ── Stats ── */}
      <section style={{ borderTop: '1px solid #1f2528', borderBottom: '1px solid #1f2528', background: '#141819' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 32, textAlign: 'center' }}>
          {STATS.map(s => (
            <div key={s.label}>
              <p style={{ fontSize: 32, fontWeight: 900, color: '#f5f4f0', margin: '0 0 4px' }}>{s.value}</p>
              <p style={{ fontSize: 13, color: '#858b8e', margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '96px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#858b8e', margin: '0 0 12px' }}>Todo en uno</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, letterSpacing: '-0.02em', color: '#f5f4f0', margin: '0 0 16px' }}>
            Todo lo que tu gym necesita
          </h2>
          <p style={{ fontSize: 16, color: '#b8bdc0', maxWidth: 460, margin: '0 auto' }}>
            Sin apps separadas. Sin planillas de Excel. Sin caos.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: '#141819', border: '1px solid #1f2528', borderRadius: 16, padding: 28, transition: 'border-color 150ms' }}>
              <div style={{ width: 40, height: 40, background: '#1c2023', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <f.icon size={18} color="#d3d0c8" />
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f5f4f0', margin: '0 0 8px' }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: '#858b8e', margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Precios ── */}
      <section id="precios" style={{ background: '#141819', borderTop: '1px solid #1f2528', borderBottom: '1px solid #1f2528' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '96px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#858b8e', margin: '0 0 12px' }}>Precios</p>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, letterSpacing: '-0.02em', color: '#f5f4f0', margin: '0 0 16px' }}>
              Simple y transparente
            </h2>
            <p style={{ fontSize: 16, color: '#b8bdc0', maxWidth: 400, margin: '0 auto' }}>
              14 días gratis, sin tarjeta de crédito. Cancela cuando quieras.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
            {PLANS.map(plan => (
              <div key={plan.name} style={{
                background: plan.highlight ? '#f3f1ec' : '#1c2023',
                border: `1px solid ${plan.highlight ? 'transparent' : '#282e31'}`,
                borderRadius: 20,
                padding: 32,
                position: 'relative',
              }}>
                {plan.highlight && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#0d0f10', border: '1px solid #282e31', borderRadius: 100, padding: '4px 14px', fontSize: 11, fontWeight: 700, color: '#d3d0c8', whiteSpace: 'nowrap', letterSpacing: '0.08em' }}>
                    MÁS POPULAR
                  </div>
                )}
                <p style={{ fontSize: 13, fontWeight: 700, color: plan.highlight ? '#0d0f10' : '#858b8e', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{plan.name}</p>
                <div style={{ marginBottom: 8 }}>
                  {plan.price === 'Contactar' ? (
                    <span style={{ fontSize: 32, fontWeight: 900, color: plan.highlight ? '#0d0f10' : '#f5f4f0' }}>Contactar</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 13, color: plan.highlight ? '#3E3E3E' : '#858b8e', verticalAlign: 'super' }}>CLP $</span>
                      <span style={{ fontSize: 40, fontWeight: 900, color: plan.highlight ? '#0d0f10' : '#f5f4f0' }}>{plan.price}</span>
                      <span style={{ fontSize: 13, color: plan.highlight ? '#3E3E3E' : '#858b8e' }}>/mes</span>
                    </>
                  )}
                </div>
                <p style={{ fontSize: 13, color: plan.highlight ? '#3E3E3E' : '#858b8e', margin: '0 0 24px', lineHeight: 1.5 }}>{plan.desc}</p>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: plan.highlight ? '#1c2023' : '#b8bdc0' }}>
                      <CheckCircle size={14} color={plan.highlight ? '#0d0f10' : '#6f9a79'} style={{ flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <a href="mailto:hola@nexatraining.cl" style={{
                  display: 'block', textAlign: 'center', textDecoration: 'none',
                  fontSize: 14, fontWeight: 700,
                  color: plan.highlight ? '#f3f1ec' : '#f5f4f0',
                  background: plan.highlight ? '#0d0f10' : '#222729',
                  padding: '13px 20px', borderRadius: 12,
                  border: plan.highlight ? 'none' : '1px solid #282e31',
                }}>
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, letterSpacing: '-0.02em', color: '#f5f4f0', margin: '0 0 16px' }}>
          ¿Listo para profesionalizar tu gym?
        </h2>
        <p style={{ fontSize: 16, color: '#b8bdc0', maxWidth: 440, margin: '0 auto 36px', lineHeight: 1.6 }}>
          Únete a los entrenadores que ya usan NEXA para gestionar su negocio sin caos.
        </p>
        <a href="mailto:hola@nexatraining.cl" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: '#0d0f10', background: '#f3f1ec', textDecoration: 'none', padding: '16px 32px', borderRadius: 14 }}>
          Contactar ahora <ArrowRight size={16} />
        </a>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid #1f2528', background: '#0d0f10' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 26, height: 26, background: '#f3f1ec', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: '#0d0f10', letterSpacing: 2 }}>N</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.14em', color: '#f5f4f0' }}>NEXA</span>
          </div>
          <p style={{ fontSize: 12, color: '#858b8e', margin: 0 }}>
            © {new Date().getFullYear()} NEXA Training Studio · Todos los derechos reservados
          </p>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/login" style={{ fontSize: 12, color: '#858b8e', textDecoration: 'none' }}>Admin</Link>
            <Link href="/portal/login" style={{ fontSize: 12, color: '#858b8e', textDecoration: 'none' }}>Portal alumnos</Link>
            <a href="mailto:hola@nexatraining.cl" style={{ fontSize: 12, color: '#858b8e', textDecoration: 'none' }}>Contacto</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
