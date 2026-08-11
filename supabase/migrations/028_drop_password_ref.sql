-- Elimina la columna password_ref: guardaba una copia en texto plano de la
-- contraseña de cada usuario de staff, visible desde /usuarios. Se reemplazó
-- por un botón de "generar nueva contraseña" que no persiste nada.
-- Importante: correr esta migración DESPUÉS de desplegar el código que ya
-- no lee ni escribe password_ref (de lo contrario el deploy anterior falla).
alter table public.perfiles drop column if exists password_ref;
