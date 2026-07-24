'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Home, Calendar, Users, Users2, Dumbbell, TrendingUp, Grid3x3, Settings, ClipboardCheck, LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  Icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: '/dashboard',  label: 'Inicio',     shortLabel: 'Inicio', Icon: Home },
  { href: '/horario',    label: 'Horario',    shortLabel: 'Hor',    Icon: Grid3x3 },
  { href: '/rutinas',    label: 'Rutinas',    shortLabel: 'Rut',    Icon: Calendar },
  { href: '/alumnos',     label: 'Alumnos',     shortLabel: 'Alumn', Icon: Users },
  { href: '/profesores',  label: 'Profesores',  shortLabel: 'Prof',  Icon: Users2 },
  { href: '/checkin',     label: 'Check-in',    shortLabel: 'Check', Icon: ClipboardCheck },
  { href: '/weightroom',  label: 'Weightroom',  shortLabel: 'WR',    Icon: Dumbbell },
  { href: '/progreso',   label: 'Progreso',   shortLabel: 'Prog',   Icon: TrendingUp },
];

const AUTH_ROUTES = ['/', '/login'];

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href;
  return pathname.startsWith(href);
}

export default function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const [role,  setRole]  = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('get_my_role').then(({ data }: { data: unknown }) => setRole(data as string | null));
    supabase.auth.getUser().then(res => setEmail(res.data.user?.email ?? null));
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (AUTH_ROUTES.includes(pathname)) return null;

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside
        className="fixed left-0 top-0 z-30 hidden h-screen w-[220px] flex-col lg:flex"
        style={{
          background: 'var(--nexa-bg)',
          borderRight: '1px solid var(--nexa-border)',
        }}
      >
        {/* Logo */}
        <div
          className="flex h-[60px] shrink-0 items-center gap-3 px-5"
          style={{ borderBottom: '1px solid var(--nexa-border)' }}
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px]"
            style={{ background: 'var(--nexa-text)' }}
          >
            <span className="select-none text-[11px] font-black tracking-wider" style={{ color: '#FFFFFF' }}>
              N
            </span>
          </div>
          <span
            className="select-none text-[13px] font-black tracking-[0.16em]"
            style={{ color: 'var(--nexa-text)', letterSpacing: '0.14em' }}
          >
            NEXA
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {NAV.map(({ href, label, Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className="relative flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[13px] font-medium transition-all duration-150"
                    style={active ? {
                      background: 'var(--nexa-card-alt)',
                      color: 'var(--nexa-text)',
                      fontWeight: 600,
                    } : {
                      color: 'var(--nexa-muted)',
                    }}
                    onMouseEnter={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--nexa-text-sub)';
                    }}
                    onMouseLeave={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--nexa-muted)';
                    }}
                  >
                    <Icon
                      size={15}
                      strokeWidth={active ? 2.25 : 1.75}
                      className="shrink-0"
                    />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Config link — solo admin */}
        {role === 'admin' && (
          <div className="px-3 pb-2">
            <Link
              href="/configuracion"
              className="relative flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[13px] font-medium transition-all duration-150"
              style={isActive(pathname, '/configuracion') ? {
                background: 'var(--nexa-card-alt)',
                color: 'var(--nexa-text)',
                fontWeight: 600,
              } : { color: 'var(--nexa-muted)' }}
              onMouseEnter={e => {
                if (!isActive(pathname, '/configuracion'))
                  (e.currentTarget as HTMLElement).style.color = 'var(--nexa-text-sub)';
              }}
              onMouseLeave={e => {
                if (!isActive(pathname, '/configuracion'))
                  (e.currentTarget as HTMLElement).style.color = 'var(--nexa-muted)';
              }}
            >
              <Settings size={15} strokeWidth={isActive(pathname, '/configuracion') ? 2.25 : 1.75} className="shrink-0" />
              Configuración
            </Link>
          </div>
        )}

        {/* Footer — user + logout */}
        <div
          className="shrink-0 px-3 py-3"
          style={{ borderTop: '1px solid var(--nexa-border)' }}
        >
          <div className="flex items-center gap-2.5 rounded-[8px] px-2 py-2">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
              style={{ background: 'var(--nexa-card-alt)', color: 'var(--nexa-text-sub)' }}
            >
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
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="shrink-0 rounded-[6px] p-1.5 transition-colors"
              style={{ color: 'var(--nexa-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--nexa-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--nexa-muted)')}
            >
              <LogOut size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom navigation ──────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 lg:hidden"
        style={{
          background: 'var(--nexa-bg)',
          borderTop: '1px solid var(--nexa-border)',
        }}
      >
        <ul className="flex h-16 items-center">
          {NAV.map(({ href, shortLabel, Icon }) => {
            const active  = isActive(pathname, href);
            const isGym   = href === '/weightroom';

            if (isGym) {
              return (
                <li key={href} className="flex flex-1 items-center justify-center">
                  <Link
                    href={href}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-5 py-2 transition-all duration-150"
                    style={{
                      background: active ? 'var(--nexa-text)' : 'var(--nexa-card-alt)',
                      color: active ? '#FFFFFF' : 'var(--nexa-text-sub)',
                    }}
                  >
                    <Icon size={18} strokeWidth={2} />
                    <span className="text-[10px] font-black tracking-wide">WR</span>
                  </Link>
                </li>
              );
            }

            return (
              <li key={href} className="flex flex-1 items-center justify-center">
                <Link
                  href={href}
                  className="flex h-full flex-col items-center justify-center gap-1 transition-colors duration-150"
                  style={{ color: active ? 'var(--nexa-text)' : 'var(--nexa-faint)' }}
                >
                  <Icon size={18} strokeWidth={active ? 2.25 : 1.5} />
                  <span className="text-[10px] font-semibold tracking-wide">{shortLabel}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
