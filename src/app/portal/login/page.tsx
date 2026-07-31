'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function PortalLoginPage() {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/portal` },
    });
    if (err) { setError(err.message); setLoading(false); return; }
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#121212]">
            <span className="text-lg font-black tracking-widest text-white">N</span>
          </div>
          <h1 className="text-xl font-black tracking-widest text-[#121212]">NEXA</h1>
          <p className="mt-1 text-sm text-[#5E5E5E]">Portal del alumno</p>
        </div>

        <div className="rounded-2xl border border-[#D8D8D8] bg-white p-6 shadow-sm">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <span className="text-2xl">📧</span>
              </div>
              <h2 className="font-bold text-[#121212]">Revisa tu email</h2>
              <p className="mt-2 text-sm text-[#5E5E5E]">
                Te enviamos un link de acceso a <strong>{email}</strong>.<br />
                Haz clic en el link para entrar a tu portal.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-4 text-xs text-[#9B9B9B] underline"
              >
                Usar otro email
              </button>
            </div>
          ) : (
            <>
              <h2 className="mb-1 font-bold text-[#121212]">Ingresar</h2>
              <p className="mb-5 text-sm text-[#5E5E5E]">
                Ingresa tu email y te enviamos un link de acceso.
              </p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="tu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[#D8D8D8] bg-[#F8F8F8] px-4 py-3 text-sm text-[#121212] placeholder-[#9B9B9B] outline-none transition focus:border-[#121212]"
                />
                {error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full rounded-xl bg-[#121212] py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
                >
                  {loading ? 'Enviando...' : 'Enviar link de acceso'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
