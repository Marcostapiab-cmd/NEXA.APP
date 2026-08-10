'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function validarRut(rut: string): boolean {
  const clean = rut.replace(/[.\-\s]/g, '').toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
  const cuerpo = clean.slice(0, -1);
  const dv     = clean.slice(-1);
  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * mult;
    mult  = mult === 7 ? 2 : mult + 1;
  }
  const dvEsperado = 11 - (suma % 11);
  const dvStr = dvEsperado === 11 ? '0' : dvEsperado === 10 ? 'K' : String(dvEsperado);
  return dv === dvStr;
}

function RegistroContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl  = searchParams.get('redirect');

  const [form, setForm] = useState({
    nombre: '', apellido: '', email: '', telefono: '', rut: '', password: '', confirm: '',
  });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.nombre.trim() || !form.apellido.trim()) return setError('Nombre y apellido son obligatorios.');
    if (!form.email.trim()) return setError('Email es obligatorio.');
    if (!form.rut.trim()) return setError('El RUT es obligatorio.');
    if (!validarRut(form.rut)) return setError('RUT inválido. Verifica el dígito verificador (el número después del guión). Ej: 12.345.678-5');
    if (form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (form.password !== form.confirm) return setError('Las contraseñas no coinciden.');

    setLoading(true);
    try {
      const res = await fetch('/api/grupales-alumno/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:   form.nombre.trim(),
          apellido: form.apellido.trim(),
          email:    form.email.trim().toLowerCase(),
          telefono: form.telefono.trim() || null,
          rut:      form.rut.trim()      || null,
          password: form.password,
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Error al crear la cuenta.');
        setLoading(false);
        return;
      }

      // Login automático después del registro
      const { supabase } = await import('@/lib/supabaseClient');
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email:    form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (loginErr) {
        setError('Cuenta creada. Por favor inicia sesión.');
        const loginHref = redirectUrl
          ? `/grupales-alumno/login?redirect=${encodeURIComponent(redirectUrl)}`
          : '/grupales-alumno/login';
        router.push(loginHref);
        return;
      }
      router.push(redirectUrl ?? '/grupales-alumno/dashboard');
    } catch {
      setError('Error de conexión. Verifica tu internet e intenta de nuevo.');
      setLoading(false);
    }
  }

  const loginHref = redirectUrl
    ? `/grupales-alumno/login?redirect=${encodeURIComponent(redirectUrl)}`
    : '/grupales-alumno/login';

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
          <p className="mt-1 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>Crea tu cuenta de clases grupales</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Nombre*</label>
              <input type="text" required value={form.nombre} onChange={set('nombre')} placeholder="Juan" className="nexa-input w-full" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Apellido*</label>
              <input type="text" required value={form.apellido} onChange={set('apellido')} placeholder="Pérez" className="nexa-input w-full" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Email*</label>
            <input type="email" required value={form.email} onChange={set('email')} placeholder="tu@email.com" className="nexa-input w-full" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Teléfono</label>
              <input type="tel" value={form.telefono} onChange={set('telefono')} placeholder="+56 9 ..." className="nexa-input w-full" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>RUT*</label>
              <input type="text" value={form.rut} onChange={set('rut')} placeholder="Ej: 12.345.678-5" className="nexa-input w-full" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Contraseña*</label>
            <input type="password" required value={form.password} onChange={set('password')} placeholder="Mínimo 6 caracteres" className="nexa-input w-full" />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>Confirmar contraseña*</label>
            <input type="password" required value={form.confirm} onChange={set('confirm')} placeholder="Repite la contraseña" className="nexa-input w-full" />
          </div>

          {error && (
            <p className="rounded-lg px-3 py-2 text-[12px]"
              style={{ background: 'var(--nexa-danger-bg)', color: 'var(--nexa-danger)' }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="nexa-btn-primary w-full py-3 text-[14px]">
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="mt-6 text-center text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href={loginHref} className="font-semibold" style={{ color: 'var(--nexa-text)' }}>
            Ingresar
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function GrupalesRegistroPage() {
  return <Suspense><RegistroContent /></Suspense>;
}
