'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Plus, Search, X, Save, Eye, Users, CreditCard, CheckCircle2, Clock, XCircle, RefreshCw, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { getAllPagosDB, type Pago } from '@/lib/pagos-supabase';
import { getAlumnos, createAlumno, updateAlumno, deleteAlumno, updateEstadoPago } from '@/lib/alumnos';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Alumno {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  fechaNacimiento: string;
  peso: string;
  altura: string;
  foto: string;
  estado: 'activo' | 'pendiente' | 'archivado';
  // Datos de contacto
  rut?: string;
  telefono?: string;
  // Contacto de emergencia
  contactoEmergenciaNombre?: string;
  contactoEmergenciaTel?: string;
  contactoEmergenciaRelacion?: string;
  // Entrenamiento
  objetivo?: string;
  etapa?: string;
  notasProfesor?: string;
  // Contrato
  contratoFirmado?: boolean;
  contratoFechaFirma?: string;
  // Pago
  estadoPago?: 'al_dia' | 'debe';
}

export interface AtletaSalud {
  atletaId: string;
  enfermedades?: string;
  lesiones?: string;
  medicamentos?: string;
  alergias?: string;
}

const EMPTY = (): Omit<Alumno, 'id'> => ({
  nombre: '', apellido: '', email: '',
  fechaNacimiento: '', peso: '', altura: '',
  foto: '', estado: 'activo',
});

// ─── Avatar determinístico ────────────────────────────────────────────────────

const PALETTES = [
  { bg: '#2a1f5c', color: '#a78bfa' },
  { bg: '#0f2847', color: '#60a5fa' },
  { bg: '#0a2e1e', color: '#34d399' },
  { bg: '#2e0f1e', color: '#f472b6' },
  { bg: '#2e1e00', color: '#fbbf24' },
  { bg: '#062424', color: '#2dd4bf' },
];

function getPalette(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return PALETTES[Math.abs(h) % PALETTES.length];
}

function Avatar({ alumno, size = 36 }: { alumno: Pick<Alumno, 'nombre' | 'apellido' | 'foto'>; size?: number }) {
  const pal = getPalette(alumno.nombre);
  const initials = `${alumno.nombre[0] ?? ''}${alumno.apellido[0] ?? ''}`.toUpperCase();
  if (alumno.foto) {
    return (
      <img
        src={alumno.foto} alt=""
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, backgroundColor: pal.bg, color: pal.color }}
      className="rounded-full flex-shrink-0 flex items-center justify-center font-bold text-xs"
    >
      {initials || '?'}
    </div>
  );
}

// ─── Badge de estado ──────────────────────────────────────────────────────────

const ESTADO_CFG = {
  activo:    { label: 'Activo',    color: '#4A8A5A' },
  pendiente: { label: 'Pendiente', color: '#C4783A' },
  archivado: { label: 'Archivado', color: '#9B9B9B' },
} as const;

function EstadoText({ estado }: { estado: Alumno['estado'] }) {
  const c = ESTADO_CFG[estado];
  return (
    <span className="text-sm font-semibold" style={{ color: c.color }}>
      {c.label}
    </span>
  );
}

// ─── Modal crear / editar ─────────────────────────────────────────────────────

const IC = 'w-full rounded-lg border border-[#D8D8D8] bg-[#F0F0F0] px-3 py-2.5 text-sm text-[#121212] placeholder-[#9B9B9B] outline-none transition focus:border-[#CACACA]';
const LC = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#777777]';

