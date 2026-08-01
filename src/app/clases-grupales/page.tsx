'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { getSesionesDisponibles, type SesionGrupal } from '@/lib/clases-grupales';

const DIA_LABELS: Record<number, string> = {
  0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb',
};

const MES_LABELS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function FechaChip({ fecha, diaSemana }: { fecha: string; diaSemana: number }) {
  const d   = new Date(fecha + 'T12:00:00');
  const dia = d.getDate();
  const mes = MES_LABELS[d.getMonth()];
  return (
    <div className="text-center shrink-0 w-11">
      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--nexa-muted)' }}>
        {DIA_LABELS[diaSemana]}
      </p>
      <p className="text-[20px] font-black leading-tight" style={{ color: 'var(--nexa-text)' }}>
        {dia}
      </p>
      <p className="text-[9px] uppercase" style={{ color: 'var(--nexa-muted)' }}>{mes}</p>
    </div>
  );
}

function CuposBadge({ s }: { s: SesionGrupal }) {
  if (s.bloqueada) {
    return (
      <span className="text-[10px] font-bold px-2 py-1 rounded-lg"
        style={{ background: 'rgba(155,155,155,0.12)', color: 'var(--nexa-muted)' }}>
        Bloqueado
      </span>
    );
  }
  if (s.disponibles === 0) {
    return (
      <span className="text-[10px] font-bold px-2 py-1 rounded-lg"
        style={{ background: 'rgba(180,64,64,0.12)', color: '#B44040' }}>
        Llena
      </span>
    );
  }
  return (
    <div className="text-right">
      <p className="text-[20px] font-black leading-tight" style={{ color: 'var(--nexa-accent)' }}>
        {s.disponibles}
      </p>
      <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--nexa-muted)' }}>
        de {s.capacidad}
      </p>
    </div>
  );
}

export default function ClasesGrupalesPage() {
  const [sesiones, setSesiones] = useState<SesionGrupal[]>([]);
  const [loading,  setLoading]  = useState(true);

  async function cargar() {
    setLoading(true);
    const data = await getSesionesDisponibles(14);
    setSesiones(data);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, []);

  // Agrupar por fecha para separadores visuales
  const porFecha = sesiones.reduce<Record<string, SesionGrupal[]>>((acc, s) => {
    (acc[s.fecha] ??= []).push(s);
    return acc;
  }, {});

  return (
    <main className="min-h-screen" style={{ background: 'var(--nexa-black)' }}>
      <div className="mx-auto max-w-lg px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-black tracking-[0.12em]" style={{ color: 'var(--nexa-text)' }}>
              CLASES GRUPALES
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--nexa-muted)' }}>
              Vista de prueba · próximos 14 días
            </p>
          </div>
          <button onClick={cargar} disabled={loading}
            className="p-2 rounded-xl transition"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)', color: 'var(--nexa-muted)', opacity: loading ? 0.4 : 1 }}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading && (
          <p className="text-[12px] text-center py-12" style={{ color: 'var(--nexa-muted)' }}>
            Calculando disponibilidad...
          </p>
        )}

        {!loading && sesiones.length === 0 && (
          <p className="text-[12px] text-center py-12" style={{ color: 'var(--nexa-muted)' }}>
            No hay clases grupales programadas en los próximos 14 días.
          </p>
        )}

        {!loading && Object.entries(porFecha).map(([fecha, sesionesDia]) => (
          <div key={fecha} className="mb-4">
            <div className="space-y-2">
              {sesionesDia.map(s => (
                <div key={`${s.claseId}-${s.fecha}`}
                  className="flex items-center gap-4 rounded-xl px-4 py-3"
                  style={{
                    background: 'var(--nexa-card)',
                    border: '1px solid var(--nexa-border)',
                    opacity: (s.bloqueada || s.disponibles === 0) ? 0.5 : 1,
                  }}>
                  <FechaChip fecha={s.fecha} diaSemana={s.diaSemana} />

                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold truncate" style={{ color: 'var(--nexa-text)' }}>
                      {s.nombre}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
                      {s.hora}
                      {s.reservadas > 0 && (
                        <span> · {s.reservadas} reservada{s.reservadas !== 1 ? 's' : ''}</span>
                      )}
                    </p>
                  </div>

                  <CuposBadge s={s} />
                </div>
              ))}
            </div>
          </div>
        ))}

      </div>
    </main>
  );
}
