insert into auth.users values
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');
insert into private.memberships values
  ('22222222-2222-4222-8222-222222222222', 'staff'),
  ('33333333-3333-4333-8333-333333333333', 'admin');
insert into public.events (id, title) values ('11111111-1111-4111-8111-111111111111', 'Synthetic test event');

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select public.import_employees('[{"id":"004509","nombre":"Synthetic employee"}]');
-- A later invalid row must roll back the whole import.
do $$ begin
  begin
    perform public.import_employees('[{"id":"004509","nombre":"Must roll back"},{"id":"bad","nombre":""}]');
    raise exception 'Invalid import accepted';
  exception when check_violation then null;
  end;
  if (select nombre from public.employees where id = '004509') <> 'Synthetic employee' then
    raise exception 'Partial import was saved';
  end if;
end $$;

set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if (select count(*) from public.employees) <> 1 then raise exception 'Staff cannot read employees'; end if;
  begin
    perform public.import_employees('[{"id":"002","nombre":"Forbidden"}]');
    raise exception 'Staff imported employees';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.attendance (event_id, employee_id, nombre, tienda, plaza, region, asesor, posicion)
    values ('11111111-1111-4111-8111-111111111111', '004509', 'Forged', '', '', '', '', '');
    raise exception 'Direct attendance write allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

set request.jwt.claim.sub = '';
do $$ begin
  if (select count(*) from public.employees) <> 0 then raise exception 'Unassigned account can read employees'; end if;
  begin
    perform public.check_in('11111111-1111-4111-8111-111111111111', '004509');
    raise exception 'Unassigned account checked in';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.events set is_open = false;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  begin
    perform public.check_in('11111111-1111-4111-8111-111111111111', '004509');
    raise exception 'Closed event accepted check-in';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
update public.events set is_open = true;
set role anon;
do $$ begin
  begin
    perform count(*) from public.employees;
    raise exception 'Anonymous employee read allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
