# usapeek

El [registro de renombrado](docs/operations/usapeek-rename-2026-10-05.md) documenta
los nombres, URLs, callbacks y límites de despliegue actuales.

Marketplace con storefront, panel de operador y panel de vendedor independientes sobre un backend modular Mercur/Medusa. El alcance obligatorio **F01–F12 / Phase 1–6 está DONE**, con **Financial Readiness: PASS para Stripe TEST, USD y operación manual**. Incluye histórico de comisiones, liquidación, recuperación y reporting. Ese cierre no certifica pagos reales ni preparación de producción.

Documentación vigente actualizada el **6 de octubre de 2026**. Pagos permite elegir liberación Manual o Automático y configurar una espera de 0–365 días, con opciones Inmediato, 3 días y Una semana, un campo contiguo para escribir otra cantidad y valor inicial de 3. El nuevo plazo afecta solo a futuras finalizaciones; los relojes existentes conservan sus fechas. La ampliación tiene pruebas aisladas de configuración y persistencia; el recorrido completo del pedido TEST #16 con sus 72 horas originales permanece **NEEDS VERIFICATION** y su seguimiento está pausado por el cambio de entorno. La copia local usa PostgreSQL Docker y un índice Algolia independiente; su modo de liberación se verificó en Manual. Los resultados y sus límites están en el [progreso](docs/develpment/development-progress.md), separado de la auditoría histórica del 13–14 de septiembre.

El pedido TEST #16 ya está capturado y completado, sin transferencia anticipada.
Su plazo vence el **6 de octubre a las 12:51 de Uruguay**; el
[seguimiento integral](docs/develpment/evidence/automatic-settlement-e2e-20261003.md)
registrará la transferencia automática y la ausencia de duplicados.

## Continuar el desarrollo

Leer en este orden, junto con las instrucciones aplicables de `AGENTS.md`:

1. [Auditoría de cierre](docs/develpment/development-completion-audit.md): evidencia, F01–F17 y criterio financiero.
2. [Plan de implementación](docs/develpment/development-implementation-plan.md): seis fases, dependencias y criterios de salida para P0/P1.
3. [Progreso y handoff](docs/develpment/development-progress.md): estado actual, verificaciones y siguiente acción.

Las seis fases obligatorias están cerradas. La siguiente verificación funcional corresponde a la extensión automática de 72 horas; el estado mutable se registra en el archivo de progreso. La auditoría no se reescribe al resolver hallazgos. La carpeta `docs/develpment` conserva el nombre solicitado para el handoff. El [índice documental](docs/README.md) distingue guías vigentes de planes e informes históricos.

## Arquitectura

| Área                 | Ubicación                              | Función                                                               | URL local                         |
| -------------------- | -------------------------------------- | --------------------------------------------------------------------- | --------------------------------- |
| Storefront           | `apps/web`                             | Catálogo, cuenta, carrito, checkout y solicitud de vendedor           | `http://localhost:3000`           |
| Admin                | `apps/admin`                           | Operación del marketplace, revisión de vendedores, catálogo y pedidos | `http://localhost:7000/dashboard` |
| Vendor               | `apps/vendor`                          | Ofertas, inventario, almacén, envíos, pedidos y cuenta Connect        | `http://localhost:7001/seller`    |
| API / worker         | `packages/api`                         | Mercur 2.3.7 / Medusa 2.21.2; modos server, worker y shared           | API: `http://localhost:9000`      |
| Sistema visual       | `packages/ui`                          | Componentes, tokens y motion canónicos para los tres frontends        | —                                 |
| Tema                 | `packages/theme-sync`                  | Contrato y sincronización de preferencias visuales                    | —                                 |
| Contratos onboarding | `packages/vendor-onboarding-contracts` | Contratos de transporte compartidos del alta de vendedor              | —                                 |

Las aplicaciones usan Next.js 16.4.0, React 19 y TypeScript 7.0.2. Se comunican con las APIs mediante SDKs; no acceden directamente a PostgreSQL o Redis. El admin Vite integrado está desactivado porque el operador usa su propia aplicación Next.js. PostgreSQL/Supabase persiste datos y Redis participa en caché, eventos, workflows y locks; producción lo provisiona dentro de Railway.

Hay un único workspace pnpm y lockfile raíz. Las versiones, overrides y patches vigentes están en [package.json](package.json), [pnpm-workspace.yaml](pnpm-workspace.yaml) y `pnpm-lock.yaml`; consultar esos contratos antes de actualizar dependencias.

## Alcance implementado y límites

