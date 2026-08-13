'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Lock, X, Eye, EyeOff, RefreshCw, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface Usuario {
  id:     string;
  email:  string;
  nombre: string;
  rol:    string;
}

function generarPasswordSegura(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const random = new Uint32Array(12);
  crypto.getRandomValues(random);
  for (let i = 0; i < 12; i++) out += chars[random[i] % chars.length];
  return out;
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

const INITIAL_EDIT = { nombre: '', email: '', password: '', rol: '' };

export default function UsuariosPage() {
  const [role,     setRole]    = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState('');

  // Modal crear
  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState(INITIAL_FORM);
  const [showPwd,   setShowPwd]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState('');
  const [formOk,    setFormOk]    = useState('');

  // Modal editar
  const [editUser,        setEditUser]        = useState<Usuario | null>(null);
  const [editForm,        setEditForm]        = useState(INITIAL_EDIT);
  const [showEditPwd,     setShowEditPwd]     = useState(false);
  const [editSaving,      setEditSaving]      = useState(false);
  const [editErr,         setEditErr]         = useState('');
  const [editOk,          setEditOk]          = useState('');

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

  function openEdit(u: Usuario) {
    setEditUser(u);
    setEditForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol });
    setEditErr('');
    setEditOk('');
    setShowEditPwd(false);
  }

  function closeEdit() {
    setEditUser(null);
    setEditErr('');
    setEditOk('');
  }

  async function handleEditar(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setEditSaving(true);
    setEditErr('');
    setEditOk('');
    try {
      const body: Record<string, string> = { id: editUser.id };
      if (editForm.nombre.trim() !== editUser.nombre) body.nombre = editForm.nombre.trim();
      if (editForm.email.trim() !== editUser.email)   body.email  = editForm.email.trim();
      if (editForm.password)                          body.password = editForm.password;
      if (editForm.rol !== editUser.rol)              body.rol    = editForm.rol;

      const res  = await fetch('/api/admin/editar-usuario', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);

      setEditOk('Cambios guardados correctamente.');
      await fetchUsuarios();
      setTimeout(() => closeEdit(), 1500);
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setEditSaving(false);
    }
  }

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
      const json = await res.json().catch(() => ({ error: `HTTP ${res.status} — respuesta inválida` })) as { ok?: boolean; error?: string; step?: string };
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setFormOk(`Usuario "${form.nombre}" creado correctamente.`);
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

          <div className="overflow-x-auto">
          {/* Header tabla */}
          <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_1fr_auto_auto] gap-4 px-5 py-3 min-w-[280px]"
            style={{ borderBottom: '1px solid var(--nexa-border)' }}>
            {['Nombre', 'Email', 'Rol', ''].map((h, i) => (
              <p key={i} className={`text-[10px] font-black uppercase tracking-[0.12em] ${i === 1 ? 'hidden sm:block' : ''}`}
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
                  className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_1fr_auto_auto] gap-4 items-center px-5 py-3.5"
                  style={{ borderTop: i > 0 ? '1px solid var(--nexa-border)' : undefined }}>
                  <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--nexa-text)' }}>
                    {u.nombre || '—'}
                  </span>
                  <span className="hidden sm:block text-[12px] truncate" style={{ color: 'var(--nexa-muted)' }}>
                    {u.email}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md whitespace-nowrap"
                    style={{
                      background: ROL_COLOR[u.rol] ?? 'rgba(255,255,255,0.06)',
                      color:      ROL_TEXT[u.rol]  ?? 'var(--nexa-muted)',
                    }}>
                    {ROL_LABEL[u.rol] ?? u.rol}
                  </span>
                  <button
                    onClick={() => openEdit(u)}
                    className="rounded-lg p-1.5 transition"
                    style={{ color: 'var(--nexa-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--nexa-text)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--nexa-muted)')}>
                    <Pencil size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>

      </div>

      {/* ── Modal Editar usuario ─────────────────────────────────────── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}>

          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>

            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--nexa-border)' }}>
              <div>
                <h2 className="text-[13px] font-black tracking-[0.1em]" style={{ color: 'var(--nexa-text)' }}>
                  EDITAR USUARIO
                </h2>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--nexa-muted)' }}>
                  {editUser.nombre || editUser.email}
                </p>
              </div>
              <button onClick={closeEdit}
                className="rounded-lg p-1.5 transition"
                style={{ color: 'var(--nexa-muted)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--nexa-text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--nexa-muted)')}>
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleEditar} className="px-5 py-5 space-y-4">

              <Field label="Nombre completo">
                <input type="text" placeholder={editUser.nombre}
                  value={editForm.nombre}
                  onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                  className="input-nexa" />
              </Field>

              <Field label="Email">
                <input type="email" placeholder={editUser.email}
                  value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="input-nexa" />
              </Field>

              <Field label="Nueva contraseña (opcional)">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input type={showEditPwd ? 'text' : 'password'}
                      placeholder="Dejar vacío para no cambiar"
                      value={editForm.password}
                      onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                      className="input-nexa pr-10" />
                    <button type="button" onClick={() => setShowEditPwd(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--nexa-muted)' }}>
                      {showEditPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <button type="button"
                    onClick={() => { setEditForm(f => ({ ...f, password: generarPasswordSegura() })); setShowEditPwd(true); }}
                    className="rounded-xl px-3 text-[11px] font-bold whitespace-nowrap transition"
                    style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-muted)' }}>
                    Generar
                  </button>
                </div>
                <p className="mt-1.5 text-[10px]" style={{ color: 'var(--nexa-faint)' }}>
                  Genera una contraseña nueva y cópiala para pasársela — no queda guardada en ningún lado, solo se ve aquí una vez.
                </p>
              </Field>

              <Field label="Cargo / Rol">
                <div className="grid grid-cols-3 gap-2">
                  {(['admin', 'profesor', 'recepcionista'] as const).map(val => (
                    <button key={val} type="button"
                      onClick={() => setEditForm(f => ({ ...f, rol: val }))}
                      className="rounded-xl px-3 py-2.5 text-[11px] font-bold transition"
                      style={{
                        background: editForm.rol === val ? 'var(--nexa-accent)' : 'var(--nexa-card-alt)',
                        border:     `1px solid ${editForm.rol === val ? 'var(--nexa-accent)' : 'var(--nexa-border)'}`,
                        color:      editForm.rol === val ? '#FFFFFF' : 'var(--nexa-muted)',
                      }}>
                      {ROL_LABEL[val]}
                    </button>
                  ))}
                </div>
              </Field>

              {editErr && (
                <div className="rounded-lg px-3 py-2.5 text-[12px]"
                  style={{ background: 'rgba(180,64,64,0.12)', border: '1px solid #B44040', color: '#B44040' }}>
                  {editErr}
                </div>
              )}
              {editOk && (
                <div className="rounded-lg px-3 py-2.5 text-[12px]"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid #4ADE80', color: '#4ADE80' }}>
                  {editOk}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeEdit}
                  className="flex-1 rounded-xl px-4 py-2.5 text-[12px] font-bold transition"
                  style={{
                    background: 'var(--nexa-card-alt)',
                    border: '1px solid var(--nexa-border)',
                    color: 'var(--nexa-muted)',
                  }}>
                  Cancelar
                </button>
                <button type="submit" disabled={editSaving}
                  className="flex-1 rounded-xl px-4 py-2.5 text-[12px] font-bold transition"
                  style={{
                    background: editSaving ? 'var(--nexa-card-alt)' : 'var(--nexa-accent)',
                    color: '#FFFFFF',
                    opacity: editSaving ? 0.6 : 1,
                  }}>
                  {editSaving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ── Modal Nuevo usuario ─────────────────────────────────────── */}
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
                      <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0"
                        value={form.tarifa_1a1} onChange={e => setForm(f => ({ ...f, tarifa_1a1: e.target.value }))}
                        className="input-nexa" />
                    </Field>
                    <Field label="Tarifa 2:1 ($/sesión)">
                      <input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0"
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
