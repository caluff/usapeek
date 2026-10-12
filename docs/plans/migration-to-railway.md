# Plan futuro: migración completa de Supabase a Railway (opción C)

Fecha de elaboración: 2026-10-05.

**Estado: referencia para el futuro; migración no iniciada.** La decisión actual
del usuario es continuar con PostgreSQL y Storage en Supabase, cuyo coste actual
es USD 0. Este documento no autoriza ejecutar la migración, provisionar recursos
de pago, cambiar variables, desplegar código ni eliminar Supabase. La ejecución
se retomará cuando el usuario solicite migrar.

## 1. Objetivo y alcance

Trasladar PostgreSQL y los archivos de imágenes a Railway, conservando Mercur,
Medusa, la autenticación de la aplicación y los flujos actuales de subida.

Arquitectura de destino:

| Componente | Destino |
| --- | --- |
| Storefront, admin y vendor | Sus servicios Next.js en Railway |
| API y worker | Sus servicios Mercur/Medusa en Railway |
| Datos comerciales y autenticación Medusa | PostgreSQL en Railway |
| Eventos, caché, workflows, bloqueos y SSE | Redis en Railway |
| Archivos de imágenes | Railway Storage Bucket compatible con S3 |
| Entrega pública de imágenes | Endpoint estable del backend en Railway, leyendo el bucket privado |

La migración no introduce Cloudflare ni cambia los proveedores externos de
correo, búsqueda o pagos. «Todo en Railway» se refiere al alojamiento, la base,
Redis y el almacenamiento de imágenes; no sustituye esas integraciones de
negocio ni habilita funcionalidades financieras LIVE.

El cambio se divide en dos ventanas: primero PostgreSQL, conservando Storage en
Supabase; después imágenes. La etapa intermedia es la opción B, pero el destino
de este plan es C. No cambiar simultáneamente la versión mayor de PostgreSQL,
Medusa/Mercur y el proveedor de infraestructura.

## 2. Evidencia de partida y límites

La auditoría del 2026-10-05 revisó los tres frontends, backend, dependencias,
migraciones, configuración de Railway y el proyecto Supabase que coincidía con
el `.env` local. Las consultas remotas fueron de solo lectura. Ese contraste no
demuestra que las variables desplegadas en Railway coincidan con las locales.

| Hallazgo observado | Consecuencia |
| --- | --- |
| PostgreSQL 17.6, aproximadamente 31,8 MB y 218 tablas de aplicación en `public` | Volumen pequeño en esa fecha; repetir inventario antes de ejecutar |
| Conexión local al pooler Supabase `us-west-2`, puerto 5432 | Cambiar `DATABASE_URL` de todos los consumidores de forma coordinada |
| Bucket público `product-images`, 3 objetos y 210.213 bytes | Los archivos deben copiarse por separado de PostgreSQL |
| 3 referencias en `catalog_image`, 3 en `image`, 1 miniatura de producto y 2 propuestas con referencias dentro de JSON | Migrar todas las referencias relevantes, no solo nuevas subidas |
| Supabase `auth.users` sin usuarios; identidades Medusa `emailpass` y `google` presentes | Conservar las tablas de autenticación Medusa y sus claves de configuración |
| Ninguna Edge Function; publicación Realtime sin tablas y sin clientes Supabase Realtime en el código | No hay una migración de esos servicios identificada |
| SSE implementado con Redis Pub/Sub, API Medusa y proxies Next.js | Conservar y probar ese recorrido |
| 6 funciones PL/pgSQL y 7 triggers propios en `public` | Restaurarlos y verificar sus restricciones |
| 218 tablas con RLS, sin políticas en `public`, sin FORCE RLS; propietario `postgres` | Planificar propietario y permisos del destino; un usuario arbitrario puede quedar bloqueado |
| `plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements` y `supabase_vault` instaladas | Revisar dependencias; Vault no tenía secretos ni consumidores identificados |

No se encontraron SDKs `@supabase/*`, consumidores de la Data API/RPC,
dependencias de objetos de aplicación hacia las extensiones distintas de
PL/pgSQL, ni claves foráneas de `public` a esquemas internos de Supabase.
Los enums propios de Medusa también deben exportarse. Los iconos en
`apps/web/public` forman parte del despliegue y no pertenecen al bucket.

