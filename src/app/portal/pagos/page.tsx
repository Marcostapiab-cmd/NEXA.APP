'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ArrowLeft, CheckCircle2, Clock, XCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface Pago {
  id: string;
  monto: number;
  estado: string;
  descripcion?: string;
  checkoutUrl?: string;
  fechaPago?: string;
  createdAt: string;
}

const ESTADO: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pagado:      { label: 'Pagado',    icon: CheckCircle2, color: '#16a34a', bg: '#f0fdf4' },
  pendiente:   { label: 'Pendiente', icon: Clock,        color: '#d97706', bg: '#fffbeb' },
  fallido:     { label: 'Fallido',   icon: XCircle,      color: '#dc2626', bg: '#fef2f2' },
  reembolsado: { label: 'Reembolsado', icon: CheckCircle2, color: '#6b7280', bg: '#f9fafb' },
};

export default function PortalPagosPage() {
  const router = useRouter();
  const [pagos,   setPagos]   = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/portal/login'); return; }

      const { data: atletaData } = await supabase
        .from('atletas').select('id').eq('user_id', user.id).single();
      if (!atletaData) { router.push('/portal/sin-cuenta'); return; }

      const aid = (atletaData as { id: string }).id;
      const { data } = await supabase
        .from('pagos')
        .select('id, monto, estado, descripcion, checkout_url, fecha_pago, created_at')
        .eq('alumno_id', aid)
        .order('created_at', { ascending: false });

      setPagos((data ?? []).map((p: Record<string, unknown>) => ({
        id:          String(p.id),
        monto:       Number(p.monto),
        estado:      String(p.estado),
        descripcion: p.descripcion ? String(p.descripcion) : undefined,
        checkoutUrl: p.checkout_url ? String(p.checkout_url) : undefined,
        fechaPago:   p.fecha_pago ? String(p.fecha_pago).slice(0, 10) : undefined,
        createdAt:   String(p.created_at),
      })));
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="border-b border-[#D8D8D8] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/portal" className="rounded-lg border border-[#CACACA] p-2 text-[#5E5E5E] hover:text-[#121212]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-bold text-[#121212]">Mis pagos</h1>
            <p className="text-xs text-[#5E5E5E]">Historial de cobros</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 py-6 sm:px-6">
        {pagos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D8D8D8] bg-white py-16 text-center">
            <p className="font-semibold text-[#5E5E5E]">Sin pagos registrados</p>
          </div>
        ) : pagos.map(p => {
          const cfg = ESTADO[p.estado] ?? ESTADO.pendiente;
          const Icn = cfg.icon;
          return (
            <div key={p.id} className="rounded-2xl border border-[#D8D8D8] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#121212]">{p.descripcion || 'Cobro'}</p>
                  <p className="mt-0.5 text-sm text-[#5E5E5E]">
                    <span className="font-bold text-[#121212]">${p.monto.toLocaleString('es-CL')} CLP</span>
                    {p.fechaPago
                      ? ` · Pagado el ${new Date(p.fechaPago).toLocaleDateString('es-CL')}`
                      : ` · ${new Date(p.createdAt).toLocaleDateString('es-CL')}`
                    }
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{ color: cfg.color, background: cfg.bg }}>
                    <Icn className="h-3 w-3" />
                    {cfg.label}
                  </span>
                  {p.checkoutUrl && p.estado === 'pendiente' && (
                    <a href={p.checkoutUrl} target="_blank" rel="noreferrer"
                      className="rounded-lg bg-[#121212] px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110">
                      Pagar <ExternalLink className="ml-1 inline h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
