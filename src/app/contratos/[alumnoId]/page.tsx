'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Printer, ArrowLeft, CheckCircle, Save } from 'lucide-react';
import { getAlumnoById, getAtletaSaludDB, updateAlumno } from '@/lib/alumnos';
import { getPlanesAlumnoDB } from '@/lib/planes-supabase';
import type { Alumno, AtletaSalud } from '@/app/alumnos/page';
import type { Plan } from '@/lib/planes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(date: string) {
  if (!date) return '___/___/______';
  try {
    return new Date(date + 'T12:00:00').toLocaleDateString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return date; }
}

function fmtLong(date: string) {
  if (!date) return '';
  try {
    return new Date(date + 'T12:00:00').toLocaleDateString('es-CL', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return date; }
}

function tipoLabel(tipo: string) {
  if (tipo === '1a1' || tipo === '1:1') return '1:1 Individual';
  if (tipo === '2a1' || tipo === '2:1') return '2:1 Duo';
  if (tipo === 'grupal') return 'Grupal';
  return tipo;
}

function semanas(start: string, end: string): number {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000));
}

// ─── Contrato visual ─────────────────────────────────────────────────────────

function ContratoDoc({ a, salud, plan, extra }: {
  a: Alumno;
  salud: AtletaSalud | null;
  plan: Plan | null;
  extra: Extra;
}) {
  const sw = plan ? semanas(plan.startDate, plan.endDate) : 0;
  const clasesSemana = extra.clasesSemana || (sw > 0 && plan ? Math.round(plan.totalClases / sw) : 0);

  return (
    <div id="contrato-doc" style={{
      background: '#000000',
      color: '#ffffff',
      fontFamily: 'Georgia, serif',
      padding: '48px 56px',
      minHeight: '297mm',
      maxWidth: '210mm',
      margin: '0 auto',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 36, fontWeight: 'bold', letterSpacing: 6, color: '#ffffff', fontFamily: 'Arial, sans-serif' }}>
          NEXA
        </div>
        <div style={{ fontSize: 11, letterSpacing: 4, color: '#C9A84C', marginTop: 4, fontFamily: 'Arial, sans-serif' }}>
          TRAINING STUDIO
        </div>
        <div style={{ fontSize: 10, color: '#888888', marginTop: 2, fontFamily: 'Arial, sans-serif' }}>
          Where Strength Connects
        </div>
        <div style={{ border: '1px solid #C9A84C', marginTop: 16, marginBottom: 0 }} />
      </div>

      {/* Título */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 'bold', letterSpacing: 2, color: '#ffffff', fontFamily: 'Arial, sans-serif' }}>
          CONTRATO DE SERVICIOS DE ENTRENAMIENTO PERSONAL
        </div>
        <div style={{ fontSize: 11, color: '#888888', marginTop: 6, fontFamily: 'Arial, sans-serif' }}>
          Fecha: {fmtLong(new Date().toISOString().slice(0, 10))}
        </div>
      </div>

      <Section title="1. IDENTIFICACIÓN DEL ALUMNO">
        <Row2 label1="Nombre completo" val1={`${a.nombre} ${a.apellido}`.trim()} label2="RUT" val2={a.rut || '—'} />
        <Row2 label1="Email" val1={a.email || '—'} label2="Teléfono" val2={a.telefono || '—'} />
        <Row2 label1="Fecha nacimiento" val1={a.fechaNacimiento ? fmt(a.fechaNacimiento) : '—'} label2="Dirección" val2={extra.direccion || '—'} />
        <Row1 label="Contacto de emergencia"
          val={[a.contactoEmergenciaNombre, a.contactoEmergenciaTel]
            .filter(Boolean).join(' · ') || '—'} />
      </Section>

      <Section title="2. PLAN DE ENTRENAMIENTO CONTRATADO">
        <Row2 label1="Modalidad" val1={plan ? tipoLabel(plan.tipo) : '—'} label2="Plan" val2={plan?.nombre || '—'} />
        <Row2 label1="Clases / semana" val1={clasesSemana ? `${clasesSemana} clases / semana` : '—'} label2="Total clases" val2={plan ? `${plan.totalClases} clases` : '—'} />
        <Row2 label1="Fecha inicio" val1={plan?.startDate ? fmt(plan.startDate) : '—'} label2="Fecha término" val2={plan?.endDate ? fmt(plan.endDate) : '—'} />
        <Row2 label1="Profesor asignado" val1={extra.profesor || '—'} label2="Objetivo" val2={a.objetivo || '—'} />
      </Section>

      <Section title="3. ANTECEDENTES DE SALUD (CONFIDENCIAL)">
        <Row1 label="Enfermedades / condiciones" val={salud?.enfermedades || 'Ninguna'} />
        <Row1 label="Lesiones o limitaciones"    val={salud?.lesiones     || 'Ninguna'} />
        <Row1 label="Medicamentos actuales"       val={salud?.medicamentos  || 'Ninguno'} />
        <Row1 label="Nivel de actividad previa"   val={extra.nivelActividad || 'Moderado'} />
        <Row1 label="Autorización uso de imagen"  val={extra.autorizaImagen ? 'Sí autoriza' : 'No autoriza'} />
      </Section>

      <Section title="4. CONDICIONES DEL SERVICIO">
        <Clausula num="4.1" titulo="Política de cancelación">
          Para clases AM (antes de las 12:00 hrs), el alumno debe cancelar antes de las 21:00 hrs del día anterior.
          Para clases desde las 12:00 hrs, la cancelación debe realizarse con al menos 6 horas de anticipación.
          El incumplimiento resultará en el descuento de la clase del plan contratado.
        </Clausula>
        <Clausula num="4.2" titulo="Clases no utilizadas">
          Las inasistencias sin aviso dentro del plazo establecido serán descontadas del plan.
          No se realizarán reembolsos por cancelaciones tardías. Las clases no utilizadas al vencimiento del período no son acumulables.
        </Clausula>
        <Clausula num="4.3" titulo="Vigencia del plan">
          El plan tiene vigencia desde el {plan?.startDate ? fmt(plan.startDate) : '___/___/______'} hasta
          el {plan?.endDate ? fmt(plan.endDate) : '___/___/______'}. Vencido el período, las clases no realizadas
          no serán reembolsables salvo casos de fuerza mayor debidamente documentados.
        </Clausula>
        <Clausula num="4.4" titulo="Forma de pago">
          El pago del plan contratado debe realizarse de forma anticipada, antes del inicio de las clases
          correspondientes al período acordado. No se garantiza la reserva del horario ni del profesor asignado
          sin la confirmación del pago previo.
        </Clausula>
        <Clausula num="4.5" titulo="Reagendamiento">
          Las clases canceladas dentro del plazo podrán reagendarse sin costo adicional, sujeto a disponibilidad
          del profesor y horario.
        </Clausula>
        <Clausula num="4.6" titulo="Responsabilidad médica">
          El alumno declara estar en condiciones físicas para realizar entrenamiento. NEXA no se responsabiliza
          por lesiones derivadas de omisión de información médica. Es obligación del alumno informar cualquier
          cambio en su estado de salud.
        </Clausula>
        <Clausula num="4.7" titulo="Uso de imagen">
          El alumno {extra.autorizaImagen ? 'sí' : 'no'} autoriza el uso de su imagen en fotografías o videos
          con fines promocionales de NEXA Training Studio en redes sociales y material de marketing.
        </Clausula>
        <Clausula num="4.8" titulo="Datos personales">
          Los datos de salud e información personal del alumno son tratados de manera confidencial y utilizados
          exclusivamente para la planificación del entrenamiento. No serán compartidos con terceros.
        </Clausula>
      </Section>

      {/* Firmas */}
      <div style={{ borderTop: '1px solid #C9A84C', marginTop: 24, paddingTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 'bold', letterSpacing: 2, color: '#C9A84C', marginBottom: 12, fontFamily: 'Arial, sans-serif' }}>
          5. FIRMAS Y ACEPTACIÓN
        </div>
        <div style={{ fontSize: 10, color: '#cccccc', marginBottom: 28, fontFamily: 'Arial, sans-serif' }}>
          Habiendo leído y comprendido todas las condiciones, las partes manifiestan su conformidad y suscriben el presente contrato.
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 40 }}>
          <FirmaBox nombre={`${a.nombre} ${a.apellido}`.trim()} rol="Alumno/a" rut={a.rut} />
          <FirmaBox nombre="NEXA Training Studio" rol="Representante legal" rut="76.XXX.XXX-X" />
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #333333', marginTop: 32, paddingTop: 10, textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: '#555555', fontFamily: 'Arial, sans-serif' }}>
          NEXA Training Studio · Where Strength Connects · Generado el {fmtLong(new Date().toISOString().slice(0, 10))}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componentes del contrato ─────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 12, fontWeight: 'bold', letterSpacing: 2,
        color: '#C9A84C', textAlign: 'center', marginBottom: 10,
        fontFamily: 'Arial, sans-serif',
      }}>
        {title}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: 'Arial, sans-serif' }}>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Row2({ label1, val1, label2, val2 }: { label1: string; val1: string; label2: string; val2: string }) {
  const cell: React.CSSProperties = { border: '1px solid #2a2a2a', padding: '7px 10px', color: '#cccccc' };
  const header: React.CSSProperties = { ...cell, color: '#C9A84C', fontWeight: 'bold', width: '18%', background: '#0a0a0a' };
  return (
    <tr>
      <td style={header}>{label1}</td>
      <td style={{ ...cell, width: '32%' }}>{val1}</td>
      <td style={header}>{label2}</td>
      <td style={{ ...cell, width: '32%' }}>{val2}</td>
    </tr>
  );
}

