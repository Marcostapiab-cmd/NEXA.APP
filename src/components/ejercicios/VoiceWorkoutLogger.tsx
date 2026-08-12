'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, X, Check, AlertTriangle, Pencil, Trash2, Plus, Loader2
} from 'lucide-react';
import {
  parseVoiceTranscript,
  type ParsedSet,
  type ParsedExercise,
} from '@/lib/voiceParser';

export type { ParsedSet, ParsedExercise };

// ─── Preview editor ───────────────────────────────────────────────────────────

interface PreviewProps {
  parsed: ParsedExercise;
  onChange: (p: ParsedExercise) => void;
}

function VoiceParsingPreview({ parsed, onChange }: PreviewProps) {
  const IC = 'rounded-lg border border-[#C8C8C8] bg-[#F8F8F8] px-2 py-1.5 text-xs text-[#121212] outline-none focus:border-[#121212] w-full';

  function setName(exerciseName: string) { onChange({ ...parsed, exerciseName }); }
  function setNotes(generalNotes: string) { onChange({ ...parsed, generalNotes }); }
  function setSerie(idx: number, field: keyof ParsedSet, val: string | number | null) {
    const series = parsed.series.map((s, i) => i === idx ? { ...s, [field]: val } : s);
    onChange({ ...parsed, series });
  }
  function addSerie() {
    const last = parsed.series[parsed.series.length - 1];
    onChange({
      ...parsed,
      series: [...parsed.series, {
        setNumber: (last?.setNumber ?? 0) + 1,
        reps: last?.reps ?? null, weight: last?.weight ?? null,
        rir: null, rpe: null, notes: '',
      }],
    });
  }
  function removeSerie(idx: number) {
    onChange({ ...parsed, series: parsed.series.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-4">
      {/* Exercise name */}
      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]">
          Ejercicio
        </label>
        <input value={parsed.exerciseName} onChange={e => setName(e.target.value)}
          placeholder="Nombre del ejercicio"
          className="w-full rounded-xl border border-[#C8C8C8] bg-[#F8F8F8] px-3 py-2.5 text-sm font-semibold text-[#121212] outline-none focus:border-[#121212]" />
      </div>

      {/* Series table */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]">
            Series ({parsed.series.length})
          </label>
          <button type="button" onClick={addSerie}
            className="flex items-center gap-1 text-[10px] text-[#121212] transition hover:text-[#3E3E3E]">
            <Plus className="h-3 w-3" /> Agregar
          </button>
        </div>

        {parsed.series.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#C8C8C8] py-6 text-center text-xs text-[#888888]">
            No se detectaron series. Edita el nombre o agrega manualmente.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#C8C8C8]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#C8C8C8] bg-[#F5F5F5]">
                  {['#', 'Reps', 'Kg', 'RIR', 'RPE', 'Notas', ''].map((h, i) => (
                    <th key={i} className="px-2 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-[#9B9B9B]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DEDEDE]">
                {parsed.series.map((s, i) => (
                  <tr key={i} className="bg-[#F8F8F8]">
                    <td className="px-2 py-2 font-mono text-[#888888]">{s.setNumber}</td>
                    <td className="px-2 py-2">
                      <input type="number" value={s.reps ?? ''} onChange={e => setSerie(i, 'reps', e.target.value ? parseInt(e.target.value) : null)}
                        placeholder="—" className={IC + ' w-14'} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" step="0.5" value={s.weight ?? ''} onChange={e => setSerie(i, 'weight', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="—" className={IC + ' w-16'} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" step="0.5" min="0" max="5" value={s.rir ?? ''} onChange={e => setSerie(i, 'rir', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="—" className={IC + ' w-12'} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" step="0.5" min="1" max="10" value={s.rpe ?? ''} onChange={e => setSerie(i, 'rpe', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="—" className={IC + ' w-12'} />
                    </td>
                    <td className="px-2 py-2">
                      <input value={s.notes} onChange={e => setSerie(i, 'notes', e.target.value)}
                        placeholder="Notas..." className={IC + ' w-28'} />
                    </td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => removeSerie(i)}
                        className="text-[#9B9B9B] transition hover:text-[#B44040]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* General notes */}
      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#777777]">
          Notas generales
        </label>
        <textarea value={parsed.generalNotes} onChange={e => setNotes(e.target.value)}
          rows={2} placeholder="Observaciones del entrenamiento..."
          className="w-full resize-none rounded-xl border border-[#C8C8C8] bg-[#F8F8F8] px-3 py-2 text-xs text-[#121212] outline-none focus:border-[#121212]" />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onConfirm: (parsed: ParsedExercise) => void;
  trigger?: React.ReactNode;
}

type Phase = 'idle' | 'listening' | 'processing' | 'preview' | 'unsupported';

export default function VoiceWorkoutLogger({ onConfirm, trigger }: Props) {
  const [open, setOpen]        = useState(false);
  const [phase, setPhase]      = useState<Phase>('idle');
  const [transcript, setTrans] = useState('');
  const transcriptRef          = useRef('');
  const [parsed, setParsed]    = useState<ParsedExercise | null>(null);
  const [error, setError]      = useState('');
  const recognitionRef         = useRef<any>(null);

  // Check support
  const isSupported = typeof window !== 'undefined'
    && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  function openModal() {
    if (!isSupported) { setPhase('unsupported'); }
    setOpen(true);
  }

  function closeModal() {
    stopRecognition();
    setOpen(false);
    setPhase('idle');
    setTrans('');
    transcriptRef.current = '';
    setParsed(null);
    setError('');
  }

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
  }, []);

  function startListening() {
    setError('');
    setTrans('');
    transcriptRef.current = '';
    setPhase('listening');

    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'es-CL';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    rec.onresult = (e: any) => {
      // Accumulate from index 0 to avoid stale partial transcripts
      // when the browser fires multiple onresult events
      let full = '';
      for (let i = 0; i < e.results.length; i++) {
        full += e.results[i][0].transcript;
      }
      transcriptRef.current = full;
      setTrans(full);
    };

    rec.onerror = (e: any) => {
      setError(
        e.error === 'not-allowed' ? 'Permiso de micrófono denegado. Actívalo en la configuración del navegador.' :
        e.error === 'no-speech'   ? 'No se detectó voz. Inténtalo de nuevo.' :
        `Error: ${e.error}`
      );
      setPhase('idle');
    };

    rec.onend = () => {
      setPhase(prev => {
        if (prev === 'listening') {
          // auto-process
          return 'processing';
        }
        return prev;
      });
    };

    rec.start();
  }

  function stopAndProcess() {
    stopRecognition();
    setPhase('processing');
  }

  // When processing starts, parse from transcriptRef (avoids stale closure on transcript state)
  useEffect(() => {
    if (phase !== 'processing') return;
    const result = parseVoiceTranscript(transcriptRef.current);
    if (!result) {
      setError('No se pudo interpretar lo que dijiste. Inténtalo de nuevo o ingresa los datos manualmente.');
      setPhase('idle');
      return;
    }
    setParsed(result);
    setPhase('preview');
  }, [phase]);

  function handleConfirm() {
    if (!parsed) return;
    onConfirm(parsed);
    closeModal();
  }

  return (
    <>
      {/* Trigger */}
      <div onClick={openModal} className="cursor-pointer">
        {trigger ?? (
          <button type="button"
            className="flex items-center gap-2 rounded-xl border border-[#C8C8C8] px-3.5 py-2 text-xs font-medium text-[#5E5E5E] transition hover:border-[#121212] hover:text-[#121212]">
            <Mic className="h-3.5 w-3.5" />
            Registrar con voz
          </button>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/35 p-4 pt-12 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#C8C8C8] bg-[#EBEBEB] shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#C8C8C8] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                  phase === 'listening' ? 'animate-pulse bg-red-500/20' : 'bg-[#E4E4E4]'
                }`}>
                  {phase === 'listening'
                    ? <Mic className="h-4 w-4 text-red-400" />
                    : <Mic className="h-4 w-4 text-[#5E5E5E]" />
                  }
                </div>
                <div>
                  <p className="text-sm font-bold text-[#121212]">
                    {phase === 'idle'        ? 'Registrar con voz'
                    : phase === 'listening'  ? 'Escuchando...'
                    : phase === 'processing' ? 'Procesando...'
                    : phase === 'preview'    ? 'Confirmar datos'
                    : 'Voz no disponible'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#777777]">
                    {phase === 'idle' && 'Di el ejercicio y las series que completaste'}
                    {phase === 'listening' && 'Habla claro y luego presiona Detener'}
                    {phase === 'preview' && 'Revisa y edita antes de confirmar'}
                  </p>
                </div>
              </div>
              <button onClick={closeModal}
                className="rounded-xl border border-[#C8C8C8] p-2 text-[#777777] transition hover:border-[#888888] hover:text-[#121212]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">

              {/* Unsupported */}
              {phase === 'unsupported' && (
                <div className="flex items-start gap-3 rounded-xl border border-yellow-400/50 bg-yellow-50 px-4 py-3.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                  <p className="text-sm text-yellow-800">
                    Tu navegador no soporta dictado por voz. Puedes ingresar los datos manualmente desde la tabla de series.
                  </p>
                </div>
              )}

              {/* Idle — instructions */}
              {phase === 'idle' && isSupported && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[#DEDEDE] bg-[#F5F5F5] p-4">
                    <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-[#888888]">
                      Ejemplo de dictado
                    </p>
                    <p className="text-sm leading-relaxed text-[#5E5E5E] italic">
                      &quot;Press banca, primera serie 4 repeticiones con 30 kilos, segunda serie 7 repeticiones con 30 kilos, tercera serie 6 repeticiones con 27 kilos&quot;
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-[#888888]">
                      {['Primera/Segunda/Tercera serie', 'N repeticiones', 'con N kilos', 'RIR N', 'RPE N'].map(t => (
                        <span key={t} className="rounded-md border border-[#C8C8C8] px-2 py-1">{t}</span>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-[#B44040]/30 bg-[#FAEAEA] px-3.5 py-3 text-sm text-[#B44040]">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <button onClick={startListening}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#121212] py-3.5 text-sm font-bold text-white transition hover:bg-[#3E3E3E]">
                    <Mic className="h-4 w-4" />
                    Iniciar dictado
                  </button>
                </div>
              )}

              {/* Listening */}
              {phase === 'listening' && (
                <div className="space-y-4">
                  {/* Mic animation */}
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="relative flex items-center justify-center">
                      <div className="absolute h-20 w-20 animate-ping rounded-full bg-red-500/10" />
                      <div className="absolute h-16 w-16 animate-pulse rounded-full bg-red-500/15" />
                      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 border border-red-500/40">
                        <Mic className="h-7 w-7 text-red-400" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-[#5E5E5E] animate-pulse">Escuchando... habla ahora</p>
                  </div>

                  {/* Live transcript */}
                  {transcript && (
                    <div className="rounded-xl border border-[#C8C8C8] bg-[#F5F5F5] px-4 py-3">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#888888]">Transcripción en vivo</p>
                      <p className="text-sm text-[#121212] leading-relaxed">{transcript}</p>
                    </div>
                  )}

                  <button onClick={stopAndProcess}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#C8C8C8] py-3 text-sm font-medium text-[#121212] transition hover:bg-[#E4E4E4]">
                    <MicOff className="h-4 w-4" />
                    Detener y procesar
                  </button>
                </div>
              )}

              {/* Processing */}
              {phase === 'processing' && (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-[#121212]" />
                  <p className="text-sm text-[#5E5E5E]">Interpretando dictado...</p>
                </div>
              )}

              {/* Preview */}
              {phase === 'preview' && parsed && (
                <>
                  <div className="flex items-start gap-2.5 rounded-xl border border-[#C8C8C8] bg-[#F0F0F0] px-3.5 py-3 text-xs text-[#5E5E5E]">
                    <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#121212]" />
                    Esto fue lo que entendí. Edita cualquier campo antes de confirmar.
                  </div>

                  <VoiceParsingPreview parsed={parsed} onChange={setParsed} />

                  <div className="flex gap-2.5 border-t border-[#DEDEDE] pt-4">
                    <button onClick={() => { setPhase('idle'); setTrans(''); transcriptRef.current = ''; setParsed(null); }}
                      className="flex items-center gap-1.5 rounded-xl border border-[#C8C8C8] px-4 py-2.5 text-xs font-medium text-[#5E5E5E] transition hover:border-[#888888] hover:text-[#121212]">
                      <Mic className="h-3.5 w-3.5" /> Repetir
                    </button>
                    <button onClick={handleConfirm}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#121212] py-2.5 text-sm font-bold text-white transition hover:bg-[#3E3E3E]">
                      <Check className="h-4 w-4" />
                      Confirmar y guardar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
