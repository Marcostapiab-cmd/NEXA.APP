'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function RecuperarContrasenaPage() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/actualizar-contrasena`,
      });

      setLoading(false);

      if (err) {
        setError('No se pudo enviar el correo. Intentá de nuevo.');
        return;
      }

      setSent(true);
    } catch {
      setError('Error de conexión. Verifica tu internet e intenta de nuevo.');
      setLoading(false);
    }
  }

  if (sent) {
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
            Correo enviado
          </h2>
          <p className="mb-6 text-[13px]" style={{ color: 'var(--nexa-text-sub)' }}>
            Revisá tu bandeja de entrada y hacé clic en el link para crear una nueva contraseña.
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
        <div className="mb-10 flex flex-col items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: 'var(--nexa-accent)' }}
          >
            <span className="text-[18px] font-black tracking-wider" style={{ color: '#FFFFFF' }}>N</span>
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-black tracking-[0.14em]" style={{ color: 'var(--nexa-accent)' }}>
              NEXA
            </h1>
            <p className="mt-1 text-[12px] font-medium uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              Recuperar contraseña
            </p>
          </div>
        </div>

        <p className="mb-6 text-center text-[13px]" style={{ color: 'var(--nexa-text-sub)' }}>
          Ingresá tu correo y te enviamos un link para crear una nueva contraseña.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            {loading ? 'Enviando...' : 'Enviar link de recuperación'}
          </button>
        </form>

        <p className="mt-8 text-center text-[13px]" style={{ color: 'var(--nexa-muted)' }}>
          <Link href="/login" className="font-semibold" style={{ color: 'var(--nexa-text)' }}>
            Volver al login
          </Link>
        </p>
      </div>
    </div>
  );
}