function Row1({ label, val }: { label: string; val: string }) {
  const cell: React.CSSProperties = { border: '1px solid #2a2a2a', padding: '7px 10px', color: '#cccccc' };
  const header: React.CSSProperties = { ...cell, color: '#C9A84C', fontWeight: 'bold', width: '28%', background: '#0a0a0a' };
  return (
    <tr>
      <td style={header}>{label}</td>
      <td style={cell}>{val}</td>
    </tr>
  );
}

function Clausula({ num, titulo, children }: { num: string; titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ fontSize: 10, fontWeight: 'bold', color: '#cccccc', marginBottom: 3 }}>
        {num} {titulo}
      </div>
      <div style={{ fontSize: 9.5, color: '#aaaaaa', lineHeight: 1.6, textAlign: 'justify' }}>
        {children}
      </div>
    </div>
  );
}

function FirmaBox({ nombre, rol, rut }: { nombre: string; rol: string; rut?: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ borderBottom: '1px solid #555555', marginBottom: 8, paddingBottom: 24 }} />
      <div style={{ fontSize: 10, color: '#cccccc' }}>{nombre}</div>
      <div style={{ fontSize: 9, color: '#888888', marginTop: 2 }}>{rol}</div>
      {rut && <div style={{ fontSize: 9, color: '#888888', marginTop: 2 }}>RUT: {rut}</div>}
      <div style={{ fontSize: 9, color: '#888888', marginTop: 4 }}>Fecha: _______________</div>
    </div>
  );
}

