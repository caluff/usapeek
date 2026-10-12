# Auditoría y refactorización del repositorio

Fecha: 11 de octubre de 2026.

Se aplicaron mejoras de reutilización, organización y rendimiento en las tres
aplicaciones y en las herramientas de generación de contratos. Se retiraron
18 archivos sin consumidores y cuatro declaraciones redundantes de dependencias.
Las modificaciones conservan los contratos generados y las implementaciones de
los formularios extraídos; no cambian modelos, migraciones ni flujos financieros.

## Alcance y método

El inventario inicial contenía 1.694 archivos versionados y 1.405 archivos
TS, TSX, JS y CSS, incluidos tests y declaraciones generadas. Se examinaron la
estructura, manifests, configuración, tamaños y duplicados del repositorio;
la revisión detallada se concentró en los consumidores, componentes, utilidades,
generadores y superficies sensibles que justificaban cambios o una reserva.
Este alcance no equivale a una validación semántica de cada archivo ni a una
auditoría de seguridad exhaustiva.

Las eliminaciones se contrastaron con imports y reexports, imports dinámicos y
`require` literales, búsquedas globales, convenciones de Next.js y reemplazos
activos. Los adaptadores del sistema visual, rutas implícitas del framework,
scripts operativos, migraciones y pruebas se conservaron cuando correspondía.
Una segunda revisión independiente comprobó los diffs entre áreas.

Las skills `building-with-medusa`, `building-storefronts` y
`storefront-best-practices` no estaban instaladas en los directorios disponibles.
Se utilizaron las instrucciones del repositorio, las fuentes y tipos instalados,
la documentación local de Next.js 16.3.4 y la skill `react-best-practices`.
Los cambios del backend se limitaron a tooling y su runner de pruebas.

## Problemas y mejoras aplicadas

| Área           | Problema comprobado                                                                | Cambio y beneficio                                                                            | Riesgo |
| -------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| Paneles        | Componentes de demostración, métricas y tablas antiguas sin consumidores           | Retirada de archivos y exports sustituidos por vistas operativas                              | Bajo   |
| Sistema visual | Dos implementaciones idénticas del selector de tema                                | `ThemeSetting` en `packages/ui`, con adaptadores que preservan `AccountAppearance`            | Bajo   |
| Vendor         | Creación y edición de productos en un archivo de 573 líneas                        | Separación por responsabilidad conservando la fachada y los cuerpos de las funciones          | Bajo   |
| Storefront     | Resolución del favorito repetida entre catálogo y búsqueda                         | Un componente con la misma autenticación, skeleton y frontera Suspense                        | Bajo   |
| Storefront     | Cada producto recorría todas las ofertas en cuatro listados                        | Un índice por producto en cada lista, conservando orden y referencias                         | Bajo   |
| Carrito        | La misma descripción de variante en tres vistas                                    | Un helper que conserva opciones, títulos y descarte de valores por defecto                    | Bajo   |
| Cuenta         | Dos filas de navegación con el mismo markup                                        | Composición local mediante `AccountNavLink`                                                   | Bajo   |
| Favoritos      | Productos y ofertas se esperaban en secuencia y el título esperaba todos los datos | Lecturas en paralelo después de autenticación y región; Suspense limitado al contenido remoto | Bajo   |
| Contratos      | Diez generadores repetían configuración TypeScript, renderizado y comprobación     | Helper común, mismos resultados y mensajes, seis regresiones conectadas al runner habitual    | Bajo   |
| Dependencias   | Declaraciones directas sin usos tras la migración a UI compartida                  | Retirada mediante pnpm y actualización limitada del lockfile                                  | Bajo   |

La extracción de formularios y del selector de tema se contrastó mediante AST:
los cuerpos coinciden con los originales, salvo el nombre del componente de
categorías. Los adaptadores de botones y ajustes ya apuntaban a las mismas
implementaciones compartidas. Las tablas, logos, diálogos y tokens que ya estaban
centralizados no recibieron otra capa de abstracción.

## Principales archivos modificados

- `packages/ui/src/theme-setting.tsx` y los adaptadores
  `apps/{admin,vendor}/src/features/account/appearance.tsx`.
