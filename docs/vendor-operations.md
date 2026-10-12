# Alta y operación de vendedores

Guía vigente de las superficies conectadas, actualizada el 2026-10-06. El diseño
inicial para Mercur 2.3.3 y Medusa 2.18.0 está en
[el plan histórico](plans/vendor-onboarding.md); los resultados de QA al final
conservan su fecha y no representan una nueva verificación.

La [auditoría de cierre](develpment/development-completion-audit.md) es la base de
los requisitos originales de desarrollo. **F01–F12 / Phase 1–6 DONE** y
**Financial Readiness PASS para Stripe TEST, USD y operación manual**, incluidos
comisión, liquidación, recuperación y reporting. La liberación automática está
implementada con plazo configurable en TEST. Inmediato pasó una QA integral
aislada; el pedido original a 72 horas reales permanece **NEEDS VERIFICATION**
y su seguimiento está pausado por el cambio de entorno. LIVE y producción no
están certificados. Seguir las
[fases de implementación](develpment/development-implementation-plan.md) y el
[handoff de progreso](develpment/development-progress.md).

## Recorrido

1. El comprador entra en `/account/sell`, desde su cuenta o el menú del avatar.
   Conserva su cuenta, pedidos, direcciones y favoritos.
2. Completa responsable, tienda, actividad y revisión. El borrador se guarda en
   el backend y puede retomarse. La primera versión admite personas y empresas
   de Estados Unidos, teléfono estadounidense y categorías/monedas habilitadas
   por el marketplace.
3. Verifica su correo y envía la solicitud con consentimiento de revisión. Los
   datos enviados quedan como una revisión independiente del borrador.
4. Un administrador autorizado revisa `/dashboard/vendor-applications`: aprueba,
   solicita correcciones con motivo o rechaza con motivo. Las correcciones
   permiten reenviar; el rechazo cierra esta solicitud, sin reapertura automática.
5. La aprobación crea la tienda y su membresía con los workflows nativos de
   Mercur. No habilita el registro público genérico de vendedores. El comprador
   accede al portal con el mismo correo y contraseña, pero obtiene una sesión
   `member` independiente; no se transfieren tokens por URL.
6. El vendedor consulta su preparación en `/seller`. Una solicitud aprobada, una
   tienda activa, un producto publicado y una oferta disponible para comprar son
   estados distintos.

## Superficies conectadas

| Ruta                                   | Capacidad y límite                                                                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web `/account/sell`                    | Borrador, envío, estado, correcciones e historial/notificaciones dentro de la cuenta.                                                                           |
| Admin `/dashboard/vendor-applications` | Cola, detalle y decisión de solicitudes, con permisos y control de versión.                                                                                     |
| Admin `/dashboard/product-review`      | Moderación nativa de productos propuestos y de cambios pendientes. No configura precios ni ofertas.                                                             |
| Vendor `/seller`                       | Conteos, pedidos recientes, preparación y reporte financiero propio: ventas netas, ganancias, transferencias y pendiente, con períodos y detalle. |
| Vendor `/seller/catalog`               | Catálogo compartido, variantes, imágenes y revisión de productos/cambios; ofertas y precios propios. Producto aprobado y oferta vendible son estados distintos. |
| Vendor `/seller/inventory`             | Consulta y ajuste atómico del total físico en el almacén aprobado, con controles de cantidad esperada y reservas.                                               |
| Vendor `/seller/inventory/locations`   | Consulta y revalidación del único almacén de Estados Unidos basado en la solicitud aprobada. No permite creación libre.                                         |
| Vendor `/seller/orders`                | Pedidos asignados, detalle, preparación parcial, envío/tracking y transiciones admitidas; cancelación/refund TEST según elegibilidad backend.                   |
| Vendor `/seller/settings`              | Edición de perfil, dirección comercial y nombre de empresa.                                                                                                     |
| Vendor `/seller/settings/shipping`     | Configuración de opciones de envío admitidas y tarifas propias para la cobertura estadounidense soportada.                                                      |
| Vendor `/seller/settings/payments`     | Alta/reanudación Connect TEST, consulta y refresco de estado. No muestra una liquidación ni un payout bancario.                                                 |
| Admin `/dashboard/orders`              | Consulta/operación de pedidos y captura, cancelación y reembolsos TEST protegidos por el backend.                                                               |
| Admin `/dashboard/commissions`         | Consulta y edición de la regla global; no es un dashboard de ingresos.                                                                                          |

El catálogo compartido publicado de Mercur puede ser visible a más de una tienda.
Los productos privados y los registros de inventario requieren el alcance de la
tienda. La API vuelve a comprobar la membresía activa y el estado operativo; una
cookie válida por sí sola no mantiene acceso a una tienda suspendida.

