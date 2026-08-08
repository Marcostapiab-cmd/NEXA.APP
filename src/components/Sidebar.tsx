'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  Home, Calendar, Users, Users2, Dumbbell, TrendingUp,
  Grid3x3, Settings, LogOut, CreditCard,
  ChevronDown, ChevronRight, CalendarDays, BarChart2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface NavItem { href: string; label: string; Icon: LucideIcon }
interface Section  { label: string; collapsible?: boolean; items: NavItem[] }

const SECTIONS_COMUN: Section[] = [
  {
    label: 'Principal',
    items: [
      { href: '/dashboard', label: 'Inicio',  Icon: Home },
      { href: '/horario',   label: 'Horario', Icon: Grid3x3 },
    ],
  },
  {
    label: 'Entrenamiento',
    collapsible: true,
    items: [
      { href: '/rutinas',    label: 'Rutinas',    Icon: Calendar },
      { href: '/weightroom', label: 'Weightroom', Icon: Dumbbell },
      { href: '/progreso',   label: 'Progreso',   Icon: TrendingUp },
    ],
  },
  {
    label: 'Personas',
    items: [
      { href: '/alumnos',    label: 'Alumnos',    Icon: Users },
      { href: '/profesores', label: 'Profesores', Icon: Users2 },
    ],
  },
];

const SECTION_ADMIN: Section = {
  label: 'Administración',
  items: [
    { href: '/metricas',       label: 'Métricas',        Icon: BarChart2    },
    { href: '/grupales',      label: 'Clases grupales', Icon: CalendarDays },
    { href: '/configuracion', label: 'Configuración',   Icon: Settings     },
  ],
};

const SECTIONS_PROFESOR: Section[] = [
  {
    label: 'Principal',
    items: [
      { href: '/horario', label: 'Horario', Icon: Grid3x3 },
      { href: '/rutinas', label: 'Rutinas', Icon: Calendar },
    ],
  },
];

const MOBILE_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio',    Icon: Home },
  { href: '/horario',   label: 'Horario',   Icon: Grid3x3 },
  { href: '/alumnos',   label: 'Alumnos',   Icon: Users },
  { href: '/rutinas',   label: 'Rutinas',   Icon: Calendar },
];

const MOBILE_ITEMS_PROFESOR: NavItem[] = [
  { href: '/horario', label: 'Horario', Icon: Grid3x3 },
  { href: '/rutinas', label: 'Rutinas', Icon: Calendar },
];

const NO_SIDEBAR_EXACT    = new Set(['/', '/login', '/registro', '/recuperar-contrasena', '/actualizar-contrasena']);
const NO_SIDEBAR_PREFIXES = ['/portal', '/clases-grupales', '/unirse', '/mi-cuenta', '/reservar', '/grupales-alumno'];

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href;
  return pathname.startsWith(href);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className="flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-all duration-150"
      style={active
        ? { background: 'var(--nexa-card-alt)', color: 'var(--nexa-text)', fontWeight: 600 }
        : { color: 'var(--nexa-muted)' }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--nexa-text-sub)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--nexa-muted)'; }}
    >
      <item.Icon size={14} strokeWidth={active ? 2.25 : 1.75} className="shrink-0" />
      {item.label}
    </Link>
  );
}

