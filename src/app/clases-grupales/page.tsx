'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, CheckCircle2 } from 'lucide-react';
import {
  getSesionesDisponibles,
  reservarClaseGrupal,
  type SesionGrupal,
} from '@/lib/clases-grupales';

// ── Constantes ──────────────────────────────────────────────────────────────

const DIAS_CORTO = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_LARGO = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const ERROR_MSG: Record<string, string> = {
  datos_incompletos:          'Nombre y apellido son obligatorios.',
  telefono_o_email_requerido: 'Ingresa al menos tu teléfono o email para contactarte.',
  clase_no_encontrada:        'Esta clase ya no está disponible.',
  fecha_incorrecta:           'Fecha inválida para esta clase.',
  fecha_pasada:               'No puedes reservar en una fecha pasada.',
  fecha_bloqueada:            'Esta fecha está bloqueada por el estudio.',
  sin_cupo:                   'No quedan cupos disponibles para esta sesión.',
  ya_reservado:               'Ya tienes una reserva activa para esta clase.',
  error_servidor:             'Ocurrió un error. Por favor inténtalo nuevamente.',
};

function formatFechaLarga(fecha: string, diaSemana: number): string {
  const d   = new Date(fecha + 'T12:00:00');
  const dia = d.getDate();
  const mes = MESES_LARGO[d.getMonth()];
  return `${DIAS_LARGO[diaSemana]} ${dia} de ${mes}`;
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function NexaLogo() {
  return (
    <div className="flex items-center gap-2.5 mb-6">
      <div className="flex h-8 w-8 items-center justify-center rounded-[7px]"
        style={{ background: 'var(--nexa-text)' }}>
        <span className="select-none text-[12px] font-black tracking-wider text-white">N</span>
      </div>
      <span className="select-none text-[14px] font-black tracking-[0.18em]"
        style={{ color: 'var(--nexa-text)' }}>
        NEXA
      </span>
    </div>
  );
}

function FechaChip({ fecha, diaSemana }: { fecha: string; diaSemana: number }) {
  const d   = new Date(fecha + 'T12:00:00');
  const dia = d.getDate();
  const mes = MESES_CORTO[d.getMonth()];
  return (
    <div className="text-center shrink-0 w-10">
      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--nexa-muted)' }}>
        {DIAS_CORTO[diaSemana]}
      </p>
      <p className="text-[22px] font-black leading-none my-0.5" style={{ color: 'var(--nexa-text)' }}>
        {dia}
      </p>
      <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--nexa-muted)' }}>
        {mes}
      </p>
    </div>
  );
}

function CupoChip({ s }: { s: SesionGrupal }) {
  if (s.bloqueada) {
    return (
      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--nexa-faint)' }}>
        Bloqueado
      </span>
    );
  }
  if (s.disponibles === 0) {
    return (
      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: 'rgba(180,64,64,0.12)', color: '#C05050' }}>
        Llena
      </span>
    );
  }
  return (
    <div className="text-right shrink-0">
      <p className="text-[20px] font-black leading-none" style={{ color: 'var(--nexa-accent)' }}>
        {s.disponibles}
      </p>
      <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--nexa-muted)' }}>
        de {s.capacidad}
      </p>
    </div>
  );
}

// ── Input helper ─────────────────────────────────────────────────────────────