El admin puede cambiar el **Permiso de catálogo** en Tiendas. **Supervisado**
mantiene la revisión actual; **Autorizado** publica productos nuevos y aplica
cambios nuevos mediante los flujos nativos, sin revisión. Todas las tiendas
empiezan en Supervisado y las solicitudes ya pendientes no se aprueban al
cambiar el permiso. El alcance, revocación y controles están descritos en
[permisos de catálogo](catalog-permissions.md).

El almacén se gestiona con la dirección aprobada. Si falta o no se puede confirmar
uno único, la UI informa del bloqueo y requiere revisión del operador. Crear otra
ubicación no es la solución del flujo actual. Los contratos y evidencia de esa
entrega están en [el informe de almacén](reports/phase-1-warehouse.md).

Una cuenta Connect habilitada, una oferta activa y stock disponible tampoco
demuestran una venta cobrada: el checkout autoriza y separa pedidos por vendedor.
El cobro puede ser Manual o Automático según la configuración; Automático espera
la preparación de todas las cantidades activas. Ver [pedidos](orders-flow.md) y
[operaciones financieras](order-finance.md). Los dashboards muestran conteos
operativos y reporting backend conciliado. La sección Finanzas del detalle de
pedido muestra asignado/capturado/reembolsado, saldo e historial de operaciones,
con comisión devuelta cuando corresponde. El desglose por venta del informe en
`/seller` utiliza el snapshot original de comisión/ganancias y los movimientos de
transferencia/reversión. Los períodos usan `America/Montevideo` y la cobertura
incompleta queda explícita. Transferido al saldo Connect no significa depositado
en el banco del vendedor.

## Verificación de correo en pruebas

El identificador de la tienda es interno: el backend lo genera al guardar la
solicitud y conserva el de los borradores existentes. No se solicita ni se muestra
como un campo editable al cliente.

Configura `VENDOR_ONBOARDING_TEST_VERIFICATION=true` en el entorno privado de la
API (el `.env` raíz para desarrollo local o las variables del servicio desplegado).
La solicitud de vendedor mostrará «Generar código de prueba»: el servidor genera
un token nativo para el correo de la cuenta autenticada y el formulario lo
completa automáticamente. La persona debe pulsar «Confirmar código»; generar el
token por sí solo no verifica la cuenta. No se envía un correo en este modo y se
mantienen los límites de reenvío y la caducidad del token.

La opción está desactivada por defecto, independientemente de `NODE_ENV`. Para
volver a verificar la posesión real del correo, elimina la variable o configura
`VENDOR_ONBOARDING_TEST_VERIFICATION=false` y reinicia la API. Las cuentas ya
verificadas conservan su estado. Activa esta opción solo en el entorno de pruebas.

## Pendientes de desarrollo y límites

- **Finanzas:** F01–F03 cerraron histórico, redondeo y validación; F04 protege
  escritores de pedidos; F07–F09 completaron liquidación, recuperación y reporting.
  No repetir transferencias ni liberar journals por SQL para resolver un resultado
  incierto. La extensión automática usa un reloj durable observado por servidor,
  conserva el plazo configurado al finalizar (0–365 días, inicialmente 3) y
  revalida elegibilidad. Órdenes sin reloj o con revisión/resultado incierto no
  se pagan automáticamente. El pedido original TEST #16 conserva 72 horas y su
  comprobación posterior sigue pausada; la QA inmediata aislada no lo certifica.
- **Autorización:** F05 cerró el aislamiento de carrito/identidad y F06 la
  corrección de permisos incluida en el cierre. Medusa no protege consultas SQL
  externas; verificar migraciones y permisos al preparar cada destino. La evidencia
  del entorno de cierre no certifica la configuración de una nueva producción.
- **Catálogo y checkout:** F10–F11 cerraron continuidad del catálogo y coherencia del
  desglose con descuentos/impuestos. F12 certificó la regresión del alcance TEST/manual.
- **Inventario:** el ajuste vendor ya compara y escribe de forma atómica, con
  bloqueos compartidos con reservas/ajustes nativos. La evidencia histórica incluye
  carreras PostgreSQL. La extensión usa clases internas de Medusa 2.18.0 y exige
  revisar compatibilidad al actualizar; no protege escrituras SQL externas.
  Consultar [el contrato de concurrencia](../packages/api/src/modules/inventory/README.md).
