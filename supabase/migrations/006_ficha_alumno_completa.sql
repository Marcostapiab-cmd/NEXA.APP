-- migración 006: ficha completa del alumno

-- 1. Campos nuevos en atletas
ALTER TABLE public.atletas
  ADD COLUMN IF NOT EXISTS rut                          text,
  ADD COLUMN IF NOT EXISTS telefono                     text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre   text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_tel      text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_relacion text,
  ADD COLUMN IF NOT EXISTS objetivo                     text,
  ADD COLUMN IF NOT EXISTS etapa                        text DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS notas_profesor               text,
  ADD COLUMN IF NOT EXISTS contrato_firmado             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS contrato_fecha_firma         date;

-- 2. Tabla separada para datos de salud (acceso restringido a admin y profesor)
CREATE TABLE IF NOT EXISTS public.atletas_salud (
  atleta_id    uuid PRIMARY KEY REFERENCES public.atletas(id) ON DELETE CASCADE,
  enfermedades text,
  lesiones     text,
  medicamentos text,
  alergias     text,
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE public.atletas_salud ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salud_select" ON public.atletas_salud
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'profesor'));

CREATE POLICY "salud_insert" ON public.atletas_salud
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'profesor'));

CREATE POLICY "salud_update" ON public.atletas_salud
  FOR UPDATE TO authenticated
  USING  (get_my_role() IN ('admin', 'profesor'))
  WITH CHECK (get_my_role() IN ('admin', 'profesor'));
