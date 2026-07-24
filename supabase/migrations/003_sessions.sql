-- ============================================================
-- NEXA — Sistema de sesiones, horarios y reservas (Fases 4-12)
-- Ejecutar después de 001_schema.sql y 002_progresion.sql
-- ============================================================

-- ─── Extensiones ────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLAS DE CONFIGURACIÓN
-- ============================================================

-- Espacios / salas de entrenamiento
create table if not exists public.training_spaces (
  id        uuid primary key default uuid_generate_v4(),
  nombre    text not null,
  capacidad int  not null default 2,
  activo    boolean default true,
  orden     int  default 0,
  created_at timestamptz default now()
);

-- Horario de apertura del gimnasio (configurable desde Configuración)
-- dia_semana: 0=domingo, 1=lunes … 6=sábado
create table if not exists public.gym_opening_hours (
  id          uuid primary key default uuid_generate_v4(),
  dia_semana  int not null check (dia_semana between 0 and 6),
  apertura    time not null,
  cierre      time not null,
  activo      boolean default true,
  updated_at  timestamptz default now(),
  updated_by  uuid references public.profiles(id),
  unique (dia_semana)
);

-- Reglas de cancelación (configurables, permite múltiples vigencias)
create table if not exists public.cancellation_rules (
  id                   uuid primary key default uuid_generate_v4(),
  nombre               text not null,
  horas_anticipacion   int  not null default 6,
  am_deadline_hora_ant time,            -- para clases AM, límite del día anterior
  burns_class          boolean not null default true,
  puede_reagendar      boolean not null default true,
  vigente_desde        date not null default current_date,
  vigente_hasta        date,
  is_default           boolean default false,
  created_at           timestamptz default now()
);

-- Tarifas de pago a profesores (historial de versiones)
create table if not exists public.coach_payment_rates (
  id            uuid primary key default uuid_generate_v4(),
  tipo          text not null check (tipo in ('1:1', '2:1', 'reemplazo', '2:1_solo')),
  coach_id      uuid references public.profiles(id) on delete cascade,  -- null = tarifa global
  monto         numeric(10,2) not null,
  moneda        text not null default 'CLP',
  vigente_desde date not null default current_date,
  vigente_hasta date,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz default now()
);

-- ============================================================
-- TABLAS DE SERIES RECURRENTES
-- ============================================================

create table if not exists public.session_series (
  id              uuid primary key default uuid_generate_v4(),
  coach_id        uuid references public.profiles(id) on delete restrict not null,
  space_id        uuid references public.training_spaces(id) on delete set null,
  modality        text not null check (modality in ('1:1', '2:1')),
  session_type    text not null default 'entrenamiento',
  recurrence_rule text not null,   -- 'weekly:1', 'weekly:1,3,5', 'biweekly:1' etc.
  time_start      time not null,
  time_end        time not null,
  starts_on       date not null,
  ends_on         date,
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz default now()
);

-- ============================================================
-- TABLA PRINCIPAL: SESIONES
-- ============================================================

create table if not exists public.sessions (
  id                   uuid primary key default uuid_generate_v4(),
  series_id            uuid references public.session_series(id) on delete set null,
  space_id             uuid references public.training_spaces(id) on delete set null,
  coach_id             uuid references public.profiles(id) on delete restrict not null,
  replacement_coach_id uuid references public.profiles(id) on delete set null,
  modality             text not null check (modality in ('1:1', '2:1')),
  session_type         text not null default 'entrenamiento',
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  status               text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled_nexa', 'cancelled_admin', 'no_show')),
  capacity             int not null default 1 check (capacity in (1, 2)),
  notes                text,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  constraint sessions_ends_after_starts check (ends_at > starts_at),
  constraint sessions_capacity_modality check (
    (modality = '1:1' and capacity = 1) or
    (modality = '2:1' and capacity = 2)
  )
);

-- ============================================================
-- TABLA: ALUMNOS POR SESIÓN (asistencia individual)
-- ============================================================

