-- Guarda la última contraseña asignada por el admin (solo visible para el admin)
alter table perfiles add column if not exists password_ref text;
