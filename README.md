# Registro de asistencia

Herramienta interna en español con Vue 3, Vike, TypeScript, Vite+ y Supabase. Cada evento tiene su propio enlace público de registro y su propio informe privado de asistencia. La página principal abre el inicio de sesión de administración.

## Rutas

| URL                                | Acceso           | Función                                                        |
| ---------------------------------- | ---------------- | -------------------------------------------------------------- |
| `/`                                | Inicio de sesión | Acceso de administradores y enlaces de invitación/recuperación |
| `/admin`                           | Administrador    | Crear eventos, copiar enlaces y abrir informes                 |
| `/admin/empleados`                 | Administrador    | Buscar, filtrar, importar y exportar empleados                 |
| `/eventos/:id`                     | Público          | Registrar asistencia con número de empleado                    |
| `/admin/eventos/:id`               | Administrador    | Consultar, exportar, registrar a mano y subir convocados       |
| `/admin/eventos/:id/configuracion` | Administrador    | Cambiar nombre, cerrar, reabrir o eliminar el evento           |

El identificador UUID del enlace determina el evento. Un enlace inválido muestra un error y nunca selecciona otro evento. Cada registro y exportación usa el identificador de la ruta. El enlace permanece igual cuando se cambia el nombre del evento.

El informe incluye empleados activos, asistencias, pendientes y porcentaje de la base activa registrada. Los pendientes se calculan por ID: la asistencia histórica de empleados inactivos no reduce ese número. El desglose por asesor se ordena de mayor a menor y permite filtrar la lista, incluidos los registros sin asesor. Los controles usan shadcn-vue con el preset `axPhMWG` (Reka Luma, mauve, Inter) y Lucide (`@lucide/vue`). El layout administrativo conserva la navegación y la sesión entre páginas.

En Empleados, «Borrar todos los empleados» pide confirmación y borra la base completa, todas las asistencias y las listas de convocados, incluidos los datos ocultos por filtros. Conserva los eventos y sus imágenes. Exporta antes los datos que necesites; la operación no se puede deshacer y solo la puede ejecutar un administrador.

En Configuración de cada evento, «Subir imagen» permite agregar, reemplazar o quitar una imagen JPG, PNG o WebP de hasta 5 MB. La imagen aparece en su registro público y en su informe administrativo. Se almacena en el bucket público `event-images`; solo administradores pueden subirla o eliminarla. Ejecuta las migraciones `202610260007_employee_clear_event_images.sql` y `202610260008_employee_clear_safeupdate.sql` para habilitar ambas funciones con la protección de borrado de Supabase.

La base de empleados es compartida entre eventos. La asistencia se guarda por evento con una copia de los datos del empleado al registrarse, de modo que las importaciones posteriores no cambian el historial. Un empleado puede registrarse en varios eventos, una sola vez en cada uno.

Cada evento puede tener su lista de convocados. Desde el encabezado del evento («Subir convocados») o la tarjeta de convocados, el administrador sube un CSV con el mismo formato que la base de empleados. Los IDs nuevos se registran en la base y los existentes se actualizan, igual que en la importación general. El archivo reemplaza la lista anterior del evento; las filas con `Activo` en «no» se actualizan pero no se convocan. Con lista, los pendientes y el porcentaje se calculan contra los convocados, y quien se registre sin estar en ella se acepta y aparece como «No convocado» en su propia pestaña y en la columna `Estado` de las exportaciones. Sin lista, o después de quitarla, los pendientes vuelven a calcularse con la base activa. La función `import_event_roster` valida todo el archivo y escribe la base y la lista en una sola transacción. El registro público no cambia: sigue devolviendo el mismo recibo genérico.

«Registro manual», en la lista de asistencia, registra a quien no está en la base o en la lista. El número y el nombre sugieren empleados existentes y, al elegir uno, se llenan sus datos. Tienda, plaza, región, asesor y posición sugieren los valores ya guardados, pero aceptan texto nuevo; elegir una tienda conocida completa la plaza, la región y el asesor más frecuentes si están vacíos. La función `register_manual_attendance` actualiza o crea al empleado (reactivándolo si estaba inactivo), opcionalmente lo agrega a la lista existente y registra la asistencia con la hora del servidor, todo en una transacción. El evento debe estar abierto.

## Desarrollo

