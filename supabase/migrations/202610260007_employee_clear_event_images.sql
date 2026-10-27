begin;

-- Clear personal data atomically; event definitions and images remain available.
create function public.clear_employees() returns void
language plpgsql security definer set search_path = ''
as $$ begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Solo administradores pueden borrar empleados' using errcode = '42501';
  end if;
  -- Check-ins and roster changes lock events first. Block them before clearing.
  lock table public.events in access exclusive mode;
  lock table public.employees in share row exclusive mode;
  delete from public.attendance;
  delete from public.event_roster;
  delete from public.employees;
end $$;
revoke all on function public.clear_employees() from public, anon;
grant execute on function public.clear_employees() to authenticated;

alter table public.events add column image_path text
  check (image_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'));
grant update (image_path) on public.events to authenticated;

create or replace function public.event_info(target_event uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', id, 'title', title, 'is_open', is_open, 'image_path', image_path)
  from public.events where id = target_event;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Public delivery of event artwork; only administrators may list or modify it.
create policy event_images_read on storage.objects for select to authenticated
using (bucket_id = 'event-images' and (select public.current_role()) = 'admin');
create policy event_images_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-images' and (select public.current_role()) = 'admin'
  and exists (select 1 from public.events e where name ~ ('^' || e.id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
create policy event_images_delete on storage.objects for delete to authenticated
using (bucket_id = 'event-images' and (select public.current_role()) = 'admin');

notify pgrst, 'reload schema';
commit;
