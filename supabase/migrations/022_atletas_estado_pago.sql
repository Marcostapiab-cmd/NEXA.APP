-- Migration 022: Estado de pago en atletas
-- Permite marcar rápidamente si un alumno está al día o debe su plan,
-- sin necesidad de JOIN a la tabla pagos en cada carga de la lista.

ALTER TABLE public.atletas
  ADD COLUMN IF NOT EXISTS estado_pago text NOT NULL DEFAULT 'al_dia'
  CHECK (estado_pago IN ('al_dia', 'debe'));

COMMENT ON COLUMN public.atletas.estado_pago IS
  'Indicador manual de cobro: al_dia = sin deuda, debe = plan sin pagar.
   Se actualiza desde el panel de alumnos al registrar o confirmar un pago.';
