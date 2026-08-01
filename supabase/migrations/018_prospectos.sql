CREATE TABLE IF NOT EXISTS public.prospectos (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text        NOT NULL,
  apellido   text,
  email      text,
  telefono   text,
  objetivo   text,
  mensaje    text,
  estado     text        NOT NULL DEFAULT 'nuevo'
               CHECK (estado IN ('nuevo', 'contactado', 'convertido', 'descartado')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.prospectos ENABLE ROW LEVEL SECURITY;

-- Solo admin y recepcionista ven y gestionan prospectos
CREATE POLICY "prospectos_admin" ON public.prospectos
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'recepcionista'))
  WITH CHECK (get_my_role() IN ('admin', 'recepcionista'));

-- Cualquiera puede insertar (formulario público sin auth)
CREATE POLICY "prospectos_insert_anon" ON public.prospectos
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS prospectos_estado_idx    ON public.prospectos(estado);
CREATE INDEX IF NOT EXISTS prospectos_created_at_idx ON public.prospectos(created_at DESC);
