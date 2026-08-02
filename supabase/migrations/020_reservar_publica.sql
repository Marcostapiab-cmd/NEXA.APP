-- ============================================================
-- NEXA 020 — Flujo público de reserva con pago (Flow)
-- ============================================================

-- ── 1. Agregar duración a clases_grupales ─────────────────────
ALTER TABLE public.clases_grupales
  ADD COLUMN IF NOT EXISTS duracion_min integer DEFAULT 50;

-- Ajustar duraciones conocidas
UPDATE public.clases_grupales SET duracion_min = 60 WHERE nombre ILIKE '%barre%';

-- ── 2. Planes de prueba (paquetes para alumnos nuevos) ────────
CREATE TABLE IF NOT EXISTS public.planes_grupales (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       text NOT NULL,
  descripcion  text,
  precio_clp   integer NOT NULL,
  num_clases   integer NOT NULL DEFAULT 1,
  validez_dias integer NOT NULL DEFAULT 7,
  destacado    boolean DEFAULT false,
  orden        integer DEFAULT 0,
  activo       boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.planes_grupales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planes_grupales_anon_read" ON public.planes_grupales
  FOR SELECT TO anon USING (activo = true);

CREATE POLICY "planes_grupales_auth_read" ON public.planes_grupales
  FOR SELECT TO authenticated USING (activo = true);

CREATE POLICY "planes_grupales_admin_all" ON public.planes_grupales
  FOR ALL TO authenticated USING (public.is_admin());

INSERT INTO public.planes_grupales (nombre, descripcion, precio_clp, num_clases, validez_dias, destacado, orden)
VALUES
  ('Clase de Prueba',
   'Una clase para conocer el estudio y probar nuestra metodología.',
   15000, 1, 7, false, 1),
  ('Pack 2×Prueba',
   'Dos clases para explorar distintas disciplinas a tu ritmo.',
   25000, 2, 14, true, 2)
ON CONFLICT DO NOTHING;

-- ── 3. Pedidos grupales (orden de compra antes del pago) ──────
CREATE TABLE IF NOT EXISTS public.pedidos_grupales (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id        uuid NOT NULL REFERENCES public.planes_grupales(id),
  clase_id       uuid NOT NULL REFERENCES public.clases_grupales(id),
  fecha          date NOT NULL,
  hora           text NOT NULL,
  nombre         text NOT NULL,
  apellido       text NOT NULL,
  email          text,
  telefono       text,
  rut            text,
  monto_clp      integer NOT NULL,
  estado         text DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','procesando','pagado','cancelado','fallido')),
  flow_token     text UNIQUE,
  flow_order     bigint,
  commerce_order text UNIQUE,
  atleta_id      uuid REFERENCES public.atletas(id),
  reserva_id     bigint,
  created_at     timestamptz DEFAULT now(),
  confirmado_at  timestamptz
);

ALTER TABLE public.pedidos_grupales ENABLE ROW LEVEL SECURITY;

-- Solo admin puede leer; las escrituras van por service_role desde las API routes
CREATE POLICY "pedidos_grupales_admin_read" ON public.pedidos_grupales
  FOR SELECT TO authenticated USING (public.is_admin());

-- ── 4. Función pública: sesiones con duración + profesor ──────
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
    GREATEST(0, cg.capacidad - COUNT(r.id)::int)::int   AS disponibles,
    d.fecha::date,
    EXISTS(
      SELECT 1 FROM public.horario_bloqueos hb
      WHERE hb.fecha = d.fecha
        AND (hb.hora_inicio IS NULL
             OR (cg.hora >= hb.hora_inicio
                 AND cg.hora < COALESCE(hb.hora_fin, '23:59')))
    ) AS bloqueada,
    COALESCE(TRIM(CONCAT(p.nombre, ' ', p.apellido)), '') AS coach_nombre
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
  LEFT JOIN public.perfiles p ON p.id = cg.coach_id
  GROUP BY cg.id, cg.nombre, cg.duracion_min, cg.hora, cg.dia_semana, cg.capacidad,
           d.fecha, p.nombre, p.apellido
  ORDER BY d.fecha, cg.hora;
$$;

GRANT EXECUTE ON FUNCTION public.get_sesiones_publicas(int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_sesiones_publicas(int) TO authenticated;