- `apps/vendor/src/features/catalog/product-form.tsx`, `product-create-form.tsx`,
  `product-edit-form.tsx`, `product-form-types.ts` y `product-category-group.tsx`.
- `apps/vendor/src/features/catalog/presentation-editor.tsx`: conserva el contexto
  y hook activos; elimina dos componentes sin consumidores.
- `apps/web/features/account/components/product-favorite-action.tsx`,
  `account-nav.tsx` y sus consumidores en catálogo y búsqueda.
- `apps/web/features/catalog/offers.ts`, sus pruebas y cuatro listados consumidores.
- `apps/web/features/cart/variant-description.ts`, sus pruebas y tres consumidores.
- `apps/web/app/account/favorites/page.tsx` y
  `apps/web/components/product-grid-skeleton.tsx`: carga local y reutilización del skeleton.
- `packages/api/scripts/contract-generation.cjs`, diez generadores y
  `scripts/__tests__/contract-generation.test.cjs`.
- `packages/api/package.json`: nuevo `test:contracts`, incluido en `test`.
- Manifests de las tres aplicaciones, export de UI y `pnpm-lock.yaml`.

## Código y dependencias retirados

Los 18 archivos eliminados sumaban 922 líneas:

- Admin: `components/admin/{demo-banner,empty-state,metric-card,review-queue-table}.tsx`,
  `features/vendor-applications/{pending-action,pending-status}.ts`,
  `hooks/use-mobile.ts` y `lib/demo-data.ts`.
- Vendor: `components/vendor/{demo-notice,empty-state,metric-card,recent-orders}.tsx`,
  `features/catalog/presentation-card.tsx`,
  `features/finance-reporting/{sale-row,sales}.tsx`, `hooks/use-mobile.ts` y
  `lib/demo-data.ts`.
- Web: `features/vendor-onboarding/components/application-reminder.tsx`.

También se retiraron el `pendingKey` del recordatorio, dos exports obsoletos del
editor de presentación y una variable `printer` sin uso del generador financiero.
Las vistas activas de ventas y notificaciones conservan sus propias implementaciones.

Se quitaron `class-variance-authority` como dependencia directa de las tres apps
y `radix-ui` como dependencia directa de admin. Son cuatro declaraciones de dos
paquetes; ambos siguen disponibles donde se utilizan, especialmente en
`packages/ui`. Web conserva Radix para su slider y vendor para su acordeón.
No se añadieron paquetes ni se actualizaron versiones.

## Métricas comparativas

Las cifras de líneas normalizan CRLF a LF y excluyen este informe.

| Medida                                                        | Antes      | Después      |
| ------------------------------------------------------------- | ---------- | ------------ |
| Archivos confirmados como obsoletos                           | 18         | 0            |
| Implementaciones de favorito para catálogo y búsqueda         | 2          | 1            |
| Implementaciones de descripción de variantes del carrito      | 3          | 1            |
| Implementaciones de fila de navegación de cuenta              | 2          | 1            |
| Implementaciones del selector de tema de los paneles          | 2          | 1 compartida |
| Archivo de composición `ProductForm`                          | 573 líneas | 15 líneas    |
| Diez generadores, contando el nuevo helper y excluyendo tests | 519 líneas | 388 líneas   |
| Asociación entre productos y ofertas por listado              | O(P × O)   | O(P + O)     |

La separación de `ProductForm` distribuye su código entre creación, edición,
tipos y categorías; las 558 líneas que salen de la fachada no son código eliminado.
El cambio completo comprende 60 archivos de código, pruebas y configuración:
31 modificados, 18 eliminados y 11 nuevos. La reducción neta es de 973 líneas,
incluyendo los helpers y tests nuevos. Estas cifras no acreditan una reducción
medida del bundle, de memoria o de latencia HTTP.

## Validación ejecutada

