-- ============================================================
-- NEXA 018 — Horario fijo de clases grupales
-- Tabla para definir clases grupales recurrentes (horario fijo semanal)
-- independiente de si alguien ya reservó. Base para la página
-- pública de reservas de grupales.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.clases_grupales (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text        NOT NULL,
  dia_semana  int         NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora        text        NOT NULL,        -- formato 'HH:MM'
  coach_id    uuid        REFERENCES public.coaches(id) ON DELETE SET NULL,
  capacidad   int         NOT NULL DEFAULT 12,
  activa      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.clases_grupales ENABLE ROW LEVEL SECURITY;

-- Lectura PÚBLICA: cualquiera (anon o autenticado) puede ver el horario
CREATE POLICY "clases_grupales_select_public" ON public.clases_grupales
  FOR SELECT USING (true);

-- Escritura: solo admin
CREATE POLICY "clases_grupales_admin_write" ON public.clases_grupales
  FOR ALL TO authenticated
  USING  (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

CREATE INDEX IF NOT EXISTS clases_grupales_dia_idx    ON public.clases_grupales(dia_semana);
CREATE INDEX IF NOT EXISTS clases_grupales_activa_idx ON public.clases_grupales(activa);

-- Datos iniciales (dia_semana: 0=domingo … 6=sábado)
INSERT INTO public.clases_grupales (nombre, dia_semana, hora, capacidad) VALUES
  ('GAP',   6, '10:00', 12),
  ('Barre', 6, '11:00', 12),
  ('HYROX', 6, '12:00', 12),
  ('HYROX', 0, '11:00', 12);
