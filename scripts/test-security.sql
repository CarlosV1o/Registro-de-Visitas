-- All records in this file are synthetic. Never run this suite against a live project.
insert into public.employees (id, nombre, active) values ('000099', 'Inactive synthetic employee', false);
set request.method = 'POST';
set request.headers = '{"x-forwarded-for":"203.0.113.1"}';
set role anon;
do $$
declare receipt jsonb;
begin
  receipt := public.register_attendance('11111111-1111-4111-8111-111111111111', '004509');
  if receipt <> '{"accepted":true}'::jsonb then raise exception 'Receipt leaks employee details'; end if;
  if public.register_attendance('11111111-1111-4111-8111-111111111111', '004509') <> receipt
    or public.register_attendance('11111111-1111-4111-8111-111111111111', 'missing') <> receipt
    or public.register_attendance('11111111-1111-4111-8111-111111111111', '000099') <> receipt
    or public.register_attendance('11111111-1111-4111-8111-111111111111', null) <> receipt
    or public.register_attendance('11111111-1111-4111-8111-111111111111', repeat('x', 101)) <> receipt
    or public.register_attendance('55555555-5555-4555-8555-555555555555', '004509') <> receipt then
    raise exception 'Employee or event existence is exposed';
  end if;
  begin
    perform * from private.request_limits;
    raise exception 'Rate-limit records are publicly readable';
  exception when insufficient_privilege then null; end;
  begin
    perform private.consume_request_budget('forged', 60, 10000);
    raise exception 'Caller can modify rate limits';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.attendance where event_id = '11111111-1111-4111-8111-111111111111') <> 1 then
    raise exception 'Blind registration changed attendance semantics';
  end if;
end $$;

-- Invalid IDs must consume the same budget. Forging a header prefix does not reset it.
set role anon;
do $$
declare detail text;
begin
  for attempt in 1..30 loop
    perform set_config('request.headers', json_build_object('x-forwarded-for', '192.0.2.' || attempt || ', 198.51.100.77')::text, true);
    perform public.register_attendance('11111111-1111-4111-8111-111111111111', 'not-an-employee');
  end loop;
  begin
    perform public.register_attendance('11111111-1111-4111-8111-111111111111', '004509');
    raise exception 'Rate limit was bypassed';
  exception when sqlstate 'PGRST' then
    get stacked diagnostics detail = pg_exception_detail;
    if (sqlerrm::jsonb)->>'code' <> 'PT429' or (detail::jsonb)->>'status' <> '429'
      or ((detail::jsonb)->'headers'->>'Retry-After')::integer < 1 then
      raise exception 'Rate limit does not return HTTP 429 and Retry-After';
    end if;
  end;
end $$;
reset role;

-- Cycling IPv6 privacy addresses within the same /64 does not reset the budget.
set role anon;
do $$ begin
  for attempt in 1..30 loop
    perform set_config('request.headers', json_build_object('x-forwarded-for', '2001:db8:1:2::' || attempt)::text, true);
    perform public.register_attendance('11111111-1111-4111-8111-111111111111', 'unknown');
  end loop;
  begin
    perform public.register_attendance('11111111-1111-4111-8111-111111111111', 'unknown');
    raise exception 'IPv6 rotation bypassed the rate limit';
  exception when sqlstate 'PGRST' then null; end;
end $$;
reset role;

-- Missing gateway metadata fails closed. GET cannot invoke the mutating endpoint.
set role anon;
set request.headers = '{}';
do $$ begin
  begin
    perform public.register_attendance('11111111-1111-4111-8111-111111111111', '004509');
    raise exception 'Missing gateway address was accepted';
  exception when sqlstate 'PT403' then null; end;
end $$;
set request.headers = '{"x-forwarded-for":"not-an-address"}';
do $$ begin
  begin
    perform public.register_attendance('11111111-1111-4111-8111-111111111111', '004509');
    raise exception 'Invalid gateway address was accepted';
  exception when sqlstate 'PT403' then null; end;
end $$;
set request.method = 'GET';
do $$ begin
  begin
    perform public.register_attendance('11111111-1111-4111-8111-111111111111', '004509');
    raise exception 'GET caused a state change';
  exception when sqlstate 'PT405' then null; end;
end $$;
reset role;

-- The longer budget applies even when the short-window bucket is fresh.
insert into private.request_limits(source_hash, window_seconds, bucket, attempts, expires_at)
values (md5('source:' || '203.0.113.92'::inet::text), 900, floor(extract(epoch from clock_timestamp()) / 900)::bigint, 200, now() + interval '30 minutes');
set request.method = 'POST';
set request.headers = '{"x-forwarded-for":"203.0.113.92"}';
set role anon;
do $$ begin
  begin
    perform public.register_attendance('11111111-1111-4111-8111-111111111111', 'unknown');
    raise exception 'Long-window rate limit was bypassed';
  exception when sqlstate 'PGRST' then null; end;
end $$;
reset role;

-- A distributed source still cannot exceed the event budget.
insert into private.request_limits(source_hash, window_seconds, bucket, attempts, expires_at)
values (md5('event:55555555-5555-4555-8555-555555555555'), 60, floor(extract(epoch from clock_timestamp()) / 60)::bigint, 600, now() + interval '30 minutes')
on conflict (source_hash, window_seconds) do update set bucket = excluded.bucket, attempts = excluded.attempts, expires_at = excluded.expires_at;
set request.method = 'POST';
set request.headers = '{"x-forwarded-for":"203.0.113.90"}';
set role anon;
do $$ begin
  begin
    perform public.register_attendance('55555555-5555-4555-8555-555555555555', 'unknown');
    raise exception 'Event rate limit was bypassed';
  exception when sqlstate 'PGRST' then null; end;
end $$;
reset role;

-- An old bucket resets atomically, and stale source rows are pruned.
insert into private.request_limits(source_hash, window_seconds, bucket, attempts, expires_at)
values (md5('source:' || '203.0.113.91'::inet::text), 60, 0, 10000, now() - interval '1 hour');
insert into private.request_limits(source_hash, window_seconds, bucket, attempts, expires_at)
values (md5('stale-source'), 60, 0, 1, now() - interval '1 hour');
set request.headers = '{"x-forwarded-for":"203.0.113.91"}';
set role anon;
select public.register_attendance('11111111-1111-4111-8111-111111111111', 'unknown');
reset role;
do $$ begin
  if exists (select 1 from private.request_limits where source_hash = md5('stale-source'))
    or (select attempts from private.request_limits where source_hash = md5('source:' || '203.0.113.91'::inet::text) and window_seconds = 60) <> 1 then
    raise exception 'Rate-limit expiry or reset is broken';
  end if;
end $$;

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$ begin
  begin
    perform public.import_employees(jsonb_build_array(jsonb_build_object('id', '123', 'nombre', 'Valid', 'extra', repeat('x', 10 * 1024 * 1024))));
    raise exception 'Oversized import was accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- Leave the first event empty for the separate concurrent registration test.
delete from public.attendance where event_id = '11111111-1111-4111-8111-111111111111';
