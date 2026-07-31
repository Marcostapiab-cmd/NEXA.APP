CREATE TABLE IF NOT EXISTS public.mediciones (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id  uuid        NOT NULL REFERENCES public.atletas(id) ON DELETE CASCADE,
  fecha      date        NOT NULL,
  peso       numeric(5,2),
  grasa      numeric(5,2),
  musculo    numeric(5,2),
  notas      text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.mediciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mediciones_admin" ON public.mediciones
  FOR ALL TO authenticated
  USING (get_my_role() IN ('admin', 'recepcionista', 'profesor'))
  WITH CHECK (get_my_role() IN ('admin', 'recepcionista', 'profesor'));

CREATE POLICY "mediciones_portal_self_read" ON public.mediciones
  FOR SELECT TO authenticated
  USING (
    alumno_id IN (
      SELECT id FROM public.atletas WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS mediciones_alumno_id_idx ON public.mediciones(alumno_id);
CREATE INDEX IF NOT EXISTS mediciones_fecha_idx     ON public.mediciones(alumno_id, fecha DESC);
