'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';

export default function RegistroPage() {
  const router = useRouter();
  const [nombre,   setNombre]   = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!isSupabaseConfigured) {
      setError('Supabase no está configurado en .env.local');
      setLoading(false);
      return;
    }

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nombre: nombre.trim(), apellido: '', rol: 'alumno' },
      },
    });

    setLoading(false);

    if (err) {
      const msg = err.message ?? '';
      if (
        msg.includes('already registered') ||
        msg.includes('already been registered') ||
        msg === '{}' ||
        msg.trim() === ''
      ) {
        setError('Ya existe una cuenta con ese correo. Ingresá desde el login.');
      } else if (msg.includes('Password') || msg.includes('password')) {
        setError('La contraseña debe tener al menos 6 caracteres.');
      } else if (msg.includes('invalid') || msg.includes('email')) {
        setError('El correo electrónico no es válido.');
      } else {
        setError(msg);
      }
      return;
    }

    if (data.session) {
      // Email confirmation desactivado → sesión inmediata
      router.push('/mi-cuenta');
    } else {
      // Email confirmation activado → mostrar aviso
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-4"
        style={{ background: 'var(--nexa-surface)' }}
      >
        <div
          className="w-full max-w-[400px] rounded-2xl p-12 text-center"
          style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}
        >
          <div
            className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: 'var(--nexa-success-bg)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--nexa-success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="mb-2 text-[18px] font-bold" style={{ color: 'var(--nexa-text)' }}>
            ¡Cuenta creada!
          </h2>
          <p className="mb-6 text-[13px]" style={{ color: 'var(--nexa-text-sub)' }}>
            Revisá tu correo y hacé clic en el link de confirmación para activar tu cuenta.
          </p>
          <Link
            href="/login"
            className="text-[13px] font-semibold"
            style={{ color: 'var(--nexa-accent)' }}
          >
            Volver al login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: 'var(--nexa-surface)' }}
    >
      <div
        className="w-full max-w-[400px] rounded-2xl p-12"
        style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}
      >
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: 'var(--nexa-accent)' }}
          >
            <span className="text-[18px] font-black tracking-wider" style={{ color: '#FFFFFF' }}>
              N
            </span>
          </div>
          <div className="text-center">
            <h1
              className="text-[22px] font-black tracking-[0.14em]"
              style={{ color: 'var(--nexa-accent)' }}
            >
              NEXA
            </h1>
            <p
              className="mt-1 text-[12px] font-medium uppercase tracking-[0.1em]"
              style={{ color: 'var(--nexa-muted)' }}
            >
              Crear cuenta
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: 'var(--nexa-muted)' }}
            >
              Nombre
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              required
              placeholder="Tu nombre"
              className="nexa-input"
            />
          </div>

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
            <label
              className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: 'var(--nexa-muted)' }}
            >
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              className="nexa-input"
            />
          </div>

          {error && (
            <div
              className="rounded-lg px-4 py-3 text-[13px]"
              style={{
                background: 'var(--nexa-danger-bg)',
                border: '1px solid rgba(180,64,64,0.20)',
                color: 'var(--nexa-danger)',
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
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <p
          className="mt-8 text-center text-[13px]"
          style={{ color: 'var(--nexa-muted)' }}
        >
          ¿Ya tenés cuenta?{' '}
          <Link
            href="/login"
            className="font-semibold"
            style={{ color: 'var(--nexa-text)' }}
          >
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
