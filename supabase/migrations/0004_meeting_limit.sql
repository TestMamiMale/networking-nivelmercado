-- ============================================================================
-- Networking Games · Límite de 3 reuniones por participante
-- ----------------------------------------------------------------------------
-- Ejecutar DESPUÉS de 0001–0003. Es idempotente (`create or replace`).
--
-- Regla de producto: cada persona puede tener como máximo 3 reuniones
-- (confirmadas o pendientes) durante el evento. La comprobación vive dentro de
-- `book_availability` para que sea atómica: un candado de transacción por
-- usuario serializa sus reservas y evita que dos peticiones simultáneas se
-- salten el tope.
--
-- La misma regla está en `src/lib/meetings.ts` (error amigable antes de tocar
-- la base de datos). Si cambias el número, hazlo en los tres sitios:
--   src/lib/meetings.ts · POST /api/meetings · esta migración.
-- ============================================================================

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
  v_meetings integer;
  c_max_meetings constant integer := 3;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_virtual_link is null or trim(p_virtual_link) = '' then
    raise exception 'invalid_virtual_link' using errcode = '22023';
  end if;

  -- Serializa las reservas del mismo usuario (se libera al terminar la
  -- transacción): sin esto, dos reservas simultáneas podrían contar 2 y 2 y
  -- crear la cuarta y la quinta.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select count(*)
    into v_meetings
    from public.meetings
   where participant1_id = v_user_id
      or participant2_id = v_user_id;

  if v_meetings >= c_max_meetings then
    raise exception 'meeting_limit_reached' using errcode = 'P0001';
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

comment on function public.book_availability(uuid, text) is
  'Reserva atómica de un hueco de disponibilidad, con límite de 3 reuniones por participante.';

revoke execute on function public.book_availability(uuid, text) from anon;
grant execute on function public.book_availability(uuid, text) to authenticated;
