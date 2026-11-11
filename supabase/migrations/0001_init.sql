-- ============================================================================
-- Networking Games · Esquema inicial
-- ----------------------------------------------------------------------------
-- Ejecutar en el SQL Editor de Supabase o con `supabase db push`.
-- Idempotente: se puede volver a ejecutar sin romper nada.
--
-- Incluye un bloque de "reconciliación" que arregla tablas creadas por
-- intentos anteriores con otro nombre de columnas (causa del error
-- 42703: column "participant1_id" does not exist).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_type') then
    create type public.profile_type as enum ('indie', 'publisher');
  end if;
end
$$;


-- ----------------------------------------------------------------------------
-- Reconciliación de tablas preexistentes
-- ----------------------------------------------------------------------------
-- `create table if not exists` no toca una tabla que ya existe. Si una versión
-- anterior (o una prueba manual) creó `meetings` con otras columnas, los
-- índices, políticas y GRANT de más abajo fallan con:
--   42703: column "participant1_id" does not exist
--
-- Este bloque, antes de crear/validar nada:
--   1. renombra columnas antiguas conocidas al nombre actual;
--   2. si sigue faltando alguna columna y la tabla está vacía, la borra para
--      que se recree con el esquema de este script;
--   3. si la tabla tiene datos y no es compatible, aborta con un mensaje claro
--      (así nunca se pierde información sin querer).
do $$
declare
  spec record;
  v_from text;
  v_to text;
  v_missing text[];
  v_columns text;
  v_has_rows boolean;
begin
  for spec in
    select *
    from (values
      (
        'profiles',
        array[
          'id', 'name', 'type', 'description', 'long_description',
          'image_url', 'website_url', 'social_links'
        ]::text[],
        '{
          "display_name": "name",
          "full_name": "name",
          "title": "name",
          "bio": "description",
          "avatar_url": "image_url",
          "website": "website_url",
          "kind": "type",
          "profile_type": "type"
        }'::jsonb
      ),
      (
        'availability',
        array['id', 'user_id', 'start_time', 'end_time', 'is_booked']::text[],
        '{
          "owner_id": "user_id",
          "profile_id": "user_id",
          "start_at": "start_time",
          "end_at": "end_time",
          "booked": "is_booked"
        }'::jsonb
      ),
      (
        'meetings',
        array[
          'id', 'participant1_id', 'participant2_id',
          'availability_id', 'start_time', 'end_time', 'virtual_link'
        ]::text[],
        '{
          "user1_id": "participant1_id",
          "user_1_id": "participant1_id",
          "user1": "participant1_id",
          "booker_id": "participant1_id",
          "requester_id": "participant1_id",
          "participant_a_id": "participant1_id",
          "participant1": "participant1_id",
          "user2_id": "participant2_id",
          "user_2_id": "participant2_id",
          "user2": "participant2_id",
          "owner_id": "participant2_id",
          "host_id": "participant2_id",
          "invitee_id": "participant2_id",
          "participant_b_id": "participant2_id",
          "participant2": "participant2_id"
        }'::jsonb
      )
    ) as t(tbl, req_cols, renames)
  loop
    if to_regclass(format('public.%I', spec.tbl)) is null then
      continue;
    end if;

    -- 1) Renombra columnas antiguas (solo si el nombre nuevo no existe).
    for v_from, v_to in
      select key, value #>> '{}'
      from jsonb_each(spec.renames)
    loop
      if exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = spec.tbl
          and c.column_name::text = v_from
      ) and not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = spec.tbl
          and c.column_name::text = v_to
      ) then
        execute format(
          'alter table public.%I rename column %I to %I',
          spec.tbl, v_from, v_to
        );
      end if;
    end loop;

    -- 2) ¿Queda alguna columna del esquema actual sin existir?
    select array_agg(req.col) into v_missing
    from unnest(spec.req_cols) as req(col)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = spec.tbl
        and c.column_name::text = req.col
    );

    if v_missing is null then
      continue;
    end if;

    -- 3) Incompatible: solo se puede recrear si está vacía.
    execute format('select exists (select 1 from public.%I)', spec.tbl)
      into v_has_rows;

    if v_has_rows then
      select string_agg(c.column_name::text, ', ' order by c.ordinal_position)
        into v_columns
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = spec.tbl;

      raise exception
        'La tabla public.% ya existe con un esquema incompatible (faltan columnas: %). Columnas actuales: %.',
        spec.tbl,
        array_to_string(v_missing, ', '),
        coalesce(v_columns, '(ninguna)')
        using hint =
          'Borra la tabla si no necesitas sus datos y vuelve a ejecutar este script.';
    end if;

    execute format('drop table public.%I cascade', spec.tbl);
  end loop;
end
$$;


-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
-- Una fila por usuario de auth.users (se crea automáticamente con el trigger
-- handle_new_user de más abajo).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  type public.profile_type not null default 'indie',
  description text not null default '',
  long_description text,
  image_url text,
  website_url text,
  social_links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_social_links_is_array check (jsonb_typeof(social_links) = 'array')
);

