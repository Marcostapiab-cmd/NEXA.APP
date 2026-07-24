-- Agregar columnas para vincular reservas al sistema de planes
-- Las reservas del horario antiguo (rut-based) quedan con alumno_id = NULL
-- Las nuevas reservas de planes tendrán alumno_id y plan_id poblados
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS alumno_id uuid REFERENCES public.atletas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS plan_id   uuid;

CREATE INDEX IF NOT EXISTS reservas_alumno_id_idx ON public.reservas(alumno_id);
CREATE INDEX IF NOT EXISTS reservas_plan_id_idx   ON public.reservas(plan_id);

-- reagenda_id para vincular una reserva con su reagenda
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS reagenda_id uuid;
