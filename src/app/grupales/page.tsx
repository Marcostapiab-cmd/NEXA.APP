'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Calendar, CheckCircle2, XCircle, Clock, RefreshCw, UserCircle, CreditCard, Plus, Pencil, Trash2, Star, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { clp, DIAS_LARGO, MESES_LARGO, MESES_CORTO } from '@/lib/format';

// ── Tipos para alumnos grupales ──────────────────────────────

interface GrupalesAlumno {
  id:        string;
  nombre:    string;
  apellido:  string;
  email:     string;
  telefono:  string | null;
  rut:       string | null;
  creado_en: string;
}

interface GrupalesCompra {
  id:               string;
  alumno_id:        string;
  clases_totales:   number;
  clases_restantes: number;
  clases_usadas:    number;
  fecha_expira:     string;
  estado_pago:      string;
  monto_clp:        number;
  grupales_packs:   { nombre: string }[] | null;
}


function AlumnosGrupalesTab() {
  const [alumnos,  setAlumnos]  = useState<GrupalesAlumno[]>([]);
  const [compras,  setCompras]  = useState<GrupalesCompra[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const cargarAlumnos = useCallback(async () => {
    setLoading(true);
    const [{ data: als }, { data: comps }] = await Promise.all([
      supabase.from('grupales_alumnos').select('*').order('creado_en', { ascending: false }),
      supabase.from('grupales_compras')
        .select('id, alumno_id, clases_totales, clases_restantes, clases_usadas, fecha_expira, estado_pago, monto_clp, grupales_packs(nombre)')
        .order('creado_en', { ascending: false }),
    ]);
    setAlumnos((als ?? []) as GrupalesAlumno[]);
    setCompras((comps ?? []) as GrupalesCompra[]);
    setLoading(false);
  }, []);

  useEffect(() => { cargarAlumnos(); }, [cargarAlumnos]);

  const now = new Date();

  function comprasAlumno(id: string) {
    return compras.filter(c => c.alumno_id === id);
  }

  function saldoActivo(id: string) {
    return comprasAlumno(id)
      .filter(c => c.estado_pago === 'pagado' && new Date(c.fecha_expira) > now)
      .reduce((a, c) => a + c.clases_restantes, 0);
  }

  function diasHasta(iso: string) {
    const dias = Math.ceil((new Date(iso).getTime() - now.getTime()) / 86400000);
    return dias <= 0 ? 'Vencido' : `${dias}d`;
  }

  function formatFecha(iso: string) {
    const d = new Date(iso);
    return `${d.getDate()} ${MESES_CORTO[d.getMonth()]} ${d.getFullYear()}`;
  }

  const alumnoSeleccionado = alumnos.find(a => a.id === selected);
  const comprasSeleccionado = selected ? comprasAlumno(selected) : [];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
          style={{ color: 'var(--nexa-muted)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {alumnos.length === 0 && (
        <div className="rounded-2xl py-16 text-center"
          style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
          <UserCircle size={32} className="mx-auto mb-3" style={{ color: 'var(--nexa-faint)' }} />
          <p className="text-[14px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
            Sin alumnos grupales registrados
          </p>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
            Los alumnos que se registren en el portal grupal aparecerán aquí.
          </p>
        </div>
      )}

      {/* Lista de alumnos */}
      {alumnos.length > 0 && (
        <div className="overflow-hidden rounded-2xl"
          style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
          <div className="divide-y" style={{ borderColor: 'var(--nexa-border)' }}>
            {alumnos.map(al => {
              const saldo = saldoActivo(al.id);
              const compsAl = comprasAlumno(al.id);
              const compraActiva = compsAl.find(c => c.estado_pago === 'pagado' && new Date(c.fecha_expira) > now);
              return (
                <button key={al.id}
                  onClick={() => setSelected(selected === al.id ? null : al.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:opacity-80"
                  style={{ background: selected === al.id ? 'var(--nexa-card-alt)' : 'transparent' }}>

                  {/* Avatar */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-black"
                    style={{ background: 'var(--nexa-card-alt)', color: 'var(--nexa-text-sub)' }}>
                    {al.nombre[0]?.toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--nexa-text)' }}>
                      {al.nombre} {al.apellido}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--nexa-muted)' }}>{al.email}</p>
                  </div>

                  {/* Saldo */}
                  <div className="shrink-0 text-right">
                    <p className="text-[15px] font-black" style={{
                      color: saldo > 0 ? 'var(--nexa-text)' : 'var(--nexa-faint)'
                    }}>
                      {saldo}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--nexa-muted)' }}>
                      {saldo === 1 ? 'clase' : 'clases'}
                    </p>
                  </div>

                  {/* Vencimiento */}
                  {compraActiva && (
                    <div className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: new Date(compraActiva.fecha_expira) < new Date(Date.now() + 7 * 86400000)
                          ? 'var(--nexa-warning-bg)' : 'var(--nexa-success-bg)',
                        color: new Date(compraActiva.fecha_expira) < new Date(Date.now() + 7 * 86400000)
                          ? 'var(--nexa-warning)' : 'var(--nexa-success)',
                      }}>
                      {diasHasta(compraActiva.fecha_expira)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Detalle del alumno seleccionado */}
      {alumnoSeleccionado && (
        <div className="overflow-hidden rounded-2xl"
          style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--nexa-border)' }}>
            <p className="text-[13px] font-black" style={{ color: 'var(--nexa-text)' }}>
              {alumnoSeleccionado.nombre} {alumnoSeleccionado.apellido} — Historial de packs
            </p>
            <div className="mt-1 flex gap-3 text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
              {alumnoSeleccionado.telefono && <span>📞 {alumnoSeleccionado.telefono}</span>}
              {alumnoSeleccionado.rut      && <span>ID {alumnoSeleccionado.rut}</span>}
              <span>Registrado {formatFecha(alumnoSeleccionado.creado_en)}</span>
            </div>
          </div>

          {comprasSeleccionado.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <CreditCard size={24} className="mx-auto mb-2" style={{ color: 'var(--nexa-faint)' }} />
              <p className="text-[12px]" style={{ color: 'var(--nexa-muted)' }}>Sin compras registradas</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--nexa-border)' }}>
              {comprasSeleccionado.map(comp => {
                const vencido = new Date(comp.fecha_expira) < now;
                return (
                  <div key={comp.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--nexa-text)' }}>
                        {comp.grupales_packs?.[0]?.nombre ?? 'Pack'} — {comp.monto_clp.toLocaleString('es-CL')} CLP
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                        Vence {formatFecha(comp.fecha_expira)} · {comp.clases_usadas}/{comp.clases_totales} usadas
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[16px] font-black" style={{
                        color: comp.clases_restantes > 0 && !vencido ? 'var(--nexa-success)' : 'var(--nexa-faint)'
                      }}>
                        {comp.clases_restantes}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--nexa-muted)' }}>restantes</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={comp.estado_pago === 'pagado'
                        ? (vencido ? { background: 'var(--nexa-card-alt)', color: 'var(--nexa-faint)' }
                                   : { background: 'var(--nexa-success-bg)', color: 'var(--nexa-success)' })
                        : { background: 'var(--nexa-warning-bg)', color: 'var(--nexa-warning)' }
                      }>
                      {comp.estado_pago === 'pagado' ? (vencido ? 'Vencido' : 'Activo') : comp.estado_pago}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type AtletaFila = {
  nombre: string;
  apellido: string;
  telefono: string | null;
  email: string | null;
  rut: string | null;
};

interface Reserva {
  id: number;
  fecha: string;
  hora: string;
  estado: string;
  descripcion: string | null;
  atletas: AtletaFila[];
}

interface ClaseInfo {
  nombre: string;
  hora: string;
  dia_semana: number;
  capacidad: number;
}

interface SesionAgrupada {
  fecha: string;
  hora: string;
  nombre: string;
  capacidad: number;
  reservas: Reserva[];
}

const ESTADO_CFG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  pendiente:        { label: 'Pendiente',  color: '#d97706', bg: '#fffbeb', Icon: Clock        },
  presente:         { label: 'Presente',   color: '#16a34a', bg: '#f0fdf4', Icon: CheckCircle2 },
  no_show:          { label: 'No asistió', color: '#dc2626', bg: '#fef2f2', Icon: XCircle      },
  cancelada_tiempo: { label: 'Cancelada',  color: '#9B9B9B', bg: '#f9fafb', Icon: XCircle      },
  cancelada_tarde:  { label: 'Cancelada',  color: '#dc2626', bg: '#fef2f2', Icon: XCircle      },
  cancelada_nexa:   { label: 'Cancelada',  color: '#9B9B9B', bg: '#f9fafb', Icon: XCircle      },
};

function formatFecha(fecha: string) {
  const d = new Date(fecha + 'T12:00:00');
  return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`;
}

function CupoBar({ inscritos, capacidad }: { inscritos: number; capacidad: number }) {
  const pct  = capacidad > 0 ? Math.min(100, (inscritos / capacidad) * 100) : 0;
  const lleno = inscritos >= capacidad;
  const casi  = pct >= 75;
  const color = lleno ? '#dc2626' : casi ? '#d97706' : '#16a34a';
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-24 rounded-full overflow-hidden" style={{ background: 'var(--nexa-border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[12px] font-black" style={{ color }}>
        {inscritos}/{capacidad}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>cupos</span>
    </div>
  );
}

// ── Planes tab ───────────────────────────────────────────────────────────────

interface Plan {
  id:           string;
  nombre:       string;
  descripcion:  string | null;
  precio_clp:   number;
  num_clases:   number;
  validez_dias: number;
  destacado:    boolean;
  orden:        number;
  activo:       boolean;
}

const PLAN_VACIO: Omit<Plan, 'id'> = {
  nombre: '', descripcion: '', precio_clp: 0,
  num_clases: 1, validez_dias: 7, destacado: false, orden: 0, activo: true,
};


function PlanInput({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  const isNumeric = type === 'number';
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.1em]"
        style={{ color: 'var(--nexa-muted)' }}>{label}</label>
      <input type="text" inputMode={isNumeric ? 'numeric' : undefined}
        pattern={isNumeric ? '[0-9]*' : undefined}
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none transition"
        style={{ background: 'var(--nexa-surface)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }} />
    </div>
  );
}

function PlanesTab() {
  const [planes,   setPlanes]   = useState<Plan[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(false);
  const [editando, setEditando] = useState<Plan | null>(null);
  const [form,     setForm]     = useState<Omit<Plan, 'id'>>(PLAN_VACIO);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('planes_grupales').select('*').order('orden').order('created_at');
    setPlanes((data ?? []) as Plan[]);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() { setEditando(null); setForm(PLAN_VACIO); setModal(true); }
  function abrirEditar(p: Plan) {
    setEditando(p);
    setForm({ nombre: p.nombre, descripcion: p.descripcion ?? '', precio_clp: p.precio_clp,
              num_clases: p.num_clases, validez_dias: p.validez_dias,
              destacado: p.destacado, orden: p.orden, activo: p.activo });
    setModal(true);
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.precio_clp) return;
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(), descripcion: form.descripcion?.trim() || null,
        precio_clp: Number(form.precio_clp), num_clases: Number(form.num_clases),
        validez_dias: Number(form.validez_dias), destacado: form.destacado,
        orden: Number(form.orden), activo: form.activo,
      };
      const { error } = editando
        ? await supabase.from('planes_grupales').update(payload).eq('id', editando.id)
        : await supabase.from('planes_grupales').insert(payload);
      if (error) throw error;
      setModal(false);
      cargar();
    } catch (e: unknown) {
      alert(`Error al guardar el plan: ${e instanceof Error ? e.message : 'intenta de nuevo.'}`);
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(id: string) {
    setDeleting(id);
    try {
      const { error } = await supabase.from('planes_grupales').update({ activo: false }).eq('id', id);
      if (error) throw error;
      cargar();
    } catch (e: unknown) {
      alert(`Error al eliminar el plan: ${e instanceof Error ? e.message : 'intenta de nuevo.'}`);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
          Paquetes que ven los alumnos en el portal grupal
        </p>
        <div className="flex gap-2">
          <button onClick={cargar} className="rounded-lg p-2 transition"
            style={{ border: '1px solid var(--nexa-border)', color: 'var(--nexa-muted)' }}>
            <RefreshCw size={14} strokeWidth={2} />
          </button>
          <button onClick={abrirNuevo}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition"
            style={{ background: 'var(--nexa-text)', color: '#fff' }}>
            <Plus size={14} strokeWidth={2.5} /> Nuevo plan
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
            style={{ color: 'var(--nexa-muted)' }} />
        </div>
      ) : planes.length === 0 ? (
        <div className="rounded-2xl py-16 text-center"
          style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
          <p className="text-[14px] font-semibold mb-1" style={{ color: 'var(--nexa-text-sub)' }}>Sin planes todavía</p>
          <p className="text-[12px] mb-5" style={{ color: 'var(--nexa-muted)' }}>
            Crea el primer plan para que aparezca en el flujo de reserva.
          </p>
          <button onClick={abrirNuevo}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold"
            style={{ background: 'var(--nexa-text)', color: '#fff' }}>
            <Plus size={14} /> Crear plan
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {planes.map(p => (
            <div key={p.id} className="rounded-2xl px-5 py-4 flex items-center gap-4"
              style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)', opacity: p.activo ? 1 : 0.45 }}>
              <span className="text-[11px] w-5 text-center font-semibold shrink-0"
                style={{ color: 'var(--nexa-faint)' }}>{p.orden || '—'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[15px] font-black" style={{ color: 'var(--nexa-text)' }}>{p.nombre}</p>
                  {p.destacado && (
                    <span className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-black"
                      style={{ background: 'var(--nexa-card-alt)', color: 'var(--nexa-text-sub)' }}>
                      <Star size={9} fill="currentColor" /> Popular
                    </span>
                  )}
                  {!p.activo && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: 'var(--nexa-warning-bg)', color: 'var(--nexa-warning)' }}>
                      Inactivo
                    </span>
                  )}
                </div>
                {p.descripcion && (
                  <p className="text-[12px] truncate mb-1" style={{ color: 'var(--nexa-muted)' }}>{p.descripcion}</p>
                )}
                <div className="flex gap-2">
                  <span className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--nexa-border)', color: 'var(--nexa-muted)' }}>
                    {p.num_clases} {p.num_clases === 1 ? 'clase' : 'clases'}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--nexa-border)', color: 'var(--nexa-muted)' }}>
                    {p.validez_dias} días
                  </span>
                </div>
              </div>
              <p className="text-[18px] font-black shrink-0" style={{ color: 'var(--nexa-text)' }}>{clp(p.precio_clp)}</p>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => abrirEditar(p)} className="rounded-lg p-2 transition"
                  style={{ border: '1px solid var(--nexa-border)', color: 'var(--nexa-muted)' }}>
                  <Pencil size={13} strokeWidth={2} />
                </button>
                <button disabled={deleting === p.id} onClick={() => eliminar(p.id)}
                  className="rounded-lg p-2 transition disabled:opacity-40"
                  style={{ border: '1px solid var(--nexa-border)', color: 'var(--nexa-danger)' }}>
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div className="w-full max-w-md rounded-2xl p-6"
            style={{ background: 'var(--nexa-bg)', border: '1px solid var(--nexa-border)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-black" style={{ color: 'var(--nexa-text)' }}>
                {editando ? 'Editar plan' : 'Nuevo plan'}
              </h2>
              <button onClick={() => setModal(false)} style={{ color: 'var(--nexa-muted)' }}>
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="space-y-3 mb-5">
              <PlanInput label="Nombre *" value={form.nombre}
                onChange={v => setForm({ ...form, nombre: v })} placeholder="Ej: Clase de Prueba" />
              <PlanInput label="Descripción" value={form.descripcion ?? ''}
                onChange={v => setForm({ ...form, descripcion: v })}
                placeholder="Una línea describiendo el plan" />
              <div className="grid grid-cols-2 gap-3">
                <PlanInput label="Precio CLP *" type="number" value={form.precio_clp}
                  onChange={v => setForm({ ...form, precio_clp: Number(v) })} placeholder="15000" />
                <PlanInput label="N° de clases" type="number" value={form.num_clases}
                  onChange={v => setForm({ ...form, num_clases: Number(v) })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PlanInput label="Validez (días)" type="number" value={form.validez_dias}
                  onChange={v => setForm({ ...form, validez_dias: Number(v) })} />
                <PlanInput label="Orden" type="number" value={form.orden}
                  onChange={v => setForm({ ...form, orden: Number(v) })} placeholder="1, 2, 3..." />
              </div>
              <div className="flex gap-4 pt-1">
                {([['destacado', 'Popular', form.destacado], ['activo', 'Activo', form.activo]] as [keyof typeof form, string, boolean][]).map(([key, label, val]) => (
                  <button key={key} onClick={() => setForm({ ...form, [key]: !val })}
                    className="flex items-center gap-2 text-[12px] font-semibold"
                    style={{ color: 'var(--nexa-text-sub)' }}>
                    <div className="w-9 h-5 rounded-full flex items-center transition-all px-0.5"
                      style={{ background: val ? 'var(--nexa-text)' : 'var(--nexa-border)' }}>
                      <div className="w-4 h-4 rounded-full bg-white shadow transition-all"
                        style={{ transform: val ? 'translateX(16px)' : 'translateX(0)' }} />
                    </div>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModal(false)}
                className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold"
                style={{ border: '1px solid var(--nexa-border)', color: 'var(--nexa-muted)' }}>
                Cancelar
              </button>
              <button disabled={saving || !form.nombre.trim() || !form.precio_clp} onClick={guardar}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold disabled:opacity-40"
                style={{ background: 'var(--nexa-text)', color: '#fff' }}>
                {saving
                  ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  : <><Check size={14} strokeWidth={2.5} /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function GrupalesPage() {
  const [tab,      setTab]      = useState<'sesiones' | 'alumnos' | 'planes'>('sesiones');
  const [sesiones, setSesiones] = useState<SesionAgrupada[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filtro,   setFiltro]   = useState<'hoy' | 'semana' | 'mes'>('semana');
  const [updating, setUpdating] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const hoy = new Date().toISOString().slice(0, 10);
    const fin = filtro === 'hoy'
      ? hoy
      : filtro === 'semana'
      ? new Date(Date.now() + 7  * 86400000).toISOString().slice(0, 10)
      : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const [{ data: reservasData }, { data: clasesData }] = await Promise.all([
      supabase
        .from('reservas')
        .select('id, fecha, hora, estado, descripcion, atletas(nombre, apellido, telefono, email, rut)')
        .ilike('tipo_clase', '%grupal%')
        .gte('fecha', hoy)
        .lte('fecha', fin)
        .not('estado', 'in', '(cancelada_tiempo,cancelada_tarde,cancelada_nexa)')
        .order('fecha', { ascending: true })
        .order('hora',  { ascending: true }),
      supabase
        .from('clases_grupales')
        .select('nombre, hora, dia_semana, capacidad')
        .eq('activa', true),
    ]);

    const clases = (clasesData ?? []) as ClaseInfo[];

    // Agrupar por fecha + hora
    const mapa: Record<string, SesionAgrupada> = {};
    for (const r of (reservasData ?? []) as unknown as Reserva[]) {
      const key = `${r.fecha}|${r.hora}`;
      if (!mapa[key]) {
        const dow = new Date(r.fecha + 'T12:00:00').getDay();
        const claseInfo = clases.find(c => c.hora === r.hora && c.dia_semana === dow);
        mapa[key] = {
          fecha:     r.fecha,
          hora:      r.hora,
          nombre:    r.descripcion ?? claseInfo?.nombre ?? 'Clase grupal',
          capacidad: claseInfo?.capacidad ?? 0,
          reservas:  [],
        };
      }
      mapa[key].reservas.push(r);
    }

    setSesiones(Object.values(mapa));
    setLoading(false);
  }, [filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  async function cambiarEstado(id: number, nuevoEstado: string) {
    setUpdating(id);
    const { error } = await supabase.from('reservas').update({ estado: nuevoEstado }).eq('id', id);
    setUpdating(null);
    if (error) {
      alert('No se pudo actualizar el estado del alumno. Verifica tu conexión e intenta de nuevo.');
      return;
    }
    cargar();
  }

  const totalInscritos = sesiones.reduce((acc, s) => acc + s.reservas.length, 0);
  const totalSesiones  = sesiones.length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--nexa-surface)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4"
        style={{ background: 'var(--nexa-bg)', borderColor: 'var(--nexa-border)' }}>
        <div>
          <h1 className="text-[18px] font-black tracking-tight" style={{ color: 'var(--nexa-text)' }}>
            Clases grupales
          </h1>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
            {totalInscritos} inscritos · {totalSesiones} sesiones
          </p>
        </div>
        <button onClick={cargar}
          className="rounded-lg p-2 transition"
          style={{ color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }}>
          <RefreshCw size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Tabs: Sesiones | Alumnos grupales | Planes */}
      <div className="flex border-b" style={{ background: 'var(--nexa-bg)', borderColor: 'var(--nexa-border)' }}>
        {([['sesiones', 'Sesiones'], ['alumnos', 'Alumnos grupales'], ['planes', 'Planes']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-6 py-2.5 text-[12px] font-semibold transition"
            style={{
              color:        tab === key ? 'var(--nexa-text)'  : 'var(--nexa-muted)',
              borderBottom: tab === key ? '2px solid var(--nexa-text)' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-4xl px-6 py-5">

        {/* ── Tab Alumnos grupales ──────────────────── */}
        {tab === 'alumnos' && <AlumnosGrupalesTab />}

        {/* ── Tab Planes ───────────────────────────── */}
        {tab === 'planes' && <PlanesTab />}

        {/* ── Tab Sesiones ─────────────────────────── */}
        {tab === 'sesiones' && <>
        {/* Filtros */}
        <div className="mb-6 flex gap-2">
          {(['hoy', 'semana', 'mes'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition"
              style={filtro === f
                ? { background: 'var(--nexa-text)', color: '#fff' }
                : { background: 'var(--nexa-card)', color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }
              }>
              {f === 'hoy' ? 'Hoy' : f === 'semana' ? 'Esta semana' : 'Este mes'}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color: 'var(--nexa-muted)' }} />
          </div>
        )}

        {!loading && sesiones.length === 0 && (
          <div className="rounded-2xl py-16 text-center"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
            <Calendar size={32} strokeWidth={1.5} style={{ color: 'var(--nexa-faint)' }} className="mx-auto mb-3" />
            <p className="text-[14px] font-semibold" style={{ color: 'var(--nexa-text-sub)' }}>
              Sin inscripciones en este período
            </p>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
              Las reservas de clases grupales aparecerán aquí.
            </p>
          </div>
        )}

        <div className="space-y-5">
          {sesiones.map(sesion => {
            const key   = `${sesion.fecha}|${sesion.hora}`;
            const esHoy = sesion.fecha === new Date().toISOString().slice(0, 10);
            const lleno = sesion.capacidad > 0 && sesion.reservas.length >= sesion.capacidad;

            return (
              <div key={key} className="overflow-hidden rounded-2xl"
                style={{ background: 'var(--nexa-card)', border: `1px solid ${esHoy ? 'var(--nexa-accent)' : 'var(--nexa-border)'}` }}>

                {/* Cabecera sesión */}
                <div className="flex items-center justify-between px-5 py-4"
                  style={{ borderBottom: '1px solid var(--nexa-border)' }}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {esHoy && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                          style={{ background: 'var(--nexa-accent)', color: '#fff' }}>
                          Hoy
                        </span>
                      )}
                      {lleno && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                          style={{ background: '#fef2f2', color: '#dc2626' }}>
                          Llena
                        </span>
                      )}
                      <p className="text-[15px] font-black" style={{ color: 'var(--nexa-text)' }}>
                        {sesion.nombre}
                      </p>
                    </div>
                    <p className="text-[12px] capitalize mb-2" style={{ color: 'var(--nexa-muted)' }}>
                      {formatFecha(sesion.fecha)} · {sesion.hora}
                    </p>
                    <CupoBar inscritos={sesion.reservas.length} capacidad={sesion.capacidad} />
                  </div>

                  <div className="flex items-center gap-1.5 rounded-xl px-3 py-2 ml-4"
                    style={{ background: 'var(--nexa-card-alt)' }}>
                    <Users size={14} strokeWidth={2} style={{ color: 'var(--nexa-muted)' }} />
                    <span className="text-[16px] font-black" style={{ color: 'var(--nexa-text)' }}>
                      {sesion.reservas.length}
                    </span>
                  </div>
                </div>

                {/* Lista inscritos */}
                {sesion.reservas.length === 0 ? (
                  <div className="px-5 py-4 text-center">
                    <p className="text-[12px]" style={{ color: 'var(--nexa-faint)' }}>Sin inscripciones aún</p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--nexa-border)' }}>
                    {sesion.reservas.map((r, idx) => {
                      const cfg    = ESTADO_CFG[r.estado] ?? ESTADO_CFG.pendiente;
                      const Icn    = cfg.Icon;
                      const atleta = r.atletas[0] as AtletaFila | undefined;
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                          {/* Número */}
                          <span className="w-5 shrink-0 text-center text-[11px] font-semibold"
                            style={{ color: 'var(--nexa-faint)' }}>
                            {idx + 1}
                          </span>

                          {/* Avatar */}
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-black"
                            style={{ background: 'var(--nexa-card-alt)', color: 'var(--nexa-text-sub)' }}>
                            {atleta?.nombre?.[0]?.toUpperCase() ?? '?'}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--nexa-text)' }}>
                              {atleta?.nombre ?? '—'} {atleta?.apellido ?? ''}
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              {atleta?.telefono && (
                                <span className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                                  {atleta.telefono}
                                </span>
                              )}
                              {atleta?.email && (
                                <span className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                                  {atleta.email}
                                </span>
                              )}
                              {atleta?.rut && (
                                <span className="text-[11px]" style={{ color: 'var(--nexa-faint)' }}>
                                  RUT: {atleta.rut}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Estado + botones */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                              style={{ color: cfg.color, background: cfg.bg }}>
                              <Icn size={11} />
                              {cfg.label}
                            </span>
                            {r.estado === 'pendiente' && (
                              <>
                                <button
                                  disabled={updating === r.id}
                                  onClick={() => cambiarEstado(r.id, 'presente')}
                                  title="Marcar presente"
                                  className="rounded-lg px-2 py-1 text-[11px] font-bold transition disabled:opacity-40"
                                  style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                                  ✓
                                </button>
                                <button
                                  disabled={updating === r.id}
                                  onClick={() => cambiarEstado(r.id, 'no_show')}
                                  title="Marcar ausente"
                                  className="rounded-lg px-2 py-1 text-[11px] font-bold transition disabled:opacity-40"
                                  style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                                  ✗
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>}
      </div>
    </div>
  );
}
