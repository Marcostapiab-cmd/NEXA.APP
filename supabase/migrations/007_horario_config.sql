-- migración 007: configuración de horarios

-- ── 1. Config global (una sola fila, id siempre = 1) ────────────────────────
-- DROP + recrear porque la tabla puede existir con un esquema anterior (columna "cfg")
DROP TABLE IF EXISTS public.horario_config CASCADE;

CREATE TABLE public.horario_config (
  id                   int  PRIMARY KEY DEFAULT 1,
  -- por día de la semana: dow 0=domingo, 1=lunes … 6=sábado
  dias                 jsonb NOT NULL DEFAULT '[
    {"dow":0,"abierto":true,"apertura":"09:00","cierre":"13:00"},
    {"dow":1,"abierto":true,"apertura":"06:00","cierre":"21:00"},
    {"dow":2,"abierto":true,"apertura":"06:00","cierre":"21:00"},
    {"dow":3,"abierto":true,"apertura":"06:00","cierre":"21:00"},
    {"dow":4,"abierto":true,"apertura":"06:00","cierre":"21:00"},
    {"dow":5,"abierto":true,"apertura":"06:00","cierre":"21:00"},
    {"dow":6,"abierto":true,"apertura":"08:00","cierre":"14:00"}
  ]'::jsonb,
  capacidad_grupal      int  NOT NULL DEFAULT 12,
  max_profesores        int  NOT NULL DEFAULT 3,
  duracion_bloque       int  NOT NULL DEFAULT 60,
  -- hora tope del DÍA ANTERIOR para poder cancelar una clase AM
  corte_cancelacion_am  text NOT NULL DEFAULT '21:00',
  -- clases que empiecen ANTES de esta hora se consideran AM
  limite_hora_am        text NOT NULL DEFAULT '12:00',
  -- horas mínimas de aviso para cancelar clase PM
  cancel_horas_aviso_pm int  NOT NULL DEFAULT 6,
  reagenda_validez_dias int  NOT NULL DEFAULT 30,
  updated_at            timestamptz DEFAULT now()
);

-- Fila única por defecto
INSERT INTO public.horario_config (id) VALUES (1);

ALTER TABLE public.horario_config ENABLE ROW LEVEL SECURITY;

-- Todos los roles autenticados pueden leer (la grilla lo necesita)
CREATE POLICY "hconfig_read" ON public.horario_config
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'profesor', 'recepcionista'));

-- Solo admin puede escribir
CREATE POLICY "hconfig_write" ON public.horario_config
  FOR ALL TO authenticated
  USING  (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- ── 2. Bloqueos: feriados y cierres puntuales ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.horario_bloqueos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha       date NOT NULL,
  hora_inicio text,        -- null = día completo
  hora_fin    text,        -- null = día completo
  motivo      text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.horario_bloqueos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bloqueos_read"  ON public.horario_bloqueos;
DROP POLICY IF EXISTS "bloqueos_admin" ON public.horario_bloqueos;

CREATE POLICY "bloqueos_read" ON public.horario_bloqueos
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'profesor', 'recepcionista'));

CREATE POLICY "bloqueos_admin" ON public.horario_bloqueos
  FOR ALL TO authenticated
  USING  (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');