create table if not exists public.session_students (
  id                       uuid primary key default uuid_generate_v4(),
  session_id               uuid references public.sessions(id) on delete cascade not null,
  student_id               uuid references public.atletas(id) on delete restrict not null,
  plan_id                  uuid references public.class_plans(id) on delete set null,
  attendance_status        text not null default 'pending'
    check (attendance_status in (
      'pending', 'confirmed', 'attended', 'absent',
      'cancelled_ontime', 'cancelled_late', 'burned',
      'rescheduled', 'cancelled_nexa'
    )),
  class_deducted           boolean default false,
  cancellation_at          timestamptz,
  cancellation_reason      text,
  cancellation_rule_result jsonb,     -- snapshot: {isOnTime, burnsClass, deadline, reason}
  rescheduled_to           uuid references public.sessions(id) on delete set null,
  checked_in_at            timestamptz,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  unique (session_id, student_id)
);

-- ============================================================
-- TABLA: PLANES DE CLASES
-- ============================================================

create table if not exists public.class_plans (
  id                 uuid primary key default uuid_generate_v4(),
  student_id         uuid references public.atletas(id) on delete cascade not null,
  nombre             text not null,
  modalidad          text check (modalidad in ('1:1', '2:1', 'ambas')),
  clases_total       int  not null check (clases_total > 0),
  clases_restantes   int  not null check (clases_restantes >= 0),
  frecuencia_semana  int  default 3,
  precio             numeric(10,2),
  fecha_inicio       date not null,
  fecha_fin          date,
  estado             text not null default 'activo'
    check (estado in ('pendiente','activo','pausado','vencido','agotado','cancelado')),
  regla_cancelacion  text default 'standard',
  created_by         uuid references public.profiles(id),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- ============================================================
-- TABLA: MOVIMIENTOS DE CLASES (ledger inmutable)
-- ============================================================

create table if not exists public.class_movements (
  id                 uuid primary key default uuid_generate_v4(),
  plan_id            uuid references public.class_plans(id) on delete cascade not null,
  student_id         uuid references public.atletas(id) on delete cascade not null,
  session_id         uuid references public.sessions(id) on delete set null,
  session_student_id uuid references public.session_students(id) on delete set null,
  tipo               text not null check (tipo in (
    'compra',
    'descuento_asistencia',
    'descuento_cancelacion_tarde',
    'devolucion',
    'reagendamiento',
    'correccion_admin',
    'extension',
    'bonificacion'
  )),
  cantidad           int  not null,  -- positivo = suma, negativo = resta
  saldo_resultante   int  not null,  -- saldo después del movimiento
  motivo             text,
  responsable_id     uuid references public.profiles(id),
  created_at         timestamptz default now()
);

-- ============================================================
-- TABLA: DISPONIBILIDAD SEMANAL DE PROFESORES
-- ============================================================

create table if not exists public.coach_availability (
  id          uuid primary key default uuid_generate_v4(),
  coach_id    uuid references public.profiles(id) on delete cascade not null,
  dia_semana  int not null check (dia_semana between 0 and 6),
  inicio      time not null,
  fin         time not null,
  activo      boolean default true,
  created_at  timestamptz default now(),
  unique (coach_id, dia_semana)
);

-- Excepciones: vacaciones, ausencias, horario especial
create table if not exists public.coach_availability_exceptions (
  id         uuid primary key default uuid_generate_v4(),
  coach_id   uuid references public.profiles(id) on delete cascade not null,
  fecha      date not null,
  tipo       text not null check (tipo in ('ausencia','vacaciones','horario_especial','bloqueado')),
  inicio     time,   -- null = día completo
  fin        time,
  motivo     text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- ============================================================
-- TABLA: PAGO POR SESIÓN (calculado y almacenado)
-- ============================================================

create table if not exists public.coach_session_payments (
  id          uuid primary key default uuid_generate_v4(),
  session_id  uuid references public.sessions(id) on delete cascade not null unique,
  coach_id    uuid references public.profiles(id) not null,
  monto       numeric(10,2) not null,
  tipo_pago   text not null check (tipo_pago in ('1:1','2:1','reemplazo','2:1_solo')),
  rate_id     uuid references public.coach_payment_rates(id),
  estado      text not null default 'pendiente'
    check (estado in ('pendiente','revisado','aprobado','pagado','corregido')),
  notas       text,
  corregido_por uuid references public.profiles(id),
  corregido_at  timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- TABLA: HISTORIAL DE CAMBIOS DE ESTADO (audit trail)
-- ============================================================

create table if not exists public.session_status_history (
  id                 uuid primary key default uuid_generate_v4(),
  session_id         uuid references public.sessions(id) on delete cascade not null,
  session_student_id uuid references public.session_students(id) on delete cascade,
  campo              text not null,
  valor_anterior     text,
  valor_nuevo        text not null,
  motivo             text,
  responsable_id     uuid references public.profiles(id),
  fuente             text default 'web',
  created_at         timestamptz default now()
);

-- ============================================================
-- TABLA: LISTA DE ESPERA
-- ============================================================

create table if not exists public.waitlist (
  id          uuid primary key default uuid_generate_v4(),
  session_id  uuid references public.sessions(id) on delete cascade not null,
  student_id  uuid references public.atletas(id) on delete cascade not null,
  posicion    int not null,
  estado      text not null default 'esperando'
    check (estado in ('esperando','ofrecido','confirmado','expirado','rechazado')),
  ofrecido_at timestamptz,
  expira_at   timestamptz,
  created_at  timestamptz default now(),
  unique (session_id, student_id)
);

-- ============================================================
-- ÍNDICES
-- ============================================================

create index idx_sessions_starts_at          on public.sessions(starts_at);
create index idx_sessions_coach_id           on public.sessions(coach_id);
create index idx_sessions_series_id          on public.sessions(series_id);
create index idx_sessions_status             on public.sessions(status);
create index idx_sessions_week               on public.sessions(date_trunc('week', starts_at));

create index idx_session_students_session    on public.session_students(session_id);
create index idx_session_students_student    on public.session_students(student_id);
create index idx_session_students_status     on public.session_students(attendance_status);

create index idx_class_plans_student         on public.class_plans(student_id);
create index idx_class_plans_estado          on public.class_plans(estado);

create index idx_class_movements_plan        on public.class_movements(plan_id);
create index idx_class_movements_student     on public.class_movements(student_id);
create index idx_class_movements_session     on public.class_movements(session_id);

create index idx_coach_availability_coach    on public.coach_availability(coach_id);
create index idx_avail_exceptions_coach_date on public.coach_availability_exceptions(coach_id, fecha);

create index idx_payments_coach_estado       on public.coach_session_payments(coach_id, estado);
create index idx_status_history_session      on public.session_status_history(session_id);
create index idx_status_history_ss           on public.session_status_history(session_student_id);

create index idx_waitlist_session            on public.waitlist(session_id, posicion);
create index idx_waitlist_student            on public.waitlist(student_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.training_spaces              enable row level security;
alter table public.gym_opening_hours            enable row level security;
alter table public.cancellation_rules           enable row level security;
alter table public.coach_payment_rates          enable row level security;
alter table public.session_series               enable row level security;
alter table public.sessions                     enable row level security;
alter table public.session_students             enable row level security;
alter table public.class_plans                  enable row level security;
alter table public.class_movements              enable row level security;
alter table public.coach_availability           enable row level security;
alter table public.coach_availability_exceptions enable row level security;
alter table public.coach_session_payments       enable row level security;
alter table public.session_status_history       enable row level security;
alter table public.waitlist                     enable row level security;

-- ── Helper: rol del usuario actual ──────────────────────────

create or replace function public.my_role()
returns text language sql stable security definer as $$
  select rol from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin')
$$;

-- ── training_spaces ─────────────────────────────────────────

create policy "spaces_select_authenticated" on public.training_spaces
  for select using (auth.uid() is not null);

create policy "spaces_modify_admin" on public.training_spaces
  for all using (public.is_admin());

-- ── gym_opening_hours ────────────────────────────────────────

create policy "opening_hours_select" on public.gym_opening_hours
  for select using (auth.uid() is not null);

create policy "opening_hours_admin" on public.gym_opening_hours
  for all using (public.is_admin());

-- ── cancellation_rules ───────────────────────────────────────

create policy "cancel_rules_select" on public.cancellation_rules
  for select using (auth.uid() is not null);

create policy "cancel_rules_admin" on public.cancellation_rules
  for all using (public.is_admin());

-- ── coach_payment_rates ──────────────────────────────────────

create policy "rates_admin_all" on public.coach_payment_rates
  for all using (public.is_admin());

create policy "rates_coach_own" on public.coach_payment_rates
  for select using (coach_id = auth.uid() or coach_id is null);

-- ── session_series ───────────────────────────────────────────

create policy "series_admin_all" on public.session_series
  for all using (public.is_admin());

create policy "series_coach_own" on public.session_series
  for select using (coach_id = auth.uid());

create policy "series_coach_insert" on public.session_series
  for insert with check (
    coach_id = auth.uid() or public.is_admin()
  );

-- ── sessions ─────────────────────────────────────────────────

create policy "sessions_admin_all" on public.sessions
  for all using (public.is_admin());

create policy "sessions_coach_own" on public.sessions
  for select using (coach_id = auth.uid() or replacement_coach_id = auth.uid());

create policy "sessions_coach_insert" on public.sessions
  for insert with check (
    coach_id = auth.uid() or public.is_admin()
  );

create policy "sessions_coach_update_own" on public.sessions
  for update using (coach_id = auth.uid() or replacement_coach_id = auth.uid());

create policy "sessions_student_view" on public.sessions
  for select using (
    exists (
      select 1 from public.session_students ss
      join public.atletas a on a.id = ss.student_id
      join public.profiles p on p.id = a.coach_id
      where ss.session_id = sessions.id
        and (a.id::text = (select raw_user_meta_data->>'atleta_id' from auth.users where id = auth.uid()))
    )
  );

-- ── session_students ─────────────────────────────────────────

create policy "ss_admin_all" on public.session_students
  for all using (public.is_admin());

create policy "ss_coach_own_session" on public.session_students
  for all using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
        and (s.coach_id = auth.uid() or s.replacement_coach_id = auth.uid())
    )
  );

-- ── class_plans ──────────────────────────────────────────────

create policy "plans_admin_all" on public.class_plans
  for all using (public.is_admin());

create policy "plans_coach_view" on public.class_plans
  for select using (
    exists (
      select 1 from public.atletas a
      where a.id = student_id and a.coach_id = auth.uid()
    )
  );

-- ── class_movements ──────────────────────────────────────────

create policy "movements_admin_all" on public.class_movements
  for all using (public.is_admin());

create policy "movements_coach_view" on public.class_movements
  for select using (
    exists (
      select 1 from public.atletas a
      where a.id = student_id and a.coach_id = auth.uid()
    )
  );

-- Los movimientos solo se insertan (nunca se actualizan/borran — ledger inmutable)
create policy "movements_insert_coach_admin" on public.class_movements
  for insert with check (
    public.is_admin() or exists (
      select 1 from public.atletas a
      where a.id = student_id and a.coach_id = auth.uid()
    )
  );

-- ── coach_availability ───────────────────────────────────────

create policy "avail_admin_all" on public.coach_availability
  for all using (public.is_admin());

create policy "avail_coach_own" on public.coach_availability
  for all using (coach_id = auth.uid());

create policy "avail_select_authenticated" on public.coach_availability
  for select using (auth.uid() is not null);

-- ── coach_availability_exceptions ────────────────────────────

create policy "avail_exc_admin_all" on public.coach_availability_exceptions
  for all using (public.is_admin());

create policy "avail_exc_coach_own" on public.coach_availability_exceptions
  for all using (coach_id = auth.uid());

-- ── coach_session_payments ───────────────────────────────────

create policy "payments_admin_all" on public.coach_session_payments
  for all using (public.is_admin());

create policy "payments_coach_view" on public.coach_session_payments
  for select using (coach_id = auth.uid());

-- ── session_status_history ───────────────────────────────────

create policy "history_admin_all" on public.session_status_history
  for all using (public.is_admin());

create policy "history_coach_view" on public.session_status_history
  for select using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
        and (s.coach_id = auth.uid() or s.replacement_coach_id = auth.uid())
    )
  );

