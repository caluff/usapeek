# Permiso de catálogo por tienda

En Admin → Tiendas (`/dashboard/stores`), la columna **Permiso de catálogo**
permite elegir **Supervisado** o **Autorizado** y guardar el cambio. El mismo
control está en el detalle de la tienda. Requiere un operador con permiso
`seller.update`; la lectura requiere `seller.read`.

| Modo        | Productos nuevos                                       | Cambios nuevos                                                           |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| Supervisado | Quedan propuestos para revisión del admin.             | Se conserva el producto actual hasta la aprobación del admin.            |
| Autorizado  | Se publican mediante la confirmación nativa de Mercur. | Se confirman y aplican mediante el flujo nativo, sin revisión del admin. |

Todas las tiendas empiezan en Supervisado. Conceder el permiso no aprueba
solicitudes que ya estaban pendientes. Revocarlo vuelve a exigir revisión para
las solicitudes siguientes; no revierte publicaciones anteriores. Una solicitud
en curso termina bajo el permiso vigente al obtener su lock; el cambio de
permiso espera ese mismo lock.

La autorización cubre contenido, categorías admitidas, imágenes propias,
variantes y atributos de los productos que la tienda ya puede editar. El catálogo
publicado es compartido: también puede abarcar productos publicados accesibles
a esa tienda. No concede acceso a productos privados de otra tienda ni evita
validaciones de imágenes, combinaciones, membresía, estado operativo o RBAC.
Eliminar un producto completo conserva el comportamiento nativo anterior.
Publicar un producto tampoco crea una oferta vendible ni configura precio,
stock, pagos o envíos.

## Backend y contratos

- El módulo privado `catalogPermission` guarda `seller_id`, `mode` y el operador
  `changed_by`, con timestamps. La ausencia de una fila significa Supervisado;
  un fallo de lectura se propaga y no se presenta como un permiso conocido.
- El permiso no se obtiene de `seller.metadata`: editar el perfil no permite
  concederse autorización. La tabla tiene RLS y no concede permisos a PUBLIC,
  `anon` o `authenticated`; los clientes usan las rutas autenticadas del backend.
- `GET /admin/catalog-permissions?seller_ids[]=…` devuelve
  `{ catalog_permissions: [{ seller_id, mode }] }`, con un máximo de 100 IDs.
- `POST /admin/sellers/:id/catalog-permission` acepta exclusivamente `{ mode }`
  y devuelve `{ catalog_permission: { seller_id, mode } }`.
- `GET /vendor/catalog-permission` lee únicamente el permiso de la tienda activa.
- Los contratos públicos derivan de Zod y se exportan desde
  `@usapeek/api/catalog-permission-contracts`. Generación y comprobación:
  `pnpm --filter @usapeek/api catalog:contracts:generate` y
  `pnpm --filter @usapeek/api catalog:contracts:check`.

Los wrappers reutilizan creación, staging, confirmación, auditoría y compensación
nativos. No registran nuevos hooks ni desactivan la revisión global de Mercur.
El permiso y las escrituras de cada tienda comparten lock; las ediciones también
bloquean el producto compartido para revalidar combinaciones antes de aplicar
cambios concurrentes de distintas tiendas.

## Migración y verificación

La migración nativa `Migration20261003173018` crea la tabla y el índice único
por tienda, con RLS y ACL privados. Debe aplicarse mediante Medusa antes de usar
los nuevos endpoints. El progreso registra si fue aplicada al entorno habitual.

`packages/api/integration-tests/http/catalog-permission.spec.ts` verifica los
flujos HTTP, RBAC, publicación y auditoría nativas, variantes/atributos, imágenes,
revocación, solicitudes antiguas, catálogo compartido y concurrencia. Requiere
`CATALOG_PERMISSION_TESTS=disposable-local` y la infraestructura aislada descrita
en su cabecera; no debe ejecutarse contra la base habitual. No se añadieron
tests unitarios.

Los resultados ejecutados y sus límites se registran en
[progreso](develpment/development-progress.md).
