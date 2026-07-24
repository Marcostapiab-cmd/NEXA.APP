'use client';

import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Lock } from 'lucide-react';
import {
  getHorarioConfig, saveHorarioConfig,
  getBloqueos, addBloqueo, deleteBloqueo,
  DEFAULT_HORARIO_CONFIG,
  type HorarioConfig, type HorarioDiaConfig, type HorarioBloqueo,
} from '@/lib/horario-config';
import { supabase } from '@/lib/supabaseClient';

const DIA_LABELS: Record<number, string> = {
  0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
  4: 'Jueves',  5: 'Viernes', 6: 'Sábado',
};
const DIA_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun → Dom

// ─── Componentes pequeños ─────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--nexa-border)' }}>
        <h2 className="text-[11px] font-black uppercase tracking-[0.12em]"
          style={{ color: 'var(--nexa-muted)' }}>{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function NumInput({ label, sub, value, onChange, min, max }: {
  label: string; sub: string; value: number;
  onChange: (v: number) => void; min: number; max: number;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider mb-1"
        style={{ color: 'var(--nexa-muted)' }}>{label}</label>
      <p className="text-[10px] mb-1.5" style={{ color: 'var(--nexa-faint)' }}>{sub}</p>
      <input type="number" value={value} min={min} max={max}
        onChange={e => onChange(parseInt(e.target.value) || min)}
        className="w-full rounded-lg px-3 py-2 text-[13px]"
        style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}
      />
    </div>
  );
}