Estos datos son una fotografía histórica. Si aparecen nuevos servicios,
extensiones, políticas, objetos, consumidores o esquemas, ampliar este plan
antes del cambio.

## 3. Código y configuración que condicionan el trabajo

| Fuente | Trabajo futuro |
| --- | --- |
| [Configuración Railway](../../.railway/railway.ts) y [guía](../../.railway/README.md) | Añadir PostgreSQL y bucket; completar variables de API/worker y origen público de imágenes. Actualmente se declaran cinco aplicaciones y Redis |
| [Configuración Medusa](../../packages/api/medusa-config.ts) | Revisar TLS, pool, proveedor File y consistencia entre API y worker |
| [Configuración Storage](../../packages/api/src/lib/file-storage-configuration.ts) | Sustituir la restricción a dominios/rutas Supabase por configuración S3 validada |
| [Proveedor de imágenes](../../packages/api/src/modules/product-media-file/service.ts) | Mantener validación y `acl: false`; hacer configurable el estilo de endpoint según Railway |
| [Workflow de subida](../../packages/api/src/workflows/upload-catalog-images.ts) | Reutilizar el flujo nativo y sus compensaciones |
| [Propiedad de imágenes](../../packages/api/src/lib/catalog-media/access.ts) | Preservar autorización por vendedor y consistencia de URLs |
| [Trigger de imágenes](../../packages/api/src/modules/catalog-media/migrations/Migration20260906005052.ts) | Preparar migración controlada: protege `seller_id`, `member_id`, `file_id` y `url` |
| [Permisos de base](../../packages/api/src/modules/commerce-automation/migrations/Migration20260919120000.ts) | Mantener propiedad, RLS y privilegios al restaurar |
| [Imágenes del storefront](../../apps/web/lib/product-image-config.ts) y [Next config](../../apps/web/next.config.ts) | Actualizar origen/prefijo y probar optimización; contemplar convivencia temporal de URLs |
| [Servicio de notificaciones](../../packages/api/src/modules/order-notifications/service.ts) y [SSE](../../packages/api/src/lib/vendor-orders/notification-stream.ts) | Verificar API, worker, Redis, reconexión y actualización de datos |

La configuración actual usa `ssl: { rejectUnauthorized: false }`. El destino
debe tener una decisión explícita sobre TLS, CA y red privada. No copiar esa
excepción como configuración definitiva ni desactivar verificación ante un
error sin investigar el certificado. Dimensionar conexiones para el conjunto de
API, workers, migraciones y tareas operativas, no solo para una instancia.

## 4. Decisión para servir imágenes desde Railway

A la fecha del documento, Railway Buckets ofrece almacenamiento S3 privado;
no ofrece buckets públicos. Revalidar esta capacidad cuando se ejecute el plan.
Si incorpora entrega pública permanente, evaluar esa alternativa antes de
implementar el intermediario.

La solución base propuesta es una URL permanente del backend, por ejemplo:

```text
https://<dominio-api>/media/products/<archivo>
```

El navegador solicita esa URL y el backend obtiene el objeto del bucket mediante
S3 y transmite sus bytes. La subida continúa pasando por el workflow de Medusa.
No se guardan URLs S3 firmadas que caduquen en `image.url` o `catalog_image.url`.

Contrato del endpoint público que deberá implementarse:

- Lectura GET/HEAD de imágenes públicas de catálogo, conservando el prefijo
  `products/`. Determinar la ruta exacta según el routing de Medusa instalado.
- Credenciales S3 exclusivamente del lado del servidor. Sin API key de Medusa
  requerida en el navegador para visualizar una imagen pública.
- Aceptar solo claves válidas del prefijo permitido. No aceptar URLs arbitrarias,
  nombres de bucket enviados por el cliente ni rutas fuera de ese alcance.
- Mantener las restricciones actuales de PNG, JPEG y WebP. Los archivos privados
  o documentos de otro tipo requieren un diseño independiente.
- Transmitir en streaming; gestionar cancelación, timeout, objeto inexistente y
  fallos del proveedor. No cargar originales completos en memoria por defecto.
