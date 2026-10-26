# Seguridad y despliegue

## Activar las protecciones

Aplica todas las migraciones, incluida `supabase/migrations/202610260004_public_protection.sql`, antes de publicar este frontend. Las protecciones de Postgres no se activan solo al compilar o publicar el sitio. Esta sesión prueba una base temporal; no configura un proyecto Supabase remoto.

El limitador usa la última dirección de `X-Forwarded-For`. El gateway de confianza debe agregar la dirección real del cliente al final, o reemplazar el encabezado completo. Verifica esta condición en staging, especialmente si hay proxies adicionales. No expongas PostgREST directamente detrás de un proxy que conserve encabezados arbitrarios sin agregar una dirección confiable. Las solicitudes sin dirección válida se rechazan. La convención de encabezados depende del despliegue: no presupongas que cualquier proxy agrega los mismos saltos.

En Supabase → Authentication:

- Desactiva nuevas inscripciones y usuarios anónimos. Las cuentas administrativas se crean por invitación.
- Configura al menos 12 caracteres de contraseña, conserva la rotación de refresh tokens y los límites de autenticación. Los mensajes de la aplicación no distinguen entre una cuenta inexistente y credenciales incorrectas.
- Mantén las URL de redirección limitadas a los dominios y rutas que controlas. No uses comodines abiertos.

Estos ajustes pertenecen al proyecto remoto y no pueden imponerse desde una aplicación estática. Consulta las guías oficiales de [límites de Auth](https://supabase.com/docs/guides/auth/rate-limits) y [seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security).

## Controles implementados

- `register_attendance` responde exactamente `{"accepted":true}` para IDs activos, inactivos, inexistentes y repetidos. Tampoco devuelve nombres, fechas ni el estado de creación. Los detalles se conservan en los informes administrativos.
- El registro solo acepta POST. Los intentos inválidos también consumen cuota. Los límites se aplican dentro de la función de Postgres, incluso cuando el cliente evita la interfaz.
- Presupuestos atómicos por origen: 30 solicitudes por minuto y 200 por 15 minutos. IPv6 se agrupa por /64. Otro presupuesto permite hasta 600 solicitudes por evento y minuto. Son ventanas fijas; los límites pueden permitir ráfagas alrededor de un cambio de ventana. Los usuarios de una misma red comparten cuota.
- El exceso devuelve HTTP 429 con `Retry-After`. Los contadores permanecen en el esquema privado y guardan hashes, no IDs de empleados ni direcciones IP en texto. La limpieza es acotada y evita bloquear filas usadas por otras solicitudes.
- Los informes y empleados siguen protegidos por permisos y RLS. Los clientes anónimos no pueden listar empleados, eventos ni asistencias, escribir asistencias directamente, modificar límites ni ejecutar el escritor privado.
- Las importaciones se validan completas y admiten un máximo de 10 MB de JSON y 10,000 empleados en el servidor. El CSV también se valida antes de enviar.
- Los datos importados se renderizan como texto. Las exportaciones CSV neutralizan fórmulas y Excel escribe los campos de empleados como texto.
- El CSP de producción permite scripts locales y conexiones al origen HTTPS concreto de Supabase. No permite objetos, iframes ni cambios de base URL. Los estilos inline se mantienen por los componentes Reka. La política de referrer evita transmitir la URL a otros sitios.
- Si la aplicación se abre dentro de un iframe, el layout no monta formularios ni controles administrativos. En hosting que admita encabezados HTTP, agrega también `Content-Security-Policy: frame-ancestors 'none'` y `X-Content-Type-Options: nosniff`. GitHub Pages no permite definir esos encabezados y `frame-ancestors` no funciona en una etiqueta meta.
- El frontend no instala el CLI shadcn-vue y sus dependencias de transformación. Los componentes y CSS con licencia MIT están en `src/components/ui`.

## Cotejo de identificación en sitio

El modo en sitio usa una sesión con rol `admin`. Una sola acción registra el ingreso y muestra el nombre completo, ID y hora para el cotejo físico. La escritura y su respuesta están protegidas por `check_in`. No se conceden permisos nuevos a los roles anónimo o `staff`. Sin sesión administrativa, el formulario conserva la respuesta pública genérica.

## Alcance

Un recibo genérico no prueba la identidad de la persona. El registro público sigue basado en un ID: alguien que conozca un ID válido podría registrar esa asistencia. Los límites reducen automatización y abuso; no sustituyen identificación individual o una verificación de presencia. Las respuestas uniformes tampoco prometen tiempo de ejecución constante ni protección completa frente a ataques distribuidos o de denegación de servicio.

## Verificación

`npm run test:db` usa un clúster desechable para comprobar permisos, respuestas indistinguibles, cuotas atómicas, direcciones falsas, rotación IPv6, métodos, importaciones y registros concurrentes. No usa empleados reales ni se conecta al proyecto remoto.

`npm test`, `npm run check` y `npm run test:e2e:static` comprueban el contrato público, la política CSP, el navegador, las exportaciones y los flujos administrativos. `npm audit` comprueba las dependencias instaladas.
