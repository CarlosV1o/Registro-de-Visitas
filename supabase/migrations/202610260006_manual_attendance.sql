begin;

-- Lets an administrator record someone missing from the base or the event's list. The employee
-- is upserted like a one-row import, then checked in through the shared writer, in one transaction.
create function public.register_manual_attendance(target_event uuid, employee jsonb, schedule boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  written jsonb;
  result jsonb;
  event_open boolean;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Solo administradores pueden registrar manualmente' using errcode = '42501';
  end if;
  -- Lock the event before any employee row, the same order as import_event_roster, to avoid deadlocks.
  select is_open into event_open from public.events where id = target_event for share;
  if not found or not event_open then
    raise exception 'El evento está cerrado o no existe' using errcode = '22023';
  end if;
  written := private.upsert_employees(jsonb_build_array(employee));

  -- Only extend an existing list; adding to an event without one would create a one-person list.
  if schedule and exists (select 1 from public.event_roster where event_id = target_event) then
    insert into public.event_roster (event_id, employee_id)
    values (target_event, btrim(employee->>'id'))
    on conflict do nothing;
  end if;

  result := private.record_attendance(target_event, employee->>'id');
  return result || jsonb_build_object('registered', (written->>'created')::integer = 1);
end;
$$;
revoke all on function public.register_manual_attendance(uuid, jsonb, boolean) from public, anon;
grant execute on function public.register_manual_attendance(uuid, jsonb, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
