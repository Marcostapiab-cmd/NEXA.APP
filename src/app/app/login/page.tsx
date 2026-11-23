'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { cerrarSesion } from '@/lib/cerrar-sesion';
import { rolActual } from '@/lib/rol-cliente';

// Acceso a la app de rutinas. Las cuentas y claves las crea un admin desde la
// ficha del alumno en NEXA: aquí no hay registro.
export default function AppLoginPage() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true); setError('');
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave });
      if (err || !data.user) { setError('Correo o clave incorrectos.'); setCargando(false); return; }
      if ((await rolActual(data.user)) !== 'alumno') {
        await cerrarSesion();
        setError('Esta cuenta no es de alumno. La app de rutinas es solo para alumnos.');
        setCargando(false); return;
      }
      window.location.assign('/app');
    } catch {
      setError('No hay conexión. Revisa tu internet e inténtalo de nuevo.');
      setCargando(false);
    }
  }

  const campo = 'w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-[17px] text-white placeholder-white/40 outline-none focus:border-white';
  return (
    <main className="flex min-h-dvh flex-col justify-center px-5">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white">
            <span className="text-2xl font-black text-[#0E0E0E]">N</span>
          </div>
          <h1 className="text-2xl font-black tracking-[0.2em]">NEXA</h1>
          <p className="mt-1 text-[15px] text-white/70">Tu rutina de entrenamiento</p>
        </div>
        <form onSubmit={entrar} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[14px] font-semibold text-white/80">Correo</span>
            <input type="email" required autoComplete="username" inputMode="email" value={email}
              onChange={e => setEmail(e.target.value)} className={campo} placeholder="tu@correo.com" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[14px] font-semibold text-white/80">Clave</span>
            <input type="password" required autoComplete="current-password" value={clave}
              onChange={e => setClave(e.target.value)} className={campo} placeholder="La que te dio NEXA" />
          </label>
          {error && <p role="alert" className="rounded-2xl bg-red-500/15 px-4 py-3 text-[15px] text-red-300">{error}</p>}
          <button type="submit" disabled={cargando || !email || !clave}
            className="h-14 w-full rounded-2xl bg-white text-[17px] font-bold text-[#0E0E0E] disabled:opacity-40">
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="mt-6 text-center text-[14px] text-white/60">
          ¿No tienes clave o la olvidaste? Pídesela a tu coach en NEXA.
        </p>
        <p className="mt-3 text-center">
          <Link href="/app/instalar" className="text-[15px] font-semibold text-white underline underline-offset-4">
            Cómo instalar la app en tu celular
          </Link>
        </p>
      </div>
    </main>
  );
}
