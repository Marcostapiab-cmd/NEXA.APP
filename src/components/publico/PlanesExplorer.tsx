'use client';

import { useState } from 'react';
import { clp } from '@/lib/format';
import {
  DIAS_POR_TIPO, FRECUENCIAS, MODALIDADES, MODALIDAD_INFO, TIPOS_PLAN, TIPO_LABEL,
  buscarPrecio, descuentoMensual, esClaseDePrueba, etiquetaClases, etiquetaDias,
  montoTotalPlan, precioMensualPlan, sesionesTotalesPlan,
  type CatalogoPublico, type PlanGrupal, type TipoPlan,
} from '@/lib/catalogo';
import PlanCard from './PlanCard';
import CompraGrupalModal from './CompraGrupalModal';
import CompraPersonalModal, { type SeleccionPersonal } from './CompraPersonalModal';

function Categoria({ id, titulo, desc, children }: { id: string; titulo: string; desc?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-28">
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <h3 className="nx-display text-[24px] sm:text-[28px]" style={{ color: 'var(--nx-white)', fontWeight: 700 }}>{titulo}</h3>
        {desc && <p className="max-w-md text-[14px]" style={{ color: 'var(--nx-muted)' }}>{desc}</p>}
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

export default function PlanesExplorer({ catalogo, comprarInicial }: { catalogo: CatalogoPublico; comprarInicial?: string }) {
  // /planes?comprar=<id> abre directamente la compra de ese pack
  const planInicial = comprarInicial ? catalogo.grupales.find(g => g.id === comprarInicial) ?? null : null;
  const [tipo,       setTipo]       = useState<TipoPlan>('mensual');
  const [abierta,    setAbierta]    = useState<string | null>(planInicial ? `g-${planInicial.id}` : null);
  const [grupal,     setGrupal]     = useState<PlanGrupal | null>(planInicial);
  const [personal,   setPersonal]   = useState<SeleccionPersonal | null>(null);

  const toggle = (k: string) => setAbierta(a => a === k ? null : k);
  const descuento = descuentoMensual(tipo, catalogo.config);

  if (catalogo.error && catalogo.grupales.length === 0 && catalogo.precios.length === 0) {
    return (
      <p role="alert" className="nx-alert nx-alert-error">
        No pudimos cargar los planes en este momento. Recarga la página en unos minutos.
      </p>
    );
  }

  return (
    <div className="space-y-20">
      {catalogo.grupales.length > 0 && (
        <Categoria id="grupales" titulo="Clases grupales"
          desc="Packs por cantidad de clases. Reservas tus horarios según los cupos disponibles.">
          {catalogo.grupales.map(p => {
            const k = `g-${p.id}`;
            const detalles = [
              etiquetaClases(p.num_clases),
              `Válido por ${etiquetaDias(p.validez_dias)} desde la confirmación del pago`,
              'Reservas cada clase según los cupos disponibles',
            ];
            if (esClaseDePrueba(p)) detalles.push('Una sola vez por persona');
            return (
              <PlanCard key={p.id}
                titulo={p.nombre}
                precio={clp(p.precio_clp)}
                precioNota={`${etiquetaClases(p.num_clases)} · ${etiquetaDias(p.validez_dias)}`}
                etiqueta={p.destacado ? 'Popular' : undefined}
                detalles={detalles}
                descripcion={p.descripcion}
                abierto={abierta === k}
                onToggle={() => toggle(k)}
                onComprar={() => setGrupal(p)} />
            );
          })}
        </Categoria>
      )}

      {catalogo.precios.length > 0 && (
        <div id="personalizado" className="scroll-mt-28 space-y-14">
          <div>
            <p className="nx-eyebrow mb-3">Entrenamiento personalizado</p>
            <p className="max-w-xl text-[15px] leading-relaxed" style={{ color: 'var(--nx-sub)' }}>
              Elige la duración, la modalidad y cuántas veces por semana quieres entrenar.
            </p>
            <div role="tablist" aria-label="Duración del plan"
              className="mt-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1"
              style={{ border: '1px solid var(--nx-line)', background: 'var(--nx-graphite)' }}>
              {TIPOS_PLAN.map(t => (
                <button key={t} type="button" role="tab" aria-selected={tipo === t}
                  onClick={() => { setTipo(t); setAbierta(null); }}
                  className="nx-chip border-0 px-5 text-[12px] uppercase tracking-[0.14em]">
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
            {descuento > 0 && (
              <p className="mt-3 text-[13px]" style={{ color: 'var(--nx-muted)' }} aria-live="polite">
                Plan {TIPO_LABEL[tipo].toLowerCase()}: {clp(descuento)} menos por mes respecto del plan mensual.
              </p>
            )}
          </div>

          {MODALIDADES.map(m => {
            const filas = FRECUENCIAS.map(fr => ({ fr, precio: buscarPrecio(catalogo.precios, m, fr) })).filter(x => x.precio);
            if (filas.length === 0) return null;
            return (
              <Categoria key={m} id={`modalidad-${m.replace(':', '')}`} titulo={MODALIDAD_INFO[m].titulo} desc={MODALIDAD_INFO[m].desc}>
                {filas.map(({ fr, precio }) => {
                  const k = `p-${m}-${fr}-${tipo}`;
                  const mes   = precioMensualPlan(precio!.precio_mes_clp, tipo, catalogo.config);
                  const total = montoTotalPlan(precio!.precio_mes_clp, tipo, catalogo.config);
                  const ses   = sesionesTotalesPlan(fr, tipo);
                  return (
                    <PlanCard key={k}
                      titulo={`${fr} ${fr === 1 ? 'vez' : 'veces'} por semana`}
                      precio={clp(total)}
                      precioNota={tipo === 'mensual' ? `${ses} sesiones · ${DIAS_POR_TIPO[tipo]} días` : `${clp(mes)} por mes · ${ses} sesiones`}
                      detalles={[
                        `${ses} sesiones de ${MODALIDAD_INFO[m].titulo.toLowerCase()}`,
                        `Vigencia: ${DIAS_POR_TIPO[tipo]} días desde la confirmación del pago`,
                        `Eliges ${fr === 1 ? 'el día' : `los ${fr} días`} de la semana y tu hora`,
                        'NEXA asigna tu coach después del pago',
                      ]}
                      abierto={abierta === k}
                      onToggle={() => toggle(k)}
                      onComprar={() => setPersonal({ modalidad: m, frecuencia: fr, tipo, precioMes: mes, total })} />
                  );
                })}
              </Categoria>
            );
          })}
        </div>
      )}

      {grupal   && <CompraGrupalModal plan={grupal} onCerrar={() => setGrupal(null)} />}
      {personal && <CompraPersonalModal sel={personal} onCerrar={() => setPersonal(null)} />}
    </div>
  );
}
