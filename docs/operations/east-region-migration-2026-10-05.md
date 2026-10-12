# Traslado a la costa este de Estados Unidos

Ejecutado el 2026-10-05 en horario de Uruguay, 2026-10-06 UTC. Alcance autorizado:
trasladar Supabase y los servicios de Railway a la costa este. PostgreSQL y
Storage siguen en Supabase; el plan futuro de trasladarlos a Railway es independiente.

## Destino y estado verificado

| Recurso | Destino | Estado final |
| --- | --- | --- |
| Supabase `usapeek` (`hbqenwcbsmpsjjfqjxac`) | North Virginia, `us-east-1` | Base y Storage copiados y verificados |
| Railway UI Store, UI Admin, UI Vendor | Virginia, `us-east4-eqdc4a` | Verificados y apagados a pedido del usuario |
| Railway Redis y `redis-volume` | Virginia, `us-east4-eqdc4a` | Proceso apagado; volumen existente conservado |
| Railway API y worker | Virginia, `us-east4-eqdc4a` | Arranque verificado y ambos apagados |

Supabase conserva la organización `caluff's Org` (`sfsbhckabxysmmdzosbl`). Railway
usa el proyecto `usapeek` (`0b5d408b-ca21-4f5a-88aa-5dabcfc4788b`) y el entorno
`production` (`5983ce74-6ba3-43b4-bd6f-6215817099e2`).

## Copia y verificación

- Se obtuvo un respaldo completo y otro de `public` desde un mismo snapshot
  consistente de la fuente. La fuente no se modificó.
- Se restauraron 218 tablas y 2.428 filas. Los fingerprints de las 218 tablas
  coincidieron antes de actualizar URLs. También se comprobó que la fuente
  seguía coincidiendo con ese snapshot antes del cambio de conexiones.
- Se preservaron propietarios, RLS en las 218 tablas, seis funciones propias
  y siete triggers. Se omitió la creación del esquema `public` ya existente y
  los tres default ACL de `supabase_admin`, administrados por la plataforma.
  Los permisos de aplicación del respaldo se restauraron.
- Se copiaron los tres objetos de `product-images` (210.213 bytes), conservando
  claves, contenido, MIME, caché y configuración pública del bucket. Los hashes
  SHA-256 de los archivos de origen y destino coincidieron.
- Se reemplazaron exclusivamente las tres URLs inventariadas en nueve filas:
  `catalog_image.url` (3), `image.url` (3), `product.thumbnail` (1) y
  `product_change_action.details` (2). La operación fue una sola transacción;
  el trigger de propiedad de imágenes se restauró antes del commit. La
  comparación inversa de URLs confirmó que no cambió ningún otro dato.
- Se verificó S3 con el par de credenciales del destino: listado, lectura y
  hashes de los tres archivos; subida, lectura y eliminación de un objeto de
  prueba propio. No quedó ese objeto en el bucket.
- Redis se trasladó mediante la migración nativa de Railway. El volumen
  `a6e4968f-0010-4831-8be9-61d3139a7ed3` conservó su identificador, montaje `/data`
  y capacidad de 5.000 MB. El nuevo proceso cargó 49 claves del respaldo RDB
  y quedó listo para conexiones.

La fuente usa PostgreSQL 17.6 y el destino 17.11: se conserva la versión mayor.
Supabase Auth no tenía usuarios y Vault no tenía secretos que trasladar; las
identidades Medusa están incluidas en las tablas de aplicación restauradas.
Las conexiones usadas para la copia y verificación validaron TLS y la CA.