-- ── waitlist ─────────────────────────────────────────────────

create policy "waitlist_admin_all" on public.waitlist
  for all using (public.is_admin());

create policy "waitlist_coach_view" on public.waitlist
  for select using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
        and (s.coach_id = auth.uid() or s.replacement_coach_id = auth.uid())
    )
  );

-- ============================================================
-- DATOS INICIALES: horario y reglas por defecto
-- ============================================================

-- Horario por defecto NEXA (se puede modificar desde Configuración)
insert into public.gym_opening_hours (dia_semana, apertura, cierre) values
  (1, '06:00', '21:00'),  -- Lunes
  (2, '06:00', '21:00'),  -- Martes
  (3, '06:00', '21:00'),  -- Miércoles
  (4, '06:00', '21:00'),  -- Jueves
  (5, '06:00', '21:00'),  -- Viernes
  (6, '08:00', '14:00'),  -- Sábado
  (0, '00:00', '00:00')   -- Domingo: desactivado por defecto
on conflict (dia_semana) do nothing;

update public.gym_opening_hours set activo = false where dia_semana = 0;

-- Regla de cancelación por defecto NEXA
insert into public.cancellation_rules
  (nombre, horas_anticipacion, am_deadline_hora_ant, burns_class, puede_reagendar, is_default)
