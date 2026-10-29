// Estructura mínima de tablas de producción para probar migraciones en PGlite.
// Compartida por las pruebas SQL (041, 042, …).
export const SQL_BASE = `
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.get_my_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.rol', true), '') $$;

CREATE TABLE public.coaches (id uuid PRIMARY KEY, nombre text, activo boolean DEFAULT true);
CREATE TABLE public.atletas (id uuid PRIMARY KEY, nombre text, apellido text, email text, user_id uuid, perfil_id uuid, tipo_sesion text);
CREATE TABLE public.planes (id text PRIMARY KEY, alumno_id text, nombre text, tipo text, total_clases int, used_clases int DEFAULT 0,
  start_date text, end_date text, extended_until text, admin_nota text, created_at timestamptz DEFAULT now(), modalidad text);
CREATE TABLE public.reservas (id serial PRIMARY KEY, rut text, clase_id int, fecha timestamptz DEFAULT now(), coach_id uuid,
  end_time time, admin_note text, attendance_status text DEFAULT 'pendiente', tipo_clase text DEFAULT '1:1 Individual',
  estado text DEFAULT 'confirmada', serie_id text, duracion_min int DEFAULT 60, obs text, alumno_id uuid, plan_id uuid,
  reagenda_id uuid, hora text, descripcion text);
CREATE TABLE public.reagendas (id text PRIMARY KEY, alumno_id text, plan_id text, reserva_original_id text, nueva_reserva_id text,
  fecha_limite text, estado text, motivo text, creada_at text DEFAULT now()::text);
CREATE TABLE public.horario_config (id int PRIMARY KEY DEFAULT 1,
  dias jsonb NOT NULL DEFAULT '[{"dow":0,"abierto":true,"apertura":"09:00","cierre":"13:00"},{"dow":1,"abierto":true,"apertura":"06:00","cierre":"21:00"},{"dow":2,"abierto":true,"apertura":"06:00","cierre":"21:00"},{"dow":3,"abierto":true,"apertura":"06:00","cierre":"21:00"},{"dow":4,"abierto":true,"apertura":"06:00","cierre":"21:00"},{"dow":5,"abierto":true,"apertura":"06:00","cierre":"21:00"},{"dow":6,"abierto":true,"apertura":"08:00","cierre":"14:00"}]'::jsonb,
  capacidad_grupal int NOT NULL DEFAULT 12, max_profesores int NOT NULL DEFAULT 3, duracion_bloque int NOT NULL DEFAULT 60,
  corte_cancelacion_am text NOT NULL DEFAULT '21:00', limite_hora_am text NOT NULL DEFAULT '12:00',
  cancel_horas_aviso_pm int NOT NULL DEFAULT 6, reagenda_validez_dias int NOT NULL DEFAULT 30, updated_at timestamptz DEFAULT now());
INSERT INTO public.horario_config (id) VALUES (1);
CREATE TABLE public.horario_bloqueos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fecha date NOT NULL, hora_inicio text, hora_fin text,
  motivo text, created_at timestamptz DEFAULT now());
CREATE TABLE public.pagos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), alumno_id uuid NOT NULL, plan_id text, monto int NOT NULL,
  moneda text DEFAULT 'clp', estado text DEFAULT 'pendiente', metodo text DEFAULT 'transferencia', descripcion text,
  fecha_pago timestamptz, created_at timestamptz DEFAULT now());
`;

export const MIGRACIONES = ['041_autogestion_alumno.sql', '042_creditos_asistencia.sql'];
