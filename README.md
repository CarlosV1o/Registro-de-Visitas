# Registro de asistencia

Herramienta interna en español con Vue 3, Vike, TypeScript, Vite+ y Supabase. Cada evento tiene su propio enlace público de registro y su propio informe privado de asistencia. La página principal abre el inicio de sesión de administración.

## Rutas

| URL                                | Acceso           | Función                                                        |
| ---------------------------------- | ---------------- | -------------------------------------------------------------- |
| `/`                                | Inicio de sesión | Acceso de administradores y enlaces de invitación/recuperación |
| `/admin`                           | Administrador    | Crear eventos, copiar enlaces y abrir informes                 |
| `/admin/empleados`                 | Administrador    | Importar y exportar la base de empleados                       |
| `/eventos/:id`                     | Público          | Registrar asistencia con número de empleado                    |
| `/admin/eventos/:id`               | Administrador    | Consultar y exportar la asistencia de ese evento               |
| `/admin/eventos/:id/configuracion` | Administrador    | Cambiar nombre, cerrar, reabrir o eliminar el evento           |

El identificador UUID del enlace determina el evento. Un enlace inválido muestra un error y nunca selecciona otro evento. Cada registro y exportación usa el identificador de la ruta. El enlace permanece igual cuando se cambia el nombre del evento.

El informe incluye empleados activos, asistencias, pendientes y porcentaje de la base activa registrada. Los pendientes se calculan por ID: la asistencia histórica de empleados inactivos no reduce ese número. El desglose por asesor se ordena de mayor a menor y permite filtrar la lista, incluidos los registros sin asesor. Los iconos usan Lucide (`@lucide/vue`).

La base de empleados es compartida entre eventos. La asistencia se guarda por evento con una copia de los datos del empleado al registrarse, de modo que las importaciones posteriores no cambian el historial. Un empleado puede registrarse en varios eventos, una sola vez en cada uno.

## Desarrollo

Requiere Node.js 24 y npm 12.2.1.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local`. Usa únicamente la clave publicable (`sb_publishable_…`). No incluyas claves privilegiadas, contraseñas ni datos reales en el repositorio. El navegador solo recibe las dos variables con prefijo `VITE_`.

## Configurar Supabase

1. En un proyecto nuevo, ejecuta las migraciones de `supabase/migrations/` en orden. Si ya existe la primera migración, ejecuta las migraciones posteriores en orden para habilitar las rutas públicas, limitar los informes a administradores y permitir eliminar eventos. La migración conserva los datos existentes.
2. En Authentication → URL Configuration, configura **Site URL** y **Redirect URLs** con la URL publicada, por ejemplo `https://carlosv1o.github.io/Registro-de-Visitas/`. Usa un enlace nuevo si la invitación anterior ya se consumió. La aplicación incluye la pantalla para establecer la contraseña de invitaciones y recuperación.
3. Crea las cuentas de administradores en Authentication. No hay registro público de cuentas.
4. Asigna el rol usando el UUID de cada cuenta:

```sql
insert into private.memberships (user_id, role)
values ('UUID-DE-LA-CUENTA', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

5. Inicia sesión, importa la base de empleados y crea un evento. Copia el enlace del evento para compartir su registro.

Las políticas de Postgres protegen los empleados, la administración y los informes. Las cuentas sin rol de administrador, incluidas las antiguas cuentas `staff`, no pueden leer esos datos. El acceso público solo permite consultar el título y estado de un evento por UUID, y registrar un número de empleado exacto. No ofrece búsquedas de empleados, directorio de eventos ni listas de asistencia. La respuesta pública es un recibo con nombre y hora; los demás detalles permanecen privados.

Una función privada realiza la escritura con bloqueo del evento y una clave única por evento y empleado. La hora y los datos provienen del servidor. Cerrar un evento conserva el historial y rechaza nuevos registros. Eliminarlo requiere confirmación y borra su asistencia en una transacción protegida por permisos de administrador, sin modificar otros eventos ni la base de empleados. Las sesiones administrativas se guardan en `sessionStorage`: sobreviven a la recarga de la página en la misma pestaña. Cerrar la pestaña o cerrar sesión elimina el acceso guardado.

## Archivos

La base de empleados conserva el orden `ID, Nombre, Tienda, Plaza, Región, Asesor, Posición`. `Activo` es opcional. Los IDs son texto y conservan sus ceros iniciales; configura esa columna como texto al abrir el CSV. Se valida todo el archivo antes de guardarlo. Los empleados ausentes del archivo no se eliminan.

La exportación conserva `ID_Empleado, Nombre, Tienda, Plaza, Región, Asesor, Posición, Hora_Registro`. Incluye toda la asistencia del evento de la URL, incluso con filtros activos, con fecha ISO y zona horaria. Los datos importados se muestran como texto.

## Verificación

```sh
npm run check
npm test
npx playwright install chromium
npm run test:e2e
npm run test:e2e:static
npm run test:db
npm run build
```

Las pruebas del navegador interceptan peticiones a un proyecto ficticio. Verifican registro público, autenticación de administradores, eventos separados, exportaciones, enlaces directos, configuración, invitaciones y pantallas móviles. Las pruebas estáticas también simulan el comportamiento de GitHub Pages bajo `/Registro-de-Visitas/`, incluidos los enlaces a eventos creados después de compilar.

Las pruebas de base requieren PostgreSQL (`initdb`, `pg_ctl`, `psql`, `pg_config`) y un usuario sin privilegios de root. Usan un clúster temporal para comprobar permisos, importaciones atómicas, registros simultáneos y separación por evento. No modifican el proyecto real.

## GitHub Pages

La acción `.github/workflows/pages.yml` valida y publica cada push a `main`. Selecciona **GitHub Actions** como fuente en Settings → Pages y configura las variables de Actions `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.

La compilación usa `DEPLOY_BASE=/Registro-de-Visitas/` y publica `dist/client/`. Vike genera las páginas estáticas de inicio y administración. `404.html` recupera las rutas dinámicas de eventos con el enrutador del cliente, de modo que los enlaces nuevos no requieren recompilar. GitHub Pages devuelve HTTP 404 para esa primera petición dinámica; la aplicación muestra el evento solicitado y conserva su URL. Los datos se consultan en Supabase y no se incluyen en el HTML generado.

Para otro dominio o subdirectorio, ajusta `DEPLOY_BASE` y la configuración de URLs de Supabase. Sin las variables de Supabase, la app indica que falta configuración y no permite registrar.