- Conservar `Content-Type`, longitud cuando esté disponible, validadores HTTP y
  política de caché. Usar nombres inmutables para poder cachear; no cachear errores
  como respuestas exitosas.
- Probar imágenes desde los tres frontends y desde el optimizador de Next.js.
  Restringir los patrones remotos al origen y prefijo elegidos.
- Mantener la validación, propiedad, límites y compensaciones de las subidas.
  El endpoint público no incorpora operaciones de subida o borrado.

El `file_url` del proveedor sería la base `/media`; la clave del objeto ya
contiene `products/`. El valor público del storefront incluiría `/media/products`.
Confirmar la concatenación y codificación de claves con las versiones instaladas
para evitar prefijos duplicados. Actualmente Medusa File usa la clave S3 como
`file_id`; conservarla evita cambiar identificadores y facilita la reversión.

Railway documenta estilo virtual-hosted para buckets nuevos y posibles buckets
antiguos con path-style. Leer las credenciales del bucket creado y configurar el
cliente en consecuencia: el proveedor actual fuerza `forcePathStyle: true`.
Ensayar también checksums, escritura, lectura y borrado con el SDK instalado.

Esta opción utiliza la API existente y añade carga y egreso a ese servicio.
Medirlos. Si el tráfico lo justifica, extraer posteriormente la entrega a un
servicio de imágenes en Railway manteniendo una dirección estable. No es un
requisito inicial crear otro servicio.

## 5. Variables del cambio

Los nombres S3 de destino de esta tabla son **propuestos**, aún no implementados.

| Variable/configuración | Durante el cambio de PostgreSQL | Durante el cambio de imágenes |
| --- | --- | --- |
| `DATABASE_URL` | Nueva conexión en API, worker y consumidores operativos | Conservar el destino Railway |
| `REDIS_URL` | Mantener el Redis del entorno productivo; ensayo con Redis aislado | Conservar |
| `SUPABASE_S3_ENDPOINT` | Conservar | Sustituir por `S3_ENDPOINT` |
| `SUPABASE_S3_REGION` | Conservar | Sustituir por `S3_REGION` |
| `SUPABASE_S3_ACCESS_KEY_ID` | Conservar | Sustituir por `S3_ACCESS_KEY_ID` |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | Conservar | Sustituir por `S3_SECRET_ACCESS_KEY` |
| `SUPABASE_STORAGE_BUCKET` | Conservar | Sustituir por `S3_BUCKET` |
| URL pública derivada de Supabase | Conservar | Configurar `S3_FILE_URL` hacia el endpoint público |
| `NEXT_PUBLIC_PRODUCT_IMAGE_URL` | Conservar | Nuevo origen/prefijo; reconstruir storefront |
| `JWT_SECRET`, `COOKIE_SECRET`, `AUTH_MFA_ENCRYPTION_KEY` y OAuth | Preservar valores y configuración utilizados por el entorno | Preservar |
| TLS/CA PostgreSQL | Adaptar y verificar | Conservar |
| Flags de jobs y modos API/worker | Registrar estado, detener y restaurar coordinadamente | Mantener los valores validados |

Implementar una transición explícita de configuración y conservar la versión
anterior para rollback. Si falta Storage en producción, el flujo de catálogo
debe fallar de forma clara; no sustituir almacenamiento duradero por archivos
locales efímeros. Guardar secretos en variables de Railway y, para desarrollo,
solo en el `.env` raíz ignorado. Nunca incluir valores reales en este documento.

## 6. Fase 0: decidir ejecutar y renovar el inventario

- [ ] El usuario solicita retomar la migración y acepta el presupuesto estimado
      con las tarifas vigentes. Supabase continúa activo hasta el cierre.
- [ ] Identificar proyecto/entorno Railway, API y worker desplegados, base fuente,
      bucket fuente y commit de código; contrastarlos sin imprimir secretos.
- [ ] Inventariar todos los escritores: servidores, workers, jobs, webhooks,
      scripts y procesos locales que compartan la base.
- [ ] Repetir inventario de tablas, tamaños, extensiones, funciones, triggers,
      propietarios, RLS, políticas, permisos, secuencias y migraciones aplicadas.
- [ ] Revisar nuevas dependencias de Supabase Auth, Realtime, RPC, Functions o
      Storage y consumidores externos que no estén en el repositorio.