function TimeInput({ label, sub, value, onChange }: {
  label: string; sub: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider mb-1"
        style={{ color: 'var(--nexa-muted)' }}>{label}</label>
      <p className="text-[10px] mb-1.5" style={{ color: 'var(--nexa-faint)' }}>{sub}</p>
      <input type="time" value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-[13px]"
        style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}
      />
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="relative inline-flex h-5 w-9 rounded-full transition-colors duration-200 shrink-0"
      style={{ background: on ? 'var(--nexa-accent)' : 'var(--nexa-border)' }}>
      <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200"
        style={{ margin: 2, transform: on ? 'translateX(16px)' : 'translateX(0)' }} />
    </button>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const [role,    setRole]    = useState<string | null>(null);
  const [draft,   setDraft]   = useState<HorarioConfig>(DEFAULT_HORARIO_CONFIG);
  const [bloqueos, setBloqueos] = useState<HorarioBloqueo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [err,      setErr]     = useState('');
  const [bloqueoErr, setBloqueoErr] = useState('');

  const [newB, setNewB] = useState({
    fecha: '', horaInicio: '', horaFin: '', motivo: '', diaCompleto: true,
  });
  const [addingB, setAddingB] = useState(false);

  useEffect(() => {
    async function init() {
      const [{ data: roleData }, cfg, bls] = await Promise.all([
        supabase.rpc('get_my_role'),
        getHorarioConfig(),
        getBloqueos(),
      ]);
      setRole(roleData as string ?? null);
      setDraft(cfg);
      setBloqueos(bls);
      setLoading(false);
    }
    init();
  }, []);

  function updateDia(dow: number, patch: Partial<HorarioDiaConfig>) {
    setDraft(d => ({
      ...d,
      dias: d.dias.map(x => x.dow === dow ? { ...x, ...patch } : x),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setErr('');
    try {
      await saveHorarioConfig(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setErr(typeof e === 'object' && e && 'message' in e ? String((e as { message: string }).message) : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddBloqueo() {
    if (!newB.fecha) return;
    setAddingB(true);
    setBloqueoErr('');
    try {
      await addBloqueo({
        fecha:      newB.fecha,
        horaInicio: newB.diaCompleto ? undefined : newB.horaInicio || undefined,
        horaFin:    newB.diaCompleto ? undefined : newB.horaFin    || undefined,
        motivo:     newB.motivo || undefined,
      });
      setBloqueos(await getBloqueos());
      setNewB({ fecha: '', horaInicio: '', horaFin: '', motivo: '', diaCompleto: true });
    } catch (e: unknown) {
      const msg = typeof e === 'object' && e && 'message' in e
        ? String((e as { message: string }).message)
        : 'Error al guardar el bloqueo';
      setBloqueoErr(msg);
    } finally {
      setAddingB(false);
    }
  }

  async function handleDeleteBloqueo(id: string) {
    await deleteBloqueo(id);
    setBloqueos(prev => prev.filter(b => b.id !== id));
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--nexa-black)' }}>
        <p style={{ color: 'var(--nexa-muted)' }}>Cargando...</p>
      </main>
    );
  }

  if (role !== 'admin') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: 'var(--nexa-black)' }}>
        <Lock size={28} style={{ color: 'var(--nexa-muted)' }} />
        <p className="text-[13px]" style={{ color: 'var(--nexa-muted)' }}>Solo el administrador puede ver esta pantalla.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--nexa-black)' }}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-black tracking-[0.12em]" style={{ color: 'var(--nexa-text)' }}>
              CONFIGURACIÓN
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              Horarios · Cupos · Cancelación
            </p>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-bold transition"
            style={{
              background: saved ? '#2E7D55' : 'var(--nexa-accent)',
              color: '#000',
              opacity: saving ? 0.6 : 1,
            }}>
            <Save size={13} />
            {saving ? 'Guardando...' : saved ? 'Guardado ✓' : 'Guardar cambios'}
          </button>
        </div>

        {err && (
          <div className="rounded-lg px-4 py-3 text-[12px]"
            style={{ background: 'rgba(180,64,64,0.12)', border: '1px solid #B44040', color: '#B44040' }}>
            {err}
          </div>
        )}

        {/* ─ Horario por día ─ */}
        <Card title="Horario por día">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Día', 'Abierto', 'Apertura', 'Cierre'].map(h => (
                    <th key={h} className="pb-3 text-left pr-4 text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: 'var(--nexa-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIA_ORDER.map(dow => {
                  const dia = draft.dias.find(d => d.dow === dow) ??
                    { dow, abierto: false, apertura: '06:00', cierre: '21:00' };
                  return (
                    <tr key={dow} style={{ borderTop: '1px solid var(--nexa-border)' }}>
                      <td className="py-2.5 pr-6 font-semibold" style={{ color: 'var(--nexa-text)', whiteSpace: 'nowrap' }}>
                        {DIA_LABELS[dow]}
                      </td>
                      <td className="py-2.5 pr-6">
                        <Toggle on={dia.abierto} onToggle={() => updateDia(dow, { abierto: !dia.abierto })} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <input type="time" value={dia.apertura} disabled={!dia.abierto}
                          onChange={e => updateDia(dow, { apertura: e.target.value })}
                          className="rounded-lg px-2 py-1 text-[12px]"
                          style={{
                            background: 'var(--nexa-card-alt)',
                            border: '1px solid var(--nexa-border)',
                            color: dia.abierto ? 'var(--nexa-text)' : 'var(--nexa-muted)',
                            opacity: dia.abierto ? 1 : 0.35,
                          }}
                        />
                      </td>
                      <td className="py-2.5">
                        <input type="time" value={dia.cierre} disabled={!dia.abierto}
                          onChange={e => updateDia(dow, { cierre: e.target.value })}
                          className="rounded-lg px-2 py-1 text-[12px]"
                          style={{
                            background: 'var(--nexa-card-alt)',
                            border: '1px solid var(--nexa-border)',
                            color: dia.abierto ? 'var(--nexa-text)' : 'var(--nexa-muted)',
                            opacity: dia.abierto ? 1 : 0.35,
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ─ Cupos y bloques ─ */}
        <Card title="Cupos y bloques">
          <div className="grid grid-cols-3 gap-4">
            <NumInput
              label="Capacidad grupal"
              sub="Máx. alumnos por clase grupal"
              value={draft.capacidadGrupal}
              onChange={v => setDraft(d => ({ ...d, capacidadGrupal: v }))}
              min={1} max={50}
            />
            <NumInput
              label="Máx. profes paralelo"
              sub="Profesores simultáneos por hora"
              value={draft.maxProfesores}
              onChange={v => setDraft(d => ({ ...d, maxProfesores: v }))}
              min={1} max={10}
            />
            <NumInput
              label="Duración bloque (min)"
              sub="Largo de cada bloque horario"
              value={draft.duracionBloque}
              onChange={v => setDraft(d => ({ ...d, duracionBloque: v }))}
              min={15} max={120}
            />
          </div>
        </Card>

        {/* ─ Reglas de cancelación ─ */}
        <Card title="Reglas de cancelación">
          <div className="grid grid-cols-2 gap-4">
            <TimeInput
              label="Corte AM (día anterior)"
              sub="Hora tope del día ANTERIOR para cancelar clase de mañana. Ej: si es 21:00, debes cancelar antes de las 21h del día prev."
              value={draft.corteCancelacionAm}
              onChange={v => setDraft(d => ({ ...d, corteCancelacionAm: v }))}
            />
            <TimeInput
              label="Límite hora AM"
              sub="Clases que empiecen ANTES de esta hora se consideran AM. Ej: 12:00 → todo antes del mediodía es AM."
              value={draft.limiteHoraAm}
              onChange={v => setDraft(d => ({ ...d, limiteHoraAm: v }))}
            />
            <NumInput
              label="Aviso mínimo PM (horas)"
              sub="Horas mínimas de anticipación para cancelar una clase PM"
              value={draft.cancelHorasAvisoPm}
              onChange={v => setDraft(d => ({ ...d, cancelHorasAvisoPm: v }))}
              min={0} max={48}
            />
            <NumInput
              label="Validez reagenda (días)"
              sub="Días que tiene el alumno para usar su reagenda"
              value={draft.reagendaValidezDias}
              onChange={v => setDraft(d => ({ ...d, reagendaValidezDias: v }))}
              min={1} max={90}
            />
          </div>
        </Card>

        {/* ─ Bloqueos ─ */}
        <Card title="Bloqueos y feriados">

          {/* Lista de bloqueos */}
          {bloqueos.length === 0 ? (
            <p className="text-[12px] mb-4" style={{ color: 'var(--nexa-muted)' }}>No hay bloqueos registrados.</p>
          ) : (
            <div className="space-y-1.5 mb-4">
              {bloqueos.map(b => (
                <div key={b.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                  style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)' }}>
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-semibold" style={{ color: 'var(--nexa-text)' }}>
                      {new Date(b.fecha + 'T12:00:00').toLocaleDateString('es-CL', {
                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </span>
                    {b.horaInicio ? (
                      <span className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                        {b.horaInicio}–{b.horaFin}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(180,64,64,0.15)', color: '#B44040' }}>
                        Día completo
                      </span>
                    )}
                    {b.motivo && (
                      <span className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>· {b.motivo}</span>
                    )}
                  </div>
                  <button onClick={() => handleDeleteBloqueo(b.id)}
                    className="rounded-lg p-1.5 shrink-0"
                    style={{ color: '#B44040', background: 'rgba(180,64,64,0.1)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formulario agregar bloqueo */}
          <div className="rounded-xl p-4 space-y-3"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--nexa-border)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--nexa-muted)' }}>
              Agregar bloqueo
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1"
                  style={{ color: 'var(--nexa-muted)' }}>Fecha</label>
                <input type="date" value={newB.fecha}
                  onChange={e => setNewB(n => ({ ...n, fecha: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-[12px]"
                  style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1"
                  style={{ color: 'var(--nexa-muted)' }}>Motivo</label>
                <input type="text" value={newB.motivo} placeholder="Ej: Feriado nacional"
                  onChange={e => setNewB(n => ({ ...n, motivo: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-[12px]"
                  style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Toggle
                on={newB.diaCompleto}
                onToggle={() => setNewB(n => ({ ...n, diaCompleto: !n.diaCompleto }))}
              />
              <span className="text-[12px]" style={{ color: 'var(--nexa-muted)' }}>Día completo</span>
            </div>

            {!newB.diaCompleto && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: 'var(--nexa-muted)' }}>Hora inicio</label>
                  <input type="time" value={newB.horaInicio}
                    onChange={e => setNewB(n => ({ ...n, horaInicio: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-[12px]"
                    style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: 'var(--nexa-muted)' }}>Hora fin</label>
                  <input type="time" value={newB.horaFin}
                    onChange={e => setNewB(n => ({ ...n, horaFin: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-[12px]"
                    style={{ background: 'var(--nexa-card-alt)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-text)' }}
                  />
                </div>
              </div>
            )}

            {bloqueoErr && (
              <div className="rounded-lg px-3 py-2 text-[11px]"
                style={{ background: 'rgba(180,64,64,0.12)', border: '1px solid #B44040', color: '#B44040' }}>
                {bloqueoErr}
              </div>
            )}

            <button onClick={handleAddBloqueo} disabled={!newB.fecha || addingB}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-bold transition"
              style={{
                background: 'var(--nexa-card-alt)',
                border: '1px solid var(--nexa-border)',
                color: 'var(--nexa-text)',
                opacity: (!newB.fecha || addingB) ? 0.45 : 1,
              }}>
              <Plus size={13} />
              {addingB ? 'Agregando...' : 'Agregar bloqueo'}
            </button>
          </div>
        </Card>

      </div>
    </main>
  );
}
