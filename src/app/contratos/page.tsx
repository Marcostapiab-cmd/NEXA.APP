'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileText, CheckCircle, Clock, Plus } from 'lucide-react';
import { getAlumnos } from '@/lib/alumnos';
import type { Alumno } from '@/app/alumnos/page';

export default function ContratosPage() {
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    getAlumnos()
      .then(data => setAlumnos(data.filter(a => a.estado !== 'archivado')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtrados = busqueda.trim()
    ? alumnos.filter(a =>
        `${a.nombre} ${a.apellido}`.toLowerCase().includes(busqueda.toLowerCase()),
      )
    : alumnos;

  const firmados = alumnos.filter(a => a.contratoFirmado).length;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#121212]">Contratos</h1>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[#888888]">
            {firmados} firmado{firmados !== 1 ? 's' : ''} · {alumnos.length - firmados} pendiente{alumnos.length - firmados !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="mb-5">
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar alumno..."
          className="w-full rounded-xl border border-[#CACACA] bg-[#F0F0F0] px-4 py-3 text-sm text-[#121212] placeholder-[#888888] outline-none transition focus:border-[#121212]/50"
        />
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-[#888888]">Cargando alumnos...</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#CACACA] py-20 text-center">
          <p className="text-sm text-[#888888]">No se encontraron alumnos.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#D8D8D8]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#D8D8D8] bg-[#F5F5F5]">
                <th className="px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.14em] text-[#9B9B9B]">Alumno</th>
                <th className="px-5 py-3 text-left text-[9px] font-bold uppercase tracking-[0.14em] text-[#9B9B9B]">Estado</th>
                <th className="w-12 pr-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((a, idx) => {
                const isEven = idx % 2 === 0;
                return (
                  <tr
                    key={a.id}
                    className="group border-b border-[#E8E8E8] last:border-none"
                    style={{ backgroundColor: isEven ? '#F5F5F5' : '#F8F8F8' }}
                  >
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-[#121212]">
                        {a.nombre} {a.apellido}
                      </p>
                      {a.rut && (
                        <p className="mt-0.5 text-[11px] text-[#888888]">{a.rut}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {a.contratoFirmado ? (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          <span className="text-[12px] text-green-700">
                            Firmado {a.contratoFechaFirma
                              ? new Date(a.contratoFechaFirma).toLocaleDateString('es-CL')
                              : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-[#AAAAAA]" />
                          <span className="text-[12px] text-[#888888]">Pendiente</span>
                        </div>
                      )}
                    </td>
                    <td className="pr-4 py-4 text-right">
                      <Link
                        href={`/contratos/${a.id}`}
                        className="flex items-center gap-1.5 rounded-xl border border-[#CACACA] px-3 py-1.5 text-[11px] font-medium text-[#5E5E5E] transition hover:border-[#888888] hover:text-[#121212]"
                      >
                        <FileText className="h-3 w-3" />
                        {a.contratoFirmado ? 'Ver' : 'Generar'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-[#E8E8E8] bg-[#F5F5F5] px-5 py-2.5">
            <p className="text-[10px] text-[#AAAAAA]">{filtrados.length} alumno{filtrados.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}
    </main>
  );
}
