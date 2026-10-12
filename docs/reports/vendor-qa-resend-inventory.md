# QA de vendedores, correo e inventario

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

Fecha: 2026-09-05. Entorno local conectado a la infraestructura configurada.

## Alcance

Revisar con las cuentas autorizadas el recorrido comprador → solicitud → revisión
del operador → vendedor; integrar Resend y proteger el inventario contra
escrituras simultáneas. No se desactiva la verificación de correo para facilitar
la prueba ni se ejecuta el runner HTTP que crea/elimina bases de datos.

## Evidencia y dependencias externas

- Login del comprador: autenticación nativa y lectura de su perfil correctas;
  acceso al formulario de solicitud y a sus direcciones existentes.
- Login del administrador: autenticación nativa, lectura de usuario y lista real
  de solicitudes correctas. Una interrupción del API expuso la clasificación
  incorrecta de errores de conexión como sesión vencida.
- Resend: clave válida, sin dominios configurados. El envío al comprador fue
  rechazado con HTTP 403: el remitente `onboarding@resend.dev` solo permite el
  destinatario propietario de esa cuenta de Resend. No se confirmó entrega al
  comprador ni se completó su verificación por otro medio.
- Falta seleccionar un dominio propio, verificar los registros DNS indicados
  por Resend y configurar `RESEND_FROM_EMAIL` con una dirección de ese dominio.
  La clave y las contraseñas no forman parte de este informe ni de Git.
- Un correo de conexión enviado directamente con el SDK de Resend al administrador
  autorizado fue aceptado y alcanzó `delivered` (ID
  `c2109780-a654-4c07-81b5-25f1adde57f9`). Esta prueba confirma la conexión y
  entrega al destinatario permitido, no el recorrido completo de una notificación
  desde Medusa. No se cambió ninguna contraseña.
- Al reanudar a las 06:54 UTC, el proveedor Redis anterior rechazó conexiones con
  `ERR max requests limit exceeded`, límite 500000, uso 500002. El intento de
  arranque del API se detuvo para no mantener reintentos. Los tres servidores
  frontend permanecieron abiertos; el API quedó detenido. No se borraron colas,
  cambiaron credenciales ni contrataron planes. Es necesario recuperar capacidad
  en la instancia existente antes de continuar con workflows y correo.

## Cambios verificados

- Proveedor Resend del módulo Notification: seis plantillas de autenticación y
  estados de solicitud, configuración validada, canal email real, claves de
  idempotencia y comprobación del estado persistido de entrega. Los errores del
  proveedor no se convierten en una confirmación de envío. Ver sus límites y
  recuperación de notificaciones pendientes en
  [la documentación del proveedor](../../packages/api/src/modules/resend/README.md).
- Auth de admin, comprador y vendor: solo una denegación explícita de acceso
  invalida la lectura de sesión. Las caídas del servicio se propagan a boundaries
  de error shadcn, sin borrar cookies ni etiquetarse como credenciales inválidas.
  Se observó en navegador el panel de error del administrador conservando
  `/dashboard/vendor-applications` durante una caída. La recuperación posterior
  con el servicio disponible tiene cobertura automatizada, pero quedó pendiente
  de repetir en navegador por la cuota de Redis.
- Inventario: comparación del total esperado y escritura nativa dentro de la
  misma transacción, bloqueo de filas compartido con reservas y ajustes de Medusa,
  validación backend y aislamiento por vendedor. No se añadieron tablas ni
  migraciones. La extensión está fijada a Medusa 2.18.0 y requiere revisión al
  actualizar sus clases internas.
- Se corrigieron dos problemas detectados en el arranque real de la extensión:
  los archivos de descubrimiento de Medusa no pueden llamarse `index.ts`, y la
  dependencia directa de inventario debía resolver la misma instancia de
  framework/MikroORM que el API. La reparación del lockfile se hizo con pnpm.

## Datos de QA

Se creó la categoría `QA · Validación de vendedores`, con identificador de URL
`qa-vendor-onboarding`, porque no había categorías habilitadas. No sustituye la
definición del catálogo comercial. Los datos permanentes de solicitudes conservan
su historial; no deben borrarse para ocultar una prueba o reiniciar el proceso.

Las pruebas de inventario crearon cuatro artículos y una ubicación identificados
como QA, sin productos comerciales, pedidos ni pagos. La ejecución terminó
correctamente y eliminó sus reservas, artículos y ubicación mediante workflows
nativos, limitándose a sus IDs. Las eliminaciones nativas conservan los registros
de auditoría/soft-delete que correspondan. La categoría de QA sigue disponible;
no se confirmó la persistencia de un borrador de solicitud durante las
interrupciones y no se creó ni aprobó un vendedor con la cuenta del comprador.

## Resultados de concurrencia en PostgreSQL

Ejecutados antes de agotarse la cuota de Redis, con el módulo real cargado por
`medusa exec`, sin mocks de persistencia:

