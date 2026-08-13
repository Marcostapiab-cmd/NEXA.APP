'use client';

import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import LiquidacionesTab from './LiquidacionesTab';
import {
  getAllCoachesDB, upsertCoachDB, deleteCoachDB,
  COACH_COLORS,
  type Coach,
} from '@/lib/coaches-supabase';
import { supabase } from '@/lib/supabaseClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(nombre: string): string {
  return nombre.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
}

function formatCLP(n: number): string {
  return '$' + n.toLocaleString('es-CL');
}

function extractMsg(e: unknown): string {
  return typeof e === 'object' && e && 'message' in e
    ? String((e as { message: string }).message)
    : 'Error desconocido';
}

// ─── Draft ────────────────────────────────────────────────────────────────────

interface Draft {
  id?:                    string;
  nombre:                 string;
  email:                  string;
  password:               string;
  especialidad:           string;
  tarifa_1a1:             string;
  tarifa_2a1:             string;
  tarifa_incompleta_2a1:  string;
  color:                  string;
  activo:                 boolean;
  darAcceso:              boolean;
}

function emptyDraft(usedColors: string[]): Draft {
  const color = COACH_COLORS.find(c => !usedColors.includes(c)) ?? COACH_COLORS[0];
  return {
    nombre: '', email: '', password: '', especialidad: '',
    tarifa_1a1: '', tarifa_2a1: '', tarifa_incompleta_2a1: '',
    color, activo: true, darAcceso: false,
  };
}

