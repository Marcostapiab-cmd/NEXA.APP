-- Un RUT solo puede pertenecer a un alumno (1:1 / 2:1 / portal).
-- Se compara normalizado (sin puntos ni guion, K mayúscula) para que
-- "12.345.678-9", "12345678-9" y "123456789" cuenten como el mismo RUT.
CREATE UNIQUE INDEX IF NOT EXISTS atletas_rut_unico
  ON public.atletas (upper(regexp_replace(rut, '[^0-9kK]', '', 'g')))
  WHERE rut IS NOT NULL AND rut <> '';
