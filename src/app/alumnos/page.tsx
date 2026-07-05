'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Plus, Search, Pencil, Trash2, X, Save, BarChart2, Eye, Users } from 'lucide-react';

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
  activo:    { label: 'Activo',    color: '#D4AF37' },
  pendiente: { label: 'Pendiente', color: '#D4AF37' },
  archivado: { label: 'Archivado', color: '#555555' },
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

const IC = 'w-full rounded-lg border border-[#252525] bg-[#111111] px-3 py-2.5 text-sm text-[#f4f4f5] placeholder-[#444] outline-none transition focus:border-[#444]';
const LC = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#555]';

function AlumnoModal({ initial, onSave, onClose }: {
  initial?: Alumno;
  onSave: (a: Omit<Alumno, 'id'>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<Alumno, 'id'>>(initial ? { ...initial } : EMPTY());
  const fileRef = useRef<HTMLInputElement>(null);

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })); }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('foto', reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-[#252525] bg-[#111111] shadow-2xl"
        style={{ animation: 'scale-in 0.18s ease-out forwards' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1d1d1d] px-6 py-4">
          <h2 className="text-sm font-semibold text-[#f4f4f5]">
            {initial ? 'Editar alumno' : 'Nuevo alumno'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#555] transition hover:bg-[#1a1a1a] hover:text-[#f4f4f5]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); if (!form.nombre.trim()) return; onSave(form); }}
          className="space-y-4 p-6"
        >
          {/* Foto */}
          <div className="flex items-center gap-4">
            <Avatar alumno={{ ...form, id: '' } as Alumno} size={48} />
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-[#252525] px-3 py-1.5 text-xs text-[#888] transition hover:border-[#444] hover:text-[#f4f4f5]">
                Subir foto
              </button>
              {form.foto && (
                <button type="button" onClick={() => set('foto', '')}
                  className="text-xs text-[#ef4444] transition hover:text-red-400">
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
              className="flex-1 rounded-lg border border-[#333] py-2.5 text-sm font-medium text-[#888] transition hover:border-[#555] hover:text-[#f4f4f5]">
              Cancelar
            </button>
            <button type="submit"
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#f4f4f5] py-2.5 text-sm font-semibold text-black transition hover:bg-white">
              <Save className="h-4 w-4" />
              {initial ? 'Guardar' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

type Tab = 'activos' | 'archivados';

export default function AlumnosPage() {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [tab, setTab] = useState<Tab>('activos');
  const [modal, setModal] = useState<'new' | Alumno | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nexa_alumnos');
      if (raw) {
        const parsed: Alumno[] = JSON.parse(raw);
        // Retrocompatibilidad: añadir estado por defecto a registros viejos
        setAlumnos(parsed.map(a => ({ ...a, estado: a.estado ?? 'activo' })));
      }
    } catch {}
  }, []);

  function persist(updated: Alumno[]) {
    setAlumnos(updated);
    localStorage.setItem('nexa_alumnos', JSON.stringify(updated));
  }

  function handleSave(data: Omit<Alumno, 'id'>) {
    if (modal === 'new') {
      persist([...alumnos, { ...data, id: crypto.randomUUID() }]);
    } else if (modal && typeof modal === 'object') {
      persist(alumnos.map(a => a.id === modal.id ? { ...data, id: modal.id } : a));
    }
    setModal(null);
  }

  function del(id: string) {
    if (!confirm('¿Eliminar este alumno? Esta acción no se puede deshacer.')) return;
    persist(alumnos.filter(a => a.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  // Filtros
  const porTab = alumnos.filter(a =>
    tab === 'archivados' ? a.estado === 'archivado' : a.estado !== 'archivado'
  );
  const filtrados = porTab.filter(a =>
    `${a.nombre} ${a.apellido} ${a.email}`.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Selección
  const allChecked = filtrados.length > 0 && selected.size === filtrados.length;
  const someChecked = selected.size > 0 && !allChecked;

  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtrados.map(a => a.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6" style={{ animation: 'fade-in 0.15s ease-out forwards' }}>

      {/* ── Encabezado ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#f4f4f5] tracking-tight">Alumnos</h1>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#555]">
            {alumnos.length} registrado{alumnos.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Tab toggle estilo TeamBuildr */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-[#1d1d1d] bg-[#0d0d0d] p-1 gap-0.5">
            {(['activos', 'archivados'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setSelected(new Set()); }}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-all duration-150"
                style={tab === t
                  ? { background: '#D4AF37', color: '#000' }
                  : { color: '#555', background: 'transparent' }
                }
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => setModal('new')}
            className="flex items-center gap-1.5 rounded-xl border border-[#252525] bg-[#0d0d0d] px-4 py-2 text-sm font-semibold text-[#a1a1aa] transition hover:border-[#333] hover:text-[#f4f4f5]"
          >
            <Plus className="h-4 w-4" />
            Nuevo alumno
          </button>
        </div>
      </div>

      {/* ── Buscador ───────────────────────────────────────────────────────── */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#444] pointer-events-none" />
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, apellido o email..."
          className="w-full rounded-xl border border-[#1d1d1d] bg-[#0d0d0d] py-2.5 pl-10 pr-4 text-sm text-[#f4f4f5] placeholder-[#444] outline-none transition focus:border-[#333]"
        />
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────────── */}
      {filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#1d1d1d] py-20 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-[#2a2a2a]" />
          <p className="text-sm text-[#555]">
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
              style={{ color: '#D4AF37' }}
            >
              <Plus className="h-3.5 w-3.5" /> Agregar el primero
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#1d1d1d]">
          {/* Desktop — tabla */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              {/* Cabecera */}
              <thead>
                <tr className="border-b border-[#1d1d1d] bg-[#0d0d0d]">
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
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#444]">Acciones</span>
                  </th>
                </tr>
              </thead>

              {/* Filas */}
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
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — cards */}
          <div className="md:hidden divide-y divide-[#1d1d1d]">
            {filtrados.map(a => (
              <MobileRow
                key={a.id}
                alumno={a}
                onEdit={() => setModal(a)}
                onDelete={() => del(a.id)}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[#1d1d1d] bg-[#0a0a0a] px-5 py-2.5">
            <span className="text-[11px] text-[#444] tabular-nums">
              {filtrados.length} {filtrados.length === 1 ? 'alumno' : 'alumnos'}
              {busqueda && ` · filtrado de ${porTab.length}`}
            </span>
            {selected.size > 0 && (
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: '#D4AF37' }}>
                {selected.size} seleccionados
              </span>
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <AlumnoModal
          initial={modal === 'new' ? undefined : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}

// ─── Columna header ───────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#444]">{children}</span>
    </th>
  );
}

// ─── Fila de tabla ────────────────────────────────────────────────────────────

function TableRow({ alumno, idx, checked, onCheck, onEdit, onDelete }: {
  alumno: Alumno;
  idx: number;
  checked: boolean;
  onCheck: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isZebra = idx % 2 === 1;
  return (
    <tr
      className="border-b border-[#141414] last:border-0 transition-colors duration-75"
      style={{
        backgroundColor: checked ? 'rgba(212,175,55,0.04)' : isZebra ? '#0d0d0d' : '#0a0a0a',
      }}
      onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(212,175,55,0.05)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = checked ? 'rgba(212,175,55,0.04)' : isZebra ? '#0d0d0d' : '#0a0a0a'; }}
    >
      {/* Checkbox */}
      <td className="w-10 pl-4 pr-2 py-3">
        <input type="checkbox" checked={checked} onChange={onCheck} />
      </td>

      {/* Avatar */}
      <td className="w-10 px-2 py-3">
        <Avatar alumno={alumno} size={32} />
      </td>

      {/* Nombre */}
      <td className="px-4 py-3">
        <Link
          href={`/alumnos/${alumno.id}`}
          className="text-sm font-semibold text-[#f4f4f5] transition"
          onMouseEnter={e => (e.currentTarget.style.color = '#D4AF37')}
          onMouseLeave={e => (e.currentTarget.style.color = '#f4f4f5')}
        >
          {alumno.nombre}
        </Link>
      </td>

      {/* Apellido */}
      <td className="px-4 py-3">
        <span className="text-sm text-[#a1a1aa]">{alumno.apellido || '—'}</span>
      </td>

      {/* Email */}
      <td className="max-w-[220px] px-4 py-3">
        <span className="block truncate text-sm text-[#a1a1aa]">{alumno.email || '—'}</span>
      </td>

      {/* Estado */}
      <td className="px-4 py-3">
        <EstadoText estado={alumno.estado} />
      </td>

      {/* Acciones */}
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1.5">
          <ActionBtn
            href={`/alumnos/${alumno.id}`}
            icon={<BarChart2 className="h-3.5 w-3.5" />}
            label="Estadísticas"
            bg="rgba(34,197,94,0.12)" color="#22c55e" hoverBg="rgba(34,197,94,0.2)"
          />
          <ActionBtn
            icon={<Pencil className="h-3.5 w-3.5" />}
            label="Editar"
            bg="rgba(96,165,250,0.12)" color="#60a5fa" hoverBg="rgba(96,165,250,0.2)"
            onClick={onEdit}
          />
          <ActionBtn
            href={`/alumnos/${alumno.id}`}
            icon={<Eye className="h-3.5 w-3.5" />}
            label="Ver perfil"
            bg="rgba(161,161,170,0.08)" color="#a1a1aa" hoverBg="rgba(161,161,170,0.15)"
          />
          <ActionBtn
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Eliminar"
            bg="rgba(239,68,68,0.1)" color="#ef4444" hoverBg="rgba(239,68,68,0.18)"
            onClick={onDelete}
          />
        </div>
      </td>
    </tr>
  );
}

// ─── Botón de acción coloreado ────────────────────────────────────────────────

function ActionBtn({ href, icon, label, bg, color, hoverBg, onClick }: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  bg: string; color: string; hoverBg: string;
  onClick?: () => void;
}) {
  const style: React.CSSProperties = { background: bg, color, width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.12s' };
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

function MobileRow({ alumno, onEdit, onDelete }: {
  alumno: Alumno;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-[#0a0a0a] px-4 py-3.5 transition hover:bg-[#0d0d0d]">
      <Avatar alumno={alumno} size={38} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/alumnos/${alumno.id}`} className="text-sm font-semibold text-[#f4f4f5]">
            {alumno.nombre} {alumno.apellido}
          </Link>
          <EstadoText estado={alumno.estado} />
        </div>
        {alumno.email && (
          <p className="mt-0.5 text-xs text-[#555] truncate">{alumno.email}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <ActionBtn
          icon={<Pencil className="h-3.5 w-3.5" />}
          label="Editar"
          bg="rgba(96,165,250,0.12)" color="#60a5fa" hoverBg="rgba(96,165,250,0.2)"
          onClick={onEdit}
        />
        <ActionBtn
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Eliminar"
          bg="rgba(239,68,68,0.1)" color="#ef4444" hoverBg="rgba(239,68,68,0.18)"
          onClick={onDelete}
        />
      </div>
    </div>
  );
}
