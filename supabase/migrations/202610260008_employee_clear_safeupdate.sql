begin;

-- Supabase loads safeupdate for API connections. Explicit primary-key predicates
-- keep the intentional full reset compatible with that protection.
create or replace function public.clear_employees() returns void
language plpgsql security definer set search_path = ''
as $$ begin
  if public.current_role() is distinct from 'admin' then
    raise exception 'Solo administradores pueden borrar empleados' using errcode = '42501';
  end if;
  lock table public.events in access exclusive mode;
  lock table public.employees in share row exclusive mode;
  delete from public.attendance where employee_id is not null;
  delete from public.event_roster where employee_id is not null;
  delete from public.employees where id is not null;
end $$;

notify pgrst, 'reload schema';
commit;
