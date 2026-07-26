-- ============================================================
-- NEXA — Fix funciones core y sincronizar con esquema real
-- Problema: migrations 001-011 usaban public.profiles (esquema
-- de diseño inicial). Producción usa public.perfiles con roles
-- admin|profesor|alumno|recepcionista.
-- Esta migración define las funciones que la app necesita para
-- funcionar usando la tabla real de producción.
-- ============================================================

-- ─── get_my_role() ────────────────────────────────────────────────────────────
-- Usada en todas las policies RLS (migrations 005-011) y en el cliente
-- via supabase.rpc('get_my_role').

create or replace function public.get_my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid()
$$;

-- ─── my_role() ────────────────────────────────────────────────────────────────
-- Alias legacy definido en 003_sessions.sql con la tabla incorrecta.
-- Redefinir aquí para que delegue a get_my_role().

create or replace function public.my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select public.get_my_role()
$$;

-- ─── is_admin() ───────────────────────────────────────────────────────────────
-- Usada en policies de 003_sessions.sql. Redefinir con perfiles.

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'admin'
  )
$$;
