'use client';

import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

// Formatea RUT mientras el usuario escribe: 12.345.678-9
function formatearRUT(raw: string): string {
  const limpio = raw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length === 0) return '';
  const dv     = limpio.slice(-1);
  const cuerpo = limpio.slice(0, -1);
  const formateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formateado}-${dv}`;
}

// Valida dígito verificador módulo 11
function validarRUT(raw: string): boolean {
  const limpio = raw.replace(/[^0-9kK]/g, '').toLowerCase();
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv     = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * mult;
    mult = mult < 7 ? mult + 1 : 2;
  }
  const resto = 11 - (suma % 11);
  const dvEsp = resto === 11 ? '0' : resto === 10 ? 'k' : String(resto);
  return dv === dvEsp;
}

export default function RegistroPage() {
  const router = useRouter();
  const [nombre,   setNombre]   = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [rut,      setRut]      = useState('');
  const [rutError, setRutError] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  function handleRutChange(e: ChangeEvent<HTMLInputElement>) {
    const valor = formatearRUT(e.target.value);
    setRut(valor);
    setRutError('');
  }

  function handleRutBlur() {
    if (rut && !validarRUT(rut)) {
      setRutError('Ingresa un RUT válido (ej: 12.345.678-9)');
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    // Validar RUT antes de enviar
    if (!validarRUT(rut)) {
      setRutError('Ingresa un RUT válido (ej: 12.345.678-9)');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), email: email.trim(), password, rut }),
      });

      const json = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Error al crear la cuenta.');
        setLoading(false);
        return;
      }

      // Login automático después del registro
      const { data: loginData } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

      setLoading(false);

      if (loginData?.session) {
        router.push('/portal');
      } else {
        // Si email confirmation está activado, mostrar aviso
        setSuccess(true);
      }
    } catch {
      setError('No se pudo conectar para crear la cuenta. Revisa tu conexión e intenta de nuevo.');
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--nexa-surface)' }}>
        <div className="w-full max-w-[400px] rounded-2xl p-12 text-center"
          style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: 'var(--nexa-success-bg)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--nexa-success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="mb-2 text-[18px] font-bold" style={{ color: 'var(--nexa-text)' }}>¡Cuenta creada!</h2>
          <p className="mb-6 text-[13px]" style={{ color: 'var(--nexa-text-sub)' }}>
            Revisá tu correo y hacé clic en el link de confirmación para activar tu cuenta.
          </p>
          <Link href="/login" className="text-[13px] font-semibold" style={{ color: 'var(--nexa-accent)' }}>
            Volver al login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: 'var(--nexa-surface)' }}>
      <div className="w-full max-w-[400px] rounded-2xl p-12"
        style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>

        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'var(--nexa-accent)' }}>
            <span className="text-[18px] font-black tracking-wider" style={{ color: '#FFFFFF' }}>N</span>
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-black tracking-[0.14em]" style={{ color: 'var(--nexa-accent)' }}>NEXA</h1>
            <p className="mt-1 text-[12px] font-medium uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              Crear cuenta
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              Nombre
            </label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              required placeholder="Tu nombre" className="nexa-input" />
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              RUT *
            </label>
            <input
              type="text"
              value={rut}
              onChange={handleRutChange}
              onBlur={handleRutBlur}
              required
              placeholder="12.345.678-9"
              inputMode="numeric"
              maxLength={12}
              className={`nexa-input${rutError ? ' border-red-500' : ''}`}
            />
            {rutError && (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--nexa-danger)' }}>{rutError}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              Correo electrónico
            </label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="tucorreo@email.com" className="nexa-input" />
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              Contraseña
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              required minLength={6} placeholder="Mínimo 6 caracteres" className="nexa-input" />
          </div>

          {error && (
            <div className="rounded-lg px-4 py-3 text-[13px]"
              style={{ background: 'var(--nexa-danger-bg)', border: '1px solid rgba(180,64,64,0.20)', color: 'var(--nexa-danger)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="nexa-btn-primary w-full justify-center mt-2">
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <p className="mt-8 text-center text-[13px]" style={{ color: 'var(--nexa-muted)' }}>
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="font-semibold" style={{ color: 'var(--nexa-text)' }}>
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