values
  ('Regla estándar NEXA', 6, '21:00', true, true, true)
on conflict do nothing;

-- Tarifas por defecto NEXA
insert into public.coach_payment_rates (tipo, monto, moneda) values
  ('1:1',       11000, 'CLP'),
  ('2:1',       13000, 'CLP'),
  ('reemplazo', 12000, 'CLP'),
  ('2:1_solo',  11000, 'CLP')   -- 2:1 con solo un alumno = paga como 1:1
on conflict do nothing;

-- ============================================================
-- FUNCIONES CENTRALES
-- ============================================================

-- ─── Verificar disponibilidad del profesor ───────────────────

create or replace function public.check_coach_availability(
  p_coach_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
) returns jsonb language plpgsql security definer as $$
declare
  v_dow        int;
  v_date       date;
  v_time_start time;
  v_time_end   time;
  v_avail      record;
  v_exception  record;
begin
  v_dow        := extract(dow from p_starts_at at time zone 'America/Santiago');
  v_date       := (p_starts_at at time zone 'America/Santiago')::date;
  v_time_start := (p_starts_at at time zone 'America/Santiago')::time;
  v_time_end   := (p_ends_at   at time zone 'America/Santiago')::time;

  -- Verificar excepción del día
  select * into v_exception
  from public.coach_availability_exceptions
  where coach_id = p_coach_id and fecha = v_date;

  if found then
    if v_exception.tipo in ('ausencia', 'vacaciones', 'bloqueado') then
      return jsonb_build_object(
        'available', false,
        'reason', v_exception.tipo,
        'motivo', v_exception.motivo
      );
    end if;
    if v_exception.tipo = 'horario_especial' then
      if v_time_start >= v_exception.inicio and v_time_end <= v_exception.fin then
        return jsonb_build_object('available', true, 'reason', 'horario_especial');
      else
        return jsonb_build_object('available', false, 'reason', 'fuera_horario_especial');
      end if;
    end if;
  end if;

  -- Verificar disponibilidad semanal
  select * into v_avail
  from public.coach_availability
  where coach_id = p_coach_id and dia_semana = v_dow and activo = true;

  if not found then
    return jsonb_build_object('available', false, 'reason', 'sin_disponibilidad');
  end if;

  if v_time_start >= v_avail.inicio and v_time_end <= v_avail.fin then
    return jsonb_build_object('available', true, 'reason', 'ok');
  end if;

  return jsonb_build_object(
    'available', false,
    'reason', 'fuera_horario',
    'disponible_desde', v_avail.inicio,
    'disponible_hasta', v_avail.fin
  );