- **Configuración comercial:** el backend debe suministrar categorías, monedas,
  regiones, variantes, ofertas, inventario y envíos. No fabricar datos en el
  frontend. En modo Supervisado, productos propuestos necesitan moderación;
  borradores preexistentes necesitan progresión por el operador cuando el esquema
  vendor no lo admite. El modo Autorizado se rige por la guía de permisos de catálogo.
- **Variantes e imágenes:** hasta tres ejes y 100 combinaciones. En modo
  Supervisado, ampliar un valor de opción y crear una variante que lo use puede
  requerir dos solicitudes sucesivas: aprobar primero la ampliación. La edición
  de USD conserva los precios preexistentes de otras monedas. Las imágenes
  admiten PNG/JPEG/WebP, hasta seis por producto y 5 MiB de contenido por solicitud
  de carga. Se registra su propiedad; quitar una imagen del borrador o del
  producto no borra el archivo almacenado. Una carga interrumpida o una respuesta
  perdida puede dejar objetos huérfanos; no hay limpieza automática verificada.

## Integraciones y comprobaciones externas

Resend está integrado con Notification de Medusa y sus plantillas. Su
configuración y recuperación se documentan en
[el módulo](../packages/api/src/modules/resend/README.md). Las variables privadas
incluyen `RESEND_API_KEY`, `AUTH_EMAIL_ENABLED`, `RESEND_FROM_EMAIL`,
`STOREFRONT_URL`, `ADMIN_URL` y `VENDOR_URL`; `AUTH_EMAIL_FROM` conserva compatibilidad
si no existe `RESEND_FROM_EMAIL`. El remitente de pruebas de Resend tiene límites
propios y no acredita entrega a compradores reales.

Una creación Connect con respuesta o persistencia incierta necesita revisión
antes de intentar crear otra cuenta; el flujo nativo no garantiza creación única
entre solicitudes nuevas. La reconciliación de estado usa el lock
`payout-account-status/<id>` con propietario UUID y sin expiración. Una caída
puede dejarlo retenido: detener y revisar el escritor original, confirmar que no
puede reanudarse y liberar únicamente ese propietario mediante el módulo de
locking antes de reintentar. No usar `releaseAll`, propietarios comodín ni
eliminar bloqueos por antigüedad. Fuente:
`packages/api/src/lib/stripe-connect/account-reconciliation.ts`.

Redis sostiene eventos, workflows y bloqueos. La cuota agotada registrada el
2026-09-05 es evidencia histórica, no una consulta al estado actual del servicio.
No cambiar ni vaciar la instancia para eludir un fallo de acceso/cuota sin la
correspondiente autorización.

La entrega real de correo y el recorrido autenticado completo requieren pruebas
integradas; tipos y builds no sustituyen esa validación. Los tests unitarios se
retiraron por solicitud del usuario; se conservan las suites de integración con
preflight de infraestructura aislada. Los dominios,
remitentes, credenciales live y despliegue definitivos pertenecen a la etapa
posterior de preparación para producción. No son parte de las fases obligatorias
del plan de cierre funcional. No incluir secretos ni credenciales en evidencias.

## Configuración y despliegue

En el frontend web, `NEXT_PUBLIC_VENDOR_URL` contiene únicamente el origen público
del portal. En vendor, `NEXT_PUBLIC_STOREFRONT_URL` contiene el origen público de
la tienda. Son valores públicos de compilación de Next.js; reconstruir al cambiar
el destino. Las sesiones siguen aisladas por aplicación.

Los destinos de Railway y los watch paths del paquete de contratos están
declarados en `.railway/railway.ts`. Editar ese archivo no despliega ni aplica
configuración externa. API y worker deben ejecutar la misma versión. El servicio
API conserva la responsabilidad de migrar antes del despliegue.

La migración `Migration20260905012452` añade `vendor_application`,
`vendor_application_event` y `vendor_application_mutation`.
`Migration20260905015700` fija el `search_path` de la función de auditoría.
No editarlas después de aplicarlas. El historial es deliberadamente inmutable; no usar
la base compartida como destino de fixtures que después se pretenda borrar.

Los contratos de transporte se generan desde los esquemas Zod del backend en
`packages/vendor-onboarding-contracts`, un paquete de tipos sin código de servidor
importado por los frontends:

```powershell
pnpm --filter @usapeek/api contracts:generate
pnpm --filter @usapeek/api contracts:check
pnpm lint
pnpm typecheck
pnpm build
pnpm peers check
```

## Pruebas HTTP aisladas

Consultar primero el encabezado completo de
`packages/api/integration-tests/http/vendor-onboarding.spec.ts`. La suite se
omite por defecto y exige la opción `VENDOR_ONBOARDING_TESTS=disposable-local`,
credenciales explícitas de PostgreSQL local y una instancia Redis TLS local
dedicada. La configuración actual de API también requiere TLS en PostgreSQL.

