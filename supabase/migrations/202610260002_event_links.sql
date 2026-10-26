begin;

-- Reports, employee data and event management are administrator-only.
drop policy employees_read on public.employees;
create policy employees_read on public.employees for select to authenticated
using ((select public.current_role()) = 'admin');
drop policy events_read on public.events;
create policy events_read on public.events for select to authenticated
using ((select public.current_role()) = 'admin');
drop policy attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated
using ((select public.current_role()) = 'admin');

-- The shared writer is private. Public and admin entrypoints return different data.
create function private.record_attendance(target_event uuid, target_employee text) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  employee public.employees%rowtype;
  entry public.attendance%rowtype;
  event_open boolean;
  inserted boolean;
begin
  if target_employee is null or length(btrim(target_employee)) not between 1 and 100 then
    raise exception 'Número de empleado inválido' using errcode = '22023';
  end if;
  select is_open into event_open from public.events where id = target_event for share;
  if not found or not event_open then
    raise exception 'El evento está cerrado o no existe' using errcode = '22023';
  end if;
  select * into employee from public.employees where id = btrim(target_employee) and active for share;
  if not found then
    raise exception 'Empleado inactivo o no encontrado' using errcode = '22023';
  end if;
  insert into public.attendance (event_id, employee_id, nombre, checked_in_at, tienda, plaza, region, asesor, posicion, recorded_by)
  values (target_event, employee.id, employee.nombre, clock_timestamp(), employee.tienda, employee.plaza, employee.region, employee.asesor, employee.posicion, auth.uid())
  on conflict (event_id, employee_id) do nothing returning * into entry;
  inserted := found;
  if not inserted then
    select * into entry from public.attendance where event_id = target_event and employee_id = employee.id;
  end if;
  return jsonb_build_object('created', inserted, 'record', to_jsonb(entry) - 'recorded_by');
end;
$$;
revoke all on function private.record_attendance(uuid, text) from public, anon, authenticated;

create or replace function public.check_in(target_event uuid, target_employee text) returns jsonb
language plpgsql security definer set search_path = ''
as $$ begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Solo administradores' using errcode = '42501';
  end if;
  return private.record_attendance(target_event, target_employee);
end $$;

-- A link reveals only its own event's title and whether registration is open.
create function public.event_info(target_event uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', id, 'title', title, 'is_open', is_open)
  from public.events where id = target_event;
$$;
revoke all on function public.event_info(uuid) from public;
grant execute on function public.event_info(uuid) to anon, authenticated;

-- No public employee search or attendance listing. Registration returns only a receipt.
create function public.register_attendance(target_event uuid, target_employee text) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare result jsonb;
begin
  result := private.record_attendance(target_event, target_employee);
  return jsonb_build_object(
    'created', result->'created',
    'nombre', result->'record'->'nombre',
    'checked_in_at', result->'record'->'checked_in_at'
  );
end $$;
revoke all on function public.register_attendance(uuid, text) from public;
grant execute on function public.register_attendance(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
