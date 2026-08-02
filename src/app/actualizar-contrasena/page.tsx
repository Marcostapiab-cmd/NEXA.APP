'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function ActualizarContrasenaPage() {
  const router = useRouter();
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError('No se pudo actualizar la contraseña. El link puede haber expirado.');
      return;
    }

    router.push('/login?reset=ok');
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
              Nueva contraseña
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: 'var(--nexa-muted)' }}
            >
              Nueva contraseña
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

          <div>
            <label
              className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: 'var(--nexa-muted)' }}
            >
              Confirmar contraseña
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={6}
              placeholder="Repetí la contraseña"
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
            {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