- [ ] Inventariar objetos y referencias: URLs, claves, tamaños, MIME y hashes.
      Registrar archivos sin referencias y referencias a archivos inexistentes.
- [ ] Fijar pérdida de datos tolerable (RPO), tiempo de recuperación (RTO),
      ventana de mantenimiento y criterios de abortar o volver atrás.
- [ ] Cargar las skills requeridas por AGENTS.md: Medusa, Supabase/Postgres,
      storefront si se modifica, y db-generate/db-migrate según las operaciones.
      Consultar documentación de Mercur instalada y documentación actual.

Entregable: inventario actualizado y procedimiento concreto de corte, con un
responsable de ejecución. Backups, manifests sensibles y credenciales quedan
fuera de Git en almacenamiento protegido.

## 7. Fase 1: preparar destino, código y recuperación

- [ ] Crear PostgreSQL en Railway, inicialmente de la misma versión mayor
      compatible que la fuente, con volumen persistente y versión controlada.
- [ ] Elegir la misma región para API, worker, PostgreSQL y Redis, en el proyecto
      y entorno correctos; utilizar conexión interna para los servicios.
- [ ] Confirmar conectividad del paso de migraciones. La red privada no debe
      suponerse disponible durante el build; no hacer migraciones en ese paso.
- [ ] Definir propietario y permisos de aplicación/migraciones compatibles con
      el RLS actual. No trasladar roles internos Supabase indiscriminadamente.
- [ ] Configurar backups, retención, alertas y PITR si corresponde al RPO/RTO.
      Verificar capacidades, costes y disponibilidad actuales del plan Railway.
- [ ] Mantener además una copia lógica recuperable fuera del volumen de origen.
      Evaluar HA según disponibilidad requerida; no confundir HA con backup.
- [ ] Crear el bucket de imágenes en una región adecuada y configurar acceso S3.
      Definir respaldo independiente de objetos; no asumir versionado o backup
      automático del bucket.
- [ ] Implementar configuración S3 genérica, endpoint público y ajustes de
      frontend descritos anteriormente, preservando contratos nativos Medusa.
- [ ] Actualizar IaC, variables y documentación de despliegue al implementar.
      Confirmar que API y worker reciben las integraciones que realmente usan.
- [ ] Preparar migración de URLs y procedimiento inverso con manifest explícito.
      No editar migraciones históricas ni relajar permanentemente sus triggers.

Entregable: cambio de código revisable, recursos de ensayo y backups restaurables.
No cambiar todavía las conexiones productivas.

## 8. Fase 2: ensayo completo en un entorno aislado

1. Exportar la base mediante herramientas PostgreSQL compatibles con la versión
   fuente. Preferir conexión directa o pool de sesión apto para estas operaciones;
   verificar las restricciones actuales del pooler antes de usarlo.
2. Restaurar en una base vacía de ensayo. Incluir objetos de aplicación, enums,
   secuencias, índices, constraints, funciones, triggers, datos y ledger Medusa.
   Revisar dependencias de esquema; no copiar a ciegas `auth`, `storage`,
   `realtime`, `vault` ni roles internos de Supabase.
3. Remapear propietarios y reconstruir permisos de forma explícita. Un dump sin
   propietarios/ACL no significa que sus permisos ya estén resueltos. Validar
   operaciones con el rol real que utilizará la API.
4. Comparar migraciones fuente/destino. Evitar ejecutar migraciones ya aplicadas
   o mezclar `db:migrate` con la restauración del mismo esquema. Ejecutar solo las
   pendientes identificadas después de restaurar y validar su ledger.
5. Arrancar el mismo código con Redis aislado, jobs controlados y proveedores
   externos de ensayo/desactivados. No compartir colas productivas ni disparar
   correos, cobros, transferencias o indexación sobre servicios productivos.
6. Copiar imágenes por S3/API conservando claves, bytes, MIME y metadatos útiles.
   Comparar conteos, tamaños y hashes; ETag no es siempre un hash del contenido.
7. Ensayar la migración de referencias y su inversa, incluido el trigger de
   `catalog_image`. Probar propiedad y restricciones después de ambas operaciones.
