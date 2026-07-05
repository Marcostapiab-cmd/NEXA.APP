'use client';

import { GripVertical, Trash2, Pencil } from 'lucide-react';
import { MUSCLE_HEX, BLOQUE_HEX, type Exercise } from './types';

interface Props {
  exercise: Exercise;
  index: number;
  isDragging: boolean;
  isDragOver: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export default function ExerciseCard({
  exercise, index, isDragging, isDragOver,
  onEdit, onDelete, onDragStart, onDragOver, onDrop, onDragEnd,
}: Props) {
  const muscleHex  = MUSCLE_HEX[exercise.muscle ?? '']  ?? '#555555';
  const bloqueHex  = exercise.bloque ? BLOQUE_HEX[exercise.bloque] : null;
  const hasBloque  = exercise.bloque && exercise.bloque !== 'N/A';

  const repsDisplay = (() => {
    const r = exercise.reps;
    const suf = exercise.eachSide ? ' c/lado' : '';
    return `${exercise.series}×${r}${suf}`;
  })();

  return (
    <tr
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group cursor-grab transition-colors ${
        isDragOver  ? 'bg-white/[0.06]' :
        isDragging  ? 'opacity-40' :
        'hover:bg-white/[0.02]'
      }`}
    >
      {/* Drag handle */}
      <td className="py-3 pl-2 pr-1 text-[#2a2a2a] group-hover:text-[#444444]">
        <GripVertical className="h-3.5 w-3.5" />
      </td>

      {/* Row number */}
      <td className="px-2 py-3 text-xs font-mono text-[#333333]">{index + 1}</td>

      {/* Bloque badge */}
      <td className="px-1 py-3">
        {hasBloque && bloqueHex ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-black"
            style={{ backgroundColor: bloqueHex + '25', color: bloqueHex }}>
            {exercise.bloque}
          </span>
        ) : (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[9px] text-[#2a2a2a]">—</span>
        )}
      </td>

      {/* Name */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{exercise.name}</span>
          {exercise.bodyWeight && (
            <span className="rounded bg-[#1e1e1e] px-1.5 py-0.5 text-[9px] text-[#555555]">BW</span>
          )}
          {exercise.completionLift && (
            <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: '#D4AF3725', color: '#D4AF37' }}>1RM</span>
          )}
          {exercise.eachSide && (
            <span className="rounded bg-[#1e1e1e] px-1.5 py-0.5 text-[9px] text-[#555555]">×2</span>
          )}
        </div>
        {exercise.notas && (
          <p className="mt-0.5 truncate text-[11px] text-[#333333]">{exercise.notas}</p>
        )}
      </td>

      {/* Muscle */}
      <td className="px-3 py-3">
        <span className="flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: muscleHex + '22', color: muscleHex }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: muscleHex }} />
          {exercise.muscle}
        </span>
      </td>

      {/* Sets × Reps */}
      <td className="px-3 py-3 text-sm font-medium text-[#888888] tabular-nums">{repsDisplay}</td>

      {/* Weight */}
      <td className="px-3 py-3 text-sm text-[#666666]">
        {exercise.weight ? `${exercise.weight} kg` : '—'}
      </td>

      {/* Rest + Tempo */}
      <td className="px-3 py-3 text-xs text-[#444444]">
        <div className="flex flex-col gap-0.5">
          {exercise.rest && <span>{exercise.rest}</span>}
          {exercise.tempo && <span className="text-[#333333]">{exercise.tempo}</span>}
        </div>
      </td>

      {/* Actions */}
      <td className="py-3 pr-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={onEdit}
            className="rounded-lg p-1.5 text-[#2a2a2a] transition hover:bg-[#1e1e1e] hover:text-[#888888]">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete}
            className="rounded-lg p-1 text-[#2a2a2a] transition hover:bg-red-950/40 hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
