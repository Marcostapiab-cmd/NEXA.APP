-- Agrega campo tipo_sesion al perfil de cada atleta
ALTER TABLE atletas
  ADD COLUMN IF NOT EXISTS tipo_sesion text CHECK (tipo_sesion IN ('1:1', '2:1'));