8. Ejecutar los checks de código y pruebas funcionales de la sección 11.
9. Ensayar restauración de backup y rollback. Medir duración de exportación,
   restauración, despliegue y comprobaciones para fijar la ventana real.

Por el volumen histórico, un corte con copia final es la estrategia inicial.
Si el nuevo inventario o el ensayo excede el downtime aceptable, evaluar
replicación lógica, compatibilidad y sincronización de secuencias/DDL como un
trabajo adicional antes de programar producción. No prometer downtime cero.

## 9. Fase 3: corte de PostgreSQL

1. Preparar las versiones y variables verificadas, congelar despliegues
   automáticos durante la ventana y tomar un backup recuperable de origen.
2. Activar mantenimiento y detener todos los escritores identificados. Drenar o
   detener de forma controlada trabajos en curso y registrar operaciones externas
   pendientes antes de la copia final.
3. Definir el tratamiento de webhooks: almacenamiento duradero para procesarlos
   luego o respuestas reintentables según el proveedor. No confirmar recepción
   de eventos que no se han persistido.
4. Confirmar que no quedan transacciones de escritura. Tomar el dump final y
   restaurarlo en el destino preparado con el procedimiento ensayado.
5. Validar integridad, conteos, secuencias, ledger, roles, RLS y triggers. Aplicar
   únicamente las migraciones nuevas previstas y comprobadas en el ensayo.
6. Cambiar `DATABASE_URL` de API, worker y scripts operativos de forma coordinada.
   Solo un proceso ejecuta migraciones; hoy el predeploy de API contiene ese paso.
7. Mantener Redis y sus colas; no usar FLUSHALL ni recrear el Redis productivo
   como parte del cambio. No permitir consumidores antiguos conectados a la base
   anterior ni dos bases activas compartiendo sus mismas colas.
8. Arrancar API y ejecutar comprobaciones con escrituras de prueba controladas.
   Reanudar worker/jobs según el orden ensayado; comprobar tareas atrasadas,
   idempotencia y cualquier conciliación con proveedores externos.
9. Reabrir tráfico solo si cumplen los criterios de aceptación. Invalidar
   selectivamente cachés derivadas cuando sea necesario; preservar sesiones y
   estado durable de workflows.
10. Observar errores, conexiones, latencia, colas y SSE. Supabase Storage sigue
    sirviendo las imágenes; registrar este punto como etapa B completada.

Abortar antes de reabrir si hay diferencias no explicadas de datos, permisos que
bloquean operaciones, ledger inconsistente, fallos de autenticación o jobs no
reconciliados. Un `/health` exitoso por sí solo no es suficiente.

## 10. Fase 4: corte de imágenes

1. Con PostgreSQL Railway estable, precopiar los objetos de Supabase al bucket
   Railway. Mantener activas las URLs antiguas durante la preparación.
2. Validar el endpoint público con originales existentes y subidas nuevas de
   ensayo, incluyendo errores y limpieza/compensación de subidas fallidas.
3. Pausar subidas y modificaciones de referencias; detener los procesos que
   puedan aprobar propuestas o modificar medios durante el cambio.
4. Copiar la diferencia final y verificar el manifest completo. Conservar las
   claves originales para que los `file_id` sigan identificando los mismos bytes.
5. Ejecutar la migración revisada de URLs en una transacción y con escritores
   detenidos. Si requiere suspender el trigger concreto de imágenes, hacerlo
   únicamente dentro de esa operación controlada, restableciéndolo antes del
   commit y comprobando que vendedores, miembros y claves permanecen intactos.
   No desactivar globalmente triggers ni constraints.
6. Actualizar únicamente campos inventariados y rutas JSON conocidas. Incluir
   `catalog_image.url`, `image.url`, miniaturas y propuestas; volver a inspeccionar
   carritos, pedidos, variantes, logos, metadatos y registros históricos. Evitar
   reemplazos indiscriminados que alteren auditoría o snapshots inmutables.
7. Activar configuración S3 Railway en todos los procesos correspondientes y
   reconstruir el storefront con el origen/prefijo correctos. Preparar convivencia
   de URLs antiguas/nuevas en la versión de transición cuando sea necesaria.
8. Comprobar visualización, edición, propiedad, publicación y nuevas subidas en
   las tres aplicaciones. Revisar cachés, índices externos, emails o exports que
   contengan enlaces antiguos; actualizar lo que corresponda sin alterar evidencia.
