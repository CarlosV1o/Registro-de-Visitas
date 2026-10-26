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

# Both callers must observe the same row, with exactly one insert winning.
for caller in 1 2; do
  psql -X -v ON_ERROR_STOP=1 -qAt >"$test_cluster/checkin-$caller" <<'SQL' &
set role anon;
select public.register_attendance('11111111-1111-4111-8111-111111111111', '004509')->>'created';
SQL
done
wait
psql -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
do $$ begin
  if (select count(*) from public.attendance where event_id = '11111111-1111-4111-8111-111111111111') <> 1 then raise exception 'Concurrent check-ins created duplicates'; end if;
end $$;
SQL
if [[ $(cat "$test_cluster/checkin-1" "$test_cluster/checkin-2" | sort | tr '\n' ' ') != 'false true ' ]]; then
  echo 'Expected one new check-in and one duplicate response' >&2
  exit 1
fi
echo 'Database authorization, atomic import and concurrent check-ins passed.'