comment on table public.profiles is
  'Perfiles públicos de estudios indie y publishers del evento.';

-- ----------------------------------------------------------------------------
-- availability
-- ----------------------------------------------------------------------------
-- Huecos que cada usuario publica para ser reservado. Un hueco reservado
-- (is_booked = true) deja de mostrarse en el perfil público.
create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  is_booked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint availability_valid_range check (end_time > start_time),
  constraint availability_user_start_key unique (user_id, start_time)
);

create index if not exists availability_user_idx
  on public.availability (user_id, start_time);

create index if not exists availability_open_idx
  on public.availability (user_id, start_time)
  where is_booked = false;

-- ----------------------------------------------------------------------------
-- meetings
-- ----------------------------------------------------------------------------
-- participant1_id = quien reserva, participant2_id = dueño del hueco.
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  participant1_id uuid not null,
  participant2_id uuid not null,
  availability_id uuid unique,
  start_time timestamptz not null,
  end_time timestamptz not null,
  virtual_link text not null,
  created_at timestamptz not null default now(),
  constraint meetings_participant1_id_fkey
    foreign key (participant1_id) references public.profiles (id) on delete cascade,
  constraint meetings_participant2_id_fkey
    foreign key (participant2_id) references public.profiles (id) on delete cascade,
  constraint meetings_availability_id_fkey
    foreign key (availability_id) references public.availability (id) on delete set null,
  constraint meetings_different_participants check (participant1_id <> participant2_id),
  constraint meetings_valid_range check (end_time > start_time)
);

create index if not exists meetings_participant1_idx
  on public.meetings (participant1_id, start_time);

create index if not exists meetings_participant2_idx
  on public.meetings (participant2_id, start_time);

-- ----------------------------------------------------------------------------
-- Funciones auxiliares
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea el perfil público en cuanto alguien se registra.
-- El nombre sale de los metadatos del signUp o, si no hay, del email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, type, description)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1),
      'Participante'
    ),
    case new.raw_user_meta_data ->> 'type'
      when 'publisher' then 'publisher'::public.profile_type
      else 'indie'::public.profile_type
    end,
    ''
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reserva atómica de un hueco de disponibilidad.
-- Evita dobles reservas: el UPDATE solo afecta a un hueco libre y ajeno.
-- Se ejecuta como SECURITY DEFINER porque quien reserva no es dueño de la fila.
create or replace function public.book_availability(
  p_availability_id uuid,
  p_virtual_link text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_slot public.availability%rowtype;
  v_meeting_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_virtual_link is null or trim(p_virtual_link) = '' then
    raise exception 'invalid_virtual_link' using errcode = '22023';
  end if;

  update public.availability
     set is_booked = true
   where id = p_availability_id
     and is_booked = false
     and user_id <> v_user_id
     and start_time > now()
  returning * into v_slot;

  if v_slot.id is null then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  insert into public.meetings (
    participant1_id,
    participant2_id,
    availability_id,
    start_time,
    end_time,
    virtual_link
  )
  values (
    v_user_id,
    v_slot.user_id,
    v_slot.id,
    v_slot.start_time,
    v_slot.end_time,
    p_virtual_link
  )
  returning id into v_meeting_id;

  return v_meeting_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.availability enable row level security;
alter table public.meetings enable row level security;

-- profiles: lectura pública (directorio), escritura solo del dueño.
drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read"
  on public.profiles for select
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- availability: los huecos son visibles para cualquiera, pero solo el dueño
-- puede crear y borrar los suyos. El marcado de "reservado" pasa por
-- book_availability() para que sea atómico.
drop policy if exists "availability_public_read" on public.availability;
create policy "availability_public_read"
  on public.availability for select
  using (true);

drop policy if exists "availability_insert_own" on public.availability;
create policy "availability_insert_own"
  on public.availability for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "availability_update_own" on public.availability;
create policy "availability_update_own"
  on public.availability for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "availability_delete_own" on public.availability;
create policy "availability_delete_own"
  on public.availability for delete
  to authenticated
  using (auth.uid() = user_id);

-- meetings: solo visible para sus dos participantes.
drop policy if exists "meetings_participants_read" on public.meetings;
create policy "meetings_participants_read"
  on public.meetings for select
  to authenticated
  using (auth.uid() = participant1_id or auth.uid() = participant2_id);

drop policy if exists "meetings_insert_as_participant1" on public.meetings;
create policy "meetings_insert_as_participant1"
  on public.meetings for insert
  to authenticated
  with check (auth.uid() = participant1_id);

drop policy if exists "meetings_delete_participants" on public.meetings;
create policy "meetings_delete_participants"
  on public.meetings for delete
  to authenticated
  using (auth.uid() = participant1_id or auth.uid() = participant2_id);

-- ----------------------------------------------------------------------------
-- Permisos (PostgREST)
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

grant select on public.availability to anon, authenticated;
grant insert, update, delete on public.availability to authenticated;

grant select, insert, delete on public.meetings to authenticated;

revoke all on function public.book_availability(uuid, text) from public, anon;
grant execute on function public.book_availability(uuid, text) to authenticated;