- **Cliente:** catálogo con ofertas reales, categorías y continuidad de resultados, búsqueda Algolia con filtros/paginación, cuenta, favoritos, carrito, checkout, confirmación e historial de pedidos. Los resúmenes conservan el total backend con descuentos e impuestos (F10/F11 cerrados).
- **Vendedor:** solicitud desde una cuenta de comprador y revisión administrativa, portal autenticado, catálogo maestro y ofertas propias, imágenes, inventario, un almacén aprobado, envíos y preparación/seguimiento de pedidos. El registro genérico de sellers permanece desactivado deliberadamente.
- **Operador:** autenticación y controles conectados al backend, revisión de solicitudes y vendedores, catálogo, pedidos y configuración de comisiones. El dashboard financiero presenta ventas de mercancía, comisiones, resultado después de tarifas y pendiente de liquidar, con detalle y conciliación; los costes desconocidos permanecen explícitos.
- **Dinero:** checkout USD/Estados Unidos con Stripe TEST, autorización compartida por carrito, captura por operador, cancelación y reembolsos por tienda, incluida reversión proporcional de transferencias verificadas. Snapshot original inmutable, precisión al centavo, validación de comisiones, journal, protección de escritores, liquidación y recuperación general completan F01–F08. La extensión automática conserva estos controles y espera 72 horas desde la observación servidor de finalización; transfiere al saldo Connect, no acredita un depósito bancario.
- **Integraciones:** Google OAuth, correo Resend, Algolia, imágenes mediante almacenamiento S3 compatible de Supabase y Stripe Connect se registran según configuración. Su presencia en código no acredita la configuración o entrega remota de cada entorno.

La comisión es configurable en backend; cero o ausencia de regla bloquean la venta, y los cambios futuros no alteran el snapshot original. No equiparar GMV, comisiones, transferencias al connected account y payouts bancarios. Los filtros financieros usan `America/Montevideo`. Consultar el [flujo financiero](docs/order-finance.md) y el progreso antes de modificar pagos o métricas.

## Requisitos y entorno local

- Node.js compatible con el mínimo declarado (`>=24.0.0`) y las dependencias instaladas.
- pnpm 12.11.2, declarado en `packageManager`; usar exclusivamente pnpm.
- Docker disponible para PostgreSQL y Redis locales. La configuración de desarrollo y la copia de Supabase están descritas en [desarrollo local](docs/local-development.md). Redis acepta `redis://` en redes privadas confiables, como Railway, y `rediss://` para conexiones TLS externas.

Las credenciales backend van en el `.env` ignorado de la raíz. Medusa encuentra esa raíz desde fuente o artefacto compilado. No copiar secretos a documentación, código ni variables `NEXT_PUBLIC_*`.

| Configuración         | Variables / referencia                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API básica            | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`; secretos de firma distintos, no placeholders y de al menos 32 caracteres                                                                              |
| Orígenes y procesos   | `STORE_CORS`, `ADMIN_CORS`, `VENDOR_CORS`, `AUTH_CORS`; `MEDUSA_WORKER_MODE` (`shared` por defecto local)                                                                                                         |
| Frontends             | `NEXT_PUBLIC_MEDUSA_BACKEND_URL`; storefront además `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, asociada al canal correcto                                                                                              |
| Login y correo        | [Autenticación](AUTHENTICATION.md) y [Google OAuth](docs/google-auth.md)                                                                                                                                          |
| Stripe / Connect | `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PAYOUT_WEBHOOK_SECRET`, `VENDOR_PUBLIC_URL`; TEST es el modo por defecto. La [preparación LIVE de main](docs/operations/stripe-live-main.md) permanece desactivada. No habilitar jobs financieros como parte del arranque básico. |
| Búsqueda              | `ALGOLIA_APP_ID`, `ALGOLIA_API_KEY`, `ALGOLIA_PRODUCT_INDEX`; [guía Algolia](docs/algolia-search.md)                                                                                                              |
| Imágenes              | `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`, `SUPABASE_STORAGE_BUCKET`; [configuración fuente](packages/api/src/lib/file-storage-configuration.ts) |

Para storefront local, `apps/web/.env.local` admite solo configuración pública. Los paneles también necesitan su URL pública del backend en el entorno Next; seguir los [README admin](apps/admin/README.md) y [README vendor](apps/vendor/README.md). Las integraciones condicionales tienen requisitos adicionales: las variables mínimas no bastan para probar correo, imágenes, búsqueda o checkout completo.

## Instalar y ejecutar

```bash
pnpm install
pnpm dev
```

Antes del primer arranque, configurar el entorno y verificar las migraciones de la base seleccionada. `pnpm db:migrate` **modifica esa base**: ejecutarlo como paso explícito contra el destino de desarrollo autorizado, siguiendo las skills/instrucciones de migraciones. Arrancar no crea por sí solo regiones, vendedores aprobados, ofertas, stock, opciones de envío o cuentas Stripe aptas para comprar.