function Campo({
  label, required = false, type = 'text', value, onChange, placeholder,
}: {
  label: string; required?: boolean; type?: string;
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.1em]"
        style={{ color: 'var(--nexa-muted)' }}>
        {label}{required && <span style={{ color: 'var(--nexa-accent)' }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl px-4 py-3 text-[14px] outline-none transition"
        style={{
          background:  'var(--nexa-card)',
          border:      '1px solid var(--nexa-border)',
          color:       'var(--nexa-text)',
        }}
        onFocus={e  => { e.currentTarget.style.borderColor = 'var(--nexa-accent)'; }}
        onBlur={e   => { e.currentTarget.style.borderColor = 'var(--nexa-border)'; }}
      />
    </div>
  );
}

// ── Vista: Lista ─────────────────────────────────────────────────────────────

function ListView({
  sesiones, loading, onSelect,
}: {
  sesiones: SesionGrupal[];
  loading:  boolean;
  onSelect: (s: SesionGrupal) => void;
}) {
  return (
    <div>
      <NexaLogo />
      <div className="mb-6">
        <h1 className="text-[22px] font-black tracking-tight leading-tight" style={{ color: 'var(--nexa-text)' }}>
          Clases grupales
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--nexa-muted)' }}>
          Reserva tu cupo. Pagas directamente en el estudio.
        </p>
      </div>

      {loading && (
        <div className="py-16 text-center">
          <p className="text-[13px]" style={{ color: 'var(--nexa-faint)' }}>
            Cargando clases...
          </p>
        </div>
      )}

      {!loading && sesiones.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-[13px]" style={{ color: 'var(--nexa-faint)' }}>
            No hay clases programadas en los próximos 14 días.
          </p>
        </div>
      )}

      {!loading && sesiones.length > 0 && (
        <div className="space-y-2">
          {sesiones.map(s => {
            const inactiva = s.bloqueada || s.disponibles === 0;
            return (
              <button
                key={`${s.claseId}-${s.fecha}`}
                onClick={() => !inactiva && onSelect(s)}
                disabled={inactiva}
                className="w-full flex items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition-all duration-150"
                style={{
                  background: 'var(--nexa-card)',
                  border:     `1px solid var(--nexa-border)`,
                  opacity:    inactiva ? 0.45 : 1,
                  cursor:     inactiva ? 'default' : 'pointer',
                }}
                onMouseEnter={e => {
                  if (!inactiva) e.currentTarget.style.borderColor = 'var(--nexa-accent)';
                }}
                onMouseLeave={e => {
                  if (!inactiva) e.currentTarget.style.borderColor = 'var(--nexa-border)';
                }}
              >
                <FechaChip fecha={s.fecha} diaSemana={s.diaSemana} />

                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold truncate" style={{ color: 'var(--nexa-text)' }}>
                    {s.nombre}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ color: 'var(--nexa-muted)' }}>
                    {s.hora}
                  </p>
                </div>

                <CupoChip s={s} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Vista: Formulario ─────────────────────────────────────────────────────────

function FormView({
  sesion, onBack, onSuccess,
}: {
  sesion:    SesionGrupal;
  onBack:    () => void;
  onSuccess: (nombre: string) => void;
}) {
  const [nombre,    setNombre]    = useState('');
  const [apellido,  setApellido]  = useState('');
  const [telefono,  setTelefono]  = useState('');
  const [email,     setEmail]     = useState('');
  const [rut,       setRut]       = useState('');
  const [enviando,  setEnviando]  = useState(false);
  const [error,     setError]     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Validación frontend
    if (!nombre.trim() || !apellido.trim()) {
      setError(ERROR_MSG.datos_incompletos);
      return;
    }
    if (!telefono.trim() && !email.trim()) {
      setError(ERROR_MSG.telefono_o_email_requerido);
      return;
    }

    setEnviando(true);
    const result = await reservarClaseGrupal({
      claseId:  sesion.claseId,
      fecha:    sesion.fecha,
      nombre:   nombre.trim(),
      apellido: apellido.trim(),
      telefono: telefono.trim() || undefined,
      email:    email.trim()    || undefined,
      rut:      rut.trim()      || undefined,
    });
    setEnviando(false);

    if (result.ok) {
      onSuccess(nombre.trim());
    } else {
      setError(ERROR_MSG[result.error ?? ''] ?? ERROR_MSG.error_servidor);
    }
  }

  const fechaLarga = formatFechaLarga(sesion.fecha, sesion.diaSemana);

  return (
    <div>
      {/* Volver */}
      <button onClick={onBack}
        className="flex items-center gap-1.5 mb-6 text-[12px] font-semibold transition"
        style={{ color: 'var(--nexa-muted)' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--nexa-text)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--nexa-muted)'; }}>
        <ChevronLeft size={15} strokeWidth={2.5} />
        Volver a clases
      </button>

      {/* Resumen clase */}
      <div className="rounded-2xl px-4 py-4 mb-6"
        style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
        <p className="text-[18px] font-black" style={{ color: 'var(--nexa-text)' }}>
          {sesion.nombre}
        </p>
        <p className="text-[12px] mt-0.5 capitalize" style={{ color: 'var(--nexa-muted)' }}>
          {fechaLarga} · {sesion.hora}
        </p>
        <p className="text-[11px] mt-2 font-semibold" style={{ color: 'var(--nexa-accent)' }}>
          {sesion.disponibles} de {sesion.capacidad} cupos disponibles
        </p>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-1"
          style={{ color: 'var(--nexa-faint)' }}>
          Tus datos
        </p>

        <Campo label="Nombre"   required value={nombre}   onChange={setNombre}   placeholder="Tu nombre" />
        <Campo label="Apellido" required value={apellido} onChange={setApellido} placeholder="Tu apellido" />
        <Campo label="Teléfono" type="tel"   value={telefono} onChange={setTelefono} placeholder="+569 1234 5678" />
        <Campo label="Email"    type="email" value={email}    onChange={setEmail}    placeholder="tu@email.com" />
        <Campo label="RUT (opcional)" value={rut} onChange={setRut} placeholder="12.345.678-9" />

        <p className="text-[11px]" style={{ color: 'var(--nexa-faint)' }}>
          Se requiere al menos teléfono o email.
        </p>

        {error && (
          <div className="rounded-xl px-4 py-3 text-[13px] font-medium"
            style={{ background: 'rgba(180,64,64,0.1)', border: '1px solid rgba(180,64,64,0.25)', color: '#C05050' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-2xl py-4 text-[14px] font-black tracking-wide transition-all duration-150 disabled:opacity-50"
          style={{
            background: enviando ? 'var(--nexa-card-alt)' : 'var(--nexa-text)',
            color:      enviando ? 'var(--nexa-muted)'    : '#FFFFFF',
          }}>
          {enviando ? 'Reservando...' : 'Reservar mi cupo'}
        </button>
      </form>
    </div>
  );
}

// ── Vista: Éxito ──────────────────────────────────────────────────────────────

function SuccessView({
  sesion, nombre, onReset,
}: {
  sesion:  SesionGrupal;
  nombre:  string;
  onReset: () => void;
}) {
  const fechaLarga = formatFechaLarga(sesion.fecha, sesion.diaSemana);

  return (
    <div className="flex flex-col items-center text-center py-8">
      <div className="flex items-center justify-center w-20 h-20 rounded-full mb-6"
        style={{ background: 'rgba(var(--nexa-accent-rgb, 196,157,89), 0.12)' }}>
        <CheckCircle2 size={44} strokeWidth={1.75} style={{ color: 'var(--nexa-accent)' }} />
      </div>

      <h2 className="text-[24px] font-black tracking-tight mb-1" style={{ color: 'var(--nexa-text)' }}>
        ¡Reserva confirmada!
      </h2>
      <p className="text-[13px] mb-6" style={{ color: 'var(--nexa-muted)' }}>
        Hola {nombre}, tu lugar está apartado.
      </p>

      <div className="w-full rounded-2xl px-5 py-5 mb-6"
        style={{ background: 'var(--nexa-card)', border: '1px solid var(--nexa-border)' }}>
        <p className="text-[20px] font-black" style={{ color: 'var(--nexa-text)' }}>
          {sesion.nombre}
        </p>
        <p className="text-[13px] mt-1 capitalize" style={{ color: 'var(--nexa-muted)' }}>
          {fechaLarga} · {sesion.hora}
        </p>
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--nexa-border)' }}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: 'var(--nexa-accent)' }}>
            Paga al llegar al estudio
          </p>
        </div>
      </div>

      <button onClick={onReset}
        className="text-[13px] font-semibold underline underline-offset-4 transition"
        style={{ color: 'var(--nexa-muted)' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--nexa-text)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--nexa-muted)'; }}>
        Reservar otra clase
      </button>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

type Vista = 'lista' | 'formulario' | 'exito';

export default function ClasesGrupalesPage() {
  const [sesiones,  setSesiones]  = useState<SesionGrupal[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [vista,     setVista]     = useState<Vista>('lista');
  const [selected,  setSelected]  = useState<SesionGrupal | null>(null);
  const [nombreOk,  setNombreOk]  = useState('');

  async function cargar() {
    setLoading(true);
    const data = await getSesionesDisponibles(14);
    setSesiones(data);
    setLoading(false);
  }

  useEffect(() => { cargar(); }, []);

  function handleSelect(s: SesionGrupal) {
    setSelected(s);
    setVista('formulario');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleSuccess(nombre: string) {
    setNombreOk(nombre);
    setVista('exito');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleReset() {
    setSelected(null);
    setNombreOk('');
    setVista('lista');
    cargar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleVolver() {
    setVista('lista');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--nexa-black)' }}>
      <div className="mx-auto max-w-md px-5 py-8 pb-16">
        {vista === 'lista' && (
          <ListView sesiones={sesiones} loading={loading} onSelect={handleSelect} />
        )}
        {vista === 'formulario' && selected && (
          <FormView sesion={selected} onBack={handleVolver} onSuccess={handleSuccess} />
        )}
        {vista === 'exito' && selected && (
          <SuccessView sesion={selected} nombre={nombreOk} onReset={handleReset} />
        )}
      </div>
    </main>
  );
}
