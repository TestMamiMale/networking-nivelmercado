-- ============================================================================
-- Networking Games · Reset (solo para proyectos de prueba)
-- ----------------------------------------------------------------------------
-- Borra todo lo que crea 0001_init.sql para empezar de cero.
-- OJO: elimina perfiles, disponibilidad y reuniones. No lo ejecutes en
-- producción ni con datos que quieras conservar.
--
-- Uso: pégalo en el SQL Editor y luego vuelve a ejecutar 0001_init.sql.
-- ============================================================================

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists profiles_set_updated_at on public.profiles;

drop function if exists public.book_availability(uuid, text);
drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at() cascade;

drop table if exists public.meetings cascade;
drop table if exists public.availability cascade;
drop table if exists public.profiles cascade;

drop type if exists public.profile_type;