El runner nativo crea/restaura/elimina bases y plantillas temporales. **No usar
Supabase ni Redis compartidos, ni ejecutar la suite HTTP general contra ellos.**
Las variables deben existir antes de iniciar el proceso; `TEST_DATABASE_URL` no
es un sustituto de la configuración del runner. No requiere credenciales de
usuarios existentes ni envía correos reales.

Desde `packages/api`, y solamente después de preparar ese entorno desechable:

```powershell
pnpm test:integration:http --runTestsByPath integration-tests/http/vendor-onboarding.spec.ts
```

La suite cubre acceso, verificación, aislamiento entre tiendas, reintentos,
concurrencia y compensación de aprobación. Que el runner informe `skipped` no
significa que esas pruebas hayan pasado.

## Recuperación de aprobaciones interrumpidas

Una aprobación con resultado de escritura incierto permanece bloqueada para
recuperación; no se crea otra tienda mediante un nuevo intento a ciegas. El
operador puede inspeccionar la operación original, desde `packages/api`:

```powershell
pnpm exec medusa exec ./src/scripts/recover-vendor-application.ts <operation-id> inspect
```

El script también dispone de `cancel` y `finalize`, con confirmación explícita
mediante `VENDOR_ONBOARDING_RECOVERY_CONFIRMED=true`. Son operaciones de
recuperación que modifican datos: revisar primero la transacción original y
detener su worker ejecutor antes de usarlas. No borrar journals, cambiar estados
por SQL ni autorizar otra aprobación mientras el resultado siga siendo incierto.

## Verificación inicial del coordinador · 2026-09-05

Los siguientes resultados corresponden a la entrega inicial. La ampliación
posterior de correo, inventario y QA autenticada se recoge al final.

- Lint, tipos y compilaciones de web, admin, vendor y API: correctos en el código
  final; contratos generados y dependencias pares también comprobados.
- Tests de proyecto: web 41, admin 19, vendor 26 y API 95, todos correctos.
  Los de API usan dobles de persistencia; no son los tests HTTP aislados.
- Ambas migraciones se aplicaron correctamente en la base configurada, con
  sincronización de enlaces finalizada y sin migraciones nativas pendientes.
- Navegador: login de comprador en escritorio/móvil, rutas de autenticación,
  login de vendor móvil sin desbordamiento y redirecciones sin sesión que
  conservan el destino. No se probó una aprobación con sesiones reales.
- API local restaurada: `/health` devuelve `200 OK`; siete comprobaciones de
  rutas protegidas/registro cerrado devolvieron los `401`/`403` esperados mediante
  el SDK. Las lecturas públicas confirman **cero categorías y cero regiones**;
  no se añadieron datos comerciales de demostración para ocultar esa dependencia.
- Tras el ajuste de la función, el asesor de Supabase no reporta advertencias
  ni errores nuevos del módulo. Los tres avisos informativos de RLS sin políticas
  son intencionales para tablas privadas del backend. Persisten 201 avisos de
  tablas públicas preexistentes sin RLS, fuera de esta modificación de permisos.
- No se ejecutó la suite HTTP destructiva en infraestructura compartida, no se
  enviaron correos, no se hizo despliegue externo y no se hizo commit ni push.

## Ampliación de QA, Resend e inventario · 2026-09-05

- 268 tests correctos: web 44, admin 33, vendor 34 y API 157; lint sin errores
  (cinco advertencias documentadas por imports nativos de inventario), tipos,
  contratos, dependencias pares y cuatro builds correctos. La compilación usó
  `AUTH_EMAIL_ENABLED=false` únicamente en ese proceso, no en el entorno local.
- Cuatro pruebas de concurrencia con PostgreSQL real correctas; artículos,
  reservas y ubicación de QA eliminados mediante workflows nativos.
- Login real del comprador y administrador comprobado. Corregida la confusión
  entre caída del API, sesión vencida y credenciales incorrectas.
- Resend confirmó entrega del correo de conexión al administrador; el envío al
  comprador fue rechazado por la restricción del remitente de pruebas.
- Se añadió una categoría explícita de QA, no un catálogo comercial. No se
  confirmó el guardado de la solicitud ni se creó o aprobó una tienda del comprador.
- El API quedó detenido tras encontrar agotada la cuota de Redis; los frontends
  siguen abiertos. La entrega de correos desde la app y el recorrido completo
  hasta el portal vendor permanecen pendientes de Redis y del dominio de Resend.

La evidencia y las limitaciones se detallan en
[el informe de QA](reports/vendor-qa-resend-inventory.md).
