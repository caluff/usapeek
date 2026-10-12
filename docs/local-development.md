# PostgreSQL local para desarrollo

Desde el 5 de octubre de 2026, el `.env` local apunta a `marketplace_local` en
`localhost:5432`. La base se restauró desde una instantánea consistente de
Supabase. Usuarios, credenciales de la aplicación, clientes, vendedores,
productos, inventario, pedidos y sus relaciones conservan sus datos e IDs.
Los cambios posteriores son independientes; no hay sincronización automática.

## Arranque y persistencia

```sh
pnpm dev
```

El comando levanta PostgreSQL y Redis antes de iniciar las aplicaciones. Para
iniciar solamente el backend, usar `pnpm dev:api`. Docker debe estar ejecutándose.

Las aplicaciones arrancan en paralelo. Medusa ejecuta el linter y carga sus
módulos antes de abrir el puerto 9000; durante ese intervalo, los frontends
pueden mostrar `ECONNREFUSED`. Para comprobar que la API está lista en PowerShell:

```powershell
Invoke-RestMethod http://localhost:9000/health
```

La respuesta esperada es `OK`. El workspace declara `tsconfig-paths` 4.2.0 para
el CLI de Medusa 2.21.2 mediante `packageExtensions`: evita que su llamada
`register({})` resuelva la versión 3.15.0 y produzca la advertencia engañosa de
`ts-node` con `path.isAbsolute(undefined)`.

```sh
pnpm services:up
pnpm services:stop
pnpm postgres:up
pnpm postgres:stop
pnpm postgres:logs
```

PostgreSQL usa la imagen de Supabase `17.6.1.136`, con las mismas versiones de
PostgreSQL 17.6 y de las extensiones utilizadas por el origen. La imagen local
añade OpenSSL para generar el certificado. El puerto se publica únicamente en
`127.0.0.1`; los volúmenes `postgres-data` y `postgres-config` conservan datos y
certificado entre reinicios. Los comandos `stop` preservan los volúmenes.
Eliminar volúmenes con `docker compose down -v` elimina sus datos.

`POSTGRES_PASSWORD`, `DATABASE_URL` y `REDIS_URL` están en el `.env` raíz
ignorado. La conexión PostgreSQL usa TLS y verifica el certificado local mediante
`sslmode=verify-full` y `sslrootcert`. El certificado público está en la carpeta
privada indicada más abajo; debe conservarse junto al volumen de certificados.
No copiar las credenciales a los archivos públicos de los frontends.

Redis usa la instancia Docker existente y la base lógica **1**, que estaba vacía
antes del cambio. La base **0** del entorno anterior permanece conservada.

Los workers siguen consumiendo recursos aunque no haya usuarios conectados.
La configuración de API usa `drainDelay: 60` para espaciar las consultas de las
colas vacías; no retrasa un trabajo que acaba de llegar ni desactiva la revisión
de trabajos demorados o interrumpidos. Para detener el entorno local, cerrar los
procesos de desarrollo y usar `pnpm services:stop`, que conserva los volúmenes.

Para medir Redis local sin leer claves ni valores:

```sh
pnpm redis:diagnose --seconds 130
```

El diagnóstico acepta únicamente una dirección de loopback y usa `REDIS_URL`
del proceso o del `.env` raíz. Informa clientes, comandos, CPU, memoria, tráfico
y nombres de comandos del slowlog. No cambia configuraciones ni borra datos.
`INFO` agrega todas las bases lógicas del servidor: para atribuir consumo, evitar
otras pruebas y separar arranque, reposo y cada operación. El healthcheck Docker
ejecuta `AUTH` y `PING` cada cinco segundos; aparece separado del trabajo de la
aplicación. El slowlog es histórico y su tiempo de ejecución excluye la red.

