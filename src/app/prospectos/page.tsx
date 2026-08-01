'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Phone, Mail, MessageSquare, Target, Dumbbell, Zap, Heart, UserCheck, Trash2 } from 'lucide-react';

interface Prospecto {
  id: string;
  nombre: string;
  apellido?: string;
  email?: string;
  telefono?: string;
  objetivo?: string;
  mensaje?: string;
  estado: string;
  createdAt: string;
}

const OBJETIVO_LABEL: Record<string, { label: string; Icon: React.ElementType }> = {
  perdida_peso:  { label: 'Bajar de peso',       Icon: Target  },
  masa_muscular: { label: 'Ganar masa muscular',  Icon: Dumbbell },
  rendimiento:   { label: 'Mejorar rendimiento',  Icon: Zap    },
  salud_general: { label: 'Salud y bienestar',    Icon: Heart  },
};

const ESTADO_OPTS = [
  { value: 'nuevo',       label: 'Nuevo',       color: '#2563eb', bg: '#eff6ff' },
  { value: 'contactado',  label: 'Contactado',  color: '#d97706', bg: '#fffbeb' },
  { value: 'convertido',  label: 'Convertido',  color: '#16a34a', bg: '#f0fdf4' },
  { value: 'descartado',  label: 'Descartado',  color: '#9B9B9B', bg: '#F5F5F5' },
];

function estadoCfg(e: string) {
  return ESTADO_OPTS.find(o => o.value === e) ?? ESTADO_OPTS[0];
}

export default function ProspectosPage() {
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filtro,     setFiltro]     = useState('nuevo');

  async function load() {
    const { data } = await supabase
      .from('prospectos')
      .select('*')
      .order('created_at', { ascending: false });
    setProspectos((data ?? []).map((p: Record<string, unknown>) => ({
      id:        String(p.id),
      nombre:    String(p.nombre),
      apellido:  p.apellido  ? String(p.apellido)  : undefined,
      email:     p.email     ? String(p.email)     : undefined,
      telefono:  p.telefono  ? String(p.telefono)  : undefined,
      objetivo:  p.objetivo  ? String(p.objetivo)  : undefined,
      mensaje:   p.mensaje   ? String(p.mensaje)   : undefined,
      estado:    String(p.estado),
      createdAt: String(p.created_at),
    })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function cambiarEstado(id: string, estado: string) {
    await supabase.from('prospectos').update({ estado }).eq('id', id);
    setProspectos(prev => prev.map(p => p.id === id ? { ...p, estado } : p));
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este prospecto?')) return;
    await supabase.from('prospectos').delete().eq('id', id);
    setProspectos(prev => prev.filter(p => p.id !== id));
  }

  const counts = Object.fromEntries(ESTADO_OPTS.map(o => [o.value, prospectos.filter(p => p.estado === o.value).length]));
  const filtrados = filtro === 'todos' ? prospectos : prospectos.filter(p => p.estado === filtro);

  return (
    <div className="min-h-screen" style={{ background: 'var(--nexa-bg)' }}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-black" style={{ color: 'var(--nexa-text)' }}>Prospectos</h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--nexa-muted)' }}>
            Leads desde la página /unirse
          </p>
        </div>

        {/* Filtros con contadores */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setFiltro('todos')}
            className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
            style={filtro === 'todos'
              ? { background: 'var(--nexa-text)', color: '#fff' }
              : { background: 'var(--nexa-card)', color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }
            }
          >
            Todos ({prospectos.length})
          </button>
          {ESTADO_OPTS.map(o => (
            <button
              key={o.value}
              onClick={() => setFiltro(o.value)}
              className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
              style={filtro === o.value
                ? { background: o.color, color: '#fff' }
                : { background: 'var(--nexa-card)', color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }
              }
            >
              {o.label} ({counts[o.value] ?? 0})
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: 'var(--nexa-border)' }}>
            <p className="font-semibold" style={{ color: 'var(--nexa-muted)' }}>Sin prospectos en esta categoría</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtrados.map(p => {
              const cfg = estadoCfg(p.estado);
              const obj = p.objetivo ? OBJETIVO_LABEL[p.objetivo] : null;
              return (
                <div key={p.id} className="rounded-2xl border p-5" style={{ background: 'var(--nexa-card)', borderColor: 'var(--nexa-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold" style={{ color: 'var(--nexa-text)' }}>
                          {p.nombre} {p.apellido ?? ''}
                        </p>
                        <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                          style={{ color: cfg.color, background: cfg.bg }}>
                          {cfg.label}
                        </span>
                        {obj && (
                          <span className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                            style={{ color: 'var(--nexa-text-sub)', borderColor: 'var(--nexa-border)' }}>
                            <obj.Icon size={10} /> {obj.label}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-4">
                        {p.email && (
                          <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--nexa-muted)' }}>
                            <Mail size={13} /> {p.email}
                          </a>
                        )}
                        {p.telefono && (
                          <a href={`https://wa.me/${p.telefono.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--nexa-muted)' }}>
                            <Phone size={13} /> {p.telefono}
                          </a>
                        )}
                      </div>

                      {p.mensaje && (
                        <div className="mt-2 flex items-start gap-1.5">
                          <MessageSquare size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--nexa-faint)' }} />
                          <p className="text-sm italic" style={{ color: 'var(--nexa-muted)' }}>{p.mensaje}</p>
                        </div>
                      )}

                      <p className="mt-2 text-xs" style={{ color: 'var(--nexa-faint)' }}>
                        {new Date(p.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <button onClick={() => eliminar(p.id)} className="shrink-0 rounded-lg p-1.5 transition" style={{ color: 'var(--nexa-faint)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--nexa-faint)')}>
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Cambiar estado */}
                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: 'var(--nexa-border)' }}>
                    {ESTADO_OPTS.map(o => (
                      <button
                        key={o.value}
                        onClick={() => cambiarEstado(p.id, o.value)}
                        disabled={p.estado === o.value}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40"
                        style={p.estado === o.value
                          ? { background: o.color, color: '#fff' }
                          : { background: 'var(--nexa-bg)', color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }
                        }
                      >
                        {o.value === 'convertido' && <UserCheck size={11} />}
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
