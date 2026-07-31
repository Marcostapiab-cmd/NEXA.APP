'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Calendar, Dumbbell } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface Perfil {
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
}

interface Reserva {
  id: string;
  sesion: Array<{ fecha: string; hora: string }> | null;
  asistio: boolean | null;
}

export default function MiCuentaPage() {
  const router = useRouter();
  const [perfil,   setPerfil]   = useState<Perfil | null>(null);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const [{ data: p }, { data: r }] = await Promise.all([
        supabase
          .from('perfiles')
          .select('nombre, apellido, email, rol')
          .eq('id', user.id)
          .single(),
        supabase
          .from('reservas')
          .select('id, asistio, sesion:sesiones(fecha, hora)')
          .order('id', { ascending: false })
          .limit(10),
      ]);

      if (p) setPerfil(p as Perfil);
      if (r) setReservas(r as Reserva[]);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--nexa-surface)' }}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: 'var(--nexa-muted)' }} />
      </div>
    );
  }

  const nombre = perfil?.nombre ?? 'Alumno';

  return (
    <div className="min-h-screen" style={{ background: 'var(--nexa-surface)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 flex h-[60px] items-center justify-between px-6"
        style={{ background: 'var(--nexa-bg)', borderBottom: '1px solid var(--nexa-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-[6px]"
            style={{ background: 'var(--nexa-accent)' }}
          >
            <span className="text-[11px] font-black tracking-wider" style={{ color: '#FFFFFF' }}>N</span>
          </div>
          <span className="text-[13px] font-black tracking-[0.14em]" style={{ color: 'var(--nexa-text)' }}>
            NEXA
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors"
          style={{ color: 'var(--nexa-muted)', border: '1px solid var(--nexa-border)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--nexa-text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--nexa-muted)')}
        >
          <LogOut size={13} strokeWidth={2} />
          Salir
        </button>
      </header>

      <main className="mx-auto max-w-[560px] px-6 py-12">
        {/* Saludo */}
        <div className="mb-10">
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
            Bienvenido/a
          </p>
          <h1 className="text-[28px] font-black" style={{ color: 'var(--nexa-text)' }}>
            Hola, {nombre} 👋
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: 'var(--nexa-text-sub)' }}>
            {perfil?.email}
          </p>
        </div>

        {/* Cards de acceso rápido */}
        <div className="mb-8 grid grid-cols-2 gap-3">
          <div
            className="rounded-xl p-5"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}
          >
            <Calendar size={20} strokeWidth={1.75} style={{ color: 'var(--nexa-muted)' }} className="mb-3" />
            <p className="text-[13px] font-semibold" style={{ color: 'var(--nexa-text)' }}>Mis clases</p>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
              {reservas.length} recientes
            </p>
          </div>
          <div
            className="rounded-xl p-5"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}
          >
            <Dumbbell size={20} strokeWidth={1.75} style={{ color: 'var(--nexa-muted)' }} className="mb-3" />
            <p className="text-[13px] font-semibold" style={{ color: 'var(--nexa-text)' }}>Mi progreso</p>
            <p className="mt-0.5 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>Próximamente</p>
          </div>
        </div>

        {/* Últimas reservas */}
        {reservas.length > 0 && (
          <div>
            <p
              className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: 'var(--nexa-muted)' }}
            >
              Últimas clases
            </p>
            <div className="space-y-2">
              {reservas.slice(0, 5).map(r => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}
                >
                  <div>
                    <p className="text-[13px] font-medium" style={{ color: 'var(--nexa-text)' }}>
                      {r.sesion?.[0]?.fecha ?? '—'}
                    </p>
                    <p className="text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
                      {r.sesion?.[0]?.hora ?? '—'}
                    </p>
                  </div>
                  {r.asistio !== null && (
                    <span
                      className="rounded-full px-3 py-1 text-[11px] font-semibold"
                      style={r.asistio
                        ? { background: 'var(--nexa-success-bg)', color: 'var(--nexa-success)' }
                        : { background: 'var(--nexa-danger-bg)', color: 'var(--nexa-danger)' }
                      }
                    >
                      {r.asistio ? 'Presente' : 'Ausente'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {reservas.length === 0 && (
          <div
            className="rounded-xl px-6 py-10 text-center"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}
          >
            <Calendar size={28} strokeWidth={1.5} style={{ color: 'var(--nexa-faint)' }} className="mx-auto mb-3" />
            <p className="text-[14px] font-medium" style={{ color: 'var(--nexa-text-sub)' }}>
              Aún no tenés clases agendadas
            </p>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--nexa-muted)' }}>
              Hablá con tu coach para reservar tu primera clase.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
