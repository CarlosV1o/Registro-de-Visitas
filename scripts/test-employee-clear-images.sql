-- Roll back the destructive test so the existing concurrent check-in suite keeps its fixtures.
begin;
set role anon;
do $$ begin
  begin
    perform public.clear_employees();
    raise exception 'Anonymous employee clear allowed';
  exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  begin
    perform public.clear_employees();
    raise exception 'Staff employee clear allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name)
      values ('event-images', '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png');
    raise exception 'Staff image upload allowed';
  exception when insufficient_privilege then null; end;
  update public.events set image_path = null;
  if found then raise exception 'Staff image update allowed'; end if;
end $$;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
insert into storage.objects (bucket_id, name)
  values ('event-images', '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png');
update public.events set image_path = '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
where id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  begin
    update public.events set image_path = 'https://example.test/image.svg'
      where id = '11111111-1111-4111-8111-111111111111';
    raise exception 'External image path allowed';
  exception when check_violation then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('event-images', 'unknown/image.png');
    raise exception 'Invalid image name allowed';
  exception when insufficient_privilege then null; end;
end $$;
set role anon;
do $$ declare info jsonb; begin
  info := public.event_info('11111111-1111-4111-8111-111111111111');
  if info->>'image_path' is null or (select count(*) from jsonb_object_keys(info)) <> 4 then
    raise exception 'Public event image missing or private data exposed';
  end if;
end $$;
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$ declare event_count bigint; begin
  select count(*) into event_count from public.events;
  perform public.clear_employees();
  if exists (select 1 from public.employees) or exists (select 1 from public.attendance)
     or exists (select 1 from public.event_roster) then
    raise exception 'Employee data remains after clearing';
  end if;
  if (select count(*) from public.events) <> event_count
    or (select image_path from public.events where id = '11111111-1111-4111-8111-111111111111') is null then
    raise exception 'Clear removed events or images';
  end if;
  perform public.clear_employees();
  perform public.import_employees('[{"id":"000001","nombre":"New synthetic employee"}]');
  if not exists (select 1 from public.employees where id = '000001') then
    raise exception 'Import after clear failed';
  end if;
end $$;
rollback;
