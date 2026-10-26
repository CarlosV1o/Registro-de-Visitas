begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'staff'))
);

create function public.current_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from private.memberships where user_id = (select auth.uid()) $$;
revoke all on function public.current_role() from public, anon;
grant execute on function public.current_role() to authenticated;

create table public.employees (
  id text primary key check (length(btrim(id)) between 1 and 100 and id = btrim(id)),
  nombre text not null check (length(btrim(nombre)) between 1 and 300),
  tienda text not null default '' check (length(tienda) <= 300),
  plaza text not null default '' check (length(plaza) <= 300),
  region text not null default '' check (length(region) <= 300),
  asesor text not null default '' check (length(asesor) <= 300),
  posicion text not null default '' check (length(posicion) <= 300),
  active boolean not null default true
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.attendance (
  event_id uuid not null references public.events(id),
  employee_id text not null references public.employees(id),
  nombre text not null,
  checked_in_at timestamptz not null default now(),
  tienda text not null,
  plaza text not null,
  region text not null,
  asesor text not null,
  posicion text not null,
  recorded_by uuid references auth.users(id) on delete set null,
  primary key (event_id, employee_id)
);
create index attendance_recorded_by on public.attendance(recorded_by);
create index memberships_role on private.memberships(role);

alter table public.employees enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;
alter table private.memberships enable row level security;

revoke all on public.employees, public.events, public.attendance from public, anon, authenticated;
grant select on public.employees, public.events, public.attendance to authenticated;
grant insert, update on public.employees to authenticated;
grant insert (title), update (title, is_open) on public.events to authenticated;

create policy employees_read on public.employees for select to authenticated
using ((select public.current_role()) in ('admin', 'staff'));
create policy employees_insert on public.employees for insert to authenticated
with check ((select public.current_role()) = 'admin');
create policy employees_update on public.employees for update to authenticated
using ((select public.current_role()) = 'admin') with check ((select public.current_role()) = 'admin');
create policy events_read on public.events for select to authenticated
using ((select public.current_role()) in ('admin', 'staff'));
create policy events_insert on public.events for insert to authenticated
with check ((select public.current_role()) = 'admin');
create policy events_update on public.events for update to authenticated
using ((select public.current_role()) = 'admin') with check ((select public.current_role()) = 'admin');
create policy attendance_read on public.attendance for select to authenticated
using ((select public.current_role()) in ('admin', 'staff'));

-- Only this function may write attendance. Names, details and time come from trusted database rows.
create function public.check_in(target_event uuid, target_employee text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  employee public.employees%rowtype;
  entry public.attendance%rowtype;
  event_open boolean;
  inserted boolean;
begin
  if public.current_role() is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select is_open into event_open from public.events where id = target_event for share;
  if not found or not event_open then
    raise exception 'El evento está cerrado o no existe' using errcode = '22023';
  end if;

  select * into employee from public.employees where id = target_employee and active for share;
  if not found then
    raise exception 'Empleado inactivo o no encontrado' using errcode = '22023';
  end if;

  insert into public.attendance (event_id, employee_id, nombre, checked_in_at, tienda, plaza, region, asesor, posicion, recorded_by)
  values (target_event, employee.id, employee.nombre, clock_timestamp(), employee.tienda, employee.plaza, employee.region, employee.asesor, employee.posicion, auth.uid())
  on conflict (event_id, employee_id) do nothing
  returning * into entry;
  inserted := found;

  if not inserted then
    select * into entry from public.attendance where event_id = target_event and employee_id = target_employee;
  end if;

  return jsonb_build_object('created', inserted, 'record', to_jsonb(entry) - 'recorded_by');
end;
$$;
revoke all on function public.check_in(uuid, text) from public, anon;
grant execute on function public.check_in(uuid, text) to authenticated;

create function public.import_employees(records jsonb) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  affected integer;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Solo administradores pueden importar empleados' using errcode = '42501';
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

  insert into public.employees (id, nombre, tienda, plaza, region, asesor, posicion, active)
  select btrim(r->>'id'), btrim(r->>'nombre'), coalesce(r->>'tienda', ''), coalesce(r->>'plaza', ''),
    coalesce(r->>'region', ''), coalesce(r->>'asesor', ''), coalesce(r->>'posicion', ''), coalesce((r->>'active')::boolean, true)
  from jsonb_array_elements(records) r
  on conflict (id) do update set nombre = excluded.nombre, tienda = excluded.tienda, plaza = excluded.plaza,
    region = excluded.region, asesor = excluded.asesor, posicion = excluded.posicion, active = excluded.active;
  get diagnostics affected = row_count;

  return affected;
end;
$$;
revoke all on function public.import_employees(jsonb) from public, anon;
grant execute on function public.import_employees(jsonb) to authenticated;

commit;
