'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';

interface Pack {
  id: string;
  nombre: string;
  num_clases: number;
  precio_clp: number;
  validez_dias: number;
}

function formatPrecio(n: number) {
  return `$${n.toLocaleString('es-CL')}`;
}

export default function ComprarPage() {
  const router    = useRouter();
  const [packs,   setPacks]   = useState<Pack[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(true);
  const [paying,  setPaying]  = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/grupales-alumno/login'); return; }

      const [{ data: al }, { data: pk }] = await Promise.all([
        supabase.from('grupales_alumnos').select('email').eq('user_id', user.id).single(),
        supabase.from('grupales_packs').select('*').eq('activo', true).order('orden'),
      ]);

      setEmail((al as { email: string } | null)?.email ?? user.email ?? '');
      setPacks((pk ?? []) as Pack[]);
      if (pk && pk.length > 0) setSelected((pk[1] ?? pk[0]).id);
      setLoading(false);
    }
    init();
  }, [router]);

  async function handlePagar() {
    if (!selected) return;
    setError('');
    setPaying(true);
    const res = await fetch('/api/grupales-alumno/pagar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack_id: selected }),
    });
    const json = await res.json() as { payUrl?: string; error?: string };
    if (!res.ok || !json.payUrl) {
      setError(json.error ?? 'Error al crear el pago. Intenta de nuevo.');
      setPaying(false);
      return;
    }
    window.location.href = json.payUrl;
  }

  const packSeleccionado = packs.find(p => p.id === selected);

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
        <Link href="/grupales-alumno/dashboard"
          className="rounded-lg p-1.5" style={{ color: 'var(--nexa-muted)' }}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-[16px] font-black" style={{ color: 'var(--nexa-text)' }}>Comprar pack</h1>
          <p className="text-[11px]" style={{ color: 'var(--nexa-muted)' }}>Elige el pack que más te acomode</p>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-5 space-y-4">
        {/* Packs */}
        <div className="space-y-3">
          {packs.map((p, i) => {
            const isSelected = selected === p.id;
            const isPopular  = i === 1;
            return (
              <button key={p.id} onClick={() => setSelected(p.id)}
                className="w-full rounded-2xl p-4 text-left transition-all"
                style={{
                  background:  isSelected ? 'var(--nexa-text)' : 'var(--nexa-card)',
                  border:      isSelected ? '2px solid var(--nexa-text)' : '2px solid var(--nexa-border)',
                  color:       isSelected ? '#fff' : 'var(--nexa-text)',
                }}>
                <div className="flex items-start justify-between">
                  <div>
                    {isPopular && !isSelected && (
                      <span className="mb-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
                        style={{ background: 'var(--nexa-text)', color: '#fff' }}>
                        Popular
                      </span>
                    )}
                    {isPopular && isSelected && (
                      <span className="mb-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
                        style={{ background: 'rgba(255,255,255,0.25)', color: '#fff' }}>
                        Popular
                      </span>
                    )}
                    <p className="text-[18px] font-black leading-tight">{p.num_clases} clases</p>
                    <p className="mt-0.5 text-[12px]" style={{ opacity: 0.7 }}>
                      Validez {p.validez_dias} días · {formatPrecio(Math.round(p.precio_clp / p.num_clases))} c/u
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[22px] font-black">{formatPrecio(p.precio_clp)}</p>
                    {isSelected && (
                      <div className="mt-1 flex items-center justify-end gap-1">
                        <Check size={12} />
                        <span className="text-[10px] font-semibold">Seleccionado</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Resumen + Pagar */}
        {packSeleccionado && (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
            <div className="px-4 py-4 space-y-2">
              <div className="flex justify-between text-[13px]">
                <span style={{ color: 'var(--nexa-muted)' }}>{packSeleccionado.nombre}</span>
                <span style={{ color: 'var(--nexa-text)' }}>{formatPrecio(packSeleccionado.precio_clp)}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span style={{ color: 'var(--nexa-muted)' }}>Clases</span>
                <span style={{ color: 'var(--nexa-text)' }}>{packSeleccionado.num_clases}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span style={{ color: 'var(--nexa-muted)' }}>Vigencia</span>
                <span style={{ color: 'var(--nexa-text)' }}>{packSeleccionado.validez_dias} días desde el pago</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span style={{ color: 'var(--nexa-muted)' }}>Email</span>
                <span style={{ color: 'var(--nexa-text)' }}>{email}</span>
              </div>
            </div>

            {error && (
              <div className="mx-4 mb-3 rounded-lg px-3 py-2 text-[12px]"
                style={{ background: 'var(--nexa-danger-bg)', color: 'var(--nexa-danger)' }}>
                {error}
              </div>
            )}

            <div className="px-4 pb-4">
              <button onClick={handlePagar} disabled={paying}
                className="nexa-btn-primary flex w-full items-center justify-center gap-2 py-3 text-[14px]">
                {paying
                  ? <><Loader2 size={16} className="animate-spin" /> Redirigiendo a Flow…</>
                  : `Pagar ${formatPrecio(packSeleccionado.precio_clp)}`}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-[11px]" style={{ color: 'var(--nexa-muted)' }}>
          Pago seguro con Flow · Tarjeta de crédito, débito o transferencia
        </p>
      </div>
    </div>
  );
}
