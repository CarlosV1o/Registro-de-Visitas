-- All records in this file are synthetic. Never run this suite against a live project.
insert into public.events (id, title) values
  ('77777777-7777-4777-8777-777777777777', 'Synthetic scheduled event'),
  ('88888888-8888-4888-8888-888888888888', 'Synthetic unscheduled event');

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$
declare result jsonb;
begin
  -- The general import keeps its integer response after the shared upsert refactor.
  if public.import_employees('[{"id":"000100","nombre":"Base employee"}]') <> 1 then
    raise exception 'Employee import count changed';
  end if;

  -- New IDs are registered, existing IDs are updated, and only active rows are scheduled.
  result := public.import_event_roster('77777777-7777-4777-8777-777777777777',
    '[{"id":"004509","nombre":"Synthetic employee","tienda":"Centro"},{"id":"000200","nombre":"New scheduled employee"},{"id":"000099","nombre":"Inactive synthetic employee","active":false}]');
  if result <> '{"created":1,"updated":2,"scheduled":2}'::jsonb then
    raise exception 'Unexpected roster import result: %', result;
  end if;
  if (select tienda from public.employees where id = '004509') <> 'Centro'
    or not exists (select 1 from public.employees where id = '000200' and active) then
    raise exception 'Roster import did not upsert the employee base';
  end if;
  if (select array_agg(employee_id order by employee_id) from public.event_roster where event_id = '77777777-7777-4777-8777-777777777777') <> array['000200', '004509'] then
    raise exception 'Roster does not match the active rows of the file';
  end if;

  -- An invalid row rolls back the base and the previous list stays intact.
  begin
    perform public.import_event_roster('77777777-7777-4777-8777-777777777777', '[{"id":"000300","nombre":"Must roll back"},{"id":"bad","nombre":""}]');
    raise exception 'Invalid roster accepted';
  exception when check_violation then null; end;
  begin
    perform public.import_event_roster('77777777-7777-4777-8777-777777777777', '[{"id":"000099","nombre":"Inactive","active":false}]');
    raise exception 'Roster without active employees accepted';
  exception when invalid_parameter_value then null; end;
  if exists (select 1 from public.employees where id = '000300')
    or (select count(*) from public.event_roster where event_id = '77777777-7777-4777-8777-777777777777') <> 2 then
    raise exception 'Rejected roster import changed data';
  end if;
  begin
    perform public.import_event_roster('55555555-5555-4555-8555-555555555555', '[{"id":"004509","nombre":"Synthetic employee"}]');
    raise exception 'Roster accepted for a missing event';
  exception when invalid_parameter_value then null; end;

  -- A new file replaces the list, and other events keep theirs.
  perform public.import_event_roster('88888888-8888-4888-8888-888888888888', '[{"id":"000100","nombre":"Base employee"}]');
  perform public.import_event_roster('77777777-7777-4777-8777-777777777777', '[{"id":"000200","nombre":"New scheduled employee"}]');
  if (select array_agg(employee_id) from public.event_roster where event_id = '77777777-7777-4777-8777-777777777777') <> array['000200']
    or (select array_agg(employee_id) from public.event_roster where event_id = '88888888-8888-4888-8888-888888888888') <> array['000100'] then
    raise exception 'Roster replacement is not isolated by event';
  end if;

  -- Employees outside the list can still check in; reports flag them.
  if (public.check_in('77777777-7777-4777-8777-777777777777', '004509')->>'created')::boolean is not true then
    raise exception 'Unscheduled employee could not check in';
  end if;

  perform public.clear_event_roster('88888888-8888-4888-8888-888888888888');
  if exists (select 1 from public.event_roster where event_id = '88888888-8888-4888-8888-888888888888') then
    raise exception 'Roster was not cleared';
  end if;
end $$;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if exists (select 1 from public.event_roster) then
    raise exception 'Non-admin account can read rosters';
  end if;
  begin
    perform public.import_event_roster('77777777-7777-4777-8777-777777777777', '[{"id":"000400","nombre":"Forbidden"}]');
    raise exception 'Non-admin roster import was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.clear_event_roster('77777777-7777-4777-8777-777777777777');
    raise exception 'Non-admin roster removal was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.event_roster values ('77777777-7777-4777-8777-777777777777', '004509');
    raise exception 'Direct roster write allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.import_employees('[{"id":"000400","nombre":"Forbidden"}]');
    raise exception 'Non-admin employee import was allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role anon;
do $$ begin
  begin
    perform count(*) from public.event_roster;
    raise exception 'Anonymous roster read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.import_event_roster('77777777-7777-4777-8777-777777777777', '[{"id":"000400","nombre":"Forbidden"}]');
    raise exception 'Anonymous roster import was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform private.upsert_employees('[{"id":"000400","nombre":"Forbidden"}]');
    raise exception 'Private upsert is exposed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$ begin
  perform public.delete_event('77777777-7777-4777-8777-777777777777');
  perform public.delete_event('88888888-8888-4888-8888-888888888888');
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.event_roster) then
    raise exception 'Event deletion left its roster behind';
  end if;
end $$;