| Carrera | Resultado comprobado |
| --- | --- |
| Dos ediciones desde el mismo total 10, a 12 y 14 | Solo una escritura aceptada; la otra falló por conflicto. |
| Reducir 10 a 5 frente a reservar 8 | Solo una operación aceptada; no se perdió ni sobrepasó la reserva. |
| Edición absoluta frente al ajuste nativo -1 | No se perdió el ajuste; el total final fue 9 y la edición obsoleta falló. |
| Dos reservas nativas de 7 sobre un total de 10 | Solo una aceptada; reservado final 7. |

Estas cuatro carreras no certifican todas las interacciones comerciales posibles.
Las escrituras SQL externas que eludan los servicios nativos quedan fuera del
contrato. No se deshabilitó el comportamiento nativo de backorders.

## Checks finales y pendientes

- `pnpm lint`: correcto, sin errores; cinco advertencias por imports internos
  nativos de inventario, documentadas en el módulo.
- `pnpm typecheck`: correcto en las cuatro aplicaciones.
- `pnpm test`: 268 tests correctos (web 44, admin 33, vendor 34, API 157).
- `pnpm build`: cuatro builds correctos. Se pasó `AUTH_EMAIL_ENABLED=false`
  solamente al proceso de compilación, porque el remitente de pruebas no es válido
  en producción. La configuración local privada conserva el correo habilitado.
- Contratos generados y `pnpm peers check`: correctos.
- `git diff --check`: solo señala una línea vacía final preexistente en el
  `AGENTS.md` del usuario, que se preservó.
- No se ejecutó la suite HTTP destructiva contra la infraestructura compartida.
  No se hizo despliegue externo, commit ni push.

Para cerrar la QA faltan: recuperar Redis, verificar el dominio de Resend y
seleccionar el remitente, repetir solicitud/entrega/verificación desde la app,
guardar y retomar la solicitud, enviar, revisar, aprobar y acceder con la membresía
vendor real. También deben probarse correcciones/rechazo y la operación del portal
con datos comerciales configurados. No se declara ese recorrido completo como
aprobado por los tests unitarios.

Antes de producción, rotar la clave de Resend compartida en el chat y las
contraseñas de prueba. También revisar la credencial de Redis: el cliente nativo
incluyó argumentos de autenticación en sus logs de error de cuota; no se copiaron
esos valores a este informe. El saneamiento de logs de infraestructura y la
revisión de permisos preexistentes de Supabase siguen pendientes.

## Revisión posterior del remitente y consumo

Por indicación del usuario, el remitente local pasó a
`RESEND_FROM_EMAIL="marketplace-v2 <onboarding@resend.dev>"`. La variable tiene
prioridad sobre `AUTH_EMAIL_FROM`, conservada como fallback para entornos
anteriores. No se elimina la restricción del dominio de pruebas.

La revisión del consumo detectó trabajo en vacío en el job
`vendor-application-notifications`: se programa cada minuto y su bucle solo se
detiene cuando falta configuración. Si no existe un evento pendiente, el workflow
devuelve `configured: true`, por lo que el job sigue hasta 20 invocaciones. Con
correo habilitado y ejecución continua, son hasta 28800 invocaciones diarias,
no 28800 correos. A esto se suma el polling nativo de BullMQ.

No se dispone del desglose histórico del proveedor Redis anterior para atribuir las 500000
solicitudes a una única causa. La cuota es mensual; las fuentes públicas
consultadas no confirmaron la fecha/hora exacta de renovación de esta instancia.
En esta revisión solo se cambia el remitente, no la programación de jobs ni el
plan de Redis. Corregir el trabajo en vacío y medir el consumo es el siguiente
paso antes de reiniciar los workers.

## Corrección del job y prueba única solicitada

El job ya no inicia workflows si falta configuración de correo. Con la cola
vacía, termina después de la primera consulta en lugar de repetirla 20 veces.
Con trabajo pendiente conserva el máximo de 20 envíos por ejecución, y ante un
envío fallido se detiene hasta la siguiente ejecución programada. Las claves de
idempotencia y los estados persistidos del outbox se conservan. Los errores del
job se registran mediante un mensaje genérico sin datos del proveedor.

Se envió un único correo independiente de prueba a la dirección del administrador
autorizada, desde `marketplace-v2 <onboarding@resend.dev>`, con asunto
`marketplace-v2 · Correo de prueba`. Resend confirmó `delivered`, ID
`6f188eb7-9780-4bd3-8507-b82ff3168127`. El envío usó una clave de idempotencia
propia y no verificó cuentas ni modificó solicitudes. No se reiniciaron workers
ni se probó el cron contra Redis: su cuota sigue siendo una dependencia externa.

Validación de esta corrección: 171 tests de API aprobados, incluidos ocho nuevos
que ejecutan el workflow real con persistencia y correo simulados; typecheck y
build correctos. Lint sin errores, con las cinco advertencias conocidas de
inventario. La compilación mantuvo el correo deshabilitado solo en ese proceso.
