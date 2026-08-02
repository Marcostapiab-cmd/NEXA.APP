'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function GrupalesLoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err || !data.user) {
      setError('Email o contraseña incorrectos.');
      setLoading(false);
      return;
    }
    if (data.user.user_metadata?.rol !== 'grupales') {
      await supabase.auth.signOut();
      setError('Esta cuenta no está habilitada para el portal de clases grupales.');
      setLoading(false);
      return;
    }
    router.push('/grupales-alumno/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: 'var(--nexa-bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'var(--nexa-text)' }}>
            <span className="text-[13px] font-black tracking-wider" style={{ color: '#fff' }}>N</span>
          </div>
          <h1 className="text-[20px] font-black tracking-[0.12em]" style={{ color: 'var(--nexa-text)' }}>NEXA</h1>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>Portal de clases grupales</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="nexa-input w-full"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="nexa-input w-full"
            />
          </div>

          {error && (
            <p className="rounded-lg px-3 py-2 text-[12px]"
              style={{ background: 'var(--nexa-danger-bg)', color: 'var(--nexa-danger)' }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}
            className="nexa-btn-primary w-full py-3 text-[14px]">
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-6 text-center text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
          ¿No tienes cuenta?{' '}
          <Link href="/grupales-alumno/registro"
            className="font-semibold" style={{ color: 'var(--nexa-text)' }}>
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  );
}
