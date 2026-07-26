'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Pencil, X, Save, Video, Plus, Trash2, ExternalLink, Upload, Loader2 } from 'lucide-react';
import {
  BIBLIOTECA_EJERCICIOS,
  getBibliotecaCustoms, saveBibliotecaCustom,
  getEjerciciosPropios, saveEjercicioPropio, deleteEjercicioPropio,
  type EjBiblioteca, type BibliotecaCustom,
} from '@/lib/ejercicios';
import {
  getEjerciciosPropiosDB, saveEjercicioPropiooDB, deleteEjercicioPropiooDB,
  getBibliotecaCustomsDB, saveBibliotecaCustomDB,
  uploadEjercicioVideo, deleteEjercicioVideo,
} from '@/lib/ejercicios-supabase';
import { getRutinasDB } from '@/lib/rutinas-supabase';
import VideoUrlInput from '@/components/ejercicios/VideoUrlInput';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

interface EjercicioMerged extends EjBiblioteca {
  videoUrl: string;
  esPropio?: boolean;
}

// ─── Modal: Nuevo ejercicio ───────────────────────────────────────────────────

function NewExerciseModal({ onSave, onClose }: {
  onSave: (ej: EjBiblioteca) => Promise<void>;
  onClose: () => void;
}) {
  const [nombre,  setNombre]  = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [saving,   setSaving]  = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id:       `propio-${Date.now()}`,
        nombre:   nombre.trim(),
        grupo:    '',
        videoUrl: videoUrl || undefined,
      });
      onClose();
    } catch {
      setSaving(false);
      alert('Error al guardar el ejercicio. Intenta de nuevo.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-4 pt-16 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#CACACA] bg-[#EBEBEB] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#CACACA] px-5 py-4">
          <p className="text-sm font-bold text-[#121212]">Nuevo ejercicio</p>
          <button onClick={onClose}
            className="rounded-xl border border-[#CACACA] p-2 text-[#777777] transition hover:border-[#888888] hover:text-[#121212]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="space-y-5 p-5">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]">
                Nombre del ejercicio *
              </label>
              <input
                autoFocus
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Press banca plano"
                className="w-full rounded-xl border border-[#CACACA] bg-[#F8F8F8] px-3 py-2.5 text-sm text-[#121212] placeholder-[#888888] outline-none transition focus:border-[#121212]"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]">
                Link de video (opcional)
              </label>
              <VideoUrlInput value={videoUrl} onChange={setVideoUrl} />
            </div>
          </div>

          <div className="flex gap-3 border-t border-[#CACACA] px-5 py-4">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-[#CACACA] py-2.5 text-sm font-medium text-[#5E5E5E] transition hover:border-[#888888] hover:text-[#121212]">
              Cancelar
            </button>
            <button type="submit" disabled={!nombre.trim() || saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#121212] py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-30">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Guardando…' : 'Agregar'}
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
  onSave: (id: string, videoUrl: string, nombre: string, videoFile?: File) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [videoTab,      setVideoTab]      = useState<'link' | 'archivo'>('link');
  const [videoUrl,      setVideoUrl]      = useState(ejercicio.videoUrl ?? '');
  const [videoFile,     setVideoFile]     = useState<File | null>(null);
  const [fileError,     setFileError]     = useState('');
  const [nombre,        setNombre]        = useState(ejercicio.nombre);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving,        setSaving]        = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setFileError('El archivo supera el límite de 50 MB.');
      return;
    }
    setFileError('');
    setVideoFile(f);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(
        ejercicio.id,
        videoTab === 'link' ? videoUrl : '',
        nombre.trim() || ejercicio.nombre,
        videoTab === 'archivo' ? (videoFile ?? undefined) : undefined,
      );
      onClose();
    } catch (err) {
      setSaving(false);
      alert('Error al guardar: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 p-4 pt-16 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#CACACA] bg-[#EBEBEB] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#CACACA] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-[#121212]">{ejercicio.nombre}</p>
              {ejercicio.esPropio && (
                <span className="rounded-full border border-[#121212]/20 bg-[#121212]/6 px-1.5 py-0.5 text-[9px] font-bold text-[#121212]">
                  PROPIO
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-[#888888]">Editar ejercicio</p>
          </div>
          <button onClick={onClose}
            className="rounded-xl border border-[#CACACA] p-2 text-[#777777] transition hover:border-[#888888] hover:text-[#121212]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="space-y-4 p-5">
            {/* Nombre */}
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]">
                Nombre del ejercicio
              </label>
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                className="w-full rounded-xl border border-[#CACACA] bg-[#F8F8F8] px-3 py-2.5 text-sm text-[#121212] placeholder-[#888888] outline-none transition focus:border-[#121212]"
              />
            </div>

            {/* Video: tabs */}
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]">
                Video
              </label>

              <div className="mb-2.5 flex overflow-hidden rounded-xl border border-[#CACACA]">
                <button
                  type="button"
                  onClick={() => { setVideoTab('link'); setVideoFile(null); setFileError(''); }}
                  className={`flex-1 py-2 text-[11px] font-bold transition ${
                    videoTab === 'link'
                      ? 'bg-[#121212] text-white'
                      : 'bg-[#F5F5F5] text-[#777777] hover:bg-[#E8E8E8]'
                  }`}
                >
                  Link (YouTube, Instagram…)
                </button>
                <button
                  type="button"
                  onClick={() => setVideoTab('archivo')}
                  className={`flex-1 py-2 text-[11px] font-bold transition ${
                    videoTab === 'archivo'
                      ? 'bg-[#121212] text-white'
                      : 'bg-[#F5F5F5] text-[#777777] hover:bg-[#E8E8E8]'
                  }`}
                >
                  Subir archivo
                </button>
              </div>

              {videoTab === 'link' ? (
                <VideoUrlInput value={videoUrl} onChange={setVideoUrl} />
              ) : (
                <div>
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {videoFile ? (
                    <div className="flex items-center gap-2 rounded-xl border border-[#CACACA] bg-[#F8F8F8] px-3 py-2.5">
                      <Video className="h-4 w-4 shrink-0 text-[#121212]" />
                      <span className="flex-1 truncate text-sm text-[#121212]">{videoFile.name}</span>
                      <button type="button" onClick={() => { setVideoFile(null); setFileError(''); }}>
                        <X className="h-4 w-4 text-[#888888] transition hover:text-[#121212]" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#CACACA] bg-[#F8F8F8] px-3 py-6 text-sm text-[#777777] transition hover:border-[#888888] hover:bg-[#F0F0F0] hover:text-[#5E5E5E]"
                    >
                      <Upload className="h-4 w-4" />
                      Seleccionar video (MP4, MOV, WebM · máx. 50 MB)
                    </button>
                  )}
                  {fileError && (
                    <p className="mt-1.5 text-[11px] text-red-500">{fileError}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 border-t border-[#CACACA] px-5 py-4">
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-xl border border-[#CACACA] py-2.5 text-sm font-medium text-[#5E5E5E] transition hover:border-[#888888] hover:text-[#121212]">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || (videoTab === 'archivo' && !!fileError)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#121212] py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {videoTab === 'archivo' && videoFile ? 'Subiendo…' : 'Guardando…'}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Guardar
                  </>
                )}
              </button>
            </div>

            {onDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-2 rounded-xl border border-[#B44040]/20 bg-[#FAEAEA] p-3">
                  <p className="flex-1 text-xs text-[#B44040]">¿Eliminar este ejercicio?</p>
                  <button type="button" onClick={() => setConfirmDelete(false)}
                    className="text-xs text-[#777777] transition hover:text-[#121212]">
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete()}
                    className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white transition hover:bg-red-500"
                  >
                    Sí, eliminar
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center justify-center gap-1.5 py-1.5 text-[11px] text-[#9B9B9B] transition hover:text-red-500">
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
  const [loading,      setLoading]      = useState(true);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  function syncLocal(updatedPropios: EjBiblioteca[], updatedCustoms: Record<string, BibliotecaCustom>) {
    try {
      localStorage.setItem('nexa_ejercicios_propios', JSON.stringify(updatedPropios));
      localStorage.setItem('nexa_biblioteca_custom',  JSON.stringify(updatedCustoms));
    } catch { /* ignore */ }
  }

  async function loadData() {
    try {
      const [dbPropios, dbCustoms] = await Promise.all([
        getEjerciciosPropiosDB(),
        getBibliotecaCustomsDB(),
      ]);

      setPropios(dbPropios);

      // Migración one-time: si DB está vacía pero localStorage tiene datos, migrar
      if (Object.keys(dbCustoms).length === 0) {
        const localCustoms = getBibliotecaCustoms();
        if (Object.keys(localCustoms).length > 0) {
          await Promise.allSettled(
            Object.entries(localCustoms).map(([id, c]) => saveBibliotecaCustomDB(id, c)),
          );
          const fresh = await getBibliotecaCustomsDB().catch(() => localCustoms);
          setCustoms(fresh);
          syncLocal(dbPropios, fresh);
          return;
        }
      }

      setCustoms(dbCustoms);
      syncLocal(dbPropios, dbCustoms);
    } catch {
      // Supabase no disponible → usar localStorage
      setPropios(getEjerciciosPropios());
      setCustoms(getBibliotecaCustoms());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function handleSave(id: string, videoUrl: string, nombre: string, videoFile?: File) {
    const isPropio = propios.some(e => e.id === id);

    let finalVideoUrl  = videoUrl;
    let finalVideoPath: string | undefined;

    if (videoFile) {
      const { path, url } = await uploadEjercicioVideo(id, videoFile);
      finalVideoUrl  = url;
      finalVideoPath = path;
    }

    if (isPropio) {
      const base    = propios.find(e => e.id === id)!;
      const updated = {
        ...base,
        nombre,
        videoUrl:  finalVideoUrl  || undefined,
        videoPath: finalVideoPath ?? (videoFile ? undefined : base.videoPath),
      };
      await saveEjercicioPropiooDB(updated);
    } else {
      const existing = customs[id] ?? {};
      const custom: BibliotecaCustom = {
        ...existing,
        nombre,
        videoUrl:  finalVideoUrl  || undefined,
        videoPath: finalVideoPath ?? (videoFile ? undefined : existing.videoPath),
      };
      await saveBibliotecaCustomDB(id, custom);
    }

    await loadData();
  }

  async function handleDelete(id: string) {
    // Verificar si el ejercicio está en uso en alguna rutina
    try {
      const rutinas = await getRutinasDB();
      let usedCount = 0;
      for (const r of rutinas) {
        const sessions = r.sessions as Record<string, { exercises?: Array<{ exerciseLibraryId?: string }> }>;
        for (const s of Object.values(sessions)) {
          usedCount += (s.exercises ?? []).filter(e => e.exerciseLibraryId === id).length;
        }
      }
      if (usedCount > 0) {
        const ok = confirm(
          `Este ejercicio aparece ${usedCount} vece${usedCount !== 1 ? 's' : ''} en rutinas activas.\n¿Eliminarlo de todas formas? (las rutinas ya creadas no se modifican)`,
        );
        if (!ok) return;
      }
    } catch { /* si falla la comprobación, continuar */ }

    // Borrar video de Storage si existe
    const propio = propios.find(e => e.id === id);
    if (propio?.videoPath) {
      await deleteEjercicioVideo(propio.videoPath).catch(() => {});
    }

    await deleteEjercicioPropiooDB(id);
    setEditando(null);
    await loadData();
  }

  async function handleNew(ej: EjBiblioteca) {
    await saveEjercicioPropiooDB(ej);
    await loadData();
  }

  const baseConCustom: EjercicioMerged[] = BIBLIOTECA_EJERCICIOS.map(e => ({
    ...e,
    nombre:   customs[e.id]?.nombre   ?? e.nombre,
    videoUrl: customs[e.id]?.videoUrl ?? e.videoUrl ?? '',
    esPropio: false,
  }));

  const propiosMerged: EjercicioMerged[] = propios.map(e => ({
    ...e,
    videoUrl: e.videoUrl ?? '',
    esPropio: true,
  }));

  const merged   = [...baseConCustom, ...propiosMerged];
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
          <h1 className="text-xl font-bold tracking-tight text-[#121212]">Biblioteca</h1>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[#888888]">
            {merged.length} ejercicios · {totalConVideo} con video
            {propios.length > 0 && ` · ${propios.length} propio${propios.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[#121212] px-4 py-2.5 text-[12px] font-bold text-white transition hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo ejercicio
        </button>
      </div>

      {/* Search */}
      <div ref={searchWrapRef} className="relative mb-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888888]" />
        <input
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setShowDropdown(true); }}
          onFocus={() => { if (busqueda) setShowDropdown(true); }}
          placeholder="Buscar ejercicio..."
          className="w-full rounded-xl border border-[#CACACA] bg-[#F0F0F0] py-3 pl-10 pr-10 text-sm text-[#121212] placeholder-[#888888] outline-none transition focus:border-[#121212]/50"
        />
        {busqueda && (
          <button
            onClick={() => { setBusqueda(''); setShowDropdown(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888888] transition hover:text-[#121212]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Autocomplete dropdown */}
        {showDropdown && autocomplete.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-[#CACACA] bg-[#EBEBEB] shadow-2xl">
            {autocomplete.map(ej => (
              <button
                key={ej.id}
                onClick={() => { setEditando(ej); setShowDropdown(false); }}
                className="flex w-full items-center gap-3 border-b border-[#E0E0E0] px-4 py-3 text-left transition last:border-none hover:bg-[#E0E0E0]"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-[#121212]">{ej.nombre}</span>
                {ej.esPropio && (
                  <span className="shrink-0 rounded-full border border-[#121212]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#121212]">
                    PROPIO
                  </span>
                )}
                {ej.videoUrl?.trim()
                  ? <Video className="h-3.5 w-3.5 shrink-0 text-[#121212]" />
                  : <span className="shrink-0 text-[10px] text-[#9B9B9B]">Sin video</span>
                }
              </button>
            ))}
            <div className="border-t border-[#E0E0E0] px-4 py-2">
              <p className="text-[10px] text-[#9B9B9B]">
                {autocomplete.length} resultado{autocomplete.length !== 1 ? 's' : ''} · Click para editar
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Results info */}
      {busqueda && (
        <p className="mb-3 text-[11px] text-[#888888]">
          {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''} para{' '}
          <span className="text-[#5E5E5E]">"{busqueda}"</span>
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-10 text-center text-sm text-[#888888]">Cargando ejercicios...</div>
      )}

      {/* Table */}
      {!loading && (filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#CACACA] py-20 text-center">
          <p className="text-sm text-[#888888]">No se encontraron ejercicios.</p>
          <button onClick={() => setBusqueda('')}
            className="mt-2 text-xs text-[#121212] transition hover:underline">
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#D8D8D8]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#D8D8D8] bg-[#F5F5F5]">
                <th className="w-8 px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.14em] text-[#AAAAAA]">#</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.14em] text-[#9B9B9B]">Ejercicio</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.14em] text-[#9B9B9B]">Video</th>
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
                    className="group border-b border-[#E8E8E8] transition-colors last:border-none hover:bg-[#E4E4E4]"
                    style={{ backgroundColor: isEven ? '#F5F5F5' : '#F8F8F8' }}
                  >
                    {/* # */}
                    <td className="px-4 py-3.5 text-[11px] font-mono text-[#AAAAAA]">{idx + 1}</td>

                    {/* Nombre */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#121212]">{ej.nombre}</span>
                        {ej.esPropio && (
                          <span className="rounded-full border border-[#121212]/20 bg-[#121212]/6 px-1.5 py-0.5 text-[9px] font-bold text-[#121212]">
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
                          className="flex items-center gap-1.5 text-[12px] text-[#121212] transition hover:underline"
                        >
                          <Video className="h-3 w-3 shrink-0" />
                          Ver video
                          <ExternalLink className="h-2.5 w-2.5 opacity-40" />
                        </a>
                      ) : (
                        <button
                          onClick={() => setEditando(ej)}
                          className="text-[12px] text-[#9B9B9B] transition hover:text-[#5E5E5E]"
                        >
                          + Agregar video
                        </button>
                      )}
                    </td>

                    {/* Edit */}
                    <td className="pr-3 py-3.5 text-right">
                      <button
                        onClick={() => setEditando(ej)}
                        className="rounded-lg p-1.5 text-[#9B9B9B] opacity-0 transition group-hover:opacity-100 hover:bg-[#D8D8D8] hover:text-[#5E5E5E]"
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
          <div className="border-t border-[#E8E8E8] bg-[#F5F5F5] px-4 py-2.5">
            <p className="text-[10px] text-[#AAAAAA]">
              {filtrados.length} ejercicio{filtrados.length !== 1 ? 's' : ''}
              {busqueda && ` de ${merged.length} total`}
            </p>
          </div>
        </div>
      ))}

      {/* Modals */}
      {showNew && (
        <NewExerciseModal onSave={handleNew} onClose={() => setShowNew(false)} />
      )}

      {editando && (
        <EditModal
          ejercicio={editando}
          onSave={handleSave}
          onDelete={editando.esPropio ? () => handleDelete(editando.id) : undefined}
          onClose={() => setEditando(null)}
        />
      )}
    </main>
  );
}
