-- ============================================================
-- NEXA — Esquema completo de base de datos
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Extensión para UUIDs
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLAS
-- ============================================================

-- Perfiles (ligados a auth.users)
create table public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  email      text unique not null,
  nombre     text not null,
  apellido   text default '',
  rol        text not null default 'atleta' check (rol in ('admin', 'coach', 'atleta')),
  avatar_url text,
  created_at timestamptz default now()
);

-- Atletas
create table public.atletas (
  id               uuid default uuid_generate_v4() primary key,
  coach_id         uuid references public.profiles(id) on delete set null,
  nombre           text not null,
  apellido         text not null,
  email            text,
  fecha_nacimiento date,
  peso             decimal(5,2),
  altura           decimal(5,2),
  foto_url         text,
  notas            text,
  activo           boolean default true,
  created_at       timestamptz default now()
);

-- Ejercicios (biblioteca)
create table public.ejercicios (
  id              uuid default uuid_generate_v4() primary key,
  nombre          text not null,
  grupo_muscular  text not null,
  descripcion     text,
  youtube_url     text,
  created_at      timestamptz default now()
);

-- Programas de entrenamiento
create table public.programas (
  id               uuid default uuid_generate_v4() primary key,
  coach_id         uuid references public.profiles(id) on delete cascade,
  nombre           text not null,
  descripcion      text,
  duracion_semanas int not null default 4,
  es_plantilla     boolean default false,
  created_at       timestamptz default now()
);

-- Días de un programa
create table public.dias_programa (
  id          uuid default uuid_generate_v4() primary key,
  programa_id uuid references public.programas(id) on delete cascade,
  dia_numero  int not null,
  nombre      text not null,
  created_at  timestamptz default now()
);

-- Ejercicios dentro de un día
create table public.ejercicios_dia (
  id            uuid default uuid_generate_v4() primary key,
  dia_id        uuid references public.dias_programa(id) on delete cascade,
  ejercicio_id  uuid references public.ejercicios(id) on delete cascade,
  orden         int not null default 1,
  series        int not null default 3,
  repeticiones  text not null default '10',
  peso          decimal(6,2),
  descanso      int default 90,
  notas         text,
  created_at    timestamptz default now()
);

-- Asignación de programa a atleta
create table public.atleta_programas (
  id           uuid default uuid_generate_v4() primary key,
  atleta_id    uuid references public.atletas(id) on delete cascade,
  programa_id  uuid references public.programas(id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin    date,
  activo       boolean default true,
  created_at   timestamptz default now()
);

-- Registro de entrenamientos
create table public.registro_entrenamientos (
  id                    uuid default uuid_generate_v4() primary key,
  atleta_id             uuid references public.atletas(id) on delete cascade,
  ejercicio_id          uuid references public.ejercicios(id) on delete set null,
  ejercicio_dia_id      uuid references public.ejercicios_dia(id) on delete set null,
  fecha                 date not null default current_date,
  serie_numero          int not null,
  repeticiones_hechas   int,
  peso_utilizado        decimal(6,2),
  completado            boolean default false,
  notas                 text,
  created_at            timestamptz default now()
);

-- ============================================================
-- TRIGGER: crear perfil automáticamente al registrar usuario
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, nombre, apellido, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'apellido', ''),
    coalesce(new.raw_user_meta_data->>'rol', 'atleta')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.profiles                  enable row level security;
alter table public.atletas                   enable row level security;
alter table public.ejercicios                enable row level security;
alter table public.programas                 enable row level security;
alter table public.dias_programa             enable row level security;
alter table public.ejercicios_dia            enable row level security;
alter table public.atleta_programas          enable row level security;
alter table public.registro_entrenamientos   enable row level security;

-- PROFILES
create policy "profiles_ver_propio" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_admin_total" on public.profiles
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin')
  );

-- EJERCICIOS: lectura pública, escritura para coach y admin
create policy "ejercicios_lectura_todos" on public.ejercicios
  for select using (true);

create policy "ejercicios_insertar_coach_admin" on public.ejercicios
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and rol in ('admin','coach'))
  );

create policy "ejercicios_actualizar_coach_admin" on public.ejercicios
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and rol in ('admin','coach'))
  );

create policy "ejercicios_eliminar_admin" on public.ejercicios
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin')
  );

-- ATLETAS: coach gestiona los suyos, admin gestiona todos
create policy "atletas_coach_y_admin" on public.atletas
  for all using (
    coach_id = auth.uid() or
    exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin')
  );

-- PROGRAMAS: coach gestiona los suyos, admin gestiona todos
create policy "programas_coach_y_admin" on public.programas
  for all using (
    coach_id = auth.uid() or
    exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin')
  );

-- DÍAS DE PROGRAMA: heredan del programa
create policy "dias_via_programa" on public.dias_programa
  for all using (
    exists (
      select 1 from public.programas p
      where p.id = programa_id
        and (p.coach_id = auth.uid() or
             exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin'))
    )
  );

-- EJERCICIOS DE DÍA: heredan del programa via día
create policy "ejercicios_dia_via_programa" on public.ejercicios_dia
  for all using (
    exists (
      select 1 from public.dias_programa d
      join public.programas p on p.id = d.programa_id
      where d.id = dia_id
        and (p.coach_id = auth.uid() or
             exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin'))
    )
  );

-- ATLETA_PROGRAMAS: coach gestiona los suyos via atleta
create policy "atleta_programas_coach_y_admin" on public.atleta_programas
  for all using (
    exists (
      select 1 from public.atletas a
      where a.id = atleta_id
        and (a.coach_id = auth.uid() or
             exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin'))
    )
  );

-- REGISTROS: coach accede via atleta, admin accede a todos
create policy "registros_coach_y_admin" on public.registro_entrenamientos
  for all using (
    exists (
      select 1 from public.atletas a
      where a.id = atleta_id
        and (a.coach_id = auth.uid() or
             exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin'))
    )
  );
