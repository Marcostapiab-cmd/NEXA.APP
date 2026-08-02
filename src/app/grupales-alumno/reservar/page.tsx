'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { ArrowLeft, Calendar, Clock, Users, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface Sesion {
  clase_id:     string;
  nombre:       string;
  hora:         string;
  dia_semana:   number;
  capacidad:    number;
  disponibles:  number;
  fecha:        string;
  bloqueada:    boolean;
  coach_nombre: string;
}

interface Compra {
  id:               string;
  clases_restantes: number;
  fecha_expira:     string;
}

const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatFechaLarga(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export default function ReservarPage() {
  const router = useRouter();
  const [sesiones,  setSesiones]  = useState<Sesion[]>([]);
  const [compra,    setCompra]    = useState<Compra | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [reservando, setReservando] = useState<string | null>(null);
  const [exito,     setExito]     = useState<string | null>(null);
  const [errorMsg,  setErrorMsg]  = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/grupales-alumno/login'); return; }

    const now = new Date().toISOString();
    const [{ data: sesioneData }, { data: compraData }] = await Promise.all([
      supabase.rpc('get_sesiones_publicas', { p_dias: 21 }),
      supabase.from('grupales_compras')
        .select('id, clases_restantes, fecha_expira')
        .eq('estado_pago', 'pagado')
        .gt('clases_restantes', 0)
        .gt('fecha_expira', now)
        .order('fecha_expira', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    setSesiones((sesioneData ?? []).filter((s: Sesion) => !s.bloqueada && s.disponibles > 0) as Sesion[]);
    setCompra(compraData as Compra | null);
    setLoading(false);
  }, [router]);

  useEffect(() => { cargar(); }, [cargar]);

  async function reservar(sesion: Sesion) {
    if (!compra) return;
    const key = `${sesion.fecha}|${sesion.hora}|${sesion.clase_id}`;
    setReservando(key);
    setErrorMsg('');
    setExito(null);

    const res = await fetch('/api/grupales-alumno/reservar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clase_id:    sesion.clase_id,
        fecha:       sesion.fecha,
        hora:        sesion.hora,
        nombre_clase: sesion.nombre,
        compra_id:   compra.id,
      }),
    });
    const json = await res.json() as { error?: string };
    setReservando(null);
    if (!res.ok) {
      setErrorMsg(json.error ?? 'Error al reservar. Intenta de nuevo.');
      return;
    }
    setExito(`${sesion.nombre} — ${formatFechaLarga(sesion.fecha)} a las ${sesion.hora}`);
    cargar();
  }

  // Agrupar sesiones por fecha
  const porFecha: Record<string, Sesion[]> = {};
  for (const s of sesiones) {
    if (!porFecha[s.fecha]) porFecha[s.fecha] = [];
    porFecha[s.fecha].push(s);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--nexa-muted)' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--nexa-surface)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4"
        style={{ background: 'var(--nexa-bg)', borderBottom: '1px solid var(--nexa-border)' }}>
        <Link href="/grupales-alumno/dashboard" className="rounded-lg p-1.5" style={{ color: 'var(--nexa-muted)' }}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-[16px] font-black" style={{ color: 'var(--nexa-text)' }}>Reservar clase</h1>
          <p className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>Próximas 3 semanas</p>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-5 space-y-4">

        {/* Sin saldo */}
        {!compra && (
          <div className="rounded-2xl px-5 py-6 text-center"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
            <AlertCircle size={32} className="mx-auto mb-3" style={{ color: 'var(--nexa-warning)' }} />
            <p className="text-[14px] font-semibold" style={{ color: 'var(--nexa-text)' }}>Sin saldo disponible</p>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--nexa-muted)' }}>
              Necesitas un pack activo para reservar clases.
            </p>
            <Link href="/grupales-alumno/comprar"
              className="nexa-btn-primary mt-4 inline-block px-6 py-2.5 text-[13px]">
              Comprar pack
            </Link>
          </div>
        )}

        {/* Saldo disponible */}
        {compra && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
            <CheckCircle2 size={18} style={{ color: 'var(--nexa-success)' }} />
            <p className="text-[13px]" style={{ color: 'var(--nexa-text)' }}>
              <strong>{compra.clases_restantes}</strong> {compra.clases_restantes === 1 ? 'clase disponible' : 'clases disponibles'} ·
              Vence {new Date(compra.fecha_expira).toLocaleDateString('es-CL')}
            </p>
          </div>
        )}

        {/* Éxito */}
        {exito && (
          <div className="flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ background: 'var(--nexa-success-bg)', border: '1px solid var(--nexa-success)' }}>
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--nexa-success)' }} />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--nexa-success)' }}>¡Reserva confirmada!</p>
              <p className="text-[12px]" style={{ color: 'var(--nexa-success)' }}>{exito}</p>
            </div>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="rounded-xl px-4 py-3 text-[12px]"
            style={{ background: 'var(--nexa-danger-bg)', color: 'var(--nexa-danger)' }}>
            {errorMsg}
          </div>
        )}

        {/* Sin sesiones */}
        {Object.keys(porFecha).length === 0 && (
          <div className="rounded-2xl px-5 py-8 text-center"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
            <Calendar size={32} className="mx-auto mb-3" style={{ color: 'var(--nexa-faint)' }} />
            <p className="text-[13px]" style={{ color: 'var(--nexa-muted)' }}>
              No hay clases disponibles en las próximas 3 semanas.
            </p>
          </div>
        )}

        {/* Sesiones agrupadas por fecha */}
        {Object.entries(porFecha).map(([fecha, sesionesDia]) => (
          <div key={fecha} className="overflow-hidden rounded-2xl"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
            <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--nexa-border)', background: 'var(--nexa-card-alt)' }}>
              <p className="text-[12px] font-black uppercase tracking-[0.08em]" style={{ color: 'var(--nexa-text)' }}>
                {formatFechaLarga(fecha)}
              </p>
            </div>
            <ul className="divide-y" style={{ borderColor: 'var(--nexa-border)' }}>
              {sesionesDia.map(s => {
                const key       = `${s.fecha}|${s.hora}|${s.clase_id}`;
                const isLoading = reservando === key;
                return (
                  <li key={key} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--nexa-text)' }}>{s.nombre}</p>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                          <Clock size={11} /> {s.hora}
                        </span>
                        <span className="flex items-center gap-1 text-[11px]"
                          style={{ color: s.disponibles <= 2 ? 'var(--nexa-danger)' : 'var(--nexa-muted)' }}>
                          <Users size={11} /> {s.disponibles} cupo{s.disponibles !== 1 ? 's' : ''}
                        </span>
                        {s.coach_nombre && (
                          <span className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>· {s.coach_nombre}</span>
                        )}
                      </div>
                    </div>
                    <button
                      disabled={!compra || isLoading}
                      onClick={() => reservar(s)}
                      className="shrink-0 rounded-xl px-3 py-1.5 text-[12px] font-bold transition"
                      style={!compra
                        ? { background: 'var(--nexa-card-alt)', color: 'var(--nexa-faint)', cursor: 'not-allowed' }
                        : { background: 'var(--nexa-text)', color: '#fff' }
                      }>
                      {isLoading ? <Loader2 size={13} className="animate-spin" /> : 'Reservar'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
