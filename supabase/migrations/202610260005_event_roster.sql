begin;

-- The scheduled employees of one event. Only import_event_roster and clear_event_roster write it.
create table public.event_roster (
  event_id uuid not null references public.events(id) on delete cascade,
  employee_id text not null references public.employees(id),
  primary key (event_id, employee_id)
);
create index event_roster_employee on public.event_roster(employee_id);
alter table public.event_roster enable row level security;
revoke all on public.event_roster from public, anon, authenticated;
grant select on public.event_roster to authenticated;
create policy event_roster_read on public.event_roster for select to authenticated
using ((select public.current_role()) = 'admin');

-- Shared validation and upsert for both import flows. Callers must authorize first.
create function private.upsert_employees(records jsonb) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  result jsonb;
begin
  if records is null or octet_length(records::text) > 10 * 1024 * 1024 then
    raise exception 'El archivo supera el límite permitido' using errcode = '22023';
  end if;
  if jsonb_typeof(records) is distinct from 'array' then
    raise exception 'Se requiere una lista de empleados' using errcode = '22023';
  end if;
  if jsonb_array_length(records) not between 1 and 10000 then
    raise exception 'Importa entre 1 y 10,000 empleados' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(records) r
    where jsonb_typeof(r) is distinct from 'object'
      or jsonb_typeof(r->'id') is distinct from 'string'
      or jsonb_typeof(r->'nombre') is distinct from 'string'
      or (r ? 'active' and jsonb_typeof(r->'active') is distinct from 'boolean')
      or exists (
        select 1 from unnest(array['tienda','plaza','region','asesor','posicion']) field
        where r ? field and jsonb_typeof(r->field) is distinct from 'string'
      )
  ) then
    raise exception 'ID, Nombre y detalles deben ser texto; Activo debe ser booleano' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(records) r group by btrim(r->>'id') having count(*) > 1) then
    raise exception 'El archivo contiene IDs duplicados' using errcode = '22023';
  end if;

  -- xmax is zero only for rows this statement inserted, which separates new employees from updates.
  with written as (
    insert into public.employees as e (id, nombre, tienda, plaza, region, asesor, posicion, active)
    select btrim(r->>'id'), btrim(r->>'nombre'), coalesce(r->>'tienda', ''), coalesce(r->>'plaza', ''),
      coalesce(r->>'region', ''), coalesce(r->>'asesor', ''), coalesce(r->>'posicion', ''), coalesce((r->>'active')::boolean, true)
    from jsonb_array_elements(records) r
    on conflict (id) do update set nombre = excluded.nombre, tienda = excluded.tienda, plaza = excluded.plaza,
      region = excluded.region, asesor = excluded.asesor, posicion = excluded.posicion, active = excluded.active
    returning e.xmax = 0 as created
  )
  select jsonb_build_object('created', count(*) filter (where created), 'updated', count(*) filter (where not created))
  into result from written;

  return result;
end;
$$;
revoke all on function private.upsert_employees(jsonb) from public, anon, authenticated;

create or replace function public.import_employees(records jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Solo administradores pueden importar empleados' using errcode = '42501';
  end if;
  result := private.upsert_employees(records);
  return (result->>'created')::integer + (result->>'updated')::integer;
end;
$$;
revoke all on function public.import_employees(jsonb) from public, anon;
grant execute on function public.import_employees(jsonb) to authenticated;

-- The file replaces the event's list. Its employees are upserted into the shared base first,
-- so new IDs are registered. Rows marked inactive update the base but are not scheduled.
create function public.import_event_roster(target_event uuid, records jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  result jsonb;
  scheduled integer;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Solo administradores pueden importar convocados' using errcode = '42501';
  end if;
  -- Serializes concurrent replacements of the same list.
  perform 1 from public.events where id = target_event for update;
  if not found then
    raise exception 'El evento no existe' using errcode = '22023';
  end if;
  result := private.upsert_employees(records);

  delete from public.event_roster where event_id = target_event;
  insert into public.event_roster (event_id, employee_id)
  select target_event, btrim(r->>'id') from jsonb_array_elements(records) r
  where coalesce((r->>'active')::boolean, true);
  get diagnostics scheduled = row_count;
  if scheduled = 0 then
    raise exception 'El archivo no tiene empleados activos para convocar' using errcode = '22023';
  end if;

  return result || jsonb_build_object('scheduled', scheduled);
end;
$$;
revoke all on function public.import_event_roster(uuid, jsonb) from public, anon;
grant execute on function public.import_event_roster(uuid, jsonb) to authenticated;

-- Without a list, the event's pending employees are the active base again.
create function public.clear_event_roster(target_event uuid) returns void
language plpgsql security definer set search_path = ''
as $$ begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Solo administradores pueden quitar convocados' using errcode = '42501';
  end if;
  perform 1 from public.events where id = target_event for update;
  if not found then
    raise exception 'El evento no existe' using errcode = '22023';
  end if;
  delete from public.event_roster where event_id = target_event;
end $$;
revoke all on function public.clear_event_roster(uuid) from public, anon;
grant execute on function public.clear_event_roster(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