9. Reabrir subidas y observar respuestas del endpoint, uso de memoria, latencia y
   egreso. Registrar PostgreSQL y archivos Railway como destino activo.

Los enlaces antiguos `*.supabase.co` no están bajo control del dominio del
marketplace. Cambiar las referencias internas no redirige enlaces ya enviados
o guardados por terceros. Definir su política de conservación antes de eliminar
el proyecto Supabase; si deben seguir funcionando, habrá que conservar el origen
durante el período necesario.

## 11. Validación requerida al implementar

Este documento no ejecuta estos checks. Se aplican cuando se escriba el código y
se prepare la migración, usando bases de prueba aisladas.

- Código: `pnpm lint`, `pnpm typecheck` y `pnpm build`, más las integraciones
  pertinentes conforme a la [guía de pruebas aisladas](../../packages/api/integration-tests/http/README.md)
  y los gates del repositorio para backend y múltiples aplicaciones. `pnpm peers check`
  si cambian dependencias. No ejecutar suites que reconstruyen bases contra la
  base compartida o productiva.
- Base: restauración completa; comparación de filas/relaciones y secuencias;
  propietario, RLS, permisos, funciones, triggers y ledger verificados.
- Identidad: acceso email/contraseña y Google, sesiones vigentes, roles de
  operador/vendedor y separación entre vendedores.
- Comercio: lectura/edición de catálogo, propuestas, inventario, carrito, pedidos
  y operaciones financieras habilitadas en el entorno, preservando idempotencia.
- Medios: subir PNG/JPEG/WebP, rechazar contenido inválido, probar límites,
  visualizar imágenes existentes/nuevas y verificar compensaciones y borrado
  mediante los flujos autorizados.
- Propiedad: un vendedor no puede apropiarse de las imágenes de otro; los campos
  protegidos siguen rechazando modificaciones después de la migración.
- Entrega: GET/HEAD, 404, fallo de Storage, cancelación, caché, tipos de contenido,
  optimizador Next.js y conexiones lentas sin consumo desproporcionado de memoria.
- SSE: evento originado por worker llega a API y a admin/vendor; reconexión y
  lectura del estado actual funcionan después de reiniciar servicios.
- Recuperación: restauración de PostgreSQL y archivos demostrada; procedimiento
  inverso ensayado, incluidos datos y objetos creados después del cambio.

Si se modifican hooks Medusa, inspeccionar consumidores nativos Mercur y de la
aplicación e incluir la prueba de composición/carga exigida por AGENTS.md.

## 12. Rollback

| Situación | Procedimiento |
| --- | --- |
| Antes de nuevas escrituras en PostgreSQL Railway | Mantener mantenimiento, detener consumidores y volver todos a la conexión anterior validada; coordinar Redis y jobs |
| Después de nuevas escrituras en Railway | Congelar escritores, reconciliar datos nuevos y efectos externos y restaurar/sincronizar una base de retorno; validar antes de cambiar conexiones |
| Cambio de imágenes sin nuevas subidas | Restaurar mapeo de URLs y configuración anterior con la operación inversa ensayada; comprobar triggers y cachés |
| Cambio de imágenes con subidas nuevas | Copiar objetos nuevos de Railway a Supabase conservando claves, comprobar integridad y después invertir referencias/configuración |
| Fallo de entrega de imágenes con datos íntegros | Evaluar primero revertir el despliegue de entrega/configuración; evitar volver toda la base si el problema está limitado a archivos |

Guardar fuera de Git el commit/configuración anterior, manifiestos de objetos y
mapeos de URLs, inventario de migraciones y backups. Conservar credenciales de
recuperación hasta cerrar la ventana acordada.

No asumir que conservar Supabase equivale a replicación bidireccional. Cambiar
`DATABASE_URL` de regreso después de aceptar escrituras puede perder datos. Las
migraciones con `down()` deliberadamente bloqueado no se revierten con un comando
genérico. No reproducir pagos, emails o transferencias ya realizados al recuperar
colas: conciliar con su estado externo y sus claves de idempotencia.

## 13. Cierre y retirada de Supabase

