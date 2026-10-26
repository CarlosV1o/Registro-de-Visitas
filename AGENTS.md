# Attendance

Use Vite+, Vue 3, TypeScript and Supabase. Run commands from this directory.

- `npm run check` runs Oxfmt, Oxlint with the vendored anti-slop rules, and Vue type checks.
- `npm test` runs import/export tests. `npm run test:db` exercises authorization and concurrent check-ins against a disposable local PostgreSQL instance. `npm run test:e2e` checks the browser interface.
- `npm run build` produces the static GitHub Pages site.
- Keep every generic anti-slop rule enabled at error. The installed `install-anti-slop` skill describes maintenance. Preserve provenance and licenses in `tools/oxlint/anti-slop/`.
- Never put privileged Supabase keys, passwords, employee records or attendance exports in source or public assets. Only the project URL and publishable key belong in Vite variables.
- Authorization belongs in Postgres policies and functions. Hiding controls is not authorization.
- Preserve the original spreadsheet column order. Treat employee IDs as strings, including leading zeroes. Reject invalid imports before writing.
- Render imported data as text. Never use `v-html` for employee or event fields.