function AlumnoModal({ initial, onSave, onClose }: {
  initial?: Alumno;
  onSave: (a: Omit<Alumno, 'id'>) => void | Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<Alumno, 'id'>>(initial ? { ...initial } : EMPTY());
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('foto', reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-[#D8D8D8] bg-[#F0F0F0] shadow-2xl"
        style={{ animation: 'scale-in 0.18s ease-out forwards' }}
      >
        <div className="flex items-center justify-between border-b border-[#E0E0E0] px-6 py-4">
          <h2 className="text-sm font-semibold text-[#121212]">
            {initial ? 'Editar alumno' : 'Nuevo alumno'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#777777] transition hover:bg-[#E4E4E4] hover:text-[#121212]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 p-6"
        >
          {/* Foto */}
          <div className="flex items-center gap-4">
            <Avatar alumno={{ ...form, id: '' } as Alumno} size={48} />
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-[#D8D8D8] px-3 py-1.5 text-xs text-[#5E5E5E] transition hover:border-[#CACACA] hover:text-[#121212]">
                Subir foto
              </button>
              {form.foto && (
                <button type="button" onClick={() => set('foto', '')}
                  className="text-xs text-[#B44040] transition hover:text-[#8B3030]">
                  Quitar
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
            </div>
          </div>

          {/* Nombre + Apellido */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LC}>Nombre *</label>
              <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
                placeholder="Carlos" required className={IC} />
            </div>
            <div>
              <label className={LC}>Apellido</label>
              <input value={form.apellido} onChange={e => set('apellido', e.target.value)}
                placeholder="García" className={IC} />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className={LC}>Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="carlos@email.com" className={IC} />
          </div>

          {/* Fecha + Estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LC}>Nacimiento</label>
              <input type="date" value={form.fechaNacimiento} onChange={e => set('fechaNacimiento', e.target.value)} className={IC} />
            </div>
            <div>
              <label className={LC}>Estado</label>
              <select value={form.estado} onChange={e => set('estado', e.target.value)} className={IC}>
                <option value="activo">Activo</option>
                <option value="pendiente">Pendiente</option>
                <option value="archivado">Archivado</option>
              </select>
            </div>
          </div>

          {/* Peso + Altura */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LC}>Peso (kg)</label>
              <input value={form.peso} onChange={e => set('peso', e.target.value)}
                placeholder="75" className={IC} />
            </div>
            <div>
              <label className={LC}>Altura (cm)</label>
              <input value={form.altura} onChange={e => set('altura', e.target.value)}
                placeholder="175" className={IC} />
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-[#D8D8D8] py-2.5 text-sm font-medium text-[#5E5E5E] transition hover:border-[#CACACA] hover:text-[#121212]">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#121212] py-2.5 text-sm font-semibold text-white transition hover:bg-[#2A2A2A] disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving ? 'Guardando...' : initial ? 'Guardar' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal de pago ────────────────────────────────────────────────────────────

function PagoModal({ alumno, onClose, onMarcarAlDia }: {
  alumno: Alumno;
  onClose: () => void;
  onMarcarAlDia: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function handlePagar() {
    setSaving(true);
    try {
      // TODO: conectar con Flow (pasarela de pago Chile)
      await onMarcarAlDia();
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-sm rounded-xl border border-[#D8D8D8] bg-[#F0F0F0] shadow-2xl"
        style={{ animation: 'scale-in 0.18s ease-out forwards' }}
      >
        <div className="flex items-center justify-between border-b border-[#E0E0E0] px-6 py-4">
          <h2 className="text-sm font-semibold text-[#121212]">Registrar pago</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#777777] transition hover:bg-[#E4E4E4] hover:text-[#121212]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#777777]">Alumno</p>
            <p className="mt-1 text-base font-semibold text-[#121212]">
              {alumno.nombre} {alumno.apellido}
            </p>
          </div>

          <div className="rounded-[10px] border border-[#E0E0E0] bg-[#F8F8F8] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#777777]">Estado actual</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: alumno.estadoPago === 'debe' ? '#B44040' : '#4A8A5A' }}>
              {alumno.estadoPago === 'debe' ? 'Debe su plan' : 'Al día'}
            </p>
          </div>

          <p className="text-xs text-[#777777]">
            Al confirmar el pago, el alumno quedará marcado como <strong>al día</strong>.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[#D8D8D8] py-2.5 text-sm font-medium text-[#5E5E5E] transition hover:border-[#CACACA] hover:text-[#121212]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handlePagar}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#121212] py-2.5 text-sm font-semibold text-white transition hover:bg-[#2A2A2A] disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              {saving ? 'Guardando...' : 'Pagar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Historial de pagos Flow ────────────────────────────────────────────

const PAGO_CONFIG: Record<string, { label: string; Icon: React.ElementType; color: string; bg: string }> = {
  pagado:      { label: 'Pagado',      Icon: CheckCircle2, color: '#16a34a', bg: '#f0fdf4' },
  pendiente:   { label: 'Pendiente',   Icon: Clock,        color: '#d97706', bg: '#fffbeb' },
  fallido:     { label: 'Fallido',     Icon: XCircle,      color: '#dc2626', bg: '#fef2f2' },
  reembolsado: { label: 'Reembolsado', Icon: RefreshCw,    color: '#6b7280', bg: '#f9fafb' },
};

function PagosTab() {
  const [pagos,   setPagos]   = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro,  setFiltro]  = useState<'todos' | string>('todos');

  useEffect(() => {
    getAllPagosDB().then(setPagos).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtrados = filtro === 'todos' ? pagos : pagos.filter(p => p.estado === filtro);
  const totalPagado    = pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.monto, 0);
  const pagadoCount    = pagos.filter(p => p.estado === 'pagado').length;
  const pendienteCount = pagos.filter(p => p.estado === 'pendiente').length;

  return (
    <>
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { label: 'Recaudado',  value: `$${totalPagado.toLocaleString('es-CL')}`, sub: 'CLP confirmado' },
          { label: 'Pagados',    value: String(pagadoCount),    sub: 'cobros exitosos' },
          { label: 'Pendientes', value: String(pendienteCount), sub: 'por confirmar' },
        ].map(s => (
          <div key={s.label} className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">{s.label}</p>
            <p className="mt-1 text-xl font-black text-[#121212]">{s.value}</p>
            <p className="text-[11px] text-[#9B9B9B]">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['todos', 'pagado', 'pendiente', 'fallido', 'reembolsado'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              filtro === f
                ? 'bg-[#121212] text-white'
                : 'border border-[#CACACA] text-[#5E5E5E] hover:border-[#888]'
            }`}>
            {f === 'todos' ? 'Todos' : (PAGO_CONFIG[f]?.label ?? f)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-[#5E5E5E]">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" />
          Cargando...
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[#CACACA] py-16 text-center">
          <CreditCard className="mx-auto mb-3 h-8 w-8 text-[#CACACA]" />
          <p className="text-sm text-[#9B9B9B]">
            {filtro === 'todos' ? 'Sin pagos registrados aún.' : `Sin pagos con estado "${PAGO_CONFIG[filtro]?.label ?? filtro}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(pago => {
            const cfg = PAGO_CONFIG[pago.estado] ?? PAGO_CONFIG.pendiente;
            const Icn = cfg.Icon;
            return (
              <div key={pago.id} className="rounded-[12px] border border-[#CACACA] bg-[#F8F8F8] px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[#121212]">
                      {pago.descripcion || 'Cobro sin descripción'}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-[#5E5E5E]">
                      <span className="font-bold text-[#121212]">${pago.monto.toLocaleString('es-CL')} CLP</span>
                      {pago.fechaPago
                        ? <span>Pagado: {new Date(pago.fechaPago).toLocaleDateString('es-CL')}</span>
                        : <span>Creado: {new Date(pago.createdAt).toLocaleDateString('es-CL')}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                      style={{ color: cfg.color, background: cfg.bg }}>
                      <Icn className="h-3 w-3" />
                      {cfg.label}
                    </span>
                    {pago.checkoutUrl && pago.estado === 'pendiente' && (
                      <a href={pago.checkoutUrl} target="_blank" rel="noreferrer"
                        className="rounded-lg border border-[#CACACA] p-1.5 text-[#5E5E5E] transition hover:text-[#121212]"
                        title="Abrir link de pago">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type Tab = 'activos' | 'archivados' | 'pagos';

export default function AlumnosPage() {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [tab, setTab] = useState<Tab>('activos');
  const [modal, setModal] = useState<'new' | Alumno | null>(null);
  const [modalPago, setModalPago] = useState<Alumno | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  function syncLocal(updated: Alumno[]) {
    try {
      const existing = JSON.parse(localStorage.getItem('nexa_alumnos') || '[]');
      const merged = updated.map(a => {
        const old = existing.find((e: Alumno & { mediciones?: unknown[] }) => e.id === a.id);
        return old?.mediciones ? { ...a, mediciones: old.mediciones } : a;
      });
      localStorage.setItem('nexa_alumnos', JSON.stringify(merged));
    } catch {
      localStorage.setItem('nexa_alumnos', JSON.stringify(updated));
    }
  }

  useEffect(() => {
    getAlumnos()
      .then(data => {
        const normalized = data.map(a => ({ ...a, estado: a.estado ?? 'activo' }));
        setAlumnos(normalized);
        syncLocal(normalized);
      })
      .catch(() => {
        try {
          const raw = localStorage.getItem('nexa_alumnos');
          if (raw) setAlumnos(JSON.parse(raw).map((a: Alumno) => ({ ...a, estado: a.estado ?? 'activo' })));
        } catch {}
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(data: Omit<Alumno, 'id'>) {
    try {
      let updated: Alumno[];
      if (modal === 'new') {
        const nuevo = await createAlumno(data);
        updated = [nuevo, ...alumnos];
      } else if (modal && typeof modal === 'object') {
        const editado = await updateAlumno(modal.id, data);
        updated = alumnos.map(a => a.id === modal.id ? editado : a);
      } else return;
      setAlumnos(updated);
      syncLocal(updated);
      setModal(null);
    } catch {
      alert('Error al guardar. Verifica tu conexión a internet.');
    }
  }

  async function marcarEstadoPago(id: string, estadoPago: 'al_dia' | 'debe') {
    try {
      await updateEstadoPago(id, estadoPago);
      const updated = alumnos.map(a => a.id === id ? { ...a, estadoPago } : a);
      setAlumnos(updated);
      syncLocal(updated);
    } catch {
      alert('Error al actualizar estado de pago.');
    }
  }

  async function del(id: string) {
    if (!confirm('¿Eliminar este alumno? Esta acción no se puede deshacer.')) return;
    try {
      await deleteAlumno(id);
      const updated = alumnos.filter(a => a.id !== id);
      setAlumnos(updated);
      syncLocal(updated);
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch {
      alert('Error al eliminar. Verifica tu conexión a internet.');
    }
  }

  const porTab = alumnos.filter(a =>
    tab === 'archivados' ? a.estado === 'archivado' : a.estado !== 'archivado'
  );
  const filtrados = porTab.filter(a =>
    `${a.nombre} ${a.apellido} ${a.email}`.toLowerCase().includes(busqueda.toLowerCase())
  );

  const allChecked = filtrados.length > 0 && selected.size === filtrados.length;
  const someChecked = selected.size > 0 && !allChecked;

  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtrados.map(a => a.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6" style={{ animation: 'fade-in 0.15s ease-out forwards' }}>

      {/* ── Encabezado ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#121212] tracking-tight">Alumnos</h1>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#777777]">
            {alumnos.length} registrado{alumnos.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-[#E0E0E0] bg-[#F5F5F5] p-1 gap-0.5">
            {([['activos', 'Activos'], ['archivados', 'Archivados'], ['pagos', 'Pagos']] as [Tab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => { setTab(t); setSelected(new Set()); }}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150"
                style={tab === t
                  ? { background: '#121212', color: '#FFFFFF' }
                  : { color: '#777777', background: 'transparent' }
                }
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-1.5 rounded-xl border border-[#D8D8D8] bg-[#F5F5F5] px-4 py-2 text-sm font-semibold text-[#5E5E5E] transition hover:border-[#CACACA] hover:text-[#121212]"
          >
            <Plus className="h-4 w-4" />
            Nuevo alumno
          </button>
        </div>
      </div>

      {/* ── Tab Pagos ──────────────────────────────────────────────────────── */}
      {tab === 'pagos' && <PagosTab />}

      {/* ── Buscador + Tabla (ocultos en tab pagos) ────────────────────────── */}
      {tab !== 'pagos' && <>
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9B9B9B] pointer-events-none" />
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, apellido o email..."
          className="w-full rounded-xl border border-[#E0E0E0] bg-[#F5F5F5] py-2.5 pl-10 pr-4 text-sm text-[#121212] placeholder-[#9B9B9B] outline-none transition focus:border-[#D8D8D8]"
        />
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="py-16 text-center text-sm text-[#9B9B9B]">Cargando alumnos...</div>
      )}
      {!loading && (filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E0E0E0] py-20 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-[#CACACA]" />
          <p className="text-sm text-[#777777]">
            {busqueda
              ? 'Sin resultados para esa búsqueda'
              : tab === 'archivados'
                ? 'No hay alumnos archivados'
                : 'Sin alumnos. ¡Agrega el primero!'}
          </p>
          {!busqueda && tab === 'activos' && (
            <button
              onClick={() => setModal('new')}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium transition"
              style={{ color: '#121212' }}
            >
              <Plus className="h-3.5 w-3.5" /> Agregar el primero
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E0E0E0]">
          {/* Desktop — tabla */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#E0E0E0] bg-[#F5F5F5]">
                  <th className="w-10 pl-4 pr-2 py-3">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked; }}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="w-10 px-2 py-3" />
                  <Th>Nombre</Th>
                  <Th>Apellido</Th>
                  <Th>Email</Th>
                  <Th>Estado</Th>
                  <th className="px-5 py-3 text-right">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9B9B9B]">Acciones</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtrados.map((a, idx) => (
                  <TableRow
                    key={a.id}
                    alumno={a}
                    idx={idx}
                    checked={selected.has(a.id)}
                    onCheck={() => toggleOne(a.id)}
                    onEdit={() => setModal(a)}
                    onDelete={() => del(a.id)}
                    onPago={() => setModalPago(a)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — cards */}
          <div className="md:hidden divide-y divide-[#E0E0E0]">
            {filtrados.map(a => (
              <MobileRow
                key={a.id}
                alumno={a}
                onEdit={() => setModal(a)}
                onDelete={() => del(a.id)}
                onPago={() => setModalPago(a)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-[#E0E0E0] bg-[#F8F8F8] px-5 py-2.5">
            <span className="text-[11px] text-[#9B9B9B] tabular-nums">
              {filtrados.length} {filtrados.length === 1 ? 'alumno' : 'alumnos'}
              {busqueda && ` · filtrado de ${porTab.length}`}
            </span>
            {selected.size > 0 && (
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: '#121212' }}>
                {selected.size} seleccionados
              </span>
            )}
          </div>
        </div>
      ))}
      </>}

      {/* Modal editar/crear */}
      {modal && (
        <AlumnoModal
          initial={modal === 'new' ? undefined : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Modal pago */}
      {modalPago && (
        <PagoModal
          alumno={modalPago}
          onClose={() => setModalPago(null)}
          onMarcarAlDia={() => marcarEstadoPago(modalPago.id, 'al_dia')}
        />
      )}
    </main>
  );
}

// ─── Columna header ───────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9B9B9B]">{children}</span>
    </th>
  );
}

// ─── Fila de tabla ────────────────────────────────────────────────────────────

function TableRow({ alumno, idx, checked, onCheck, onEdit, onDelete, onPago }: {
  alumno: Alumno;
  idx: number;
  checked: boolean;
  onCheck: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPago: () => void;
}) {
  const isZebra = idx % 2 === 1;
  return (
    <tr
      className="border-b border-[#E8E8E8] last:border-0 transition-colors duration-75"
      style={{
        backgroundColor: checked ? 'rgba(18,18,18,0.04)' : isZebra ? '#F5F5F5' : '#F8F8F8',
      }}
      onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(18,18,18,0.04)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = checked ? 'rgba(18,18,18,0.04)' : isZebra ? '#F5F5F5' : '#F8F8F8'; }}
    >
      <td className="w-10 pl-4 pr-2 py-3">
        <input type="checkbox" checked={checked} onChange={onCheck} />
      </td>

      <td className="w-10 px-2 py-3">
        <Avatar alumno={alumno} size={32} />
      </td>

      <td className="px-4 py-3">
        <Link
          href={`/alumnos/${alumno.id}`}
          className="text-sm font-semibold text-[#121212] transition"
          onMouseEnter={e => (e.currentTarget.style.color = '#3E3E3E')}
          onMouseLeave={e => (e.currentTarget.style.color = '#121212')}
        >
          {alumno.nombre}
        </Link>
      </td>

      <td className="px-4 py-3">
        <span className="text-sm text-[#3E3E3E]">{alumno.apellido || '—'}</span>
      </td>

      <td className="max-w-[220px] px-4 py-3">
        <span className="block truncate text-sm text-[#3E3E3E]">{alumno.email || '—'}</span>
      </td>

      <td className="px-4 py-3">
        <EstadoText estado={alumno.estado} />
      </td>

      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1.5">
          <ActionBtn
            href={`/alumnos/${alumno.id}`}
            icon={<Eye className="h-3.5 w-3.5" />}
            label="Ver perfil"
            bg="rgba(18,18,18,0.06)" color="#5E5E5E" hoverBg="rgba(18,18,18,0.10)"
          />
          {alumno.estadoPago === 'debe' ? (
            <ActionBtn
              icon={<CreditCard className="h-3.5 w-3.5" />}
              label="Registrar pago (debe)"
              bg="rgba(180,64,64,0.10)" color="#B44040" hoverBg="rgba(180,64,64,0.18)"
              border="#B44040"
              onClick={onPago}
            />
          ) : (
            <ActionBtn
              icon={<CreditCard className="h-3.5 w-3.5" />}
              label="Registrar pago"
              bg="rgba(18,18,18,0.06)" color="#5E5E5E" hoverBg="rgba(18,18,18,0.10)"
              onClick={onPago}
            />
          )}
          <ActionBtn
            icon={<Pencil className="h-3.5 w-3.5" />}
            label="Editar alumno"
            bg="rgba(18,18,18,0.06)" color="#5E5E5E" hoverBg="rgba(18,18,18,0.10)"
            onClick={onEdit}
          />
          <ActionBtn
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Eliminar alumno"
            bg="rgba(180,64,64,0.10)" color="#B44040" hoverBg="rgba(180,64,64,0.18)"
            onClick={onDelete}
          />
        </div>
      </td>
    </tr>
  );
}

// ─── Botón de acción coloreado ────────────────────────────────────────────────

function ActionBtn({ href, icon, label, bg, color, hoverBg, border, onClick }: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  bg: string; color: string; hoverBg: string;
  border?: string;
  onClick?: () => void;
}) {
  const style: React.CSSProperties = {
    background: bg, color, width: 28, height: 28, borderRadius: 7,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'background 0.12s',
    ...(border ? { border: `1px solid ${border}` } : {}),
  };
  const handlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = hoverBg),
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.background = bg),
  };

  if (href) return (
    <Link href={href} title={label} style={style} {...handlers}>{icon}</Link>
  );
  return (
    <button title={label} onClick={onClick} style={style} {...handlers}>{icon}</button>
  );
}

// ─── Fila móvil ──────────────────────────────────────────────────────────────

function MobileRow({ alumno, onEdit, onDelete, onPago }: {
  alumno: Alumno;
  onEdit: () => void;
  onDelete: () => void;
  onPago: () => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-[#F8F8F8] px-4 py-3.5 transition hover:bg-[#F0F0F0]">
      <Avatar alumno={alumno} size={38} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/alumnos/${alumno.id}`} className="text-sm font-semibold text-[#121212]">
            {alumno.nombre} {alumno.apellido}
          </Link>
          <EstadoText estado={alumno.estado} />
        </div>
        {alumno.email && (
          <p className="mt-0.5 text-xs text-[#777777] truncate">{alumno.email}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <ActionBtn
          href={`/alumnos/${alumno.id}`}
          icon={<Eye className="h-3.5 w-3.5" />}
          label="Ver perfil"
          bg="rgba(18,18,18,0.06)" color="#5E5E5E" hoverBg="rgba(18,18,18,0.10)"
        />
        {alumno.estadoPago === 'debe' ? (
          <ActionBtn
            icon={<CreditCard className="h-3.5 w-3.5" />}
            label="Registrar pago (debe)"
            bg="rgba(180,64,64,0.10)" color="#B44040" hoverBg="rgba(180,64,64,0.18)"
            border="#B44040"
            onClick={onPago}
          />
        ) : (
          <ActionBtn
            icon={<CreditCard className="h-3.5 w-3.5" />}
            label="Registrar pago"
            bg="rgba(18,18,18,0.06)" color="#5E5E5E" hoverBg="rgba(18,18,18,0.10)"
            onClick={onPago}
          />
        )}
        <ActionBtn
          icon={<Pencil className="h-3.5 w-3.5" />}
          label="Editar alumno"
          bg="rgba(18,18,18,0.06)" color="#5E5E5E" hoverBg="rgba(18,18,18,0.10)"
          onClick={onEdit}
        />
        <ActionBtn
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Eliminar alumno"
          bg="rgba(180,64,64,0.10)" color="#B44040" hoverBg="rgba(180,64,64,0.18)"
          onClick={onDelete}
        />
      </div>
    </div>
  );
}