end;
$$;

-- ─── Verificar conflictos antes de crear/editar sesión ───────

create or replace function public.check_session_conflicts(
  p_coach_id        uuid,
  p_student_ids     uuid[],   -- array de atletas.id
  p_starts_at       timestamptz,
  p_ends_at         timestamptz,
  p_exclude_session uuid default null
) returns jsonb language plpgsql security definer as $$
declare
  v_conflicts jsonb := '[]'::jsonb;
  v_row       record;
begin
  -- Conflicto de profesor
  for v_row in
    select s.id, s.starts_at, s.ends_at
    from public.sessions s
    where s.coach_id = p_coach_id
      and s.status not in ('cancelled_nexa', 'cancelled_admin')
      and s.starts_at < p_ends_at
      and s.ends_at   > p_starts_at
      and (p_exclude_session is null or s.id != p_exclude_session)
  loop
    v_conflicts := v_conflicts || jsonb_build_object(
      'tipo', 'coach',
      'session_id', v_row.id,
      'starts_at', v_row.starts_at,
      'ends_at', v_row.ends_at
    );
  end loop;

  -- Conflicto de alumnos
  if p_student_ids is not null and array_length(p_student_ids, 1) > 0 then
    for v_row in
      select ss.student_id, s.id as session_id, s.starts_at, s.ends_at
      from public.session_students ss
      join public.sessions s on s.id = ss.session_id
      where ss.student_id = any(p_student_ids)
        and ss.attendance_status not in ('cancelled_ontime','cancelled_late','burned','cancelled_nexa','rescheduled')
        and s.status not in ('cancelled_nexa', 'cancelled_admin')
        and s.starts_at < p_ends_at
        and s.ends_at   > p_starts_at
        and (p_exclude_session is null or s.id != p_exclude_session)
    loop
      v_conflicts := v_conflicts || jsonb_build_object(
        'tipo', 'student',
        'student_id', v_row.student_id,
        'session_id', v_row.session_id,
        'starts_at', v_row.starts_at,
        'ends_at', v_row.ends_at
      );
    end loop;
  end if;

  return jsonb_build_object(
    'has_conflicts', jsonb_array_length(v_conflicts) > 0,
    'conflicts', v_conflicts
  );
