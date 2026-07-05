'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Pencil, X, Save, Video, Plus, Trash2, ExternalLink } from 'lucide-react';
import {
  BIBLIOTECA_EJERCICIOS,
  getBibliotecaCustoms, saveBibliotecaCustom,
  getEjerciciosPropios, saveEjercicioPropio, deleteEjercicioPropio,
  type EjBiblioteca, type BibliotecaCustom,
} from '@/lib/ejercicios';
import VideoUrlInput from '@/components/ejercicios/VideoUrlInput';

interface EjercicioMerged extends EjBiblioteca {
  videoUrl: string;
  esPropio?: boolean;
}

// ─── Modal: Nuevo ejercicio ───────────────────────────────────────────────────

function NewExerciseModal({ onSave, onClose }: {
  onSave: (ej: EjBiblioteca) => void;
  onClose: () => void;
}) {
  const [nombre,   setNombre]   = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    onSave({
      id:       `propio-${Date.now()}`,
      nombre:   nombre.trim(),
      grupo:    '',
      videoUrl: videoUrl || undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-4 pt-16 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#141414] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2a2a2a] px-5 py-4">
          <p className="text-sm font-bold text-white">Nuevo ejercicio</p>
          <button onClick={onClose}
            className="rounded-xl border border-[#2a2a2a] p-2 text-[#555555] transition hover:border-[#444444] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="space-y-5 p-5">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#555555]">
                Nombre del ejercicio *
              </label>
              <input
                autoFocus
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Press banca plano"
                className="w-full rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white placeholder-[#444444] outline-none transition focus:border-[#D4AF37]"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#555555]">
                Link de video (opcional)
              </label>
              <VideoUrlInput value={videoUrl} onChange={setVideoUrl} />
            </div>
          </div>

          <div className="flex gap-3 border-t border-[#2a2a2a] px-5 py-4">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-[#2a2a2a] py-2.5 text-sm font-medium text-[#888888] transition hover:border-[#444444] hover:text-white">
              Cancelar
            </button>
            <button type="submit" disabled={!nombre.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] py-2.5 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-30">
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Editar ejercicio ──────────────────────────────────────────────────

function EditModal({ ejercicio, onSave, onDelete, onClose }: {
  ejercicio: EjercicioMerged;
  onSave: (id: string, videoUrl: string, nombre: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [videoUrl,      setVideoUrl]      = useState(ejercicio.videoUrl ?? '');
  const [nombre,        setNombre]        = useState(ejercicio.nombre);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onSave(ejercicio.id, videoUrl, nombre.trim() || ejercicio.nombre);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-4 pt-16 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#141414] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#2a2a2a] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-white">{ejercicio.nombre}</p>
              {ejercicio.esPropio && (
                <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/8 px-1.5 py-0.5 text-[9px] font-bold text-[#D4AF37]">
                  PROPIO
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-[#444444]">Editar ejercicio</p>
          </div>
          <button onClick={onClose}
            className="rounded-xl border border-[#2a2a2a] p-2 text-[#555555] transition hover:border-[#444444] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="space-y-4 p-5">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#555555]">
                Nombre del ejercicio
              </label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                className="w-full rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2.5 text-sm text-white placeholder-[#444444] outline-none transition focus:border-[#D4AF37]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#555555]">
                Link de video (YouTube, Instagram, Vimeo...)
              </label>
              <VideoUrlInput value={videoUrl} onChange={setVideoUrl} />
            </div>
          </div>

          <div className="space-y-2 border-t border-[#2a2a2a] px-5 py-4">
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-xl border border-[#2a2a2a] py-2.5 text-sm font-medium text-[#888888] transition hover:border-[#444444] hover:text-white">
                Cancelar
              </button>
              <button type="submit"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] py-2.5 text-sm font-bold text-black transition hover:brightness-110">
                <Save className="h-4 w-4" />
                Guardar
              </button>
            </div>

            {onDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-2 rounded-xl border border-red-900/40 bg-red-950/20 p-3">
                  <p className="flex-1 text-xs text-red-400">¿Eliminar este ejercicio?</p>
                  <button type="button" onClick={() => setConfirmDelete(false)}
                    className="text-xs text-[#555555] transition hover:text-white">
                    No
                  </button>
                  <button type="button" onClick={() => { onDelete(); onClose(); }}
                    className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white transition hover:bg-red-500">
                    Sí, eliminar
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center justify-center gap-1.5 py-1.5 text-[11px] text-[#333333] transition hover:text-red-500">
                  <Trash2 className="h-3 w-3" />
                  Eliminar ejercicio
                </button>
              )
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BibliotecaPage() {
  const [busqueda,     setBusqueda]     = useState('');
  const [customs,      setCustoms]      = useState<Record<string, BibliotecaCustom>>({});
  const [propios,      setPropios]      = useState<EjBiblioteca[]>([]);
  const [editando,     setEditando]     = useState<EjercicioMerged | null>(null);
  const [showNew,      setShowNew]      = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  function loadData() {
    setCustoms(getBibliotecaCustoms());
    setPropios(getEjerciciosPropios());
  }

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleSaveVideo(id: string, videoUrl: string, nombre: string) {
    const isPropio = propios.some(e => e.id === id);
    if (isPropio) {
      const base = propios.find(e => e.id === id)!;
      saveEjercicioPropio({ ...base, nombre, videoUrl: videoUrl || undefined });
    } else {
      const existing = getBibliotecaCustoms()[id] ?? {};
      saveBibliotecaCustom(id, { ...existing, videoUrl, nombre });
    }
    loadData();
  }

  function handleDelete(id: string) {
    deleteEjercicioPropio(id);
    loadData();
  }

  function handleNew(ej: EjBiblioteca) {
    saveEjercicioPropio(ej);
    loadData();
  }

  const baseConCustom: EjercicioMerged[] = BIBLIOTECA_EJERCICIOS.map(e => ({
    ...e,
    nombre: customs[e.id]?.nombre ?? e.nombre,
    videoUrl: customs[e.id]?.videoUrl ?? e.videoUrl ?? '',
    esPropio: false,
  }));

  const propiosMerged: EjercicioMerged[] = propios.map(e => ({
    ...e,
    videoUrl: e.videoUrl ?? '',
    esPropio: true,
  }));

  const merged = [...baseConCustom, ...propiosMerged];

  const filtrados = busqueda.trim()
    ? merged.filter(e => e.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : merged;

  const autocomplete = busqueda.trim().length >= 1
    ? merged.filter(e => e.nombre.toLowerCase().includes(busqueda.toLowerCase())).slice(0, 8)
    : [];

  const totalConVideo = merged.filter(e => e.videoUrl?.trim()).length;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Biblioteca</h1>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[#444444]">
            {merged.length} ejercicios · {totalConVideo} con video
            {propios.length > 0 && ` · ${propios.length} propio${propios.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-[12px] font-bold text-black transition hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo ejercicio
        </button>
      </div>

      {/* Search */}
      <div ref={searchWrapRef} className="relative mb-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#444444]" />
        <input
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setShowDropdown(true); }}
          onFocus={() => { if (busqueda) setShowDropdown(true); }}
          placeholder="Buscar ejercicio..."
          className="w-full rounded-xl border border-[#2a2a2a] bg-[#111111] py-3 pl-10 pr-10 text-sm text-white placeholder-[#444444] outline-none transition focus:border-[#D4AF37]/50"
        />
        {busqueda && (
          <button
            onClick={() => { setBusqueda(''); setShowDropdown(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444444] transition hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Autocomplete dropdown */}
        {showDropdown && autocomplete.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#141414] shadow-2xl">
            {autocomplete.map(ej => (
              <button
                key={ej.id}
                onClick={() => { setEditando(ej); setShowDropdown(false); }}
                className="flex w-full items-center gap-3 border-b border-[#1a1a1a] px-4 py-3 text-left transition last:border-none hover:bg-[#1e1e1e]"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-white">{ej.nombre}</span>
                {ej.esPropio && (
                  <span className="shrink-0 rounded-full border border-[#D4AF37]/25 px-1.5 py-0.5 text-[9px] font-bold text-[#D4AF37]">
                    PROPIO
                  </span>
                )}
                {ej.videoUrl?.trim()
                  ? <Video className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />
                  : <span className="shrink-0 text-[10px] text-[#333333]">Sin video</span>
                }
              </button>
            ))}
            <div className="border-t border-[#1a1a1a] px-4 py-2">
              <p className="text-[10px] text-[#333333]">
                {autocomplete.length} resultado{autocomplete.length !== 1 ? 's' : ''} · Click para agregar video
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Results info */}
      {busqueda && (
        <p className="mb-3 text-[11px] text-[#444444]">
          {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''} para{' '}
          <span className="text-[#888888]">"{busqueda}"</span>
        </p>
      )}

      {/* Table */}
      {filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2a2a2a] py-20 text-center">
          <p className="text-sm text-[#444444]">No se encontraron ejercicios.</p>
          <button onClick={() => setBusqueda('')}
            className="mt-2 text-xs text-[#D4AF37] transition hover:underline">
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#1e1e1e]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1e1e1e] bg-[#0d0d0d]">
                <th className="w-8 px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.14em] text-[#2a2a2a]">#</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.14em] text-[#333333]">Ejercicio</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.14em] text-[#333333]">Video</th>
                <th className="w-10 pr-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((ej, idx) => {
                const hasVideo = !!ej.videoUrl?.trim();
                const isEven   = idx % 2 === 0;

                return (
                  <tr
                    key={ej.id}
                    className="group border-b border-[#111111] transition-colors last:border-none hover:bg-[#161616]"
                    style={{ backgroundColor: isEven ? '#0d0d0d' : '#0a0a0a' }}
                  >
                    {/* # */}
                    <td className="px-4 py-3.5 text-[11px] font-mono text-[#2a2a2a]">{idx + 1}</td>

                    {/* Nombre */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{ej.nombre}</span>
                        {ej.esPropio && (
                          <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/5 px-1.5 py-0.5 text-[9px] font-bold text-[#D4AF37]">
                            PROPIO
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Video */}
                    <td className="px-4 py-3.5">
                      {hasVideo ? (
                        <a
                          href={ej.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-[12px] text-[#D4AF37] transition hover:underline"
                        >
                          <Video className="h-3 w-3 shrink-0" />
                          Ver video
                          <ExternalLink className="h-2.5 w-2.5 opacity-40" />
                        </a>
                      ) : (
                        <button
                          onClick={() => setEditando(ej)}
                          className="text-[12px] text-[#333333] transition hover:text-[#888888]"
                        >
                          + Agregar video
                        </button>
                      )}
                    </td>

                    {/* Edit */}
                    <td className="pr-3 py-3.5 text-right">
                      <button
                        onClick={() => setEditando(ej)}
                        className="rounded-lg p-1.5 text-[#333333] opacity-0 transition group-hover:opacity-100 hover:bg-[#222222] hover:text-[#888888]"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer */}
          <div className="border-t border-[#111111] bg-[#0d0d0d] px-4 py-2.5">
            <p className="text-[10px] text-[#2a2a2a]">
              {filtrados.length} ejercicio{filtrados.length !== 1 ? 's' : ''}
              {busqueda && ` de ${merged.length} total`}
            </p>
          </div>
        </div>
      )}

      {/* Modals */}
      {showNew && (
        <NewExerciseModal onSave={handleNew} onClose={() => setShowNew(false)} />
      )}

      {editando && (
        <EditModal
          ejercicio={editando}
          onSave={handleSaveVideo}
          onDelete={editando.esPropio ? () => handleDelete(editando.id) : undefined}
          onClose={() => setEditando(null)}
        />
      )}
    </main>
  );
}
