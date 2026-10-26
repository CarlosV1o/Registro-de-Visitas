begin;

-- A fixed-window counter per source and time window. No employee IDs or raw addresses are stored.
create table private.request_limits (
  source_hash text not null,
  window_seconds integer not null,
  bucket bigint not null,
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null,
  primary key (source_hash, window_seconds)
);
create index request_limits_expiry on private.request_limits(expires_at);
alter table private.request_limits enable row level security;
revoke all on private.request_limits from public, anon, authenticated;

create function private.consume_request_budget(source_key text, window_size integer, max_requests integer) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  current_bucket bigint := floor(extract(epoch from clock_timestamp()) / window_size)::bigint;
  request_count integer;
  retry_seconds integer;
begin
  insert into private.request_limits as limits (source_hash, window_seconds, bucket, attempts, expires_at)
  values (md5(source_key), window_size, current_bucket, 1, clock_timestamp() + interval '30 minutes')
  on conflict (source_hash, window_seconds) do update
    set bucket = excluded.bucket,
        attempts = case when limits.bucket = excluded.bucket then limits.attempts + 1 else 1 end,
        expires_at = excluded.expires_at
  returning attempts into request_count;
  if request_count > max_requests then
    retry_seconds := greatest(1, ceil((current_bucket + 1) * window_size - extract(epoch from clock_timestamp()))::integer);
    -- Structured PostgREST errors preserve headers even though the transaction rolls back.
    raise sqlstate 'PGRST'
      using message = json_build_object('code', 'PT429', 'message', 'Demasiadas solicitudes. Intenta más tarde.', 'details', null, 'hint', null)::text,
            detail = json_build_object('status', 429, 'headers', json_build_object('Retry-After', retry_seconds::text))::text;
  end if;
end;
$$;
revoke all on function private.consume_request_budget(text, integer, integer) from public, anon, authenticated;

create function private.limit_registration(target_event uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  forwarded text[];
  source_ip inet;
begin
  if current_setting('request.method', true) is distinct from 'POST' then
    raise sqlstate 'PT405' using message = 'Método no permitido';
  end if;

  -- Require a trusted gateway that appends the actual peer address. A caller-controlled
  -- prefix must not let callers select a new rate-limit key on every request.
  forwarded := string_to_array(headers->>'x-forwarded-for', ',');
  begin
    source_ip := btrim(forwarded[array_length(forwarded, 1)])::inet;
  exception when invalid_text_representation then source_ip := null;
  end;
  if source_ip is null then
    raise sqlstate 'PT403' using message = 'No se pudo verificar la solicitud';
  end if;
  if family(source_ip) = 6 then source_ip := network(set_masklen(source_ip, 64)); end if;

  perform private.consume_request_budget('source:' || source_ip::text, 60, 30);
  perform private.consume_request_budget('source:' || source_ip::text, 900, 200);
  -- A second budget limits one event even if sources are distributed or a proxy is misconfigured.
  perform private.consume_request_budget('event:' || coalesce(target_event::text, 'invalid'), 60, 600);
  delete from private.request_limits
  where (source_hash, window_seconds) in (
    select source_hash, window_seconds from private.request_limits
    where expires_at < clock_timestamp()
    order by expires_at for update skip locked limit 100
  );
end;
$$;
revoke all on function private.limit_registration(uuid) from public, anon, authenticated;

create or replace function public.register_attendance(target_event uuid, target_employee text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.limit_registration(target_event);

  -- The limiter is outside this subtransaction, so invalid IDs still consume the budget.
  -- Existing, inactive, missing and duplicate employees all get the exact same receipt.
  begin
    perform private.record_attendance(target_event, target_employee);
  exception when invalid_parameter_value then
    null;
  end;
  return '{"accepted":true}'::jsonb;
end;
$$;
revoke all on function public.register_attendance(uuid, text) from public;
grant execute on function public.register_attendance(uuid, text) to anon, authenticated;

create or replace function public.import_employees(records jsonb) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  affected integer;
begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Solo administradores pueden importar empleados' using errcode = '42501';
  end if;
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

-- Future private functions must never acquire PostgreSQL's default PUBLIC execute privilege.
alter default privileges in schema private revoke execute on functions from public;

notify pgrst, 'reload schema';
commit;
