# Actualización del repositorio a TypeScript 7

El repositorio usa TypeScript 7.0.2 para comprobar los seis paquetes TypeScript, compilar los tres frontends Next.js y emitir el backend Medusa. La actualización incluye las dependencias que habían quedado pendientes en la [revisión anterior](dependency-update-20261012.md). El mínimo de Node.js es ahora 24; el entorno de validación usa Node.js 26.9.0 y pnpm 12.11.2.

## Dependencias actualizadas

| Dependencia                 | Versión anterior                 | Versión actual | Alcance                                                                |
| --------------------------- | -------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `typescript`                | 5.9.3                            | 7.0.2          | Web, admin, vendor, API, UI y order-reference                          |
| `eslint`                    | 9.39.5                           | 10.12.0        | Los mismos seis paquetes                                               |
| `@medusajs/*`               | 2.18.0                           | 2.21.2         | SDKs, tipos, framework, CLI, módulos, flujos, pruebas y plugin de lint |
| `@mercurjs/*`               | 2.3.3                            | 2.3.7          | Core, tipos, documentación y proveedor de payouts                      |
| `stripe`                    | 15.12.0                          | 23.0.0         | Cliente propio del backend                                             |
| `ioredis`                   | 5.11.1                           | 6.0.0          | Clientes propios del backend                                           |
| `http-proxy-middleware`     | 3.0.7 directo                    | 4.2.0 privado  | Importación nativa de Mercur, declarada mediante package extension     |
| Familia `typescript-eslint` | Versiones transitivas anteriores | 8.71.1         | Resolución coherente mediante overrides                                |
| `@eslint/compat`            | No instalado directamente        | 2.1.1          | Adaptación de las APIs antiguas de plugins de lint                     |
| `@typescript/typescript6`   | No instalado                     | 6.0.2          | API JavaScript privada para herramientas existentes                    |

Las dependencias que ya estaban en latest, como Next.js 16.4.0, React 19.3.0 de los frontends, Tailwind CSS 4.3.3, SWC 1.16.18 y Jest 30.5.2, conservan esas versiones.

Se retiraron las dependencias directas `http-proxy-middleware`, `prop-types` y `vite` de la API. Mercur importa el proxy incluso con sus paneles desactivados, por lo que recibe su propia dependencia 4.2.0. Medusa conserva su bundler Vite como dependencia transitiva; el admin integrado continúa desactivado.

## Compilación y herramientas

