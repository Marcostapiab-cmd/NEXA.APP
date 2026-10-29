'use client';

// RENOVAR MI PLAN (MI NEXA). Todo se calcula y valida en la base de datos
// (migración 044): precio, fechas, clases y estado de la solicitud. Pagar por
// transferencia y subir el comprobante NO activa el plan: lo valida el staff.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, Upload, AlertCircle, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getAtletaPortal } from '@/lib/portal';

interface Opcion { tipo: 'mensual' | 'trimestral' | 'semestral'; precio: number; clases: number; inicio: string; fin: string; actual: boolean }
interface Solicitud { id: string; tipo: string; precio_clp: number; clases: number; estado: 'pendiente_pago' | 'en_revision'; comprobante_at: string | null; inicio_previsto: string }
interface Datos {
  puede: boolean; motivo?: string;
  plan?: { nombre: string; modalidad: string; tipo: string; fin: string; dias_restantes: number; pendientes: number; disponibles: number; agendadas: number };
  modalidad?: string; frecuencia?: number; vencido?: boolean; retencion_hasta?: string;
  horarios_fijos?: { dow: number; hora: string; profesor: string | null }[];
  opciones?: Opcion[];
  solicitud?: Solicitud | null;
  ultima_revision?: { estado: string; motivo_rechazo: string | null } | null;
  transferencia?: { banco?: string; tipo_cuenta?: string; numero?: string; titular?: string; rut?: string; email?: string } | null;
  reglamento_version?: number | null; reglamento_aceptado?: boolean;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const PERIODO: Record<string, string> = { mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral' };
const MODALIDAD: Record<string, string> = { '1:1': 'Personalizado 1:1', '2:1': 'Semipersonalizado 2:1' };
const ERRORES: Record<string, string> = {
  reglamento_pendiente: 'Debes aceptar el reglamento vigente.',
  ya_solicitada: 'Ya tienes una renovación en curso.',
  sin_precio: 'Este plan no tiene precio configurado. Escríbenos.',
  archivo_invalido: 'El archivo no es válido.',
  no_editable: 'Esta solicitud ya no se puede modificar.',
};
const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;
const fecha = (f?: string) => f ? new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '';

export default function RenovarPage() {
  const router = useRouter();
  const [atletaId, setAtletaId] = useState<string | null>(null);
  const [d, setD]               = useState<Datos | null>(null);
  const [elegido, setElegido]   = useState<string | null>(null);
  const [acepto, setAcepto]     = useState(false);
  const [ocupado, setOcupado]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [copiado, setCopiado]   = useState(false);

  const cargar = useCallback(async () => {
    const a = await getAtletaPortal();
    if (a === undefined) { router.push('/portal/login'); return; }
    if (!a) { router.push('/portal/sin-cuenta'); return; }
    setAtletaId(a.id);
    const { data, error: e } = await supabase.rpc('alumno_opciones_renovacion');
    if (e) { setD({ puede: false, motivo: 'no_activo' }); return; }
    const datos = data as Datos;
    setD(datos);
    setElegido(x => x ?? datos.opciones?.find(o => o.actual)?.tipo ?? datos.opciones?.[0]?.tipo ?? null);
  }, [router]);
  useEffect(() => { void Promise.resolve().then(cargar); }, [cargar]);

  async function solicitar() {
    if (!d || !elegido) return;
    setOcupado(true); setError(null);
    if (d.reglamento_version && !d.reglamento_aceptado) {
      const { data: ac } = await supabase.rpc('alumno_aceptar_reglamento', { p_version: d.reglamento_version, p_contexto: 'renovacion' });
      if (!ac?.ok) { setError('No pudimos registrar la aceptación del reglamento.'); setOcupado(false); return; }
    }
    const { data, error: e } = await supabase.rpc('alumno_solicitar_renovacion', { p_tipo: elegido, p_frecuencia: d.frecuencia });
    if (e || !data?.ok) setError(ERRORES[data?.error] ?? 'No pudimos registrar tu solicitud. Intenta de nuevo.');
    await cargar();
    setOcupado(false);
  }

  async function subirComprobante(file: File) {
    if (!d?.solicitud || !atletaId) return;
    if (file.size > 5 * 1024 * 1024) { setError('El archivo pesa más de 5 MB.'); return; }
    setOcupado(true); setError(null);
    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${atletaId}/${d.solicitud.id}-${Date.now()}.${ext}`;
    const { error: up } = await supabase.storage.from('comprobantes').upload(path, file, { contentType: file.type, upsert: false });
    if (up) { setError('No pudimos subir el archivo. Usa una foto (JPG/PNG) o un PDF.'); setOcupado(false); return; }
    const { data, error: e } = await supabase.rpc('alumno_registrar_comprobante', { p_id: d.solicitud.id, p_path: path });
    if (e || !data?.ok) setError(ERRORES[data?.error] ?? 'No pudimos registrar el comprobante.');
    else void fetch('/api/notificaciones/procesar', { method: 'POST' }).catch(() => {});
    await cargar();
    setOcupado(false);
  }

  async function cancelar() {
    if (!d?.solicitud || !confirm('¿Cancelar esta solicitud de renovación?')) return;
    setOcupado(true);
    await supabase.rpc('alumno_cancelar_renovacion', { p_id: d.solicitud.id });
    await cargar();
    setOcupado(false);
  }

  function copiarDatos() {
    const t = d?.transferencia;
    if (!t) return;
    const texto = [t.titular, t.rut, t.banco, t.tipo_cuenta, t.numero, t.email, d?.solicitud ? `Monto: ${clp(d.solicitud.precio_clp)}` : '']
      .filter(Boolean).join('\n');
    void navigator.clipboard?.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); });
  }

  if (!d) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CACACA] border-t-[#121212]" /></div>;
  }

  const op = d.opciones?.find(o => o.tipo === elegido);
  const sol = d.solicitud;
  const t = d.transferencia;
  const hayDatosBanco = !!(t && (t.numero || t.banco));

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="border-b border-[#D8D8D8] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/portal" className="rounded-lg border border-[#CACACA] p-2 text-[#5E5E5E] hover:text-[#121212]" aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-bold text-[#121212]">Renovar mi plan</h1>
            <p className="text-xs text-[#5E5E5E]">Conserva tus horarios y tus clases pendientes</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
        {!d.puede ? (
          <div className="rounded-2xl border border-[#D8D8D8] bg-white p-6 text-sm text-[#5E5E5E]">
            {d.motivo === 'sin_plan'
              ? <>No tienes un plan para renovar. Revisa los planes disponibles en <Link href="/planes" className="font-semibold text-[#121212] underline">nuestra página</Link>.</>
              : 'La renovación en línea estará disponible pronto. Mientras tanto, escríbenos para renovar.'}
          </div>
        ) : (
          <>
            {/* Plan actual */}
            <section className="rounded-2xl border border-[#D8D8D8] bg-white p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">Plan actual</p>
              <p className="mt-1 font-bold text-[#121212]">{d.plan?.nombre}</p>
              <p className="text-xs text-[#5E5E5E]">{MODALIDAD[d.modalidad ?? ''] ?? d.modalidad} · {d.frecuencia} vez/veces por semana</p>
              <p className={`mt-3 text-sm ${d.vencido ? 'font-semibold text-[#dc2626]' : 'text-[#121212]'}`}>
                {d.vencido ? 'Venció el ' : 'Vence el '}{fecha(d.plan?.fin)}
                {!d.vencido && typeof d.plan?.dias_restantes === 'number' && ` (en ${d.plan.dias_restantes} día${d.plan.dias_restantes === 1 ? '' : 's'})`}
              </p>
              {d.vencido && <p className="mt-1 text-xs text-[#5E5E5E]">Te guardamos tus horarios hasta el {fecha(d.retencion_hasta)}.</p>}
              {(d.plan?.pendientes ?? 0) > 0 && (
                <p className="mt-2 rounded-lg bg-[#F5F5F5] px-3 py-2 text-xs text-[#121212]">
                  Te {d.plan!.pendientes === 1 ? 'queda 1 clase' : `quedan ${d.plan!.pendientes} clases`} por realizar. Las que no alcances a usar <b>pasan a tu nuevo período</b> si renuevas.
                </p>
              )}
              {!!d.horarios_fijos?.length && (
                <div className="mt-3">
                  <p className="text-xs text-[#5E5E5E]">Tus horarios fijos (se mantienen al renovar):</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {d.horarios_fijos.map(h => (
                      <span key={`${h.dow}-${h.hora}`} className="rounded-full bg-[#121212] px-2.5 py-1 text-[11px] font-semibold text-white">
                        {DIAS[h.dow]} {h.hora}{h.profesor ? ` · ${h.profesor}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {d.ultima_revision?.estado === 'rechazada' && !sol && (
              <div className="flex gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Tu solicitud anterior no se pudo confirmar: {d.ultima_revision.motivo_rechazo}. Puedes volver a solicitarla.</p>
              </div>
            )}

            {!sol ? (
              /* Elegir período */
              <section className="rounded-2xl border border-[#D8D8D8] bg-white p-5">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">Elige tu próximo período</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {d.opciones?.map(o => (
                    <button key={o.tipo} onClick={() => setElegido(o.tipo)}
                      className={`rounded-xl border p-4 text-left transition ${elegido === o.tipo ? 'border-[#121212] bg-[#121212] text-white' : 'border-[#D8D8D8] bg-white text-[#121212] hover:border-[#121212]'}`}>
                      <p className="text-sm font-bold">{PERIODO[o.tipo]}</p>
                      <p className="mt-1 text-xl font-black">{clp(o.precio)}</p>
                      <p className={`text-xs ${elegido === o.tipo ? 'text-white/70' : 'text-[#5E5E5E]'}`}>{o.clases} clases{o.actual ? ' · tu plan actual' : ''}</p>
                    </button>
                  ))}
                </div>
                {op && (
                  <p className="mt-3 text-xs text-[#5E5E5E]">
                    Tu nuevo período va del <b className="text-[#121212]">{fecha(op.inicio)}</b> al <b className="text-[#121212]">{fecha(op.fin)}</b>. Pago único por el total; si pagas con tarjeta en cuotas, eso lo gestiona tu banco.
                  </p>
                )}
                <p className="mt-1 text-xs text-[#9B9B9B]">¿Quieres cambiar tu frecuencia o modalidad? Escríbenos y lo ajustamos.</p>

                {d.reglamento_version && !d.reglamento_aceptado && (
                  <label className="mt-4 flex items-start gap-2 text-sm text-[#121212]">
                    <input type="checkbox" checked={acepto} onChange={e => setAcepto(e.target.checked)} className="mt-1 h-4 w-4 accent-[#121212]" />
                    <span>He leído y acepto el <Link href="/reglamento" target="_blank" className="font-semibold underline">Reglamento y Condiciones NEXA</Link> (versión {d.reglamento_version}).</span>
                  </label>
                )}
                <button onClick={solicitar}
                  disabled={ocupado || !op || (!!d.reglamento_version && !d.reglamento_aceptado && !acepto)}
                  className="mt-4 w-full rounded-xl bg-[#121212] py-3.5 text-sm font-black tracking-wide text-white transition disabled:opacity-40">
                  {ocupado ? 'Procesando…' : 'RENOVAR PLAN'}
                </button>
              </section>
            ) : (
              /* Solicitud en curso */
              <section className="rounded-2xl border border-[#D8D8D8] bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E5E5E]">Tu renovación</p>
                    <p className="mt-1 font-bold text-[#121212]">{PERIODO[sol.tipo]} · {sol.clases} clases · {clp(sol.precio_clp)}</p>
                    <p className="text-xs text-[#5E5E5E]">Desde el {fecha(sol.inicio_previsto)}</p>
                  </div>
                  {sol.estado === 'en_revision'
                    ? <span className="flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700"><Clock className="h-3 w-3" /> En revisión</span>
                    : <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700"><Clock className="h-3 w-3" /> Pendiente de pago</span>}
                </div>

                {sol.estado === 'en_revision' ? (
                  <div className="mt-4 flex gap-2 rounded-xl bg-[#F5F5F5] p-4 text-sm text-[#121212]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16a34a]" />
                    <p>Recibimos tu comprobante. Lo revisaremos y te avisaremos por correo cuando tu plan quede activo. Tu plan no se activa hasta confirmar el abono.</p>
                  </div>
                ) : (
                  <>
                    <p className="mt-4 text-sm font-semibold text-[#121212]">PAGAR MEDIANTE TRANSFERENCIA</p>
                    {hayDatosBanco ? (
                      <div className="mt-2 rounded-xl bg-[#F5F5F5] p-4 text-sm">
                        <dl className="grid grid-cols-[110px_1fr] gap-y-1">
                          {([['Titular', t?.titular], ['RUT', t?.rut], ['Banco', t?.banco], ['Tipo de cuenta', t?.tipo_cuenta], ['N° de cuenta', t?.numero], ['Email', t?.email], ['Monto', clp(sol.precio_clp)]] as [string, string | undefined][])
                            .filter(([, v]) => v).map(([k, v]) => (
                              <Fragmento key={k} k={k} v={v!} />
                            ))}
                        </dl>
                        <button onClick={copiarDatos} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#121212]">
                          <Copy className="h-3.5 w-3.5" /> {copiado ? 'Copiado' : 'Copiar datos'}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Estamos configurando los datos bancarios. Escríbenos y te los enviamos.</p>
                    )}
                    <label className={`mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black text-white ${ocupado ? 'bg-[#9B9B9B]' : 'bg-[#121212]'}`}>
                      <Upload className="h-4 w-4" /> {ocupado ? 'Subiendo…' : 'Subir comprobante'}
                      <input type="file" accept="image/*,application/pdf" className="hidden" disabled={ocupado}
                        onChange={e => { const f = e.target.files?.[0]; if (f) void subirComprobante(f); e.target.value = ''; }} />
                    </label>
                    <p className="mt-2 text-center text-xs text-[#9B9B9B]">Foto o PDF de hasta 5 MB. Tu plan se activa cuando confirmemos el abono.</p>
                    <button onClick={cancelar} disabled={ocupado} className="mt-3 w-full text-center text-xs text-[#5E5E5E] underline">Cancelar solicitud</button>
                  </>
                )}
              </section>
            )}
          </>
        )}
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </main>
    </div>
  );
}

function Fragmento({ k, v }: { k: string; v: string }) {
  return (<><dt className="text-[#5E5E5E]">{k}</dt><dd className="font-semibold text-[#121212]">{v}</dd></>);
}
