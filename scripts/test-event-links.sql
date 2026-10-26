-- A second event must have its own attendance, even for the same employee.
insert into public.events (id, title) values ('44444444-4444-4444-8444-444444444444', 'Second synthetic event');
set role anon;
do $$ declare receipt jsonb; begin
  if public.event_info('44444444-4444-4444-8444-444444444444')->>'title' <> 'Second synthetic event' then
    raise exception 'Link does not identify its event';
  end if;
  if public.event_info('55555555-5555-4555-8555-555555555555') is not null then
    raise exception 'Unknown event was returned';
  end if;
  begin
    perform public.delete_event('44444444-4444-4444-8444-444444444444');
    raise exception 'Anonymous event deletion was allowed';
  exception when insufficient_privilege then null; end;
  receipt := public.register_attendance('44444444-4444-4444-8444-444444444444', '004509');
  if receipt->>'created' <> 'true' or receipt ? 'record' or receipt ? 'tienda' or receipt ? 'asesor' then
    raise exception 'Public receipt is invalid or exposes employee details';
  end if;
  if public.register_attendance('44444444-4444-4444-8444-444444444444', '004509')->>'created' <> 'false' then
    raise exception 'Duplicate check-in was created';
  end if;
  begin
    perform count(*) from public.attendance;
    raise exception 'Anonymous reports are exposed';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.events;
    raise exception 'Anonymous event directory is exposed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from private.record_attendance('44444444-4444-4444-8444-444444444444', '004509');
    raise exception 'Private writer is exposed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if exists (select 1 from public.attendance) or exists (select 1 from public.employees) or exists (select 1 from public.events) then
    raise exception 'Non-admin account can access administrative data';
  end if;
  begin
    perform public.delete_event('44444444-4444-4444-8444-444444444444');
    raise exception 'Non-admin event deletion was allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.events set is_open = false where id = '44444444-4444-4444-8444-444444444444';
set role anon;
do $$ begin
  begin
    perform public.register_attendance('44444444-4444-4444-8444-444444444444', '004509');
    raise exception 'Public registration accepted a closed event';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$ begin
  if (select count(*) from public.attendance where event_id = '11111111-1111-4111-8111-111111111111') <> 0
    or (select count(*) from public.attendance where event_id = '44444444-4444-4444-8444-444444444444') <> 1 then
    raise exception 'Attendance is not isolated by event';
  end if;
  perform public.delete_event('44444444-4444-4444-8444-444444444444');
  if exists (select 1 from public.events where id = '44444444-4444-4444-8444-444444444444')
    or exists (select 1 from public.attendance where event_id = '44444444-4444-4444-8444-444444444444') then
    raise exception 'Event deletion did not remove the event and attendance';
  end if;
  if not exists (select 1 from public.events where id = '11111111-1111-4111-8111-111111111111')
    or not exists (select 1 from public.employees where id = '004509') then
    raise exception 'Event deletion removed unrelated records';
  end if;
end $$;
reset role;
