-- ============================================================================
-- Networking Games · Reset (solo para proyectos de prueba)
-- ----------------------------------------------------------------------------
-- Borra todo lo que crean 0001_init.sql y 0002_invitations.sql para empezar
-- de cero.
-- OJO: elimina perfiles, disponibilidad, reuniones e invitaciones. No lo
-- ejecutes en producción ni con datos que quieras conservar.
--
-- Uso: pégalo en el SQL Editor y luego vuelve a ejecutar 0001_init.sql y
-- 0002_invitations.sql (en ese orden).
-- ============================================================================

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_invitation_used on auth.users;
drop trigger if exists profiles_set_updated_at on public.profiles;
drop trigger if exists invitations_normalize_email on public.invitations;

drop function if exists public.book_availability(uuid, text);
drop function if exists public.handle_new_user();
drop function if exists public.check_invitation(text);
drop function if exists public.mark_invitation_used();
drop function if exists public.normalize_invitation_email();
drop function if exists public.set_updated_at() cascade;

drop table if exists public.meetings cascade;
drop table if exists public.availability cascade;
drop table if exists public.invitations cascade;
drop table if exists public.profiles cascade;

drop type if exists public.profile_type;
