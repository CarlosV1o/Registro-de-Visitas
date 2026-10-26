# Registro de asistencia

Aplicación en español con Vue 3, TypeScript, Vite+ y Supabase. La pantalla principal permite buscar un empleado y registrar su asistencia. La lista y la descarga CSV están en **Ver asistencia**; importar empleados y administrar eventos requiere una cuenta de administrador.

## Desarrollo

Requiere Node.js 24 y npm 12.2.1.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local`. Usa únicamente la clave **publishable** (`sb_publishable_…`). Nunca incluyas claves privilegiadas, contraseñas ni datos reales en el repositorio.

## Configurar Supabase

1. Ejecuta `supabase/migrations/202610260001_attendance.sql` en el editor SQL de un proyecto nuevo de Supabase.
2. En Authentication → URL Configuration, configura **Site URL** y la lista **Redirect URLs** con `https://carlosv1o.github.io/Registro-de-Visitas/` (o la dirección real donde publiques la página). El valor predeterminado localhost no sirve para las invitaciones en producción. Habilita GitHub Pages antes de usar esa dirección.
3. Crea las cuentas de los operadores en Authentication. No hay registro público en esta aplicación. Los enlaces de invitación y recuperación abren una pantalla para definir la contraseña. Si un enlace anterior ya se consumió, envía uno nuevo desde Supabase después de corregir las URLs.
4. Asigna el rol desde el editor SQL, sustituyendo el UUID por el identificador de la cuenta:

```sql
insert into private.memberships (user_id, role)
values ('UUID-DE-LA-CUENTA', 'admin');
-- Usa 'staff' para operadores que solo registran y consultan asistencia.
```

5. Inicia sesión, entra en Administración, crea un evento e importa la hoja Base como CSV UTF-8.

La base controla los permisos con políticas de Postgres. Solo la función de registro puede escribir asistencia; toma la hora y los datos del empleado desde la base. La clave única por evento y empleado evita duplicados, incluso con registros simultáneos. Cerrar un evento conserva su historial. La sesión se guarda solo en memoria y termina al recargar o cerrar la página.

## Archivos

La base de empleados conserva el orden `ID, Nombre, Tienda, Plaza, Región, Asesor, Posición`. `Activo` es una columna opcional. Los IDs son texto y conservan sus ceros iniciales; configura la columna como texto al abrir el CSV en una hoja de cálculo. Se valida todo el archivo antes de guardarlo. Los registros ausentes del archivo no se eliminan.

La exportación de asistencia conserva las columnas originales `ID_Empleado, Nombre, Tienda, Plaza, Región, Asesor, Posición, Hora_Registro`. Incluye todo el evento aunque la lista esté filtrada, con fecha ISO y zona horaria. Los campos importados se muestran como texto.

## Verificación

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run test:db
npm run build
```

Las pruebas del navegador interceptan las peticiones a un proyecto ficticio y no usan datos reales. Las pruebas de base requieren PostgreSQL instalado (`initdb`, `pg_ctl`, `psql`, `pg_config`) y un usuario sin privilegios de root; crean y eliminan un clúster temporal. Verifican permisos, importaciones atómicas y registros simultáneos.

## GitHub Pages

La acción `.github/workflows/pages.yml` valida y publica cada push a `main`.

1. Selecciona **GitHub Actions** como fuente en Settings → Pages.
2. En Settings → Secrets and variables → Actions → Variables, agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Ejecuta **Check and publish attendance** o publica un nuevo commit para reconstruir la página.

Sin esas variables se publica una pantalla que indica que falta la configuración; no permite registrar asistencia. La URL prevista es https://carlosv1o.github.io/Registro-de-Visitas/.
