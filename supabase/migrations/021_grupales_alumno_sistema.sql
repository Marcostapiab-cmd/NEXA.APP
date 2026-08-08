-- ============================================================
-- NEXA 021 — Sistema de alumnos grupales con cuenta propia
-- Mundo completamente separado de atletas/planes coacheados.
-- ============================================================

-- ── 1. Catálogo de packs de clases ───────────────────────────
CREATE TABLE IF NOT EXISTS public.grupales_packs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text        NOT NULL,
  num_clases   int         NOT NULL CHECK (num_clases > 0),
  precio_clp   int         NOT NULL CHECK (precio_clp > 0),
  validez_dias int         NOT NULL CHECK (validez_dias > 0),
  activo       boolean     NOT NULL DEFAULT true,
  orden        int         NOT NULL DEFAULT 0,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grupales_packs ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer el catálogo activo
CREATE POLICY "grupales_packs_read_all" ON public.grupales_packs
  FOR SELECT USING (activo = true);

-- Solo admin puede escribir
CREATE POLICY "grupales_packs_admin_write" ON public.grupales_packs
  FOR ALL TO authenticated USING (public.get_my_role() = 'admin');

-- Seed inicial (valores de borrador — editables desde el panel)
INSERT INTO public.grupales_packs (nombre, num_clases, precio_clp, validez_dias, orden) VALUES
  ('Pack 8 clases',   8,  69900,  45, 1),
  ('Pack 12 clases', 12,  95900,  60, 2),
  ('Pack 20 clases', 20, 149900,  90, 3)
ON CONFLICT DO NOTHING;