Requiere Node.js 24 y npm 12.2.1.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local`. Usa únicamente la clave publicable (`sb_publishable_…`). No incluyas claves privilegiadas, contraseñas ni datos reales en el repositorio. El navegador solo recibe las dos variables con prefijo `VITE_`.

## Configurar Supabase

1. En un proyecto nuevo, ejecuta las migraciones de `supabase/migrations/` en orden. Si ya existe la primera migración, ejecuta las migraciones posteriores en orden para habilitar las rutas públicas, limitar los informes a administradores, permitir eliminar eventos y agregar las listas de convocados. La migración conserva los datos existentes.
2. En Authentication → URL Configuration, configura **Site URL** y **Redirect URLs** con la URL publicada, por ejemplo `https://carlosv1o.github.io/Registro-de-Visitas/`. Usa un enlace nuevo si la invitación anterior ya se consumió. La aplicación incluye la pantalla para establecer la contraseña de invitaciones y recuperación.
3. Crea las cuentas de administradores en Authentication. No hay registro público de cuentas.
4. Asigna el rol usando el UUID de cada cuenta:

```sql
insert into private.memberships (user_id, role)
values ('UUID-DE-LA-CUENTA', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

5. Inicia sesión, importa la base de empleados y crea un evento. Copia el enlace del evento para compartir su registro.

Las políticas de Postgres protegen los empleados, la administración y los informes. Las cuentas sin rol de administrador, incluidas las antiguas cuentas `staff`, no pueden leer esos datos. El acceso público solo permite consultar el título y estado de un evento por UUID, y registrar un número de empleado exacto. No ofrece búsquedas de empleados, directorio de eventos ni listas de asistencia. La respuesta pública es siempre un recibo genérico: no revela nombres, horarios, existencia del ID ni registros previos. El organizador confirma el resultado desde su informe privado. La migración `202610260004_public_protection.sql` agrega límites de solicitudes e importaciones; consulta [SECURITY.md](SECURITY.md) antes de desplegar.

Una función privada realiza la escritura con bloqueo del evento y una clave única por evento y empleado. La hora y los datos provienen del servidor. Cerrar un evento conserva el historial y rechaza nuevos registros. Eliminarlo requiere confirmación y borra su asistencia en una transacción protegida por permisos de administrador, sin modificar otros eventos ni la base de empleados. Las sesiones administrativas se guardan en `sessionStorage`: sobreviven a la recarga de la página en la misma pestaña. Cerrar la pestaña o cerrar sesión elimina el acceso guardado.

## Archivos

La base de empleados conserva el orden `ID, Nombre, Tienda, Plaza, Región, Asesor, Posición`. `Activo` es opcional. Los IDs son texto y conservan sus ceros iniciales; configura esa columna como texto al abrir el CSV. Se valida todo el archivo antes de guardarlo. Los empleados ausentes del archivo no se eliminan.

La exportación conserva `ID_Empleado, Nombre, Tienda, Plaza, Región, Asesor, Posición, Hora_Registro`. Incluye toda la asistencia del evento de la URL, incluso con filtros activos, con fecha ISO y zona horaria. Los datos importados se muestran como texto.

La vista permite consultar asistencias, pendientes o ambos, buscar en todas las columnas y filtrar por asesor, región y plaza. Incluye orden y paginación. «Más opciones de reporte» permite descargar el CSV completo, el CSV de la vista filtrada o imprimir todos los resultados filtrados (no solo la página actual).

«Exportar Excel» genera un archivo `.xlsx` con cinco hojas: Resumen, Vista filtrada, Asistencia completa, Pendientes y Por asesor. Los IDs y los campos de empleados se escriben como texto. Hora_Registro conserva la fecha ISO y su zona horaria; la interfaz muestra la hora local. La exportación Excel usa la última actualización correcta que muestra la pantalla. Los pendientes y la cobertura por asesor se calculan con la base activa actual; las asistencias conservan los datos al registrarse.

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

## Registro en sitio

El administrador inicia sesión, abre el informe del evento y selecciona **Abrir registro**. En esa misma pestaña, el formulario reconoce la sesión administrativa y habilita el registro en sitio.

Escribe el número y pulsa **Registrar ingreso** una sola vez (o Enter). La asistencia se guarda y aparece **Bienvenido [nombre completo]**, junto con el número y la hora para cotejar la identificación física. El campo queda vacío y enfocado para el siguiente empleado. No hay un paso adicional de verificación ni botones de continuar. Los ingresos repetidos se informan sin duplicarlos.

El nombre y la confirmación del ingreso se obtienen con los permisos administrativos existentes en Postgres. El enlace abierto sin sesión mantiene el recibo público genérico. El informe mantiene los totales visibles arriba. La pestaña Ranking por asesor muestra el ranking; al seleccionar un asesor se abre la pestaña Asistencia con su lista filtrada.