Los contadores incluyen comandos internos de Lua; se distinguen de las peticiones
enviadas por los clientes y del consumo de CPU, memoria y red en Railway. Un
pipeline reduce viajes por red, pero conserva sus comandos. En BullMQ 5.13,
`drainDelay: 60` rige una cola vacía sin trabajo
demorado; cuando existe trabajo programado, el bloqueo tiene un máximo nativo
de diez segundos. La revisión de trabajos interrumpidos continúa cada treinta
segundos. No elevar esos límites ni desactivar recuperaciones para reducir una
cantidad de comandos sin evaluar su efecto sobre la confiabilidad.

La caché de consultas de Medusa sólo se registra con `MEDUSA_FF_CACHING=true`.
El cache legacy en memoria, las colas, las sesiones y los locks son independientes.
Los cron de email y evaluación comercial sólo se registran cuando su integración
estática está habilitada; los reconciliadores financieros permanecen registrados
porque también dependen de la configuración persistida en Store. Los cambios de
flags requieren reiniciar los procesos.

Antes de habilitar nuevamente la caché de consultas después de un período
desactivada, detener API y worker y ejecutar con su misma configuración Redis:

```sh
pnpm redis:cache:clear
```

El comando carga Medusa en modo `server` sin HTTP ni workers, invalida mediante
la API nativa y verifica que el namespace de caché quede vacío. Un error o claves
restantes impiden confirmar la limpieza. Después, iniciar API y worker con
`MEDUSA_FF_CACHING=true` en ambos. No basta con cambiar el flag en un solo servicio:
durante el período desactivado pudieron quedar entradas antiguas sin invalidar.
La limpieza es una operación explícita; no se ejecuta en cada arranque ni borra
colas, sesiones, locks o datos de negocio.

La [auditoría de Redis](develpment/evidence/redis-audit-20261012.md) documenta el
inventario, las mediciones locales comparativas y sus límites para Railway.

## Alcance de la copia

La restauración incluye todos los esquemas no internos de PostgreSQL presentes
en el origen: `public`, `auth`, `storage`, `realtime`, `supabase_migrations`,
`vault`, `extensions`, `graphql` y `graphql_public`. Se conservaron tablas,
datos, secuencias, funciones, restricciones, índices, permisos y RLS. No se
copiaron contraseñas de roles del servidor ni suscripciones/publicaciones de
replicación; los usuarios de Medusa están en las tablas restauradas y mantienen
sus credenciales. Los servicios HTTP Auth, Realtime y Storage de Supabase no
forman parte de este contenedor PostgreSQL.

Antes de relocalizar imágenes y arrancar Medusa, se comprobaron **258 tablas y
2.675 filas**: cantidades y fingerprints del contenido coincidieron en cada
tabla con la instantánea utilizada por `pg_dump`. Incluía 8 clientes, 1 usuario
de operador, 2 miembros de vendedores y 17 pedidos; `auth.users` estaba vacío
porque la aplicación usa la autenticación de Medusa.

Las tres imágenes de Storage se copiaron a `packages/api/static/products`,
fuera de Git. Sus referencias locales usan `http://localhost:9000/static`;
se conservaron los IDs de archivo y propietarios. La relocalización de URLs
restauró el trigger de propiedad inmutable antes de confirmar la transacción.
Los archivos de Storage y de PostgreSQL son copias; el origen no fue modificado.

## Integraciones externas

La copia conserva identificadores de proveedores. Para las pruebas locales se
dejaron `AUTH_EMAIL_ENABLED`, `STRIPE_AUTOMATIC_JOBS_ENABLED` y
`STRIPE_AUTOMATIC_SETTLEMENT_ENABLED` en `false`. Las credenciales S3 están
desactivadas y las imágenes copiadas se sirven desde el backend local.

Desde el 6 de octubre, **Pagos → Liberaciones → Modo de liberación** guarda la
elección en Store. El flag `STRIPE_AUTOMATIC_SETTLEMENT_ENABLED=false` solo es el
valor inicial: no desactiva una elección Automático ya persistida. La copia local
se verificó en Manual durante este cambio. Como conserva identificadores Stripe
del origen, no activar liberaciones en ambas copias para probar el selector;
las pruebas de persistencia usan una base UUID vacía y no crean pagos.