-- ── 2. Alumnos grupales (cuentas separadas de atletas) ────────
CREATE TABLE IF NOT EXISTS public.grupales_alumnos (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre     text        NOT NULL,
  apellido   text        NOT NULL,
  email      text        NOT NULL,
  telefono   text,
  rut        text,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grupales_alumnos ENABLE ROW LEVEL SECURITY;

-- Cada alumno ve y edita solo su propia fila
CREATE POLICY "ga_select_own" ON public.grupales_alumnos
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ga_insert_own" ON public.grupales_alumnos
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ga_update_own" ON public.grupales_alumnos
  FOR UPDATE USING (auth.uid() = user_id);

-- Admin puede ver todos los alumnos grupales
CREATE POLICY "ga_admin_all" ON public.grupales_alumnos
  FOR ALL TO authenticated USING (public.get_my_role() = 'admin');

-- ── 3. Compras de packs (fuente de créditos) ─────────────────
CREATE TABLE IF NOT EXISTS public.grupales_compras (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id        uuid        NOT NULL REFERENCES public.grupales_alumnos(id) ON DELETE CASCADE,
  pack_id          uuid        REFERENCES public.grupales_packs(id),
  clases_totales   int         NOT NULL,
  clases_usadas    int         NOT NULL DEFAULT 0,
  clases_restantes int         NOT NULL,
  fecha_compra     timestamptz NOT NULL DEFAULT now(),
  fecha_expira     timestamptz NOT NULL,
  estado_pago      text        NOT NULL DEFAULT 'pendiente'
    CHECK (estado_pago IN ('pendiente','pagado','cancelado','fallido')),
  referencia_flow  text,
  flow_order       text,
  commerce_order   text UNIQUE,
  monto_clp        int         NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grupales_compras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gc_select_own" ON public.grupales_compras
  FOR SELECT USING (
    alumno_id IN (SELECT id FROM public.grupales_alumnos WHERE user_id = auth.uid())
  );

CREATE POLICY "gc_admin_all" ON public.grupales_compras
  FOR ALL TO authenticated USING (public.get_my_role() = 'admin');

CREATE INDEX IF NOT EXISTS gc_alumno_idx    ON public.grupales_compras(alumno_id);
CREATE INDEX IF NOT EXISTS gc_estado_idx    ON public.grupales_compras(estado_pago);
CREATE INDEX IF NOT EXISTS gc_flow_tok_idx  ON public.grupales_compras(referencia_flow);

-- ── 4. Reservas grupales (consumen créditos) ─────────────────
CREATE TABLE IF NOT EXISTS public.grupales_reservas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id   uuid        NOT NULL REFERENCES public.grupales_alumnos(id) ON DELETE CASCADE,
  compra_id   uuid        REFERENCES public.grupales_compras(id),
  clase_id    uuid        REFERENCES public.clases_grupales(id),
  fecha       date        NOT NULL,
  hora        text        NOT NULL,
  nombre_clase text       NOT NULL,
  estado      text        NOT NULL DEFAULT 'reservada'
    CHECK (estado IN ('reservada','asistida','cancelada')),
  creado_en   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grupales_reservas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gr_select_own" ON public.grupales_reservas
  FOR SELECT USING (
    alumno_id IN (SELECT id FROM public.grupales_alumnos WHERE user_id = auth.uid())
  );

CREATE POLICY "gr_admin_all" ON public.grupales_reservas
  FOR ALL TO authenticated USING (public.get_my_role() = 'admin');

CREATE INDEX IF NOT EXISTS gr_alumno_idx ON public.grupales_reservas(alumno_id);
CREATE INDEX IF NOT EXISTS gr_fecha_idx  ON public.grupales_reservas(fecha);

-- ── 5. Actualizar get_sesiones_publicas para contar grupales_reservas ─
-- Las reservas de alumnos grupales también consumen cupos.
CREATE OR REPLACE FUNCTION public.get_sesiones_publicas(p_dias int DEFAULT 21)
RETURNS TABLE (
  clase_id      uuid,
  nombre        text,
  duracion_min  int,
  hora          text,
  dia_semana    int,
  capacidad     int,
  disponibles   int,
  fecha         date,
  bloqueada     boolean,
  coach_nombre  text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cg.id                                               AS clase_id,
    cg.nombre,
    COALESCE(cg.duracion_min, 50)                       AS duracion_min,
    cg.hora,
    cg.dia_semana,
    cg.capacidad,
    GREATEST(0,
      cg.capacidad
      - COUNT(DISTINCT r.id)::int
      - COUNT(DISTINCT gr.id)::int
    )::int AS disponibles,
    d.fecha::date,
    EXISTS(
      SELECT 1 FROM public.horario_bloqueos hb
      WHERE hb.fecha = d.fecha
        AND (hb.hora_inicio IS NULL
             OR (cg.hora >= hb.hora_inicio
                 AND cg.hora < COALESCE(hb.hora_fin, '23:59')))
    ) AS bloqueada,
    COALESCE(p.nombre, '') AS coach_nombre
  FROM generate_series(
    current_date,
    current_date + (p_dias - 1) * '1 day'::interval,
    '1 day'::interval
  ) AS d(fecha)
  JOIN public.clases_grupales cg
    ON EXTRACT(DOW FROM d.fecha)::int = cg.dia_semana
   AND cg.activa = true
  LEFT JOIN public.reservas r
    ON r.fecha      = d.fecha::date
   AND r.hora       = cg.hora
   AND r.tipo_clase ILIKE '%grupal%'
   AND r.estado NOT IN ('cancelada_tiempo','cancelada_tarde','cancelada_nexa','no_show')
  LEFT JOIN public.grupales_reservas gr
    ON gr.fecha    = d.fecha::date
   AND gr.hora     = cg.hora
   AND gr.clase_id = cg.id
   AND gr.estado   = 'reservada'
  LEFT JOIN public.perfiles p ON p.id = cg.coach_id
  GROUP BY cg.id, cg.nombre, cg.duracion_min, cg.hora, cg.dia_semana, cg.capacidad,
           d.fecha, p.nombre
  ORDER BY d.fecha, cg.hora;
$$;

GRANT EXECUTE ON FUNCTION public.get_sesiones_publicas(int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_sesiones_publicas(int) TO authenticated;
