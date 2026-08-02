'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!isSupabaseConfigured) {
      setError('Supabase no está configurado en .env.local');
      setLoading(false);
      return;
    }

    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });

    if (err) {
      setError('Correo o contraseña incorrectos');
      setLoading(false);
      return;
    }

    setLoading(false);
    const rol = data.user?.user_metadata?.rol;
    router.push(rol === 'alumno' ? '/mi-cuenta' : '/dashboard');
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background: 'var(--nexa-surface)',
      }}
    >
      <div
        className="w-full max-w-[400px] rounded-2xl p-12"
        style={{
          background: 'var(--nexa-card)',
          border: '1px solid var(--nexa-border)',
        }}
      >
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: 'var(--nexa-accent)' }}
          >
            <span
              className="text-[18px] font-black tracking-wider"
              style={{ color: '#FFFFFF' }}
            >
              N
            </span>
          </div>
          <div className="text-center">
            <h1
              className="text-[22px] font-black tracking-[0.14em]"
              style={{ color: 'var(--nexa-accent)', letterSpacing: '0.14em' }}
            >
              NEXA
            </h1>
            <p
              className="mt-1 text-[12px] font-medium uppercase tracking-[0.1em]"
              style={{ color: 'var(--nexa-muted)' }}
            >
              Performance Management
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: 'var(--nexa-muted)' }}
            >
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="tucorreo@email.com"
              className="nexa-input"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label
                className="text-[11px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: 'var(--nexa-muted)' }}
              >
                Contraseña
              </label>
              <Link
                href="/recuperar-contrasena"
                className="text-[11px] font-semibold"
                style={{ color: 'var(--nexa-accent)' }}
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="nexa-input"
            />
          </div>

          {error && (
            <div
              className="rounded-lg px-4 py-3 text-[13px]"
              style={{
                background: '#FAEAEA',
                border: '1px solid rgba(180,64,64,0.20)',
                color: '#B44040',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="nexa-btn-primary w-full justify-center mt-2"
          >
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>

        <p
          className="mt-8 text-center text-[13px]"
          style={{ color: 'var(--nexa-muted)' }}
        >
          ¿Sos alumno/a?{' '}
          <Link
            href="/registro"
            className="font-semibold"
            style={{ color: 'var(--nexa-text)' }}
          >
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