`pnpm dev` levanta PostgreSQL y Redis con Docker, espera que estén disponibles e inicia API, web, admin y vendor. `pnpm dev:api` también prepara ambos servicios. El modo API local `shared` incluye trabajo asíncrono; no hace falta iniciar otro worker para ese mismo modo. Los comandos `dev:web`, `dev:admin` y `dev:vendor` ejecutan sólo su aplicación. La API ofrece `/health`; los accesos son `/login` (admin) y `/seller/login` (vendor), con autenticación real.

## Verificación

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm peers check
```

`lint:*`, `typecheck:*` y `build:*` tienen variantes `web`, `admin`, `vendor` y `api`, además de lint y typecheck para `ui`. Ejecutar las comprobaciones del área modificada: la lista anterior no obliga a repetir todo el repositorio por cada cambio.

Los tests unitarios y sus comandos se eliminaron a petición del usuario. No existe un comando general `pnpm test`; se conservan las integraciones HTTP y de módulos con ejecución explícita.

Para integración, configurar primero la infraestructura aislada y los opt-ins de la [guía](packages/api/integration-tests/http/README.md), y ejecutar el archivo pertinente con `pnpm test:api:integration:http --runTestsByPath <archivo>` o `pnpm test:api:integration:modules --runTestsByPath <archivo>`. Por ejemplo, los cambios de moderación usan `catalog-permission.spec.ts`; los cambios de migraciones o permisos SQL usan `database-hardening.spec.ts` y los módulos afectados. Si se necesitan varias suites HTTP, ejecutarlas en procesos separados para evitar acumular memoria.

Para cambios transversales, ampliar la selección a los otros dominios afectados, con los opt-ins necesarios. No ejecutar todas las integraciones por defecto para ajustes visuales o cambios localizados. Las pruebas con Stripe TEST externo requieren su lanzador específico y solo corresponden a cambios de esa integración. Un cambio exclusivamente documental necesita revisión de formato, enlaces y diff; no requiere builds de aplicaciones. No tratar scripts operativos de QA como pruebas unitarias ni ejecutarlos contra datos compartidos sin comprobar su alcance.

Los resultados históricos están fechados en informes y auditoría. No constituyen verificación del siguiente cambio: cada fase exige registrar comandos, resultados y verificaciones pendientes en el handoff.

El cierre de limpieza del 2026-10-03 retiró 185 archivos de tests unitarios y conservó 15 suites de integración, con 113 comprobaciones PASS; lint, tipos, builds y dependencias pares también PASS. Todos los cambios se publicaron en `develop`, commit `e3a28e3`. Son resultados de esa revisión, no garantías permanentes del árbol actual; consultar la [evidencia de limpieza](docs/develpment/evidence/repository-cleanup-20261003.md).

## Sitemap y robots

La tienda publica `/sitemap.xml` con la portada y todos los productos de la Store
API, leídos por páginas con el SDK existente. Usa el mismo `NEXT_PUBLIC_SITE_URL`
que los metadatos sociales. `lastmod` proviene de `updated_at` válido; no se
inventan fechas para la portada. Las búsquedas, legales en revisión, accesos,
cuenta, carrito, checkout y seguimiento quedan fuera del sitemap.

El sitemap se genera al solicitarlo, sin consultar el backend durante el build
ni mantener una copia persistente del catálogo. Si falla la API o una página
queda incompleta, responde con error para que el rastreador reintente; no publica
un sitemap parcial como si el catálogo estuviera vacío. Un archivo admite hasta
49.999 productos más la portada; antes de superar el límite de 50.000 URLs del
protocolo se deben dividir los sitemaps, sin truncar silenciosamente el catálogo.

`/robots.txt` de la tienda permite el rastreo excepto `/api/` y anuncia el sitemap.
Las páginas públicas con `noindex` permanecen rastreables para que el buscador
lea esa etiqueta. Admin y vendedores publican `Disallow: /`, además de su
`noindex` existente. Estas directivas no sustituyen la autenticación.

Verificar manualmente los metadatos, `robots.txt` y `sitemap.xml` tras cambiar su generación.

## Definiciones de infraestructura existentes

[.railway/README.md](.railway/README.md) documenta los cinco servicios, comandos y variables. El worker reutiliza el backend; `pnpm build` compila cada aplicación una vez. Los artefactos backend se preparan con `build:api:deploy` / `build:worker:deploy` y tienen comandos `start:*` independientes.

Estas definiciones no certifican preparación para producción. La preparación LIVE requiere modo explícito, una cuenta principal verificada y una activación separada; cambiar solamente las claves se rechaza. Main permanece sin credenciales y con LIVE desactivado. La operación/recuperación con dinero real requiere validación adicional; ver el [procedimiento de activación](docs/operations/stripe-live-main.md).