end;
$$;

-- ─── Calcular resultado de cancelación ───────────────────────

create or replace function public.calculate_cancellation(
  p_session_id      uuid,
  p_student_id      uuid,
  p_cancelled_at    timestamptz default now()
) returns jsonb language plpgsql security definer as $$
declare
  v_session   record;
  v_rule      record;
  v_sess_time timestamptz;
  v_deadline  timestamptz;
  v_is_am     boolean;
  v_is_ontime boolean;
begin
  select starts_at, ends_at into v_session
  from public.sessions where id = p_session_id;

  if not found then
    raise exception 'session_not_found';
  end if;

  select * into v_rule
  from public.cancellation_rules
  where is_default = true
  order by vigente_desde desc limit 1;

  if not found then
    -- Regla de emergencia si no hay configuración
    return jsonb_build_object(
      'isOnTime', false, 'burnsClass', true,
      'canReschedule', false, 'deadline', p_cancelled_at::text,
      'reason', 'sin_regla_configurada'
    );
  end if;

  v_sess_time := v_session.starts_at at time zone 'America/Santiago';
  v_is_am     := extract(hour from v_sess_time) < 12;

  -- Para clases AM: el límite es a las 21:00 del día anterior
  if v_is_am and v_rule.am_deadline_hora_ant is not null then
    v_deadline := (v_sess_time::date - interval '1 day')::date
                  + v_rule.am_deadline_hora_ant;
    v_deadline := v_deadline at time zone 'America/Santiago';
  else
    v_deadline := v_session.starts_at - (v_rule.horas_anticipacion || ' hours')::interval;
  end if;

  v_is_ontime := p_cancelled_at <= v_deadline;

  return jsonb_build_object(
    'isOnTime',      v_is_ontime,
    'burnsClass',    not v_is_ontime and v_rule.burns_class,
    'canReschedule', v_is_ontime or (not v_is_ontime and v_rule.puede_reagendar),
    'deadline',      v_deadline::text,
    'reason',        case
                       when v_is_ontime then 'cancelacion_a_tiempo'
                       else 'cancelacion_tardia'
                     end,
    'rule_id',       v_rule.id
  );