function draftFromCoach(c: Coach): Draft {
  return {
    id:                    c.id,
    nombre:                c.nombre,
    email:                 '',
    password:              '',
    especialidad:          c.especialidad           ?? '',
    tarifa_1a1:            c.tarifa_1a1            > 0 ? String(c.tarifa_1a1)            : '',
    tarifa_2a1:            c.tarifa_2a1            > 0 ? String(c.tarifa_2a1)            : '',
    tarifa_incompleta_2a1: c.tarifa_incompleta_2a1 > 0 ? String(c.tarifa_incompleta_2a1) : '',
    color:                 c.color                  ?? COACH_COLORS[0],
    activo:                c.activo,
    darAcceso:             false,
  };
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function ProfesorModal({ draft, onChange, onSave, onDelete, onClose, saving, err, inviteDone, inviteLink, inviteWarning }: {
  draft:          Draft;
  onChange:       (d: Draft) => void;
  onSave:         () => void;
  onDelete:       () => void;
  onClose:        () => void;
  saving:         boolean;
  err:            string;
  inviteDone?:    boolean;
  inviteLink?:    string | null;
  inviteWarning?: string;
}) {
  const isEdit = !!draft.id;

  // Tras crear con acceso, se muestra el link para fijar contraseña en vez
  // del formulario — hay que copiarlo y mandárselo al profesor por el canal
  // que prefieras (no se envía nada automáticamente desde acá).
  if (inviteDone) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)' }}>
        <div className="w-full max-w-md rounded-2xl overflow-hidden"
          style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--nexa-border)' }}>
            <p className="text-[13px] font-bold" style={{ color: 'var(--nexa-text)' }}>
              Cuenta creada · {draft.nombre}
            </p>
            <button onClick={onClose} style={{ color: 'var(--nexa-muted)' }}><X size={16} /></button>
          </div>
          <div className="p-5 space-y-4">
            {inviteLink ? (
              <>
                <p className="text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
                  Copia este link y mándaselo a {draft.nombre} (WhatsApp, correo, como prefieras).
                  Al abrirlo va a poder fijar su propia contraseña y entrar con su correo.
                </p>
                <div className="rounded-lg px-3 py-2.5 text-[11px] break-all"
                  style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}>
                  {inviteLink}
                </div>
              </>
            ) : (
              <p className="text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
                La cuenta de {draft.nombre} ya está creada.
              </p>
            )}
            {inviteWarning && (
              <div className="rounded-lg px-3 py-2.5 text-[11px]"
                style={{ background: 'rgba(196,120,58,0.12)', border: '1px solid rgba(196,120,58,0.4)', color: '#C4783A' }}>
                {inviteWarning}
              </div>
            )}
            <div className="flex gap-2">
              {inviteLink && (
                <button
                  onClick={() => navigator.clipboard?.writeText(inviteLink)}
                  className="flex-1 rounded-xl py-2.5 text-[12px] font-bold"
                  style={{ background: 'var(--nexa-accent)', color: '#FFFFFF' }}>
                  Copiar link
                </button>
              )}
              <button onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-[12px] font-semibold"
                style={{ background: 'var(--nexa-card-alt)', color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }}>
                Listo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--nexa-border)' }}>
          <p className="text-[13px] font-bold" style={{ color: 'var(--nexa-text)' }}>
            {isEdit ? 'Editar profesor' : 'Nuevo profesor'}
          </p>
          <button onClick={onClose} style={{ color: 'var(--nexa-muted)' }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>

          {/* Color */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-2"
              style={{ color: 'var(--nexa-muted)' }}>Color</label>
            <div className="flex gap-2.5">
              {COACH_COLORS.map(c => (
                <button key={c} onClick={() => onChange({ ...draft, color: c })}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c,
                    border: draft.color === c ? `3px solid ${c}` : '2px solid transparent',
                    outline: draft.color === c ? '2px solid white' : 'none',
                    transition: 'outline 0.1s, border 0.1s',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1"
              style={{ color: 'var(--nexa-muted)' }}>Nombre *</label>
            <input type="text" value={draft.nombre}
              onChange={e => onChange({ ...draft, nombre: e.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-[13px]"
              style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}
            />
          </div>

          {/* Acceso a la app — solo al crear un profesor nuevo */}
          {!isEdit && (
            <div className="rounded-lg p-3 space-y-3"
              style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold" style={{ color: 'var(--nexa-text)' }}>
                  Dar acceso a la app
                </span>
                <button onClick={() => onChange({ ...draft, darAcceso: !draft.darAcceso })}
                  className="relative inline-flex h-5 w-9 rounded-full transition-colors duration-200"
                  style={{ background: draft.darAcceso ? 'var(--nexa-accent)' : 'var(--nexa-border)' }}>
                  <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200"
                    style={{ margin: 2, transform: draft.darAcceso ? 'translateX(16px)' : 'translateX(0)' }} />
                </button>
              </div>
              {draft.darAcceso ? (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                    style={{ color: 'var(--nexa-muted)' }}>Correo del profesor *</label>
                  <input type="email" value={draft.email}
                    placeholder="profesor@ejemplo.cl"
                    onChange={e => onChange({ ...draft, email: e.target.value })}
                    className="w-full rounded-lg px-3 py-2.5 text-[13px]"
                    style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}
                  />
                  <p className="text-[10px] mt-1.5" style={{ color: 'var(--nexa-muted)' }}>
                    Se crea su cuenta y te va a dar un link para que fije su contraseña.
                    Solo va a poder ver su horario y sus rutinas.
                  </p>
                </div>
              ) : (
                <p className="text-[10px]" style={{ color: 'var(--nexa-muted)' }}>
                  Se guarda solo la ficha (tarifas, color) sin cuenta de acceso. Puedes agregársela después.
                </p>
              )}
            </div>
          )}

          {/* Especialidad */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1"
              style={{ color: 'var(--nexa-muted)' }}>Especialidad</label>
            <input type="text" value={draft.especialidad}
              placeholder="Ej: Fuerza y acondicionamiento"
              onChange={e => onChange({ ...draft, especialidad: e.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-[13px]"
              style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}
            />
          </div>

          {/* Tarifas */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-2"
              style={{ color: 'var(--nexa-muted)' }}>Tarifas</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { label: '1:1',         key: 'tarifa_1a1'            },
                { label: '2:1',         key: 'tarifa_2a1'            },
                { label: 'Incomp. 2:1', key: 'tarifa_incompleta_2a1' },
              ] as { label: string; key: keyof Draft }[]).map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-[10px] mb-1" style={{ color: 'var(--nexa-muted)' }}>
                    {label}
                  </label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={draft[key] as string} placeholder="0"
                    onChange={e => onChange({ ...draft, [key]: e.target.value })}
                    className="w-full rounded-lg px-2.5 py-2 text-[12px]"
                    style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Estado */}
          <div className="flex items-center justify-between rounded-lg px-4 py-3"
            style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)' }}>
            <span className="text-[13px] font-medium" style={{ color: 'var(--nexa-text)' }}>Activo</span>
            <button onClick={() => onChange({ ...draft, activo: !draft.activo })}
              className="relative inline-flex h-5 w-9 rounded-full transition-colors duration-200"
              style={{ background: draft.activo ? 'var(--nexa-accent)' : 'var(--nexa-border)' }}>
              <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200"
                style={{ margin: 2, transform: draft.activo ? 'translateX(16px)' : 'translateX(0)' }} />
            </button>
          </div>

          {/* Error */}
          {err && (
            <div className="rounded-lg px-3 py-2.5 text-[11px]"
              style={{ background: 'rgba(180,64,64,0.12)', border: '1px solid rgba(180,64,64,0.4)', color: '#B44040' }}>
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center gap-2"
          style={{ borderTop: '1px solid var(--nexa-border)' }}>
          {isEdit && (
            <button onClick={onDelete} disabled={saving}
              className="rounded-xl px-4 py-2.5 text-[12px] font-bold transition"
              style={{ background: 'rgba(180,64,64,0.12)', color: '#B44040', border: '1px solid rgba(180,64,64,0.3)', opacity: saving ? 0.5 : 1 }}>
              Eliminar
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} disabled={saving}
              className="rounded-xl px-4 py-2.5 text-[12px] font-semibold"
              style={{ background: 'var(--nexa-card-alt)', color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }}>
              Cancelar
            </button>
            <button onClick={onSave}
              disabled={saving || !draft.nombre.trim() || (!isEdit && draft.darAcceso && !draft.email.trim())}
              className="rounded-xl px-5 py-2.5 text-[12px] font-bold transition"
              style={{
                background: 'var(--nexa-accent)', color: '#FFFFFF',
                opacity: (saving || !draft.nombre.trim() || (!isEdit && draft.darAcceso && !draft.email.trim())) ? 0.5 : 1,
              }}>
              {saving ? 'Guardando...' : !isEdit && draft.darAcceso ? 'Crear cuenta' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta ──────────────────────────────────────────────────────────────────

function CoachCard({ coach, alumnosCount, isAdmin, onClick }: {
  coach:        Coach;
  alumnosCount: number;
  isAdmin:      boolean;
  onClick:      () => void;
}) {
  const color    = coach.color ?? COACH_COLORS[0];
  const initials = getInitials(coach.nombre);

  return (
    <div onClick={isAdmin ? onClick : undefined}
      className="rounded-xl overflow-hidden"
      style={{
        background:  'var(--nexa-card)',
        border:      '1px solid var(--nexa-border)',
        cursor:      isAdmin ? 'pointer' : 'default',
        transition:  'transform 0.12s, box-shadow 0.12s',
      }}
      onMouseEnter={e => { if (isAdmin) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px ${color}18`; } }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
    >
      {/* Color stripe */}
      <div style={{ height: 3, background: color }} />

      <div className="p-5">
        {/* Fila 1: Avatar + Nombre + Badge */}
        <div className="flex items-center gap-3 mb-4">
          <div style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: color + '18', border: `1.5px solid ${color}`,
            fontSize: 15, fontWeight: 600, color,
          }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold truncate" style={{ color: 'var(--nexa-text)' }}>
              {coach.nombre}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--nexa-muted)' }}>
              {coach.especialidad || 'Coach'}
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full"
            style={{
              background: coach.activo ? 'rgba(46,125,85,0.15)' : 'rgba(100,100,100,0.15)',
              color:      coach.activo ? '#2E7D55' : '#666',
            }}>
            {coach.activo ? 'activo' : 'inactivo'}
          </span>
        </div>

        {/* Fila 2: Tarifas */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {[
            { label: '1:1',    value: coach.tarifa_1a1 },
            { label: '2:1',    value: coach.tarifa_2a1 },
            { label: 'Incomp.', value: coach.tarifa_incompleta_2a1 },
          ].map(t => (
            <div key={t.label} className="rounded-md px-2 py-1 text-[10px]"
              style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)' }}>
              <span style={{ color: 'var(--nexa-muted)' }}>{t.label} </span>
              <span style={{ color, fontWeight: 700 }}>{formatCLP(t.value)}</span>
            </div>
          ))}
        </div>

        {/* Fila 3: Alumnos */}
        <div className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
          <span style={{ fontSize: 20, fontWeight: 300, color: 'var(--nexa-text)', marginRight: 4, lineHeight: 1 }}>
            {alumnosCount}
          </span>
          alumno{alumnosCount !== 1 ? 's' : ''} asignado{alumnosCount !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ProfesoresPage() {
  const [coaches,      setCoaches]      = useState<Coach[]>([]);
  const [alumnosCount, setAlumnosCount] = useState<Map<string, number>>(new Map());
  const [role,         setRole]         = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [modal,        setModal]        = useState<Draft | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [err,          setErr]          = useState('');
  const [tab,          setTab]          = useState<'profesores' | 'liquidaciones'>('profesores');
  const [inviteDone,    setInviteDone]    = useState(false);
  const [inviteLink,    setInviteLink]    = useState<string | null>(null);
  const [inviteWarning, setInviteWarning] = useState<string>('');

  const isAdmin = role === 'admin' || role === 'host';

  useEffect(() => {
    async function load() {
      const [{ data: roleData }, coaches, { data: atletasData }] = await Promise.all([
        supabase.rpc('get_my_role'),
        getAllCoachesDB().catch(() => [] as Coach[]),
        supabase.from('atletas').select('coach_id').not('coach_id', 'is', null),
      ]);
      setRole(roleData as string ?? null);
      setCoaches(coaches);
      const countMap = new Map<string, number>();
      for (const a of (atletasData ?? [])) {
        const cid = String(a.coach_id);
        countMap.set(cid, (countMap.get(cid) ?? 0) + 1);
      }
      setAlumnosCount(countMap);
      setLoading(false);
    }
    load();
  }, []);

  function openCreate() {
    const usedColors = coaches.map(c => c.color).filter(Boolean) as string[];
    setModal(emptyDraft(usedColors));
    setErr('');
    setInviteDone(false); setInviteLink(null); setInviteWarning('');
  }

  function openEdit(coach: Coach) {
    setModal(draftFromCoach(coach));
    setErr('');
    setInviteDone(false); setInviteLink(null); setInviteWarning('');
  }

  async function handleSave() {
    if (!modal || !modal.nombre.trim()) return;
    setSaving(true);
    setErr('');

    // Crear profesor nuevo CON acceso: pasa por el endpoint que crea la
    // cuenta de login y la ficha de coach juntas (mismo id para ambas).
    if (!modal.id && modal.darAcceso) {
      if (!modal.email.trim()) { setErr('El correo es obligatorio para dar acceso.'); setSaving(false); return; }
      try {
        const res = await fetch('/api/profesores/invitar', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre:                modal.nombre.trim(),
            email:                 modal.email.trim(),
            especialidad:          modal.especialidad.trim() || undefined,
            tarifa_1a1:            parseFloat(modal.tarifa_1a1)            || 0,
            tarifa_2a1:            parseFloat(modal.tarifa_2a1)            || 0,
            tarifa_incompleta_2a1: parseFloat(modal.tarifa_incompleta_2a1) || 0,
            color:                 modal.color || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) { setErr(json.error || 'No se pudo crear la cuenta.'); return; }

        const nuevoCoach: Coach = {
          id:                     json.userId,
          nombre:                 modal.nombre.trim(),
          especialidad:           modal.especialidad.trim() || undefined,
          tarifa_1a1:             parseFloat(modal.tarifa_1a1)            || 0,
          tarifa_2a1:             parseFloat(modal.tarifa_2a1)            || 0,
          tarifa_incompleta_2a1:  parseFloat(modal.tarifa_incompleta_2a1) || 0,
          color:                  modal.color || undefined,
          activo:                 true,
        };
        setCoaches(prev => [...prev, nuevoCoach].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        setInviteWarning(json.warning || '');
        setInviteLink(json.setPasswordLink ?? null);
        setInviteDone(true);
      } catch (e: unknown) {
        setErr(extractMsg(e));
      } finally {
        setSaving(false);
      }
      return;
    }

    // Crear sin acceso, o editar un profesor existente: comportamiento de siempre.
    try {
      let saved: Coach;

      if (!modal.id) {
        // Crear: genera cuenta de auth + coaches entry vía API route
        const res = await fetch('/api/admin/crear-profesor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email:                 modal.email.trim(),
            password:              modal.password,
            nombre:                modal.nombre.trim(),
            especialidad:          modal.especialidad.trim() || undefined,
            tarifa_1a1:            parseFloat(modal.tarifa_1a1)            || 0,
            tarifa_2a1:            parseFloat(modal.tarifa_2a1)            || 0,
            tarifa_incompleta_2a1: parseFloat(modal.tarifa_incompleta_2a1) || 0,
            color:                 modal.color || undefined,
            activo:                modal.activo,
          }),
        });
        const json = await res.json() as { coach?: Coach; error?: string };
        if (!res.ok || !json.coach) throw new Error(json.error ?? 'Error al crear el profesor');
        saved = json.coach;
      } else {
        // Editar: solo actualiza datos de display en la tabla coaches
        saved = await upsertCoachDB({
          id:                    modal.id,
          nombre:                modal.nombre.trim(),
          especialidad:          modal.especialidad.trim() || undefined,
          tarifa_1a1:            parseFloat(modal.tarifa_1a1)            || 0,
          tarifa_2a1:            parseFloat(modal.tarifa_2a1)            || 0,
          tarifa_incompleta_2a1: parseFloat(modal.tarifa_incompleta_2a1) || 0,
          color:                 modal.color || undefined,
          activo:                modal.activo,
        });
      }

      setCoaches(prev =>
        modal.id
          ? prev.map(c => c.id === modal.id ? saved : c)
          : [...prev, saved].sort((a, b) => a.nombre.localeCompare(b.nombre))
      );
      setModal(null);
    } catch (e: unknown) {
      setErr(extractMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!modal?.id) return;
    if (!confirm('¿Eliminar este profesor? Esta acción no se puede deshacer.')) return;
    setSaving(true);
    setErr('');
    try {
      await deleteCoachDB(modal.id);
      setCoaches(prev => prev.filter(c => c.id !== modal.id));
      setModal(null);
    } catch (e: unknown) {
      setErr(extractMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--nexa-black)' }}>
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-black tracking-[0.12em]" style={{ color: 'var(--nexa-text)' }}>
              PROFESORES
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              {coaches.filter(c => c.activo).length} activos · {coaches.length} total
            </p>
          </div>
          {isAdmin && tab === 'profesores' && (
            <button onClick={openCreate}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-bold"
              style={{ background: 'var(--nexa-accent)', color: '#FFFFFF' }}>
              <Plus size={14} />
              Nuevo profesor
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl border p-1"
          style={{ borderColor: 'var(--nexa-border)', background: 'var(--nexa-card)', width: 'fit-content' }}>
          {(['profesores', 'liquidaciones'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="rounded-lg px-5 py-2 text-[12px] font-semibold capitalize transition-all"
              style={tab === t
                ? { background: 'var(--nexa-text)', color: '#fff' }
                : { color: 'var(--nexa-muted)' }}>
              {t === 'profesores' ? 'Profesores' : 'Liquidaciones'}
            </button>
          ))}
        </div>

        {tab === 'liquidaciones' && <LiquidacionesTab />}

        {/* Grid */}
        {tab === 'profesores' && (
          loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-44 rounded-xl animate-pulse"
                  style={{ background: 'var(--nexa-card)' }} />
              ))}
            </div>
          ) : coaches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <p className="text-[14px]" style={{ color: 'var(--nexa-muted)' }}>
                Sin profesores registrados.
              </p>
              {isAdmin && (
                <button onClick={openCreate} className="text-[12px] font-semibold"
                  style={{ color: 'var(--nexa-accent)' }}>
                  + Agregar el primero
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {coaches.map(c => (
                <CoachCard key={c.id} coach={c}
                  alumnosCount={alumnosCount.get(c.id) ?? 0}
                  isAdmin={isAdmin}
                  onClick={() => openEdit(c)}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Modal */}
      {modal && (
        <ProfesorModal
          draft={modal}
          onChange={setModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => {
            setModal(null); setErr('');
            setInviteDone(false); setInviteLink(null); setInviteWarning('');
          }}
          saving={saving}
          err={err}
          inviteDone={inviteDone}
          inviteLink={inviteLink}
          inviteWarning={inviteWarning}
        />
      )}
    </main>
  );
}
