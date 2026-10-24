-- Un RUT solo puede pertenecer a un alumno de clases grupales.
-- Se compara normalizado (sin puntos ni guion, K mayúscula) para que
-- "12.345.678-9" y "12345678-9" cuenten como el mismo RUT.
CREATE UNIQUE INDEX IF NOT EXISTS grupales_alumnos_rut_unico
  ON public.grupales_alumnos (upper(regexp_replace(rut, '[^0-9kK]', '', 'g')))
  WHERE rut IS NOT NULL AND rut <> '';