La búsqueda usa Algolia con el índice independiente
`marketplace_v2_dev_products_local_dcalu` y sus réplicas `_price_asc`,
`_price_desc` y `_newest`. El índice anterior `marketplace_v2_dev_products`
continúa asociado al entorno que usa Supabase. Las tres variables `ALGOLIA_*`
permanecen en el `.env` raíz ignorado; se reutiliza la clave privada existente,
restringida al prefijo de índices de desarrollo. PostgreSQL funciona localmente;
el servicio de búsqueda Algolia sigue siendo remoto.

El catálogo local se indexa mediante el workflow existente:

```sh
pnpm --filter @usapeek/api search:reindex
```

Los eventos del catálogo y la reconciliación periódica mantienen ese índice al
día con la copia local. Reindexar no restaura datos en PostgreSQL.

Las nuevas subidas de imágenes de vendedores necesitan un proveedor configurado;
la copia de imágenes permite visualizar el catálogo existente. Stripe TEST
conserva su configuración, pero sus automatizaciones están desactivadas. Los
jobs internos de proyección siguen trabajando únicamente sobre la copia local.
El seguimiento anterior del pedido TEST #16 sobre Supabase no se verifica
utilizando esta API local.

## Respaldo y pruebas

El respaldo de la configuración original, el archivo `supabase-full.dump`, el
certificado y los recibos de verificación se guardaron en:

```text
C:/Users/dcalu/.codex/tmp/local-postgres-20261005/private
```

La carpeta privada está restringida al usuario actual y SYSTEM. El dump no se
incluye en Git. Una futura actualización desde Supabase requiere otra copia
explícita; el arranque habitual no restaura ni sobrescribe los datos locales.

`pnpm db:migrate` aplica migraciones al destino configurado; no hace falta volver
a cargar el dump para arrancar. El comando desactiva el codegen de desarrollo
durante las migraciones con `MERCUR_DEV_CODEGEN=false`, para no ejecutar una
descarga de CLI ajena a la actualización del esquema. La generación durante
`pnpm dev` conserva su configuración habitual. La [actualización a TypeScript 7](develpment/evidence/typescript7-update-20261012.md)
registra las versiones y migraciones actuales. Los tests de integración usan exclusivamente su
infraestructura aislada y sus bases desechables, según
[su guía](../packages/api/integration-tests/http/README.md). No ejecutarlos contra
`marketplace_local`.

## Verificación realizada

- PostgreSQL y Redis quedaron saludables; los datos persistieron tras reiniciar
  PostgreSQL y la API respondió correctamente en `/health`.
- `pnpm db:migrate` confirmó que las migraciones y enlaces estaban al día.
- `pnpm lint`, `pnpm typecheck` y `pnpm build:api` terminaron correctamente.
  Lint conserva 58 advertencias existentes en el backend.
- Las tres imágenes locales respondieron con HTTP 200 y los mismos hashes que
  los archivos originales. Usuarios, credenciales, vendedores y pedidos
  conservaron sus fingerprints después de arrancar la API.
- Agregar al carrito existente desde el navegador tardó **455 ms**. Una prueba
  por SDK de región, creación de carrito y agregado tardó **885 ms**. La petición
  original desde el navegador, incluyendo creación de carrito, tardó **28,35 s**;
  estas mediciones no constituyen un benchmark de condiciones idénticas.
- Las suites de integración no se ejecutaron: requieren PostgreSQL y Redis
  aislados de QA, que no estaban levantados. Se verificó el flujo real de carrito
  y se devolvió el carrito del navegador a su cantidad inicial.
- La reindexación local de Algolia terminó correctamente: 2 productos elegibles,
  con 4 registros por índice contando sus proyecciones por tienda. Se verificaron
  búsqueda, orden por precio, novedades, filtro de precio y resultado vacío por
  API; `/search?q=Producto` mostró los dos productos en el navegador. Los hashes
  de registros y configuración del índice anterior y sus tres réplicas
  coincidieron antes y después de la configuración local. El recibo está en
  `algolia-local-verification.json`, dentro de la carpeta privada de respaldo.
