-- ============================================================================
-- Networking Games · Códigos de acceso
-- ----------------------------------------------------------------------------
-- Ejecutar DESPUÉS de 0001_init.sql (y de 0002_invitations.sql si ya estaba
-- aplicada). Es idempotente: se puede repetir.
--
-- Cambios:
--   1. Nueva tabla `access_codes`: un código sirve para un único registro y la
--      persona elige el correo que quiera (ya no va atado a un email).
--   2. Se retira el flujo anterior: trigger `on_auth_user_invitation_used`,
--      funciones `check_invitation()` / `mark_invitation_used()` y tabla
--      `invitations`. Los códigos que ya existieran se copian a `access_codes`.
--   3. El alta la hace el servidor con la Admin API
--      (POST /api/auth/register-with-code), que consume el código y crea el
--      usuario con `email_confirm: true` (sin correo de confirmación).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Generador de códigos
-- ----------------------------------------------------------------------------
-- `NG-` + 6 caracteres. Alfabeto sin 0/O/1/I: los códigos se dictan por
-- teléfono y se imprimen sin errores de lectura.
create or replace function public.generate_access_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  for attempt in 1..50 loop
    candidate := 'NG-';
    for i in 1..6 loop
      candidate := candidate
        || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    if not exists (select 1 from public.access_codes where code = candidate) then
      return candidate;
    end if;
  end loop;

  raise exception 'No se pudo generar un código único tras 50 intentos';
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. access_codes
-- ----------------------------------------------------------------------------
-- Una fila por código. `assigned_to` es solo una anotación del organizador
-- (empresa, persona, mesa…) y NO se usa para validar.
create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null default public.generate_access_code(),
  assigned_to text,
  is_used boolean not null default false,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  -- 4–12 caracteres para admitir también los códigos de 8 que generaba 0002.
  constraint access_codes_code_format
    check (code = upper(btrim(code)) and code ~ '^NG-[A-Z0-9]{4,12}$'),
  constraint access_codes_code_key unique (code),
  constraint access_codes_used_at_requires_used
    check (used_at is null or is_used)
);

comment on table public.access_codes is
  'Códigos de invitación: cada código vale para un único registro, con el correo que elija la persona.';

comment on column public.access_codes.assigned_to is
  'Anotación libre del organizador (empresa/persona). No se usa para validar.';

-- Acelera el chequeo de "¿existe este código sin usar?" que hace la API.
create index if not exists access_codes_unused_idx
  on public.access_codes (code)
  where is_used = false;

-- Sin políticas: la tabla solo se toca desde el servidor con la service role
-- key (omite RLS). Ni `anon` ni `authenticated` pueden leerla ni escribirla.
alter table public.access_codes enable row level security;

revoke all on public.access_codes from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.access_codes to service_role;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 3. Se retira el flujo anterior de invitaciones por email
-- ----------------------------------------------------------------------------
-- `on_auth_user_invitation_used` marcaba la invitación al insertar en
-- auth.users y `check_invitation()` la consultaba antes del alta. Ahora el
-- control está en la API, que valida y consume el código antes de crear el
-- usuario, así que ambos sobran.
drop trigger if exists on_auth_user_invitation_used on auth.users;

-- La tabla `invitations` puede no existir si se aplica 0003 sin 0002.
do $$
begin
  if to_regclass('public.invitations') is not null then
    execute 'drop trigger if exists invitations_normalize_email on public.invitations';
  end if;
end
$$;

drop function if exists public.mark_invitation_used();
drop function if exists public.check_invitation(text);
drop function if exists public.normalize_invitation_email();

-- Si ya habías repartido códigos con 0002, se conservan (sin su correo: con
-- access_codes el email deja de estar atado a la invitación).
do $$
begin
  if to_regclass('public.invitations') is not null then
    execute $mig$
      insert into public.access_codes (code, is_used, used_at)
      select upper(btrim(code)), is_used, used_at
      from public.invitations
      where code is not null
      on conflict (code) do nothing
    $mig$;
  end if;
end
$$;

drop table if exists public.invitations cascade;

-- ----------------------------------------------------------------------------
-- 4. Reparto de códigos
-- ----------------------------------------------------------------------------
-- El código se genera solo. Para crear 25 códigos de golpe y anotar a quién
-- va cada uno:
--
--   insert into public.access_codes (assigned_to)
--   select 'Estudio ' || g from generate_series(1, 25) g;
--
-- Y para llevarlos a la hoja de cálculo del evento:
--
--   select code, assigned_to, is_used
--   from public.access_codes
--   order by created_at;