| Comprobación                                                               | Resultado                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm lint`                                                                | Exit 0; sin errores. API conserva 69 advertencias existentes |
| `pnpm typecheck`                                                           | PASS en los seis paquetes cubiertos por el script raíz       |
| Lint y typecheck web después del último cambio de favoritos                | PASS                                                         |
| `pnpm --filter @usapeek/web run test`                                      | 131 pruebas PASS, incluidas cinco nuevas                     |
| `pnpm --filter @usapeek/admin run test`                                    | 45 pruebas PASS                                              |
| `pnpm --filter @usapeek/vendor run test`                                   | 78 pruebas PASS                                              |
| `pnpm --filter @usapeek/api run test:unit`                                 | 39 suites y 308 pruebas PASS                                 |
| `pnpm --filter @usapeek/api run test:contracts`                            | 6 pruebas PASS                                               |
| Diez scripts `*:contracts:check`, incluido `contracts:check` de onboarding | PASS antes y después; declaraciones sin diferencias          |
| `pnpm test:ui`                                                             | 14 pruebas PASS                                              |
| `pnpm test:branding`                                                       | 8 pruebas PASS                                               |
| `pnpm --filter @usapeek/web exec tsx --test ../../.railway/https.test.mjs` | 13 pruebas PASS                                              |
| `pnpm peers check`                                                         | Sin conflictos                                               |
| `pnpm build`                                                               | PASS en web, admin, vendor y API                             |
| `git diff --check`                                                         | PASS                                                         |

Se comparó el markup SSR de navegación antes y después en 36 escenarios de
rutas, contadores y composición. Favoritos se comprobó con respuestas diferidas:
ambas lecturas comienzan antes de resolver cualquiera; éxito conserva el markup,
el vacío evita consultar productos y los errores de autenticación se propagan.
Son comprobaciones aisladas con stubs, no pruebas de navegador autenticado.

No se ejecutaron integraciones de persistencia ni Stripe externo: los cambios
del backend afectan generación de tipos, y no las rutas o workflows que esas
integraciones ejercitan. Tampoco se ejecutaron migraciones, QA financiera,
despliegues ni operaciones contra servicios externos. La paridad visual e
interacciones de los formularios y del tema se sustentan en equivalencia del
código, compilación y revisión; queda sin comprobar una sesión real de navegador
con autenticación y respuestas lentas.

## Advertencias y trabajo pendiente

| Prioridad              | Evidencia                                                                                                                              | Tratamiento                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Alta, por sensibilidad | `return-panel.tsx` y `return-operations.ts` son copias entre admin y vendor                                                            | Centralización separada con pruebas de permisos, devoluciones y errores; no mover lógica financiera a UI genérica                                |
| Alta, por sensibilidad | `commerce-automation/service.ts` tiene 1.994 líneas; `record-provider-facts.ts` 1.069; `provider-facts.ts` 988; `recovery-plan.ts` 901 | Dividir por responsabilidad con cobertura de persistencia, compensación y concurrencia                                                           |
| Alta, conectividad     | `medusa-config.ts` declara `ssl.rejectUnauthorized: false`; existe deuda TLS documentada                                               | Verificar configuración efectiva del driver, CA y destinos antes de cambiarla; no inferir el transporte efectivo sólo de esa opción              |
| Media                  | 69 warnings de Medusa: errores genéricos, imports internos e identificadores de workflows                                              | Revisar uno a uno. Cambiar errores puede alterar HTTP; cambiar IDs puede afectar ejecuciones persistidas; no aplicar `--fix` indiscriminadamente |
| Media                  | `getCurrentCustomer` se llama desde home, cabecera y algunas fichas sin deduplicación común por petición                               | Medir y comprobar invalidación y aislamiento de sesiones antes de añadir caché                                                                   |
| Media                  | El menú de perfil espera `getApplicationNavigation`; direcciones espera datos antes del encabezado                                     | Investigar latencia y semántica de redirecciones antes de cambiar la carga                                                                       |
| Media, producto        | Árbol de devoluciones del storefront sin conexión a una ruta activa                                                                    | Decidir su destino en trabajo funcional separado; no borrar ni activar durante la limpieza                                                       |
| Baja                   | Cinco SVG de plantilla sin referencias internas                                                                                        | Conservar: las URL públicas pueden tener consumidores externos                                                                                   |
| Baja                   | pnpm informó deprecaciones existentes de ESLint y cinco dependencias transitivas                                                       | Evaluar actualizaciones por compatibilidad y procedencia, fuera de esta refactorización                                                          |

Diez de los 69 warnings corresponden a scripts locales ignorados bajo
`packages/api/static/.tasks`; los otros 59 corresponden a archivos versionados.
No se eliminaron esos scripts operativos ni se desactivaron reglas para ocultar
advertencias. `medusa develop` ejecuta su lint con `quiet: true` en la versión
instalada: que no aparezcan warnings durante `pnpm dev` no significa que
`pnpm lint:api` esté libre de ellos.

Los 41 segundos del arranque original no se atribuyen a un cuello de botella
concreto con esta auditoría. No se instrumentaron tiempos de inicialización ni
se modificaron workers, conexiones o el modo de desarrollo para acelerarlo.

## Seguimiento: advertencias de la API

El seguimiento solicitado después de la refactorización corrigió 20 de las
69 advertencias iniciales. Las métricas y comprobaciones anteriores corresponden
a la refactorización original; el estado posterior de la API es el siguiente:

| Regla de Medusa                        | Antes | Después |
| -------------------------------------- | ----- | ------- |
| Identificador de workflow y nombre     | 15    | 0       |
| Identificador de step y nombre         | 3     | 0       |
| Imports internos                      | 6     | 5       |
| Errores genéricos                      | 45    | 44      |
| Total                                 | 69    | 49      |

Se alinearon 18 nombres internos en ocho archivos con los IDs que ya existían.
Los strings de IDs y los nombres públicos exportados se conservaron mediante
cinco aliases donde fue necesario. La comparación de AST del árbol completo,
normalizando sólo esos renombres y exports, confirmó equivalencia; también se
compararon todos los literales y los nombres públicos. No se cambió la
composición, compensación, autorización ni lógica de los workflows financieros.

En inventario, la superclase ahora procede del export público tipado
`@medusajs/medusa/inventory`. Una comprobación de carga real confirmó que es el
mismo constructor y prototipo que el import interno anterior. El error local
de separador codificado en `order-finance-middlewares.ts` ahora usa `MedusaError`;
ese error se captura y descarta inmediatamente, conservando el error fijo de
ruta inválida que recibe `next`.

Las 49 advertencias restantes se conservaron por los siguientes motivos:

| Contexto                              | Cantidad | Motivo |
| ------------------------------------- | -------- | ------ |
| Scripts CLI/QA financieros            | 26       | Guardas operativas y de conciliación; conservar tipos y diagnósticos actuales |
| Migraciones `down()`                  | 2        | Impiden revertir automáticamente el hardening existente |
| Arranque Google One Tap y runner Jest | 2        | Validación fuera de HTTP; el proveedor Google nativo también usa `Error` |
| Guardas de workflows financieros      | 4        | Cambiar la clase del error puede alterar clasificación y respuesta HTTP |
| Scripts locales ignorados `.tasks`    | 10       | Archivos operativos no versionados, conservados sin modificaciones |
| Imports internos de inventario y S3   | 5        | Medusa 2.18.0 no ofrece equivalentes públicos tipados para esas clases |

La regla de errores se aplica también a CLI y migraciones. Se verificó con el
middleware instalado que `Error` produce un HTTP 500 con mensaje genérico,
mientras que `MedusaError(UNEXPECTED_STATE)` conserva el HTTP 500 pero cambia
el tipo y expone el mensaje original. Por eso no se aplicó una conversión
masiva. No se desactivaron reglas ni se añadieron supresiones o dependencias.
Quedan 39 advertencias en archivos versionados y 10 en scripts locales ignorados.

Validación posterior a todos los cambios:

- `pnpm lint:api`: exit 0; 49 warnings, cero errores y ninguna advertencia nueva.
- `pnpm typecheck:api`: PASS.
- `pnpm test:api`: 40 suites y 316 pruebas unitarias PASS, más 6 pruebas de tooling.
- Las ocho regresiones de rutas malformadas y rutas que no requieren servicios
  pasaron antes y después del cambio, sin resolver servicios ni ejecutar workflows.
- `pnpm build:api`: PASS.
- `git diff --check`: PASS.

No se ejecutaron seeds, migraciones, QA financiera, integraciones con base de
datos ni operaciones Stripe. La equivalencia se comprobó mediante análisis de
código, identidad de clases, pruebas unitarias y compilación; no constituye una
validación de operaciones financieras reales.
