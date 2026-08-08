'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Lock, X, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface Usuario {
  id:     string;
  email:  string;
  nombre: string;
  rol:    string;
}

const ROL_LABEL: Record<string, string> = {
  admin:         'Admin',
  profesor:      'Profesor',
  recepcionista: 'Host',
};

const ROL_COLOR: Record<string, string> = {
  admin:         'rgba(99,102,241,0.18)',
  profesor:      'rgba(34,197,94,0.15)',
  recepcionista: 'rgba(234,179,8,0.15)',
};

const ROL_TEXT: Record<string, string> = {
  admin:         '#818CF8',
  profesor:      '#4ADE80',
  recepcionista: '#FCD34D',
};

const INITIAL_FORM = {
  nombre: '', email: '', password: '', rol: 'profesor' as 'profesor' | 'recepcionista',
  especialidad: '', tarifa_1a1: '', tarifa_2a1: '',
};

export default function UsuariosPage() {
  const [role,     setRole]    = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState(INITIAL_FORM);
  const [showPwd,   setShowPwd]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState('');
  const [formOk,    setFormOk]    = useState('');

  const esProfesor = form.rol === 'profesor';

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/usuarios');
      const json = await res.json() as { usuarios?: Usuario[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar usuarios');
      setUsuarios(json.usuarios ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.rpc('get_my_role').then(({ data }: { data: unknown }) => setRole(data as string | null));
    fetchUsuarios();
  }, [fetchUsuarios]);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormErr('');
    setFormOk('');
    try {
      const body = {
        nombre:     form.nombre.trim(),
        email:      form.email.trim(),
        password:   form.password,
        rol:        form.rol,
        ...(form.rol === 'profesor' && {
          especialidad: form.especialidad.trim() || undefined,
          tarifa_1a1:   form.tarifa_1a1 ? parseInt(form.tarifa_1a1) : undefined,
          tarifa_2a1:   form.tarifa_2a1 ? parseInt(form.tarifa_2a1) : undefined,
        }),
      };
      const res  = await fetch('/api/admin/crear-profesor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { coach?: unknown; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Error al crear');
      setFormOk(`Profesor "${form.nombre}" creado correctamente.`);
      setForm(INITIAL_FORM);
      await fetchUsuarios();
      setTimeout(() => { setShowModal(false); setFormOk(''); }, 1800);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  }

  if (role !== null && role !== 'admin') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3"
        style={{ background: 'var(--nexa-black)' }}>
        <Lock size={28} style={{ color: 'var(--nexa-muted)' }} />
        <p className="text-[13px]" style={{ color: 'var(--nexa-muted)' }}>
          Solo el administrador puede ver esta pantalla.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--nexa-black)' }}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-lg font-black tracking-[0.12em]" style={{ color: 'var(--nexa-text)' }}>
              USUARIOS
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              Staff · Accesos · Roles
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchUsuarios} disabled={loading}
              className="rounded-xl p-2.5 transition"
              style={{
                background: 'var(--nexa-card-alt)',
                border: '1px solid var(--nexa-border)',
                color: 'var(--nexa-muted)',
                opacity: loading ? 0.5 : 1,
              }}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => { setShowModal(true); setFormErr(''); setFormOk(''); setForm(INITIAL_FORM); }}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-bold transition"
              style={{ background: 'var(--nexa-accent)', color: '#FFFFFF' }}>
              <Plus size={13} />
              Nuevo usuario
            </button>
          </div>
        </div>

        {/* Error global */}
        {error && (
          <div className="mb-4 rounded-lg px-4 py-3 text-[12px]"
            style={{ background: 'rgba(180,64,64,0.12)', border: '1px solid #B44040', color: '#B44040' }}>
            {error}
          </div>
        )}

        {/* Tabla */}
        <div className="rounded-xl overflow-hidden"
          style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>

          {/* Header tabla */}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-4 px-5 py-3"
            style={{ borderBottom: '1px solid var(--nexa-border)' }}>
            {['Nombre', 'Email', 'Rol'].map(h => (
              <p key={h} className="text-[10px] font-black uppercase tracking-[0.12em]"
                style={{ color: 'var(--nexa-muted)' }}>{h}</p>
            ))}
          </div>

          {loading ? (
            <div className="px-5 py-8 text-center">
              <p className="text-[12px]" style={{ color: 'var(--nexa-faint)' }}>Cargando...</p>
            </div>
          ) : usuarios.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-[12px]" style={{ color: 'var(--nexa-faint)' }}>
                No hay usuarios de staff registrados.
              </p>
            </div>
          ) : (
            <ul>
              {usuarios.map((u, i) => (
                <li key={u.id}
                  className="grid grid-cols-[1fr_1fr_auto] gap-4 items-center px-5 py-3.5"
                  style={{ borderTop: i > 0 ? '1px solid var(--nexa-border)' : undefined }}>
                  <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--nexa-text)' }}>
                    {u.nombre || '—'}
                  </span>
                  <span className="text-[12px] truncate" style={{ color: 'var(--nexa-muted)' }}>
                    {u.email}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md whitespace-nowrap"
                    style={{
                      background: ROL_COLOR[u.rol] ?? 'rgba(255,255,255,0.06)',
                      color:      ROL_TEXT[u.rol]  ?? 'var(--nexa-muted)',
                    }}>
                    {ROL_LABEL[u.rol] ?? u.rol}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>

      {/* ── Modal Nuevo profesor ─────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>

          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>

            {/* Header modal */}
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--nexa-border)' }}>
              <h2 className="text-[13px] font-black tracking-[0.1em]" style={{ color: 'var(--nexa-text)' }}>
                NUEVO USUARIO
              </h2>
              <button onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 transition"
                style={{ color: 'var(--nexa-muted)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--nexa-text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--nexa-muted)')}>
                <X size={15} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCrear} className="px-5 py-5 space-y-4">

              <Field label="Tipo de usuario *">
                <div className="grid grid-cols-2 gap-2">
                  {([['profesor', 'Profesor'], ['recepcionista', 'Host']] as const).map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setForm(f => ({ ...f, rol: val }))}
                      className="rounded-xl px-3 py-2.5 text-[12px] font-bold transition"
                      style={{
                        background: form.rol === val ? 'var(--nexa-accent)' : 'var(--nexa-card-alt)',
                        border:     `1px solid ${form.rol === val ? 'var(--nexa-accent)' : 'var(--nexa-border)'}`,
                        color:      form.rol === val ? '#FFFFFF' : 'var(--nexa-muted)',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Nombre completo *">
                <input type="text" required placeholder="Ej: Juan Pérez"
                  value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="input-nexa" />
              </Field>

              <Field label="Email *">
                <input type="email" required placeholder="profesor@estudio.cl"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="input-nexa" />
              </Field>

              <Field label="Contraseña temporal *">
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} required minLength={8}
                    placeholder="Mínimo 8 caracteres"
                    value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="input-nexa pr-10" />
                  <button type="button" onClick={() => setShowPwd(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--nexa-muted)' }}>
                    {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </Field>

              {esProfesor && (
                <>
                  <Field label="Especialidad">
                    <input type="text" placeholder="Ej: Funcional, HYROX, Fuerza"
                      value={form.especialidad} onChange={e => setForm(f => ({ ...f, especialidad: e.target.value }))}
                      className="input-nexa" />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Tarifa 1:1 ($/sesión)">
                      <input type="number" min={0} placeholder="0"
                        value={form.tarifa_1a1} onChange={e => setForm(f => ({ ...f, tarifa_1a1: e.target.value }))}
                        className="input-nexa" />
                    </Field>
                    <Field label="Tarifa 2:1 ($/sesión)">
                      <input type="number" min={0} placeholder="0"
                        value={form.tarifa_2a1} onChange={e => setForm(f => ({ ...f, tarifa_2a1: e.target.value }))}
                        className="input-nexa" />
                    </Field>
                  </div>
                </>
              )}

              <p className="text-[10px]" style={{ color: 'var(--nexa-faint)' }}>
                El usuario recibirá acceso inmediato con esta contraseña. Rol:{' '}
                <strong style={{ color: 'var(--nexa-muted)' }}>
                  {form.rol === 'profesor' ? 'Profesor' : 'Host'}
                </strong>.
              </p>

              {formErr && (
                <div className="rounded-lg px-3 py-2.5 text-[12px]"
                  style={{ background: 'rgba(180,64,64,0.12)', border: '1px solid #B44040', color: '#B44040' }}>
                  {formErr}
                </div>
              )}
              {formOk && (
                <div className="rounded-lg px-3 py-2.5 text-[12px]"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #4ADE80', color: '#4ADE80' }}>
                  {formOk}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 rounded-xl px-4 py-2.5 text-[12px] font-bold transition"
                  style={{
                    background: 'var(--nexa-card-alt)',
                    border: '1px solid var(--nexa-border)',
                    color: 'var(--nexa-muted)',
                  }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl px-4 py-2.5 text-[12px] font-bold transition"
                  style={{
                    background: saving ? 'var(--nexa-card-alt)' : 'var(--nexa-accent)',
                    color: '#FFFFFF',
                    opacity: saving ? 0.6 : 1,
                  }}>
                  {saving ? 'Creando...' : 'Crear usuario'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      <style>{`
        .input-nexa {
          width: 100%;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          background: var(--nexa-card-alt);
          border: 1px solid var(--nexa-border);
          color: var(--nexa-text);
          outline: none;
          transition: border-color 0.15s;
        }
        .input-nexa:focus {
          border-color: var(--nexa-accent);
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
        style={{ color: 'var(--nexa-muted)' }}>{label}</label>
      {children}
    </div>
  );
}
