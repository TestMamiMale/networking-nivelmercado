-- ============================================================================
-- Networking Games · Invitaciones y perfiles solo para autenticados
-- ----------------------------------------------------------------------------
-- Ejecutar DESPUÉS de 0001_init.sql. Es idempotente: se puede repetir.
--
-- Cambios:
--   1. `profiles` deja de ser legible con la clave anónima: solo con sesión.
--   2. Nueva tabla `invitations` (lista de invitados al evento).
--   3. `check_invitation(email)` para que el formulario de registro valide
--      antes de crear la cuenta (la tabla no es legible por el cliente).
--   4. La invitación se marca como usada automáticamente al crearse el usuario
--      en `auth.users`, para que no dependa del navegador.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles: lectura solo para usuarios autenticados
-- ----------------------------------------------------------------------------
-- Antes la política era `using (true)` para cualquiera, incluida la clave
-- anónima. Ahora el directorio y los perfiles se leen con la sesión del
-- usuario (el proxy exige login en esas rutas).
drop policy if exists "profiles_public_read" on public.profiles;
drop policy if exists "profiles_authenticated_read" on public.profiles;

create policy "profiles_authenticated_read"
  on public.profiles for select
  to authenticated
  using (true);

-- El GRANT de 0001 se lo daba también a `anon`: lo quitamos para que ni
-- siquiera pueda intentarlo (RLS ya lo bloquearía).
revoke select on public.profiles from anon;
grant select on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 2. invitations
-- ----------------------------------------------------------------------------
-- Una fila por invitado. `email` se guarda siempre en minúsculas (trigger más
-- abajo), `code` es un identificador corto por si quieres repartir enlaces
-- (`/login?code=NG-1A2B3C4D`) y `is_used` se pone a true cuando la persona
-- crea su cuenta.
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null default (
    'NG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  is_used boolean not null default false,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  constraint invitations_email_normalized check (email = lower(trim(email))),
  constraint invitations_email_length check (char_length(email) between 3 and 320),
  constraint invitations_code_length check (char_length(trim(code)) between 4 and 64),
  constraint invitations_email_key unique (email),
  constraint invitations_code_key unique (code)
);

comment on table public.invitations is
  'Lista de invitados: solo pueden registrarse los correos que estén aquí.';

-- Normaliza el correo antes de validar el CHECK, para que el organizador pueda
-- insertar "Ana@Estudio.cl" sin pelearse con la restricción.
create or replace function public.normalize_invitation_email()
returns trigger
language plpgsql
as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists invitations_normalize_email on public.invitations;
create trigger invitations_normalize_email
  before insert or update of email on public.invitations
  for each row execute function public.normalize_invitation_email();

-- Sin políticas: nadie (ni anon ni authenticated) puede leer ni escribir la
-- tabla directamente. El único acceso es la función de abajo.
alter table public.invitations enable row level security;

revoke all on public.invitations from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Verificación de una invitación (la usa POST /api/invitations/verify)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER para poder leer la tabla, pero solo revela si un correo
-- concreto está invitado: no permite listar invitados ni ver sus códigos.
create or replace function public.check_invitation(p_email text)
returns table (invited boolean, used boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.invitations i
      where i.email = lower(trim(coalesce(p_email, '')))
    ) as invited,
    coalesce(
      (
        select i.is_used
        from public.invitations i
        where i.email = lower(trim(coalesce(p_email, '')))
      ),
      false
    ) as used;
$$;

revoke all on function public.check_invitation(text) from public, anon, authenticated;
grant execute on function public.check_invitation(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Marcar la invitación como usada al crear la cuenta
-- ----------------------------------------------------------------------------
-- Corre en un trigger AFTER INSERT sobre auth.users, igual que
-- `on_auth_user_created` (que crea el perfil). Al ir en la misma transacción,
-- la marca es atómica con el registro: si el alta falla, la invitación sigue
-- disponible.
create or replace function public.mark_invitation_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then
    return new;
  end if;

  update public.invitations
     set is_used = true,
         used_at = now()
   where email = lower(trim(new.email))
     and is_used = false;

  return new;
end;
$$;

revoke all on function public.mark_invitation_used() from public, anon, authenticated;

drop trigger if exists on_auth_user_invitation_used on auth.users;
create trigger on_auth_user_invitation_used
  after insert on auth.users
  for each row execute function public.mark_invitation_used();

-- ----------------------------------------------------------------------------
-- 5. Invitados de ejemplo (opcional; no los uses en producción)
-- ----------------------------------------------------------------------------
-- insert into public.invitations (email) values
--   ('ana@estudio.cl'),
--   ('bruno@publisher.com');
