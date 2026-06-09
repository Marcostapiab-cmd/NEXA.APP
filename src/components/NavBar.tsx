'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/dashboard',  label: 'Inicio' },
  { href: '/rutinas',    label: 'Rutinas' },
  { href: '/alumnos',    label: 'Alumnos' },
  { href: '/biblioteca', label: 'Biblioteca' },
  { href: '/weightroom', label: 'Weightroom' },
  { href: '/calendario', label: 'Calendario' },
];

const LOGIN_ROUTES = ['/', '/login'];

export default function NavBar() {
  const pathname = usePathname();
  if (LOGIN_ROUTES.includes(pathname)) return null;

  return (
    <header className="sticky top-0 z-20 border-b border-[#2a2a2a] bg-[#0a0a0a]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
        <Link href="/dashboard" className="text-base font-bold tracking-[0.15em] text-white uppercase">
          NEXA
        </Link>
        <nav className="flex items-center gap-0 overflow-x-auto">
          {navLinks.map((link) => {
            const active = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
            return (
              <Link key={link.href} href={link.href}
                className={`relative whitespace-nowrap px-3 py-2 text-sm font-medium tracking-wide transition-colors ${
                  active ? 'text-white' : 'text-[#888888] hover:text-white'
                }`}>
                {link.label}
                {active && <span className="absolute bottom-0 left-3 right-3 h-px bg-white" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
