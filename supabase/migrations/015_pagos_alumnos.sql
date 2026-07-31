-- Migration 015: Tabla de pagos de alumnos

CREATE TABLE IF NOT EXISTS public.pagos (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id                 uuid        NOT NULL REFERENCES public.atletas(id) ON DELETE CASCADE,
  plan_id                   text,
  monto                     integer     NOT NULL,         -- en pesos CLP (sin decimales)
  moneda                    text        NOT NULL DEFAULT 'clp',
  estado                    text        NOT NULL DEFAULT 'pendiente'
                                          CHECK (estado IN ('pendiente','pagado','fallido','reembolsado')),
  metodo                    text        DEFAULT 'stripe'
                                          CHECK (metodo IN ('stripe','transferencia','efectivo')),
  descripcion               text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id  text,
  checkout_url              text,        -- URL de Stripe Checkout para enviar al alumno
  fecha_pago                timestamptz,
  created_at                timestamptz DEFAULT now()
);

ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

-- Solo admin y recepcionista pueden ver y gestionar pagos
CREATE POLICY "pagos_admin_recepcionista" ON public.pagos
  FOR ALL TO authenticated
  USING  (get_my_role() IN ('admin', 'recepcionista'))
  WITH CHECK (get_my_role() IN ('admin', 'recepcionista'));

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS pagos_alumno_id_idx ON public.pagos(alumno_id);
CREATE INDEX IF NOT EXISTS pagos_plan_id_idx   ON public.pagos(plan_id);
CREATE INDEX IF NOT EXISTS pagos_estado_idx    ON public.pagos(estado);
CREATE INDEX IF NOT EXISTS pagos_stripe_checkout_idx ON public.pagos(stripe_checkout_session_id);