function SectionBlock({ section, pathname }: { section: Section; pathname: string }) {
  const hasActive = section.items.some(i => isActive(pathname, i.href));
  const [open, setOpen] = useState(hasActive);

  useEffect(() => { if (hasActive) setOpen(true); }, [hasActive]);

  const isCollapsible = section.collapsible;

  return (
    <div className="mb-3">
      {isCollapsible ? (
        <button
          onClick={() => setOpen(o => !o)}
          className="mb-0.5 flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] transition-all"
          style={{ color: hasActive ? 'var(--nexa-text-sub)' : 'var(--nexa-faint)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--nexa-text-sub)')}
          onMouseLeave={e => (e.currentTarget.style.color = hasActive ? 'var(--nexa-text-sub)' : 'var(--nexa-faint)')}
        >
          {section.label}
          {open
            ? <ChevronDown size={11} strokeWidth={2.5} />
            : <ChevronRight size={11} strokeWidth={2.5} />}
        </button>
      ) : (
        <p className="mb-0.5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: 'var(--nexa-faint)' }}>
          {section.label}
        </p>
      )}

      {(!isCollapsible || open) && (
        <ul className="space-y-0.5">
          {section.items.map(item => (
            <li key={item.href}>
              {isCollapsible && (
                <Link
                  href={item.href}
                  className="flex items-center gap-2.5 rounded-[8px] py-2 pl-6 pr-3 text-[13px] font-medium transition-all duration-150"
                  style={isActive(pathname, item.href)
                    ? { background: 'var(--nexa-card-alt)', color: 'var(--nexa-text)', fontWeight: 600 }
                    : { color: 'var(--nexa-muted)' }}
                  onMouseEnter={e => { if (!isActive(pathname, item.href)) (e.currentTarget as HTMLElement).style.color = 'var(--nexa-text-sub)'; }}
                  onMouseLeave={e => { if (!isActive(pathname, item.href)) (e.currentTarget as HTMLElement).style.color = 'var(--nexa-muted)'; }}
                >
                  <item.Icon size={13} strokeWidth={isActive(pathname, item.href) ? 2.25 : 1.75} className="shrink-0" />
                  {item.label}
                </Link>
              )}
              {!isCollapsible && <NavLink item={item} pathname={pathname} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname   = usePathname();
  const router     = useRouter();
  const [role,       setRole]      = useState<string | null>(null);
  const [email,      setEmail]     = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    supabase.rpc('get_my_role').then(({ data }: { data: unknown }) => setRole(data as string | null));
    supabase.auth.getUser().then(res => setEmail(res.data.user?.email ?? null));
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (NO_SIDEBAR_EXACT.has(pathname) || NO_SIDEBAR_PREFIXES.some(p => pathname.startsWith(p))) {
    return null;
  }

  const sections     = role === 'profesor' ? SECTIONS_PROFESOR : SECTIONS_COMUN;
  const mobileItems  = role === 'profesor' ? MOBILE_ITEMS_PROFESOR : MOBILE_ITEMS;

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside
        className="fixed left-0 top-0 z-30 hidden h-screen w-[220px] flex-col lg:flex"
        style={{ background: 'var(--nexa-bg)', borderRight: '1px solid var(--nexa-border)' }}
      >
        {/* Logo */}
        <div className="flex h-[60px] shrink-0 items-center gap-3 px-5"
          style={{ borderBottom: '1px solid var(--nexa-border)' }}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px]"
            style={{ background: 'var(--nexa-text)' }}>
            <span className="select-none text-[11px] font-black tracking-wider" style={{ color: '#FFFFFF' }}>N</span>
          </div>
          <span className="select-none text-[13px] font-black tracking-[0.14em]"
            style={{ color: 'var(--nexa-text)' }}>
            NEXA
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map(s => (
            <SectionBlock key={s.label} section={s} pathname={pathname} />
          ))}

          {/* Admin-only section */}
          {role === 'admin' && (
            <SectionBlock section={SECTION_ADMIN} pathname={pathname} />
          )}
        </nav>

        {/* Footer */}
        <div className="shrink-0 px-3 py-3" style={{ borderTop: '1px solid var(--nexa-border)' }}>
          <div className="flex items-center gap-2.5 rounded-[8px] px-2 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
              style={{ background: 'var(--nexa-card-alt)', color: 'var(--nexa-text-sub)' }}>
              {email ? email[0].toUpperCase() : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
                {email ?? '—'}
              </p>
              {role && (
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--nexa-faint)' }}>
                  {role}
                </p>
              )}
            </div>
            <button onClick={handleLogout} disabled={loggingOut} title="Cerrar sesión"
              className="shrink-0 rounded-[6px] p-1.5 transition-colors disabled:opacity-40"
              style={{ color: 'var(--nexa-muted)' }}
              onMouseEnter={e => { if (!loggingOut) e.currentTarget.style.color = 'var(--nexa-text)'; }}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--nexa-muted)')}>
              <LogOut size={13} strokeWidth={2} className={loggingOut ? 'animate-pulse' : ''} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom navigation ──────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden"
        style={{ background: 'var(--nexa-bg)', borderTop: '1px solid var(--nexa-border)' }}>
        <ul className="flex h-16 items-center">
          {mobileItems.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="flex flex-1 items-center justify-center">
                <Link href={href}
                  className="flex h-full flex-col items-center justify-center gap-1 transition-colors duration-150"
                  style={{ color: active ? 'var(--nexa-text)' : 'var(--nexa-faint)' }}>
                  <Icon size={18} strokeWidth={active ? 2.25 : 1.5} />
                  <span className="text-[10px] font-semibold tracking-wide">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