- [ ] Cumplido el período de observación acordado sin fallos pendientes.
- [ ] PostgreSQL Railway y sus backups restaurados con éxito en una prueba.
- [ ] Archivos Railway íntegros, respaldados y accesibles por las URLs estables.
- [ ] Sin consumidores activos de la conexión Supabase ni referencias internas
      pendientes; política de enlaces históricos resuelta.
- [ ] Sin dependencia nueva de Auth, Realtime, Edge Functions, RPC o Vault.
- [ ] API, worker, frontends, jobs y desarrollo apuntan al entorno previsto.
- [ ] Coste medido dentro del presupuesto; alertas de gasto y capacidad activas.
- [ ] Retirada del origen y revocación de credenciales decididas explícitamente
      al finalizar; no eliminar el origen durante las primeras pruebas.
- [ ] Documentación e IaC reflejan la arquitectura realmente desplegada.

Hasta completar estos puntos, mantener las copias de origen y su recuperación.

## 14. Costes y motivo para posponer

La decisión actual de continuar con Supabase a USD 0 es válida. No hay ahorro
inmediato demostrado que justifique ejecutar este plan hoy.

Tarifas orientativas consultadas el 2026-10-05; verificarlas antes de contratar:

| Recurso Railway | Referencia de coste |
| --- | --- |
| RAM | Aproximadamente USD 10 por GB medio durante un mes |
| CPU | Aproximadamente USD 20 por vCPU media durante un mes |
| Volumen | Aproximadamente USD 0,15 por GB-mes |
| Bucket | USD 0,015 por GB-mes; egreso del bucket y operaciones gratuitos según tarifa consultada |
| Egreso de servicios | USD 0,05 por GB, incluido servir bytes de imágenes a través de la API |
| Pro | Mínimo de USD 20/mes consumible en recursos, no USD 20 adicionales por servicio |

Como orientación sin mediciones de carga, la conversación estimó USD 60–130 al
mes para el conjunto de aplicaciones, API, worker, PostgreSQL, Redis y medios,
con poco tráfico y una réplica por servicio. No es una cotización ni un límite:
la RAM real de Medusa, CPU, backups, transferencias y réplicas pueden cambiarla.
No sumar otra vez los servicios que ya se pagan en Railway al estimar el coste
incremental de la migración. Mantener ambos proveedores durante la transición
tiene un coste temporal que deberá presupuestarse.

Guardar 100 GB de imágenes costaría unos USD 1,50/mes de bucket; transmitir
100 GB a través de la API añadiría unos USD 5 de egreso del servicio, más cómputo.
El endpoint propuesto comparte la API inicialmente: su coste adicional depende
del tráfico, no de una tarifa fija por un servicio nuevo. Estas cifras excluyen
impuestos, dominio, integraciones externas y trabajo de implementación.

## 15. Documentación a revalidar al ejecutar

- [Railway: precios](https://railway.com/pricing)
- [Railway: bases de datos y responsabilidades operativas](https://docs.railway.com/databases)
- [Railway: red privada](https://docs.railway.com/networking/private-networking/how-it-works)
- [Railway: backups de volumen](https://docs.railway.com/volumes/backups)
- [Railway: PITR](https://docs.railway.com/volumes/point-in-time-recovery)
- [Railway: PostgreSQL HA](https://docs.railway.com/databases/postgresql-ha)
- [Railway: Storage Buckets y estilo de conexión](https://docs.railway.com/storage-buckets)
- [Railway: subida y entrega de archivos](https://docs.railway.com/storage-buckets/uploading-serving)
- [Railway: facturación de buckets](https://docs.railway.com/storage-buckets/billing)
- [Medusa: proveedor S3](https://docs.medusajs.com/resources/infrastructure-modules/file/s3)
- [Supabase: metadatos de Storage y separación de archivos](https://supabase.com/docs/guides/storage/schema/design)
- Mercur: documentación de la versión instalada en `node_modules/@mercurjs/docs`.
- Proyecto: [AGENTS.md](../../AGENTS.md), [estado de desarrollo](../develpment/development-progress.md)
  y [auditoría de desarrollo](../develpment/development-completion-audit.md).

Al retomar: renovar el inventario y las fuentes, medir costes y ensayar el
procedimiento completo antes de fijar una fecha de cambio.
