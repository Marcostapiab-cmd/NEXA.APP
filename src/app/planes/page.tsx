'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Star, RefreshCw, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface Plan {
  id:          string;
  nombre:      string;
  descripcion: string | null;
  precio_clp:  number;
  num_clases:  number;
  validez_dias: number;
  destacado:   boolean;
  orden:       number;
  activo:      boolean;
}

const VACIO: Omit<Plan,'id'> = {
  nombre:      '',
  descripcion: '',
  precio_clp:  0,
  num_clases:  1,
  validez_dias: 7,
  destacado:   false,
  orden:       0,
  activo:      true,
};

function clp(n: number) {
  return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',minimumFractionDigits:0}).format(n);
}

function Input({ label, value, onChange, type='text', placeholder }: {
  label: string; value: string|number; onChange:(v:string)=>void;
  type?:string; placeholder?:string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.1em]"
        style={{ color:'var(--nexa-muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none transition"
        style={{ background:'var(--nexa-surface)', border:'1px solid var(--nexa-border)', color:'var(--nexa-text)' }} />
    </div>
  );
}

export default function PlanesPage() {
  const [planes,   setPlanes]   = useState<Plan[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(false);
  const [editando, setEditando] = useState<Plan|null>(null);
  const [form,     setForm]     = useState<Omit<Plan,'id'>>(VACIO);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<string|null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('planes_grupales')
      .select('*')
      .order('orden')
      .order('created_at');
    setPlanes((data ?? []) as Plan[]);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() {
    setEditando(null);
    setForm(VACIO);
    setModal(true);
  }

  function abrirEditar(p: Plan) {
    setEditando(p);
    setForm({ nombre:p.nombre, descripcion:p.descripcion??'', precio_clp:p.precio_clp,
              num_clases:p.num_clases, validez_dias:p.validez_dias,
              destacado:p.destacado, orden:p.orden, activo:p.activo });
    setModal(true);
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.precio_clp) return;
    setSaving(true);
    const payload = {
      nombre:       form.nombre.trim(),
      descripcion:  form.descripcion?.trim() || null,
      precio_clp:   Number(form.precio_clp),
      num_clases:   Number(form.num_clases),
      validez_dias: Number(form.validez_dias),
      destacado:    form.destacado,
      orden:        Number(form.orden),
      activo:       form.activo,
    };
    if (editando) {
      await supabase.from('planes_grupales').update(payload).eq('id', editando.id);
    } else {
      await supabase.from('planes_grupales').insert(payload);
    }
    setSaving(false);
    setModal(false);
    cargar();
  }

  async function eliminar(id: string) {
    setDeleting(id);
    await supabase.from('planes_grupales').update({ activo: false }).eq('id', id);
    setDeleting(null);
    cargar();
  }

  return (
    <div className="min-h-screen" style={{ background:'var(--nexa-surface)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4"
        style={{ background:'var(--nexa-bg)', borderColor:'var(--nexa-border)' }}>
        <div>
          <h1 className="text-[18px] font-black tracking-tight" style={{ color:'var(--nexa-text)' }}>
            Planes de prueba
          </h1>
          <p className="mt-0.5 text-[12px]" style={{ color:'var(--nexa-muted)' }}>
            Paquetes que verán los alumnos nuevos en /reservar
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={cargar}
            className="rounded-lg p-2 transition"
            style={{ border:'1px solid var(--nexa-border)', color:'var(--nexa-muted)' }}>
            <RefreshCw size={14} strokeWidth={2} />
          </button>
          <button onClick={abrirNuevo}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition"
            style={{ background:'var(--nexa-text)', color:'#fff' }}>
            <Plus size={14} strokeWidth={2.5} /> Nuevo plan
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
              style={{ color:'var(--nexa-muted)' }} />
          </div>
        ) : planes.length === 0 ? (
          <div className="rounded-2xl py-16 text-center"
            style={{ background:'var(--nexa-card)', border:'1px solid var(--nexa-border)' }}>
            <p className="text-[14px] font-semibold" style={{ color:'var(--nexa-text-sub)' }}>
              Sin planes todavía
            </p>
            <p className="mt-1 text-[12px] mb-5" style={{ color:'var(--nexa-muted)' }}>
              Crea el primer plan para que aparezca en el flujo de reserva.
            </p>
            <button onClick={abrirNuevo}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold"
              style={{ background:'var(--nexa-text)', color:'#fff' }}>
              <Plus size={14} /> Crear plan
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {planes.map(p => (
              <div key={p.id} className="rounded-2xl px-5 py-4 flex items-center gap-4"
                style={{
                  background: 'var(--nexa-card)',
                  border: '1px solid var(--nexa-border)',
                  opacity: p.activo ? 1 : 0.45,
                }}>
                {/* Orden */}
                <span className="text-[11px] w-5 text-center font-semibold shrink-0"
                  style={{ color:'var(--nexa-faint)' }}>{p.orden || '—'}</span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[15px] font-black" style={{ color:'var(--nexa-text)' }}>
                      {p.nombre}
                    </p>
                    {p.destacado && (
                      <span className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-black"
                        style={{ background:'var(--nexa-card-alt)', color:'var(--nexa-text-sub)' }}>
                        <Star size={9} fill="currentColor" /> Popular
                      </span>
                    )}
                    {!p.activo && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background:'var(--nexa-warning-bg)', color:'var(--nexa-warning)' }}>
                        Inactivo
                      </span>
                    )}
                  </div>
                  {p.descripcion && (
                    <p className="text-[12px] truncate mb-1" style={{ color:'var(--nexa-muted)' }}>
                      {p.descripcion}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background:'var(--nexa-border)', color:'var(--nexa-muted)' }}>
                      {p.num_clases} {p.num_clases===1?'clase':'clases'}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background:'var(--nexa-border)', color:'var(--nexa-muted)' }}>
                      {p.validez_dias} días
                    </span>
                  </div>
                </div>

                {/* Precio */}
                <p className="text-[18px] font-black shrink-0" style={{ color:'var(--nexa-text)' }}>
                  {clp(p.precio_clp)}
                </p>

                {/* Acciones */}
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => abrirEditar(p)}
                    className="rounded-lg p-2 transition"
                    style={{ border:'1px solid var(--nexa-border)', color:'var(--nexa-muted)' }}>
                    <Pencil size={13} strokeWidth={2} />
                  </button>
                  <button
                    disabled={deleting === p.id}
                    onClick={() => eliminar(p.id)}
                    className="rounded-lg p-2 transition disabled:opacity-40"
                    style={{ border:'1px solid var(--nexa-border)', color:'var(--nexa-danger)' }}>
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background:'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div className="w-full max-w-md rounded-2xl p-6"
            style={{ background:'var(--nexa-bg)', border:'1px solid var(--nexa-border)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-black" style={{ color:'var(--nexa-text)' }}>
                {editando ? 'Editar plan' : 'Nuevo plan'}
              </h2>
              <button onClick={() => setModal(false)}
                style={{ color:'var(--nexa-muted)' }}>
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <Input label="Nombre *" value={form.nombre}
                onChange={v => setForm({...form, nombre:v})} placeholder="Ej: Clase de Prueba" />
              <Input label="Descripción" value={form.descripcion??''}
                onChange={v => setForm({...form, descripcion:v})}
                placeholder="Una línea describiendo el plan" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Precio CLP *" type="number" value={form.precio_clp}
                  onChange={v => setForm({...form, precio_clp:Number(v)})} placeholder="15000" />
                <Input label="N° de clases" type="number" value={form.num_clases}
                  onChange={v => setForm({...form, num_clases:Number(v)})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Validez (días)" type="number" value={form.validez_dias}
                  onChange={v => setForm({...form, validez_dias:Number(v)})} />
                <Input label="Orden" type="number" value={form.orden}
                  onChange={v => setForm({...form, orden:Number(v)})}
                  placeholder="1, 2, 3..." />
              </div>

              {/* Toggles */}
              <div className="flex gap-4 pt-1">
                {([
                  ['destacado', 'Popular', form.destacado],
                  ['activo',    'Activo',  form.activo],
                ] as [keyof typeof form, string, boolean][]).map(([key, label, val]) => (
                  <button key={key}
                    onClick={() => setForm({...form, [key]: !val})}
                    className="flex items-center gap-2 text-[12px] font-semibold"
                    style={{ color:'var(--nexa-text-sub)' }}>
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
                style={{ border:'1px solid var(--nexa-border)', color:'var(--nexa-muted)' }}>
                Cancelar
              </button>
              <button
                disabled={saving || !form.nombre.trim() || !form.precio_clp}
                onClick={guardar}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold disabled:opacity-40"
                style={{ background:'var(--nexa-text)', color:'#fff' }}>
                {saving
                  ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  : <><Check size={14} strokeWidth={2.5} /> Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
