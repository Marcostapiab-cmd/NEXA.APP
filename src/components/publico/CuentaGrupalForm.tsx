'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { EMAIL_RE, formatearRut, validarRut } from '@/lib/catalogo';

type Modo = 'login' | 'registro';

/**
 * Iniciar sesión o crear cuenta de alumno de clases grupales.
 * Se usa dentro del modal de compra (mantiene el plan elegido) y en las
 * páginas /grupales-alumno/login y /registro.
 */
export default function CuentaGrupalForm({ modoInicial = 'login', onListo, compacto = false }: {
  modoInicial?: Modo;
  onListo:      () => void;
  compacto?:    boolean;
}) {
  const [modo, setModo]       = useState<Modo>(modoInicial);
  const [enviando, setEnv]    = useState(false);
  const [error, setError]     = useState('');
  const [f, setF] = useState({ nombre: '', apellido: '', email: '', telefono: '', rut: '', password: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: e.target.value }));

  async function iniciarSesion(email: string, password: string): Promise<boolean> {
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err || !data.user) { setError('Email o contraseña incorrectos.'); return false; }
    if (data.user.user_metadata?.rol !== 'grupales') {
      await supabase.auth.signOut();
      setError('Esta cuenta es del equipo o del portal de alumnos personalizados. Usa otra cuenta o crea una nueva para clases.');
      return false;
    }
    return true;
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setError('');
    const email = f.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setError('Ingresa un email válido.'); return; }

    if (modo === 'registro') {
      if (!f.nombre.trim() || !f.apellido.trim()) { setError('Ingresa tu nombre y apellido.'); return; }
      if (f.password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
      if (f.rut.trim() && !validarRut(f.rut)) { setError('El RUT no es válido.'); return; }
    } else if (!f.password) { setError('Ingresa tu contraseña.'); return; }

    setEnv(true);
    try {
      if (modo === 'registro') {
        const res = await fetch('/api/grupales-alumno/registro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: f.nombre.trim(), apellido: f.apellido.trim(), email,
            telefono: f.telefono.trim() || null, rut: f.rut.trim() || null, password: f.password,
          }),
        });
        const json = await res.json().catch(() => ({})) as { error?: string };
        if (!res.ok) {
          setError(json.error ?? 'No pudimos crear la cuenta.');
          if (res.status === 409) setModo('login');
          return;
        }
      }
      if (await iniciarSesion(email, f.password)) onListo();
    } catch {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
    } finally {
      setEnv(false);
    }
  }

  return (
    <div>
      <div role="tablist" aria-label="Tipo de acceso" className="mb-5 grid grid-cols-2 gap-1 rounded-full p-1"
        style={{ border: '1px solid var(--nx-line)' }}>
        {(['login', 'registro'] as Modo[]).map(m => (
          <button key={m} type="button" role="tab" aria-selected={modo === m}
            onClick={() => { setModo(m); setError(''); }}
            className="nx-chip border-0" style={{ minHeight: 40 }}>
            {m === 'login' ? 'Ya tengo cuenta' : 'Crear cuenta'}
          </button>
        ))}
      </div>

      <form onSubmit={enviar} noValidate className="space-y-4">
        {modo === 'registro' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cg-nombre" className="nx-label">Nombre</label>
              <input id="cg-nombre" className="nexa-input" autoComplete="given-name" value={f.nombre} onChange={set('nombre')} required />
            </div>
            <div>
              <label htmlFor="cg-apellido" className="nx-label">Apellido</label>
              <input id="cg-apellido" className="nexa-input" autoComplete="family-name" value={f.apellido} onChange={set('apellido')} required />
            </div>
          </div>
        )}
        <div>
          <label htmlFor="cg-email" className="nx-label">Email</label>
          <input id="cg-email" type="email" inputMode="email" className="nexa-input" autoComplete="email"
            value={f.email} onChange={set('email')} required data-autofocus />
        </div>
        {modo === 'registro' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cg-tel" className="nx-label">Teléfono <span style={{ color: 'var(--nx-muted)' }}>(opcional)</span></label>
              <input id="cg-tel" type="tel" inputMode="tel" className="nexa-input" autoComplete="tel" placeholder="+56 9 ..."
                value={f.telefono} onChange={set('telefono')} />
            </div>
            <div>
              <label htmlFor="cg-rut" className="nx-label">RUT <span style={{ color: 'var(--nx-muted)' }}>(opcional)</span></label>
              <input id="cg-rut" className="nexa-input" placeholder="12.345.678-9" value={f.rut}
                onChange={e => setF(p => ({ ...p, rut: e.target.value }))}
                onBlur={() => f.rut.trim() && setF(p => ({ ...p, rut: formatearRut(p.rut) }))} />
            </div>
          </div>
        )}
        <div>
          <label htmlFor="cg-pass" className="nx-label">Contraseña</label>
          <input id="cg-pass" type="password" className="nexa-input"
            autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
            value={f.password} onChange={set('password')} required minLength={modo === 'registro' ? 8 : undefined} />
          {modo === 'registro' && <p className="mt-1.5 text-[12px]" style={{ color: 'var(--nx-muted)' }}>Mínimo 8 caracteres.</p>}
        </div>

        {error && <p role="alert" className="nx-alert nx-alert-error">{error}</p>}

        <button type="submit" disabled={enviando} className={`nx-btn nx-btn-primary nx-btn-block ${compacto ? '' : 'mt-2'}`}>
          {enviando && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {enviando ? 'Un momento…' : modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta y continuar'}
        </button>
        {modo === 'login' && (
          <p className="text-center text-[12px]" style={{ color: 'var(--nx-muted)' }}>
            ¿Olvidaste tu contraseña? <a href="/recuperar-contrasena" className="underline underline-offset-2 hover:text-white">Recupérala aquí</a>
          </p>
        )}
      </form>
    </div>
  );
}