end;
$$;

-- ─── Calcular resultado completo de sesión ───────────────────

create or replace function public.calculate_session_result(
  p_session_id uuid
) returns jsonb language plpgsql security definer as $$
declare
  v_session  record;
  v_students record;
  v_attended int := 0;
  v_burned   int := 0;
  v_deducted int := 0;
  v_modality text;
  v_rate     record;
  v_payment  numeric;
  v_tipo_pago text;
  v_warnings text[] := '{}';
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'session_not_found'; end if;

  -- Conteo por status de alumnos
  select
    count(*) filter (where attendance_status = 'attended')                 as attended,
    count(*) filter (where attendance_status = 'burned')                   as burned,
    count(*) filter (where class_deducted = true)                          as deducted
  into v_students
  from public.session_students
  where session_id = p_session_id;

  v_attended := coalesce(v_students.attended, 0);
  v_burned   := coalesce(v_students.burned, 0);
  v_deducted := coalesce(v_students.deducted, 0);

  -- Modalidad efectiva para pago
  if v_session.modality = '2:1' then
    if v_attended >= 2 then
      v_tipo_pago := '2:1';
    elsif v_attended = 1 then
      v_tipo_pago := '2:1_solo';
      v_warnings  := array_append(v_warnings, 'sesion_2a1_con_un_alumno_paga_como_1a1');
    else
      v_tipo_pago := '1:1';
      v_warnings  := array_append(v_warnings, 'ningún_alumno_asistió');
    end if;
  else
    v_tipo_pago := '1:1';
  end if;

  -- Si hay reemplazo, tipo es reemplazo
  if v_session.replacement_coach_id is not null then
    v_tipo_pago := 'reemplazo';
  end if;

  -- Tarifa aplicable (específica por coach primero, luego global)
  select * into v_rate
  from public.coach_payment_rates
  where tipo = v_tipo_pago
    and (coach_id = coalesce(v_session.replacement_coach_id, v_session.coach_id) or coach_id is null)
    and vigente_desde <= current_date
    and (vigente_hasta is null or vigente_hasta >= current_date)
  order by coach_id nulls last, vigente_desde desc
  limit 1;

  v_payment := coalesce(v_rate.monto, 0);

  return jsonb_build_object(
    'effectiveModality',  v_session.modality,
    'attendedStudents',   v_attended,
    'burnedClasses',      v_burned,
    'deductedClasses',    v_deducted,
    'coachPayment',       v_payment,
    'paymentRule',        v_tipo_pago,
    'rateId',             v_rate.id,
    'warnings',           v_warnings
  );
end;
$$;

-- ─── Trigger: actualizar updated_at automáticamente ──────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sessions_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

create trigger session_students_updated_at
  before update on public.session_students
  for each row execute function public.set_updated_at();

create trigger class_plans_updated_at
  before update on public.class_plans
  for each row execute function public.set_updated_at();

create trigger coach_payments_updated_at
  before update on public.coach_session_payments
  for each row execute function public.set_updated_at();
