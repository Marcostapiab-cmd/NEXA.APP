'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';

export default function Home() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!isSupabaseConfigured) {
      setError('Supabase no está configurado en .env.local');
      setLoading(false);
      return;
    }

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError('Correo o contraseña incorrectos');
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center">
            <svg viewBox="0 0 48 48" fill="none" className="h-12 w-12" aria-hidden>
              <rect x="2" y="20" width="8" height="8" rx="2" fill="#fff" />
              <rect x="38" y="20" width="8" height="8" rx="2" fill="#fff" />
              <rect x="8" y="16" width="6" height="16" rx="2" fill="#fff" />
              <rect x="34" y="16" width="6" height="16" rx="2" fill="#fff" />
              <rect x="14" y="22" width="20" height="4" rx="2" fill="#fff" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-[0.2em] text-white">NEXA</h1>
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.15em] text-[#888888]">
            Plataforma para coaches
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tucorreo@email.com"
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-sm text-white placeholder-[#444444] outline-none transition focus:border-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-sm text-white placeholder-[#444444] outline-none transition focus:border-white"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-white py-3 text-sm font-semibold text-black transition hover:bg-[#e0e0e0] disabled:opacity-40"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
