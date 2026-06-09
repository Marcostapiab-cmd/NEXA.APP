-- Supabase schema para la app NEXA
-- Tablas: profiles, athletes, exercises, programs, program_days, program_exercises, athlete_programs, workout_logs

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists athletes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  date_of_birth date,
  gender text,
  height_cm integer,
  weight_kg numeric(6,2),
  fitness_goal text,
  experience_level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athletes_profile_unique unique(profile_id)
);

create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  muscle_group text not null,
  equipment text,
  difficulty text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  level text,
  duration_weeks integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists program_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  day_order integer not null,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_days_unique_day unique(program_id, day_order)
);

create table if not exists program_exercises (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references program_days(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete restrict,
  sequence integer not null,
  sets integer,
  reps text,
  duration_seconds integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_exercises_unique_sequence unique(program_day_id, sequence)
);

create table if not exists athlete_programs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  program_id uuid not null references programs(id) on delete restrict,
  start_date date not null,
  end_date date,
  status text not null default 'active',
  progress_percent smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete restrict,
  program_day_id uuid references program_days(id) on delete set null,
  program_exercise_id uuid references program_exercises(id) on delete set null,
  workout_date date not null default current_date,
  sets_completed integer,
  reps_completed text,
  duration_seconds integer,
  calories_burned integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
