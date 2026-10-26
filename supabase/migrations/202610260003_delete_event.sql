begin;

-- Event deletion is atomic and requires an administrator. The event lock also
-- serializes deletion with check-ins, so no attendance can be added mid-delete.
create function public.delete_event(target_event uuid) returns void
language plpgsql security definer set search_path = ''
as $$ begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Solo administradores pueden eliminar eventos' using errcode = '42501';
  end if;
  perform 1 from public.events where id = target_event for update;
  if not found then
    raise exception 'El evento no existe' using errcode = '22023';
  end if;
  delete from public.attendance where event_id = target_event;
  delete from public.events where id = target_event;
end $$;
revoke all on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
