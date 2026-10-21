'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import NexaLogo from './NexaLogo';

const LINKS = [
  { href: '/planes#planes',        label: 'Planes' },
  { href: '/planes#como-funciona', label: 'Cómo funciona' },
  { href: '/planes#faq',           label: 'Preguntas' },
];

/** Encabezado de las páginas públicas. Sobre la foto es transparente y se vuelve sólido al hacer scroll. */
export default function SiteHeader({ transparente = false }: { transparente?: boolean }) {
  const [abierto,   setAbierto]   = useState(false);
  const [scrolled,  setScrolled]  = useState(!transparente);
  const [conCuenta, setConCuenta] = useState(false);

  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => setConCuenta(data.user?.user_metadata?.rol === 'grupales'))
      .catch(() => setConCuenta(false));
  }, []);

  useEffect(() => {
    if (!transparente) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [transparente]);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [abierto]);

  const cuentaHref  = conCuenta ? '/grupales-alumno/dashboard' : '/grupales-alumno/login';
  const cuentaLabel = conCuenta ? 'Mi cuenta' : 'Iniciar sesión';
  const solido = scrolled || abierto;

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 transition-colors duration-200"
      style={{
        background: solido ? 'rgba(10,10,10,0.88)' : 'transparent',
        backdropFilter: solido ? 'saturate(140%) blur(14px)' : undefined,
        WebkitBackdropFilter: solido ? 'saturate(140%) blur(14px)' : undefined,
        borderBottom: `1px solid ${solido ? 'var(--nx-line)' : 'transparent'}`,
      }}>
      <div className="nx-container flex h-16 items-center justify-between gap-4 md:h-[72px]">
        <Link href="/" aria-label="NEXA Performance, inicio" className="rounded-md">
          <NexaLogo />
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 lg:flex">
          {LINKS.map(l => (
            <Link key={l.href} href={l.href}
              className="rounded-full px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] transition-colors hover:text-white"
              style={{ color: 'var(--nx-sub)' }}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link href={cuentaHref} className="nx-btn nx-btn-ghost text-[12px]">{cuentaLabel}</Link>
          <Link href="/planes#planes" className="nx-btn nx-btn-primary" style={{ minHeight: 42 }}>Reservar</Link>
        </div>

        <button type="button" onClick={() => setAbierto(v => !v)}
          aria-expanded={abierto} aria-controls="nx-menu-movil"
          aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
          className="flex h-11 w-11 items-center justify-center rounded-full lg:hidden"
          style={{ color: 'var(--nx-white)' }}>
          {abierto ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {abierto && (
        <div id="nx-menu-movil" className="nx-anim-fade overflow-y-auto border-t lg:hidden"
          style={{ background: 'var(--nx-black)', borderColor: 'var(--nx-line)', height: 'calc(100dvh - 64px)' }}>
          <nav aria-label="Menú móvil" className="nx-container flex flex-col py-4">
            {LINKS.map(l => (
              <Link key={l.href} href={l.href} onClick={() => setAbierto(false)}
                className="nx-display flex min-h-14 items-center border-b text-[22px]"
                style={{ borderColor: 'var(--nx-line)', color: 'var(--nx-white)' }}>
                {l.label}
              </Link>
            ))}
            <div className="mt-6 grid gap-3">
              <Link href="/planes#planes" onClick={() => setAbierto(false)} className="nx-btn nx-btn-primary nx-btn-block">
                Reservar
              </Link>
              <Link href={cuentaHref} onClick={() => setAbierto(false)} className="nx-btn nx-btn-outline nx-btn-block">
                {cuentaLabel}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
