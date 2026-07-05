'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Users, Dumbbell } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  Icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: '/dashboard',  label: 'Inicio',     shortLabel: 'Inicio', Icon: Home },
  { href: '/rutinas',    label: 'Calendario', shortLabel: 'Cal',    Icon: Calendar },
  { href: '/alumnos',    label: 'Alumnos',    shortLabel: 'Alumn',  Icon: Users },
  { href: '/weightroom', label: 'Weightroom', shortLabel: 'Gym',    Icon: Dumbbell },
];

const AUTH_ROUTES = ['/', '/login'];

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href;
  return pathname.startsWith(href);
}

export default function Sidebar() {
  const pathname = usePathname();

  if (AUTH_ROUTES.includes(pathname)) return null;

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside
        className="fixed left-0 top-0 z-30 hidden h-screen w-[220px] flex-col lg:flex"
        style={{
          background: 'var(--nexa-dark)',
          borderRight: '1px solid var(--nexa-border)',
        }}
      >
        {/* Logo */}
        <div
          className="flex h-[60px] shrink-0 items-center gap-3 px-5"
          style={{ borderBottom: '1px solid var(--nexa-border)' }}
        >
          {/* Mark */}
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px]"
            style={{ background: 'var(--nexa-accent)' }}
          >
            <span
              className="select-none text-[11px] font-black tracking-wider"
              style={{ color: '#000000' }}
            >
              N
            </span>
          </div>
          {/* Wordmark */}
          <span
            className="select-none text-[14px] font-black tracking-[0.14em]"
            style={{ color: 'var(--nexa-accent)', letterSpacing: '0.12em' }}
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
                    className="relative flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[13px] font-medium transition-all duration-200"
                    style={active ? {
                      background: 'rgba(212, 175, 55, 0.1)',
                      color: 'var(--nexa-accent)',
                      borderLeft: '3px solid var(--nexa-accent)',
                      paddingLeft: 'calc(12px - 3px)',
                    } : {
                      color: 'var(--nexa-muted)',
                    }}
                    onMouseEnter={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.color = '#ffffff';
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

        {/* Footer */}
        <div
          className="shrink-0 px-5 py-4"
          style={{ borderTop: '1px solid var(--nexa-border)' }}
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--nexa-ghost)' }}
          >
            Performance
          </p>
        </div>
      </aside>

      {/* ── Mobile bottom navigation ──────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 lg:hidden"
        style={{
          background: 'var(--nexa-dark)',
          borderTop: '1px solid var(--nexa-border)',
        }}
      >
        <ul className="flex h-16 items-center">
          {NAV.map(({ href, shortLabel, Icon }) => {
            const active = isActive(pathname, href);
            const isGym  = href === '/weightroom';

            if (isGym) {
              return (
                <li key={href} className="flex flex-1 items-center justify-center">
                  <Link
                    href={href}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-2xl px-5 py-2 transition-all duration-200"
                    style={{
                      background: active ? 'var(--nexa-accent)' : 'rgba(212,175,55,0.12)',
                      color: active ? '#000' : 'var(--nexa-accent)',
                      border: active ? 'none' : '1px solid rgba(212,175,55,0.25)',
                    }}
                  >
                    <Icon size={20} strokeWidth={2.25} />
                    <span className="text-[10px] font-black tracking-wide">Gym</span>
                  </Link>
                </li>
              );
            }

            return (
              <li key={href} className="flex flex-1 items-center justify-center">
                <Link
                  href={href}
                  className="flex h-full flex-col items-center justify-center gap-1 transition-colors duration-200"
                  style={{ color: active ? 'var(--nexa-accent)' : 'var(--nexa-faint)' }}
                >
                  <Icon size={20} strokeWidth={active ? 2.25 : 1.5} />
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
