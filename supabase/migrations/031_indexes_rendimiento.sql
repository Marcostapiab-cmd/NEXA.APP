-- ============================================================
-- NEXA 031 — Índices de rendimiento
-- ============================================================
-- Postgres NO indexa automáticamente las columnas de llave foránea
-- (solo la primary key). Estas columnas se filtran constantemente
-- desde la app (check-in diario, ficha de alumno, página pública
-- de reservas, dashboard) y no tenían índice de apoyo. Con pocos
-- datos no se nota; con meses de historial de reservas, sí.
--
-- Todos con IF NOT EXISTS: se puede aplicar sin riesgo aunque ya
-- exista alguno.

-- reservas: la tabla más consultada de todo el sistema
CREATE INDEX IF NOT EXISTS idx_reservas_fecha
  ON public.reservas (fecha);

CREATE INDEX IF NOT EXISTS idx_reservas_alumno_id
  ON public.reservas (alumno_id);

CREATE INDEX IF NOT EXISTS idx_reservas_plan_id
  ON public.reservas (plan_id);

-- Cubre la consulta pública de horarios (get_sesiones_publicas) y el
-- check-in diario: WHERE fecha = ... AND hora = ... AND tipo_clase ...
CREATE INDEX IF NOT EXISTS idx_reservas_fecha_hora_tipo_estado
  ON public.reservas (fecha, hora, tipo_clase, estado);

-- Cubre el recálculo de clases usadas por plan (planes-supabase.ts)
CREATE INDEX IF NOT EXISTS idx_reservas_plan_estado
  ON public.reservas (plan_id, estado);

-- atletas: usado por el webhook de pago para buscar por email/teléfono/rut
CREATE INDEX IF NOT EXISTS idx_atletas_email
  ON public.atletas (email);

CREATE INDEX IF NOT EXISTS idx_atletas_telefono
  ON public.atletas (telefono);

CREATE INDEX IF NOT EXISTS idx_atletas_rut
  ON public.atletas (rut);

-- sesiones: historial de entrenamiento por alumno
CREATE INDEX IF NOT EXISTS idx_sesiones_alumno_id
  ON public.sesiones (alumno_id);

CREATE INDEX IF NOT EXISTS idx_sesiones_fecha
  ON public.sesiones (fecha);

-- planes: planes de un alumno
CREATE INDEX IF NOT EXISTS idx_planes_alumno_id
  ON public.planes (alumno_id);

-- pedidos_grupales: el webhook de Flow filtra por estado al reintentar
CREATE INDEX IF NOT EXISTS idx_pedidos_grupales_estado
  ON public.pedidos_grupales (estado);
