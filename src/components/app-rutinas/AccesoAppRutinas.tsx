'use client';

import { useEffect, useState } from 'react';
import { Smartphone, Copy, Check } from 'lucide-react';
import { rolActual } from '@/lib/rol-cliente';

function generarClave(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz', nums = '23456789';
  const r = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  return `${Array.from({ length: 4 }, () => r(letras)).join('')}-${Array.from({ length: 4 }, () => r(nums)).join('')}`;
}

/** Ficha del alumno → crear o cambiar la clave de la app de rutinas (solo admin). */
export default function AccesoAppRutinas({ atletaId, emailFicha, nombre }: { atletaId: string; emailFicha?: string; nombre: string }) {
  const [esAdmin, setEsAdmin] = useState(false);
  const [estado, setEstado] = useState<{ tiene: boolean; bloqueado?: boolean; email: string } | null>(null);
  const [email, setEmail] = useState(emailFicha ?? '');
  const [clave, setClave] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState<{ link: string; email: string; clave: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    rolActual().then(async r => {
      const admin = r === 'admin' || r === 'host';
      setEsAdmin(admin);
      if (!admin) return;
      const res = await fetch(`/api/app/acceso?alumnoId=${atletaId}`);
      if (res.ok) { const d = await res.json(); setEstado(d); if (d.email) setEmail(d.email); }
    }).catch(() => {});
  }, [atletaId]);

  if (!esAdmin) return null;

  async function crear() {
    setEnviando(true); setError('');
    const res = await fetch('/api/app/acceso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alumnoId: atletaId, email, clave }) });
    const d = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) { setError(d.error ?? 'No se pudo crear el acceso.'); return; }
    setHecho({ link: d.link, email: d.email, clave });
    setEstado({ tiene: true, bloqueado: false, email: d.email });
  }
  async function bloquear() {
    if (!confirm(`¿Bloquear el acceso de ${nombre} a la app de rutinas?`)) return;
    const res = await fetch('/api/app/acceso', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alumnoId: atletaId }) });
    if (res.ok) setEstado(e => e ? { ...e, bloqueado: true } : e); else setError('No se pudo bloquear el acceso.');
  }

  const mensaje = hecho ? `Hola ${nombre}, esta es tu app de rutinas NEXA:\n${hecho.link}\nCorreo: ${hecho.email}\nClave: ${hecho.clave}\nPara instalarla en tu celular: ${hecho.link}/instalar` : '';
  const campo = 'w-full rounded-lg border border-[#CACACA] bg-white px-3 py-2 text-sm text-[#121212] outline-none focus:border-[#121212]';

  return (
    <div className="rounded-[12px] border border-[#CACACA] bg-[#F0F0F0] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Smartphone className="h-3.5 w-3.5 text-[#5E5E5E]" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5E5E5E]">App de rutinas</p>
      </div>
      {estado?.tiene && !hecho && (
        <p className="mb-3 text-xs text-[#3E3E3E]">
          {estado.bloqueado ? 'Acceso bloqueado.' : 'Tiene acceso.'} Correo: <b>{estado.email}</b>
        </p>
      )}
      {hecho ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#2E7D55]">Acceso listo. Envíale este mensaje (la clave no se vuelve a mostrar):</p>
          <pre className="whitespace-pre-wrap rounded-lg border border-[#CACACA] bg-white p-3 text-xs text-[#121212]">{mensaje}</pre>
          <button onClick={() => { navigator.clipboard.writeText(mensaje); setCopiado(true); }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#121212] py-2 text-xs font-bold text-white">
            {copiado ? <><Check className="h-3.5 w-3.5" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar mensaje</>}
          </button>
          <button onClick={() => { setHecho(null); setClave(''); setCopiado(false); }} className="w-full text-xs text-[#5E5E5E] underline">Listo</button>
        </div>
      ) : (
        <div className="space-y-2">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo del alumno" className={campo} aria-label="Correo del alumno" />
          <div className="flex gap-2">
            <input value={clave} onChange={e => setClave(e.target.value)} placeholder="clave (mín. 8)" className={campo} aria-label="Clave" />
            <button type="button" onClick={() => setClave(generarClave())} className="shrink-0 rounded-lg border border-[#CACACA] bg-white px-3 text-xs font-bold text-[#3E3E3E]">Generar</button>
          </div>
          {error && <p role="alert" className="text-xs text-[#B44040]">{error}</p>}
          <button onClick={crear} disabled={enviando || !email || clave.length < 8}
            className="w-full rounded-lg bg-[#121212] py-2 text-xs font-bold text-white disabled:opacity-40">
            {enviando ? 'Guardando…' : estado?.tiene ? 'Cambiar clave' : 'Crear acceso'}
          </button>
          {estado?.tiene && !estado.bloqueado && (
            <button onClick={bloquear} className="w-full text-xs text-[#B44040] underline">Bloquear acceso</button>
          )}
        </div>
      )}
    </div>
  );
}