El asesor de seguridad solo informó `RLS Enabled No Policy` (INFO) para las 218
tablas: es la misma estructura de acceso exclusivo por backend que en la fuente.
No se añadieron políticas públicas para eliminar ese aviso.
[Referencia del asesor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Configuración aplicada y límites

La variable compartida `DATABASE_URL` de Railway apunta al session pooler del
nuevo proyecto en `aws-0-us-east-1.pooler.supabase.com:5432`. API y worker usan
`${{shared.DATABASE_URL}}`. Ambos tienen el endpoint S3 del destino, región
`us-east-1`, bucket `product-images` y su par de credenciales de servidor.
UI Store tiene `NEXT_PUBLIC_PRODUCT_IMAGE_URL` del proyecto nuevo.
Se contrastaron los seis valores de conexión y Storage guardados en cada uno
de API y worker contra los valores verificados del destino, sin mostrar secretos.

Los cambios de variables se guardaron inicialmente con `skipDeploys`. Después,
el usuario autorizó activar los servicios para comprobarlos y apagar todos al
terminar. UI Store se reconstruyó con el nuevo origen público de imágenes.
API y worker arrancaron correctamente contra la configuración del destino.

El primer redeploy de API conservó la región del despliegue anterior y su
predeploy. Este último comprobó los módulos como actualizados y completó la
sincronización de links. Se retiró ese despliegue y se lanzó uno nuevo desde
el commit actual con la configuración de Virginia. Para esa prueba el
predeploy estaba vacío; al apagar API se restauró `pnpm db:migrate` para sus
futuros despliegues.

Se dejaron explícitamente desactivados `AUTH_EMAIL_ENABLED`,
`STRIPE_AUTOMATIC_JOBS_ENABLED` y `STRIPE_AUTOMATIC_SETTLEMENT_ENABLED` en API y
worker. No se enviaron correos ni se probaron operaciones financieras.

## Verificación temporal y apagado

Los seis servicios estuvieron online con una réplica y sin fallos durante la
comprobación. Se verificaron:

- API `/health`: HTTP 200. API y worker registraron conexiones correctas a Redis;
  el worker quedó listo en el puerto 8080.
- Región de Store API para Estados Unidos y USD, siete productos, una categoría
  y cuatro ofertas regionales. Las imágenes del catálogo apuntan al destino.
- Rutas protegidas de cliente, administrador y vendedor: HTTP 401 sin sesión.
- Inicio de storefront y ficha `producto-1`: HTTP 200, contenido del producto
  presente; catálogo y precios visibles también en el navegador.
- Los tres objetos públicos mantuvieron sus hashes. El optimizador de imágenes
  de Next.js respondió HTTP 200 para los tres archivos del destino.
- Admin y Vendor: login HTTP 200 con formulario de email y contraseña;
  inicio y rutas de pedidos protegidas redirigieron al login con `next` correcto.

Despliegues comprobados antes de apagarlos:

| Servicio | Deployment |
| --- | --- |
| API | `8ea4dc38-595e-472a-8b01-2c3eb240f3b5` |
| Worker | `0125451e-34c9-4b8e-92ac-7ab8c2a56052` |
| UI Store | `a3305463-533b-4be6-869b-aac968e3c094` |
| UI Admin | `ee43152a-4422-4192-9fee-c4c2959ed416` |
| UI Vendor | `76760359-50f8-49e9-ac89-86a745818bf2` |
| Redis | `85358c35-4576-465e-a5dd-3428cde6c1df` |

Se retiraron los despliegues de los frontends, worker y API, y finalmente Redis.
La comprobación final de Railway mostró seis servicios `offline`, cero
despliegues activos, ningún trabajo pendiente y ningún cambio staged. No se
eliminaron servicios, variables, dominios ni el volumen. El volumen sigue
montado en `/data` en Virginia y conserva 5.000 MB.

Después de la prueba, la fuente sigue coincidiendo exactamente con el snapshot.
El destino conserva 218 tablas, 2.428 filas y los mismos propietarios, RLS,
funciones y siete triggers habilitados. Además de las URLs trasladadas, el
arranque y los jobs de lectura actualizaron únicamente marcas de tiempo en
proyecciones financieras, `commerce_scan` y `rbac_policy`, y el estado del
proveedor de notificaciones al dejar el correo desactivado. Los importes y la
cantidad de filas no cambiaron.

No se verificaron sesiones autenticadas, compras, pagos, payouts ni envíos de
correo. La prueba confirma arranque, conectividad, catálogo, imágenes y controles
de acceso sin sesión; no sustituye la validación de esos flujos de negocio.

## Configuración local y comprobaciones

La definición local [.railway/railway.ts](../../.railway/railway.ts) declara la
región de los seis recursos y preserva las variables Storage para futuras
aplicaciones de IaC. No se aplicó el resto de la definición al proyecto remoto.
`pnpm lint` y `pnpm typecheck` pasaron; lint conserva 58 advertencias existentes
del API y cero errores. La evaluación pura del SDK confirmó seis recursos en
Virginia, una réplica por recurso y las variables preservadas.

El desarrollo local sigue usando su PostgreSQL y Redis locales independientes.
Los secretos nuevos se guardaron únicamente en el `.env` raíz ignorado y en las
variables de servidor de Railway. No se incluyen credenciales en este documento.

## Recuperación

El proyecto anterior `usapeek-backup-oregon` (`pwytfdbvcpamkthyesqr`) en Oregon,
`us-west-2`, sigue disponible para recuperación. No se eliminó ni pausó.
Los respaldos, inventarios, archivos copiados y conexión Railway anterior están
fuera del repositorio, en el directorio privado con ACL restringida:
`C:/Users/dcalu/.codex/tmp/east-region-20261005/private`.

Antes de revertir tras nuevas escrituras en el destino, reconciliar los datos:
volver a la fuente por sí solo perdería las escrituras posteriores al snapshot.
La fuente debe retirarse únicamente después de validar los flujos pendientes del
destino y de acordar su eliminación.