// ─── Datos extra (no en DB) ───────────────────────────────────────────────────

interface Extra {
  direccion: string;
  clasesSemana: number;
  profesor: string;
  nivelActividad: string;
  autorizaImagen: boolean;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContratoPage() {
  const params   = useParams();
  const router   = useRouter();
  const alumnoId = String(params.alumnoId);

  const [alumno,  setAlumno]  = useState<Alumno | null>(null);
  const [salud,   setSalud]   = useState<AtletaSalud | null>(null);
  const [plan,    setPlan]    = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const [extra, setExtra] = useState<Extra>({
    direccion:      '',
    clasesSemana:   0,
    profesor:       '',
    nivelActividad: 'Moderado',
    autorizaImagen: true,
  });

  useEffect(() => {
    Promise.all([
      getAlumnoById(alumnoId),
      getAtletaSaludDB(alumnoId),
      getPlanesAlumnoDB(alumnoId),
    ]).then(([a, s, planes]) => {
      setAlumno(a);
      setSalud(s);
      const activePlan = planes.find(p => p.endDate >= new Date().toISOString().slice(0, 10)) ?? planes[0] ?? null;
      setPlan(activePlan);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [alumnoId]);

  async function marcarFirmado() {
    if (!alumno) return;
    setSaving(true);
    try {
      const updated = await updateAlumno(alumno.id, {
        contratoFirmado:    true,
        contratoFechaFirma: new Date().toISOString().slice(0, 10),
      });
      if (updated) {
        setAlumno(prev => prev ? { ...prev, contratoFirmado: true, contratoFechaFirma: new Date().toISOString().slice(0, 10) } : prev);
        setSaved(true);
      }
    } catch {
      alert('Error al marcar como firmado. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  function imprimir() {
    window.print();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[#888888]">Cargando contrato...</p>
      </main>
    );
  }

  if (!alumno) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-red-500">Alumno no encontrado.</p>
      </main>
    );
  }

  return (
    <>
      {/* Estilos de impresión */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #contrato-doc, #contrato-doc * { visibility: visible !important; }
          #contrato-doc {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100vw !important;
            padding: 32px 48px !important;
            margin: 0 !important;
          }
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `}</style>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Toolbar — se oculta al imprimir */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-[#777777] transition hover:text-[#121212]"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="flex items-center gap-2">
            {saved || alumno.contratoFirmado ? (
              <div className="flex items-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-[12px] font-medium text-green-700">
                <CheckCircle className="h-4 w-4" />
                Contrato firmado
              </div>
            ) : (
              <button
                onClick={marcarFirmado}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl border border-[#CACACA] px-4 py-2 text-[12px] font-medium text-[#5E5E5E] transition hover:border-[#888888] hover:text-[#121212] disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Guardando…' : 'Marcar como firmado'}
              </button>
            )}
            <button
              onClick={imprimir}
              className="flex items-center gap-2 rounded-xl bg-[#121212] px-4 py-2 text-[12px] font-bold text-white transition hover:brightness-110"
            >
              <Printer className="h-4 w-4" />
              Imprimir / PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Panel de datos extra */}
          <div className="space-y-4 rounded-2xl border border-[#D8D8D8] bg-[#F8F8F8] p-5 lg:self-start">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]">Datos del contrato</p>

            <Field label="Dirección del alumno">
              <input value={extra.direccion} onChange={e => setExtra(x => ({ ...x, direccion: e.target.value }))}
                placeholder="Av. Providencia 1234, Santiago"
                className="w-full rounded-xl border border-[#CACACA] bg-white px-3 py-2 text-sm text-[#121212] placeholder-[#AAAAAA] outline-none focus:border-[#121212]" />
            </Field>

            <Field label="Nombre del profesor">
              <input value={extra.profesor} onChange={e => setExtra(x => ({ ...x, profesor: e.target.value }))}
                placeholder="Marcos V."
                className="w-full rounded-xl border border-[#CACACA] bg-white px-3 py-2 text-sm text-[#121212] placeholder-[#AAAAAA] outline-none focus:border-[#121212]" />
            </Field>

            <Field label="Clases por semana">
              <input type="number" min={1} max={14}
                value={extra.clasesSemana || ''}
                onChange={e => setExtra(x => ({ ...x, clasesSemana: Number(e.target.value) }))}
                placeholder="3"
                className="w-full rounded-xl border border-[#CACACA] bg-white px-3 py-2 text-sm text-[#121212] placeholder-[#AAAAAA] outline-none focus:border-[#121212]" />
            </Field>

            <Field label="Nivel de actividad previa">
              <select value={extra.nivelActividad} onChange={e => setExtra(x => ({ ...x, nivelActividad: e.target.value }))}
                className="w-full rounded-xl border border-[#CACACA] bg-white px-3 py-2 text-sm text-[#121212] outline-none focus:border-[#121212]">
                <option>Sedentario</option>
                <option>Bajo</option>
                <option>Moderado</option>
                <option>Alto</option>
                <option>Atleta</option>
              </select>
            </Field>

            <Field label="Autorización uso de imagen">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={extra.autorizaImagen}
                  onChange={e => setExtra(x => ({ ...x, autorizaImagen: e.target.checked }))}
                  className="h-4 w-4 rounded accent-[#121212]" />
                <span className="text-sm text-[#5E5E5E]">Sí autoriza</span>
              </label>
            </Field>
          </div>

          {/* Preview del contrato */}
          <div className="overflow-hidden rounded-2xl border border-[#D8D8D8] shadow-sm">
            <ContratoDoc a={alumno} salud={salud} plan={plan} extra={extra} />
          </div>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#777777]">{label}</label>
      {children}
    </div>
  );
}
