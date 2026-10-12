# Verificación de permisos de catálogo — 2026-10-03

Resultado: **PASS** para el permiso Supervisado/Autorizado por tienda. Este
informe no cambia la certificación financiera, el plazo del pedido TEST #16 ni
el estado de preparación de producción.

## Comportamiento verificado

La autoridad reside en el módulo privado `catalogPermission`, no en metadata
editable por el vendedor. Solo operadores con `seller.update` pueden guardarla.
Sin registro, el modo es Supervisado; una lectura fallida no inventa un permiso.

Los siete casos HTTP del catálogo verificaron:

1. Autenticación, RBAC de lectura/escritura, validación estricta y rechazo de
   escalamiento mediante metadata del perfil.
2. Altas propuestas y cambios pendientes en Supervisado, conservando los datos
   actuales y las validaciones del catálogo.
3. Publicación y edición inmediatas en Autorizado, con acciones, estados y
   auditoría nativos de Mercur.
4. Alta, edición y eliminación de variantes; atributos e imágenes propias,
   rechazando imágenes ajenas, opciones inválidas e inventario maestro indebido.
5. Revocación efectiva para solicitudes posteriores y propuestas antiguas sin
   aprobar al conceder el permiso.
6. Edición del catálogo publicado accesible, aislamiento de productos privados
   ajenos y rechazo de contexto de tienda falsificado.
7. Dos tiendas autorizadas intentan añadir simultáneamente la misma combinación
   de variante a un producto compartido: una solicitud se confirma y la otra se
   rechaza, sin duplicados ni cambios pendientes huérfanos.

Se reutilizan los workflows nativos de creación, staging y confirmación. No se
añadieron hooks. El lock por tienda serializa el permiso y sus escrituras; el
lock adicional por producto evita carreras entre tiendas del catálogo compartido.

## Gates ejecutados

| Comprobación                                                                           | Resultado                                                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                                                                            | PASS, cero errores; 57 avisos existentes del backend                                                   |
| `pnpm typecheck`                                                                       | PASS                                                                                                   |
| `pnpm build`                                                                           | PASS en web, admin, vendor y API                                                                       |
| `pnpm peers check`                                                                     | PASS                                                                                                   |
| Contratos de catálogo y finanzas: `catalog:contracts:check`, `finance:contracts:check` | PASS                                                                                                   |
| Integraciones completas API, con todos sus opt-ins aislados                            | 120 casos PASS, 16 suites, cero omitidos                                                               |
| Harness externo de acciones/lecturas admin                                             | 17 casos PASS                                                                                          |
| Navegador local                                                                        | Columna y detalle de Tiendas, selección y habilitación de Guardar; formulario vendor con CTA coherente |

El build vuelve a generar los tipos; el typecheck API posterior también pasó.
Cambios adicionales del admin aparecidos durante esta sesión recibieron sus
checks correspondientes antes del commit que incluye los cambios pendientes.
Por instrucción del usuario, `apps/admin/tests/product-review-commerce.test.ts`,
creado en una tarea paralela, se conserva localmente y queda fuera de ese commit.
No se hace push.

La integración usó PostgreSQL y Redis locales desechables con TLS verificado,
DBs UUID del runner y Redis DB15. Todos los proveedores externos y los jobs
financieros quedaron desactivados únicamente en los procesos de prueba.
Los 56 procesos supervisados terminaron, con cero conexiones prohibidas y
1.672 conexiones TLS verificadas. `.env`, los manifiestos protegidos y el Redis
habitual conservaron su identidad. Después se retiraron exactamente los dos
contenedores, cuatro volúmenes y red temporales; queda `marketplace-v2-redis-1`.

Ensayos preliminares se conservaron: dos expectativas HTTP de imágenes ajenas
usaban 403, mientras el error nativo `not_allowed` se serializa como 400. Se
corrigieron las aserciones, sin relajar la validación; el resultado final es 7/7.

## Migración habitual

`Migration20261003173018` fue generada mediante `medusa db:generate
catalogPermission`. Hash SHA-256 de la fuente desplegada:
`76fcd404e26f98338f8a22d65ff2eff4f7b2178b2792f826f3121bbe4950869c`.

El preflight nativo readonly enumeró 56 módulos y confirmó exclusivamente esa
migración pendiente. Se ejecutó con `db:migrate --skip-links --skip-scripts
--concurrency 1`, admitiendo escrituras únicamente durante la migración exacta
del módulo de permisos. Se preservaron fuentes y configuración, con TLS
verificado y sin proveedores externos. El ledger nativo es compartido:
`public.mikro_orm_migrations`.

La auditoría SQL posterior, en una transacción readonly, confirmó:

- Una entrada del ledger para la migración nueva.
- Tabla con RLS habilitado, cero políticas y cero grants PUBLIC.
- `anon` y `authenticated` sin privilegios de tabla.
- Cero filas de permisos: ninguna tienda recibió Autorizado durante el QA local.
- Reloj del pedido TEST #16, operaciones financieras y datos de tiendas idénticos
  a la auditoría previa. `.env` permaneció idéntico.

El helper de auditoría corrigió una aserción preliminar: `pg_stat_ssl` representa
la sesión del servidor detrás del pooler y reportó false. La conexión del cliente
conservó cifrado, verificación de CA y hostname en todas las lecturas; no se
desactivó ni relajó la validación TLS.

## Procedencia y límites

Evidencia externa bajo el directorio privado `marketplace-catalog-20261003` de
Codex: `catalog-verification-summary.json`, corrida `catalog-all-native-1`,
`catalog-permission-native-3`, `catalog-generate-native-1`,
`catalog-native-preflight-1`, `catalog-native-migrate-1`, auditorías
`catalog-audit-before-4`/`catalog-audit-after-1` y captura
`stores-catalog-permission.jpg`. El harness admin está bajo
`marketplace-cleanup-20261003/catalog-permission-admin-private-harness-result.json`.
Estos archivos privados no se incorporan al repositorio.

El navegador no concedió permisos a tiendas existentes ni envió productos.
Los guardados y la publicación efectiva se verificaron mediante HTTP autenticado
en fixtures aislados; los mensajes del vendedor dependen del estado real que
devuelve el backend. La publicación no crea ofertas, precio, stock o envíos.
La prueba financiera del pedido TEST #16 sigue esperando el vencimiento original
del 6 de octubre de 2026, 12:51:00.416 America/Montevideo.
