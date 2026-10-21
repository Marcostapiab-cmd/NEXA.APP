'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { DIAS_LARGO, MESES_CORTO, MESES_LARGO } from '@/lib/format';
import SelectorSesion, { type SesionElegida } from '@/components/publico/SelectorSesion';

type Rel = { nombre: string } | { nombre: string }[] | null;
interface CompraActiva {
  id: string; clases_restantes: number; fecha_expira: string;
  planes_grupales: Rel; grupales_packs: Rel;
}
const nombreRel = (r: Rel) => (Array.isArray(r) ? r[0]?.nombre : r?.nombre);
const fechaCorta = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MESES_CORTO[d.getMonth()]}`; };
const fechaLarga = (f: string) => { const d = new Date(`${f}T12:00:00`); return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`; };

export default function ReservarGrupal() {
  const router = useRouter();
  const [compras,   setCompras]   = useState<CompraActiva[]>([]);
  const [compraId,  setCompraId]  = useState<string | null>(null);
  const [sesion,    setSesion]    = useState<SesionElegida | null>(null);
  const [estado,    setEstado]    = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [enviando,  setEnviando]  = useState(false);
  const [error,     setError]     = useState('');
  const [hecha,     setHecha]     = useState<SesionElegida | null>(null);
  const [version,   setVersion]   = useState(0); // recarga el selector tras reservar

  const cargar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/grupales-alumno/login?redirect=/grupales-alumno/reservar'); return; }
    const { data: al } = await supabase.from('grupales_alumnos').select('id').eq('user_id', user.id).maybeSingle();
    if (!al) { setEstado('error'); return; }
    const { data, error: err } = await supabase.from('grupales_compras')
      .select('id, clases_restantes, fecha_expira, planes_grupales(nombre), grupales_packs(nombre)')
      .eq('alumno_id', (al as { id: string }).id)
      .eq('estado_pago', 'pagado')
      .gt('fecha_expira', new Date().toISOString())
      .gt('clases_restantes', 0)
      .order('fecha_expira', { ascending: true });
    if (err) { setEstado('error'); return; }
    const lista = (data ?? []) as unknown as CompraActiva[];
    setCompras(lista);
    setCompraId(prev => (prev && lista.some(c => c.id === prev)) ? prev : lista[0]?.id ?? null);
    setEstado('ok');
  }, [router]);

  // Carga inicial (los datos se aplican en el callback, no durante el efecto)
  useEffect(() => { Promise.resolve().then(cargar); }, [cargar]);

  const compra = compras.find(c => c.id === compraId) ?? null;

  async function reservar() {
    if (!sesion || !compra || enviando) return;
    setError('');
    setEnviando(true);
    try {
      const res = await fetch('/api/grupales-alumno/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clase_id: sesion.clase_id, fecha: sesion.fecha, hora: sesion.hora, compra_id: compra.id }),
      });
      const json = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'No pudimos reservar. Intenta de nuevo.');
        setVersion(v => v + 1); // cupos actualizados
        setSesion(null);
        return;
      }
      setHecha(sesion);
      setSesion(null);
      setVersion(v => v + 1);
      await cargar();
    } catch {
      setError('Sin conexión. Revisa tu internet e intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="nx-container max-w-3xl">
      <Link href="/grupales-alumno/dashboard" className="nx-btn nx-btn-ghost -ml-3 mb-4"><ArrowLeft size={16} aria-hidden /> Mi cuenta</Link>
      <p className="nx-eyebrow mb-2">Reservar</p>
      <h1 className="nx-display mb-8 text-[32px] sm:text-[40px]" style={{ color: 'var(--nx-white)' }}>Elige tu clase.</h1>

      {hecha && (
        <div role="status" className="nx-alert nx-alert-success mb-6 flex gap-3">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>Reserva confirmada: <strong>{hecha.nombre}</strong>, {fechaLarga(hecha.fecha)} a las {hecha.hora}.</span>
        </div>
      )}
      {error && <p role="alert" className="nx-alert nx-alert-error mb-6">{error}</p>}

      {estado === 'cargando' && <div className="space-y-3" aria-busy="true"><div className="nx-skeleton h-20" /><div className="nx-skeleton h-64" /></div>}
      {estado === 'error' && <p role="alert" className="nx-alert nx-alert-error">No pudimos cargar tus planes. Recarga la página.</p>}

      {estado === 'ok' && compras.length === 0 && (
        <div className="nx-card p-6 text-center sm:p-10">
          <p className="text-[16px] font-semibold" style={{ color: 'var(--nx-white)' }}>No tienes clases disponibles.</p>
          <p className="mt-2 text-[14px]" style={{ color: 'var(--nx-muted)' }}>Compra un plan para reservar tu próxima clase.</p>
          <Link href="/planes#grupales" className="nx-btn nx-btn-primary mt-6">Ver planes</Link>
        </div>
      )}

      {estado === 'ok' && compra && (
        <div className="space-y-8">
          {compras.length > 1 ? (
            <fieldset>
              <legend className="nx-label">Usar clases de</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {compras.map(c => (
                  <button key={c.id} type="button" role="radio" aria-checked={c.id === compraId}
                    onClick={() => { setCompraId(c.id); setSesion(null); }}
                    className="nx-card px-4 py-3 text-left" data-selected={c.id === compraId}>
                    <span className="block text-[14px] font-semibold" style={{ color: 'var(--nx-white)' }}>{nombreRel(c.planes_grupales) ?? nombreRel(c.grupales_packs) ?? 'Pack'}</span>
                    <span className="text-[12px]" style={{ color: 'var(--nx-muted)' }}>{c.clases_restantes} disponibles · vence {fechaCorta(c.fecha_expira)}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="text-[14px]" style={{ color: 'var(--nx-muted)' }}>
              {nombreRel(compra.planes_grupales) ?? nombreRel(compra.grupales_packs) ?? 'Tu pack'}: <strong style={{ color: 'var(--nx-white)' }}>{compra.clases_restantes}</strong> {compra.clases_restantes === 1 ? 'clase disponible' : 'clases disponibles'} · vence {fechaCorta(compra.fecha_expira)}
            </p>
          )}

          <SelectorSesion key={`${compra.id}-${version}`} valor={sesion} onCambio={s => { setSesion(s); setHecha(null); }}
            dias={21} hasta={new Date(compra.fecha_expira)} />

          <div className="sticky bottom-0 -mx-4 border-t px-4 py-4 sm:static sm:mx-0 sm:border-0 sm:p-0"
            style={{ background: 'var(--nx-black)', borderColor: 'var(--nx-line)', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button type="button" onClick={reservar} disabled={!sesion || enviando} aria-busy={enviando}
              className="nx-btn nx-btn-primary nx-btn-block sm:w-auto">
              {enviando && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {enviando ? 'Reservando…' : sesion ? `Reservar ${sesion.hora} · usa 1 clase` : 'Elige un horario'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
