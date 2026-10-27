#!/usr/bin/env bash
set -euo pipefail

# Use a disposable cluster; never connect this test to a real Supabase project.
pg_bin=$(pg_config --bindir)
test_cluster=$(mktemp -d)
cleanup() {
  "$pg_bin/pg_ctl" -D "$test_cluster/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$test_cluster"
}
trap cleanup EXIT
"$pg_bin/initdb" -D "$test_cluster/data" --auth=trust --no-locale >/dev/null
"$pg_bin/pg_ctl" -D "$test_cluster/data" -l "$test_cluster/server.log" -o "-k $test_cluster -p 55439 -c listen_addresses=''" -w start >/dev/null
export PGHOST="$test_cluster" PGPORT=55439 PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon;
create role authenticated;
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, delete on storage.objects to anon, authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
SQL
psql -X -v ON_ERROR_STOP=1 -q -f supabase/migrations/202610260001_attendance.sql
psql -X -v ON_ERROR_STOP=1 -q -f scripts/test-db.sql
psql -X -v ON_ERROR_STOP=1 -q -f supabase/migrations/202610260002_event_links.sql
psql -X -v ON_ERROR_STOP=1 -q -f supabase/migrations/202610260003_delete_event.sql
psql -X -v ON_ERROR_STOP=1 -q -f scripts/test-event-links.sql
psql -X -v ON_ERROR_STOP=1 -q -f supabase/migrations/202610260004_public_protection.sql
psql -X -v ON_ERROR_STOP=1 -q -f scripts/test-security.sql
psql -X -v ON_ERROR_STOP=1 -q -f supabase/migrations/202610260005_event_roster.sql
psql -X -v ON_ERROR_STOP=1 -q -f scripts/test-event-roster.sql
psql -X -v ON_ERROR_STOP=1 -q -f supabase/migrations/202610260006_manual_attendance.sql
psql -X -v ON_ERROR_STOP=1 -q -f scripts/test-manual-attendance.sql
psql -X -v ON_ERROR_STOP=1 -q -f supabase/migrations/202610260007_employee_clear_event_images.sql
psql -X -v ON_ERROR_STOP=1 -q -f scripts/test-employee-clear-images.sql

# Both callers must observe the same row, with exactly one insert winning.
for caller in 1 2; do
  psql -X -v ON_ERROR_STOP=1 -qAt >"$test_cluster/checkin-$caller" <<'SQL' &
set role anon;
set request.method = 'POST';
set request.headers = '{"x-forwarded-for":"203.0.113.200"}';
select public.register_attendance('11111111-1111-4111-8111-111111111111', '004509')->>'accepted';
SQL
done
wait
psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
do $$ begin
  if (select count(*) from public.attendance where event_id = '11111111-1111-4111-8111-111111111111') <> 1 then raise exception 'Concurrent check-ins created duplicates'; end if;
end $$;
SQL
if [[ $(cat "$test_cluster/checkin-1" "$test_cluster/checkin-2" | sort | tr '\n' ' ') != 'true true ' ]]; then
  echo 'Expected indistinguishable receipts for concurrent check-ins' >&2
  exit 1
fi
echo 'Database authorization, atomic import, event rosters, manual registration and concurrent check-ins passed.'
