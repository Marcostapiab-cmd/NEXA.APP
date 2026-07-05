'use client';

import { useState } from 'react';
import { ExternalLink, Trash2, Video, AlertCircle } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

function isValidUrl(url: string): boolean {
  if (!url.trim()) return true; // empty is valid (no video)
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

function checkYouTube(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url);
}
function checkVimeo(url: string): boolean {
  return /vimeo\.com/i.test(url);
}

export default function VideoUrlInput({ value, onChange, className }: Props) {
  const [focused, setFocused] = useState(false);

  const valid   = isValidUrl(value);
  const hasUrl  = value.trim().length > 0;
  const isYT    = checkYouTube(value);
  const isVimeo = checkVimeo(value);

  const platform = isYT ? 'YouTube' : isVimeo ? 'Vimeo' : hasUrl ? 'Video' : null;

  return (
    <div className={className}>
      <div className={`flex items-center overflow-hidden rounded-xl border transition ${
        !valid && hasUrl
          ? 'border-red-900 bg-[#0a0a0a]'
          : focused
          ? 'border-[#f97316] bg-[#0a0a0a]'
          : 'border-[#2a2a2a] bg-[#0a0a0a]'
      }`}>
        {/* Icon */}
        <div className="flex items-center px-3 text-[#444444]">
          {!valid && hasUrl
            ? <AlertCircle className="h-4 w-4 text-red-500" />
            : <Video className="h-4 w-4" />
          }
        </div>

        {/* Input */}
        <input
          type="url"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="https://youtube.com/watch?v=... (opcional)"
          className="flex-1 bg-transparent py-2.5 pr-2 text-sm text-white placeholder-[#333333] outline-none"
        />

        {/* Actions */}
        <div className="flex items-center gap-1 pr-2">
          {hasUrl && valid && (
            <a href={value} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#888888] transition hover:border-[#f97316] hover:text-[#f97316]"
              onClick={e => e.stopPropagation()}>
              <ExternalLink className="h-3 w-3" />
              Ver{platform ? ` (${platform})` : ''}
            </a>
          )}
          {hasUrl && (
            <button type="button" onClick={() => onChange('')}
              className="rounded-lg p-1.5 text-[#333333] transition hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {!valid && hasUrl && (
        <p className="mt-1.5 text-xs text-red-500">
          URL inválida. Usa un link completo que empiece con https://
        </p>
      )}

      {/* Platform hint */}
      {valid && hasUrl && (
        <p className="mt-1.5 text-[11px] text-[#444444]">
          {isYT ? 'YouTube detectado' : isVimeo ? 'Vimeo detectado' : 'URL de video personalizada'}
          {' · El atleta podrá ver el video de referencia del ejercicio.'}
        </p>
      )}
    </div>
  );
}