TypeScript 7 aporta el compilador nativo y la comprobación paralela por defecto. Next.js 16.4 lo usa mediante su soporte de CLI. El parche de `@medusajs/framework` ejecuta ese mismo compilador al construir el backend, preservando el directorio de salida y las exclusiones originales. Una prueba compila un tipo que depende del tratamiento de puntos de código Unicode de TS7; otra comprueba que un error de tipos hace fallar la construcción. No se omiten errores de compilación. [Anuncio oficial de TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

TS7 no ofrece la API JavaScript clásica. Los generadores de contratos usan `@typescript/typescript6` para inspeccionar el AST; sus declaraciones se validan con TS7. El hook `.pnpmfile.mjs` enlaza una copia privada de esa API con ts-node, typescript-eslint y el plugin Medusa. Un parche de ts-node evita que su resolución inicial tome por error el TypeScript 7 del proyecto; conserva las opciones explícitas del llamador. Los comandos `tsc` de las aplicaciones siguen resolviendo TS7. Los valores explícitos `strict: false` y `types: ["node", "jest"]` de la API conservan sus opciones anteriores frente a los nuevos valores por defecto; `strictNullChecks` permanece activo.

Los plugins antiguos de ESLint se adaptan con `@eslint/compat`. Las pruebas comprueban que se conservan las reglas y que siguen detectando errores TypeScript, hooks incorrectos y problemas de accesibilidad. Las declaraciones de ambos paquetes CVA se comprueban con TS7 antes de ampliar el peer opcional del CVA utilizado por Medusa.

La preparación del despliegue copia los parches y `.pnpmfile.mjs` al backend independiente. El comando de instalación utiliza la opción de pnpm 12 `--config.ignore-scripts=true`.

El antiguo override del peer de `fdir` no se respetaba en la instalación independiente. El hook ahora asigna a fdir 6.1.1 su picomatch 3 privado, conforme al contrato publicado; las otras versiones conservan su resolución. La revisión de peers pasa tanto en el workspace como en el backend independiente.

## Compatibilidad de proveedores y dependencias nativas

El cliente propio Stripe 23 mantiene la versión de API `2024-04-10` y un reintento, los valores anteriores del SDK 15. `retrieveCurrent()` conserva la consulta `GET /v1/account`; los tipos se derivan de las propiedades públicas del SDK. Los proveedores nativos mantienen su Stripe 15.12.0 privado. Actualizar el SDK no debe actualizar incidentalmente la versión de la API Stripe. [Versionado de Stripe](https://docs.stripe.com/api/versioning).

Los clientes propios ioredis 6 conservan RESP2, keepalive desactivado y el reintento lineal anterior. Los seis consumidores nativos Medusa mantienen ioredis 5.11.1 mediante resolución privada, sin imponer ioredis 6 a implementaciones escritas para la versión 5. [Cambios de ioredis 6](https://github.com/redis/ioredis/releases/tag/v6.0.0).

React y React DOM 18.3.1 y sus tipos 18 siguen en la API porque `@medusajs/dashboard` y `@medusajs/ui` requieren esa generación. Los tres frontends usan 19.3.0. Esta dependencia nativa no obliga a rebajar React en Next.js.

## Adaptación de Medusa y Mercur

Los cuatro parches locales de Medusa/Mercur se portan a sus versiones nuevas; el quinto adapta ts-node. La adaptación conserva las 319 políticas de las rutas existentes, las comprobaciones de propiedad y la composición de hooks. Se declara explícitamente el módulo RBAC nativo porque el nuevo cargador calculaba su estado antes de leer la bandera habilitada del proyecto.

Mercur 2.3.7 crea pagos propios por pedido después de capturar el pago compartido. La adaptación congela los importes antes de capturar, normaliza las referencias sin contar dos veces el dinero y mantiene el tratamiento de capturas históricas. Los pagos propios pasan por los bloqueos financieros del carrito original; una referencia ambigua o un reparto incompleto requieren conciliación. Las regresiones cubren replay, respuestas perdidas, reembolsos parciales y protección de las operaciones nativas.

Las pruebas Jest aplican los parches nativos mediante el transformer público de Mercur. La cadena ESM de `sanitize-html` se transforma con SWC; no se sustituye por mocks ni se excluyen sus pruebas.

`db:migrate` utiliza la opción oficial nueva `MERCUR_DEV_CODEGEN=false`. Medusa inicia los hooks de módulos antes de buscar scripts pendientes; Mercur intentaba descargar y ejecutar un CLI de codegen en ese punto. La opción evita esa espera durante migraciones y conserva la generación de desarrollo habitual.

## Base local

Se respaldó `marketplace_local` y se restauró su esquema de aplicación en una base desechable. Las 14 migraciones pendientes son aditivas; los enlaces e índices de búsqueda quedaron al día, sin scripts de datos pendientes. Después de validar esa copia, se aplicaron al destino local `localhost:5432`. Las 13 tablas financieras comparadas mantuvieron sus filas y fingerprints de todas las columnas anteriores. Se eliminaron la copia temporal y su Redis desechable; el respaldo privado se conserva fuera de Git.

La validación no modificó la base remota ni ejecutó operaciones financieras contra Stripe. Las pruebas HTTP utilizan PostgreSQL y Redis separados, con proveedores locales de prueba y guard de red.

## Validación

| Comprobación                            | Resultado                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                             | Pasa; 49 warnings existentes en la API, sin errores                                                            |
| `pnpm typecheck`                        | Pasa en los seis paquetes con TS7                                                                              |
| `pnpm test`                             | 24 pruebas de herramientas raíz, 15 de herramientas API y 378 unitarias API; todas pasan                       |
| Pruebas frontend, UI y branding         | 276 pruebas pasan                                                                                              |
| Builds Next.js web, admin y vendor      | Los tres pasan                                                                                                 |
| `pnpm build:api:deploy`                 | Pasa; emisión nativa TS7 e instalación independiente de producción                                             |
| Smoke del backend independiente         | Importación de Mercur, API JS de ts-node, versiones Redis y opciones Stripe correctas, sin conexiones externas |
| Diez generadores de contratos `--check` | Pasan sin regenerar contratos                                                                                  |
| Instalación con lockfile congelado      | Pasa                                                                                                           |
| `pnpm peers check`                      | Sin incompatibilidades en workspace y artefacto independiente                                                  |
| HTTP de catálogo                        | 21 pruebas pasan con autorización, propiedad, concurrencia y compensación nativas                              |
| HTTP financiero                         | 5 pruebas pasan; 2 casos reforzados pasan de nuevo con replay histórico y mensajes exactos del guard           |
| Migraciones locales                     | 14 aplicadas; integridad financiera preservada                                                                 |

La consulta recursiva `pnpm outdated` deja únicamente React, React DOM y sus tipos 18 de la API fuera de latest, por sus consumidores nativos. Permanecen seis subdependencias deprecadas de terceros (`cron-parser`, dos generaciones de `glob`, `inflight`, `lodash.isequal` y `uuid`), sin forzar versiones incompatibles en esos paquetes. El aviso nativo de Mercur sobre un `when` sin nombre en `apply-product-change-actions` se corrigió posteriormente en el parche versionado, asignando el nombre estable `pc-delete-products-with-offers`. La comprobación de composición confirmó que el grafo conserva sus operaciones y elimina el aviso.
