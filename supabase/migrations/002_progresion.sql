-- ============================================================
-- NEXA — Sistema de progresión de cargas
-- Ejecutar en el SQL Editor de Supabase después de 001_schema.sql
-- ============================================================

-- Sugerencias de progresión por atleta + ejercicio
create table public.sugerencias_progresion (
  id                  uuid default uuid_generate_v4() primary key,
  atleta_id           uuid references public.atletas(id) on delete cascade not null,
  ejercicio_id        uuid references public.ejercicios(id) on delete cascade not null,
  ejercicio_nombre    text not null,
  accion_sugerida     text not null check (accion_sugerida in ('subir_carga', 'mantener', 'bajar_carga')),
  peso_actual         decimal(6,2),
  peso_sugerido       decimal(6,2),
  sesiones_ok         int not null default 0,
  sesiones_analizadas int not null default 0,
  rango_reps          text,
  motivo              text,
  activa              boolean default true,
  fecha_calculo       timestamptz default now(),
  created_at          timestamptz default now(),

  -- Upsert clave: un registro por atleta+ejercicio (se actualiza con cada cálculo)
  unique (atleta_id, ejercicio_id)
);

-- RLS
alter table public.sugerencias_progresion enable row level security;

create policy "sugerencias_coach_own" on public.sugerencias_progresion
  for all using (
    exists (
      select 1 from public.atletas a
      where a.id = atleta_id
        and (
          a.coach_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.rol = 'admin'
          )
        )
    )
  );

-- Índices para queries de la UI
create index idx_sugerencias_atleta
  on public.sugerencias_progresion(atleta_id);

create index idx_sugerencias_listas
  on public.sugerencias_progresion(atleta_id, accion_sugerida)
  where accion_sugerida = 'subir_carga' and activa = true;
