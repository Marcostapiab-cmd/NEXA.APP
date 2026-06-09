'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Plus, Search, Pencil, Trash2, X, Save, ChevronRight } from 'lucide-react';

export interface Alumno {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  fechaNacimiento: string;
  peso: string;
  altura: string;
  foto: string;
}

const EMPTY = (): Omit<Alumno, 'id'> => ({
  nombre: '', apellido: '', email: '', fechaNacimiento: '', peso: '', altura: '', foto: '',
});

const inputCls = 'w-full rounded-lg border border-[#2a2a2a] bg-[#111111] px-3 py-2.5 text-sm text-white placeholder-[#444444] outline-none transition focus:border-white';
const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-[0.1em] text-[#888888]';

function Avatar({ alumno, size = 'md' }: { alumno: Alumno; size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: 'h-8 w-8 text-sm', md: 'h-12 w-12 text-base', lg: 'h-16 w-16 text-2xl' }[size];
  if (alumno.foto) return <img src={alumno.foto} alt="" className={`${sz} rounded-lg object-cover`} />;
  return (
    <div className={`${sz} flex items-center justify-center rounded-lg bg-[#2a2a2a] font-bold text-[#888888]`}>
      {alumno.nombre[0]?.toUpperCase() || '?'}
    </div>
  );
}

function Field({ label, value, onChange, required, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  required?: boolean; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type={type} value={value} required={required} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  );
}

function AlumnoModal({ initial, onSave, onClose }: {
  initial?: Alumno;
  onSave: (a: Omit<Alumno, 'id'>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<Alumno, 'id'>>(initial ? { ...initial } : EMPTY());
  const fileRef = useRef<HTMLInputElement>(null);

  function set(key: string, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('foto', reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2a2a2a] px-6 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-white">
            {initial ? 'Editar alumno' : 'Nuevo alumno'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#888888] transition hover:bg-[#2a2a2a] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (!form.nombre.trim()) return; onSave(form); }}
          className="space-y-4 p-6">
          <div className="flex items-center gap-4">
            <Avatar alumno={{ ...form, id: '' }} size="lg" />
            <div className="flex gap-2">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-[#888888] transition hover:border-[#444444] hover:text-white">
                Subir foto
              </button>
              {form.foto && (
                <button type="button" onClick={() => set('foto', '')}
                  className="text-xs text-red-500 transition hover:text-red-400">Quitar</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre *" value={form.nombre} onChange={(v) => set('nombre', v)} placeholder="Carlos" required />
            <Field label="Apellido" value={form.apellido} onChange={(v) => set('apellido', v)} placeholder="García" />
          </div>
          <Field label="Email" value={form.email} onChange={(v) => set('email', v)} placeholder="carlos@email.com" type="email" />
          <Field label="Fecha de nacimiento" value={form.fechaNacimiento} onChange={(v) => set('fechaNacimiento', v)} type="date" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Peso (kg)" value={form.peso} onChange={(v) => set('peso', v)} placeholder="75" />
            <Field label="Altura (cm)" value={form.altura} onChange={(v) => set('altura', v)} placeholder="175" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-[#444444] py-2.5 text-sm font-medium text-white transition hover:border-white">
              Cancelar
            </button>
            <button type="submit"
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-black transition hover:bg-[#e0e0e0]">
              <Save className="h-4 w-4" />
              {initial ? 'Guardar' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AlumnosPage() {
  const [alumnos, setAlumnos]   = useState<Alumno[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal]       = useState<'new' | Alumno | null>(null);

  useEffect(() => {
    try { const s = localStorage.getItem('nexa_alumnos'); if (s) setAlumnos(JSON.parse(s)); } catch {}
  }, []);

  function save(updated: Alumno[]) {
    setAlumnos(updated);
    localStorage.setItem('nexa_alumnos', JSON.stringify(updated));
  }

  function handleSave(data: Omit<Alumno, 'id'>) {
    if (modal === 'new') {
      save([...alumnos, { ...data, id: crypto.randomUUID() }]);
    } else if (modal && typeof modal === 'object') {
      save(alumnos.map((a) => a.id === modal.id ? { ...data, id: modal.id } : a));
    }
    setModal(null);
  }

  function del(id: string) {
    if (!confirm('¿Eliminar este alumno?')) return;
    save(alumnos.filter((a) => a.id !== id));
  }

  const filtrados = alumnos.filter((a) =>
    `${a.nombre} ${a.apellido} ${a.email}`.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <main className="mx-auto min-h-[calc(100vh-57px)] max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Alumnos</h1>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.1em] text-[#888888]">
            {alumnos.length} registrado{alumnos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#e0e0e0]">
          <Plus className="h-4 w-4" /> Nuevo alumno
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#444444]" />
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, apellido o email..."
          className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-3 pl-10 pr-4 text-sm text-white placeholder-[#444444] outline-none transition focus:border-[#444444]"
        />
      </div>

      {/* List */}
      {filtrados.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#2a2a2a] py-20 text-center">
          <p className="text-sm text-[#888888]">
            {busqueda ? 'No se encontraron alumnos.' : 'Sin alumnos. ¡Agrega el primero!'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((a) => (
            <div key={a.id} className="flex items-center gap-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4 transition hover:border-[#333333]">
              <Link href={`/alumnos/${a.id}`} className="flex flex-1 items-center gap-4 min-w-0">
                <Avatar alumno={a} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{a.nombre} {a.apellido}</p>
                  {a.email && <p className="truncate text-xs text-[#888888]">{a.email}</p>}
                  <div className="mt-1 flex gap-2 text-xs text-[#888888]">
                    {a.peso && <span>{a.peso} kg</span>}
                    {a.altura && <span>{a.altura} cm</span>}
                    {a.fechaNacimiento && (
                      <span>{new Date().getFullYear() - new Date(a.fechaNacimiento).getFullYear()} años</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#444444]" />
              </Link>
              <div className="flex flex-col gap-1.5">
                <button onClick={() => setModal(a)}
                  className="rounded-md p-1.5 text-[#888888] transition hover:bg-[#2a2a2a] hover:text-white">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => del(a.id)}
                  className="rounded-md p-1.5 text-[#444444] transition hover:bg-red-950/40 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
