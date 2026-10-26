-- All records in this file are synthetic. Never run this suite against a live project.
insert into public.events (id, title, is_open) values
  ('99999999-9999-4999-8999-999999999999', 'Synthetic manual event', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Synthetic event without roster', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Synthetic closed event', false);
insert into public.employees (id, nombre, active) values ('000500', 'Inactive manual employee', false);

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$
declare result jsonb;
begin
  perform public.import_event_roster('99999999-9999-4999-8999-999999999999', '[{"id":"004509","nombre":"Synthetic employee"}]');

  -- A new ID is registered, checked in and added to the existing list.
  result := public.register_manual_attendance('99999999-9999-4999-8999-999999999999',
    '{"id":" 000600 ","nombre":"Manual employee","tienda":"Centro","asesor":"Ana"}', true);
  if result->>'registered' <> 'true' or result->>'created' <> 'true'
    or result->'record'->>'employee_id' <> '000600' or result->'record'->>'tienda' <> 'Centro' then
    raise exception 'Manual registration returned %', result;
  end if;
  if not exists (select 1 from public.event_roster where event_id = '99999999-9999-4999-8999-999999999999' and employee_id = '000600') then
    raise exception 'Manual registration did not extend the roster';
  end if;

  -- An inactive employee is reactivated, and without schedule stays outside the list.
  result := public.register_manual_attendance('99999999-9999-4999-8999-999999999999',
    '{"id":"000500","nombre":"Returning employee"}', false);
  if result->>'registered' <> 'false' or result->>'created' <> 'true'
    or not (select active from public.employees where id = '000500')
    or exists (select 1 from public.event_roster where employee_id = '000500') then
    raise exception 'Existing employee registration is wrong: %', result;
  end if;

  if public.register_manual_attendance('99999999-9999-4999-8999-999999999999',
    '{"id":"000600","nombre":"Manual employee"}', true)->>'created' <> 'false' then
    raise exception 'Manual registration duplicated attendance';
  end if;

  -- An event without a list does not get a one-person list.
  perform public.register_manual_attendance('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"id":"000700","nombre":"Unlisted employee"}', true);
  if exists (select 1 from public.event_roster where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
    raise exception 'Manual registration created a roster';
  end if;

  -- Rejections roll back the employee as well as the attendance.
  begin
    perform public.register_manual_attendance('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '{"id":"000800","nombre":"Closed event employee"}', true);
    raise exception 'Closed event accepted a manual registration';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.register_manual_attendance('99999999-9999-4999-8999-999999999999', '{"id":"000801","nombre":""}', true);
    raise exception 'Manual registration accepted an empty name';
  exception when check_violation then null; end;
  begin
    perform public.register_manual_attendance('99999999-9999-4999-8999-999999999999', '{"id":"000802","nombre":"Inactive","active":false}', true);
    raise exception 'Manual registration accepted an inactive employee';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.register_manual_attendance('99999999-9999-4999-8999-999999999999', null, true);
    raise exception 'Manual registration accepted a missing employee';
  exception when invalid_parameter_value then null; end;
  if exists (select 1 from public.employees where id in ('000800', '000801', '000802')) then
    raise exception 'Rejected manual registration wrote an employee';
  end if;
end $$;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  begin
    perform public.register_manual_attendance('99999999-9999-4999-8999-999999999999', '{"id":"000900","nombre":"Forbidden"}', true);
    raise exception 'Non-admin manual registration was allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform public.register_manual_attendance('99999999-9999-4999-8999-999999999999', '{"id":"000900","nombre":"Forbidden"}', true);
    raise exception 'Anonymous manual registration was allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$ begin
  perform public.delete_event('99999999-9999-4999-8999-999999999999');
  perform public.delete_event('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  perform public.delete_event('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
end $$;
reset role;
