# Actualización de dependencias — 12 de octubre de 2026

Este informe conserva la primera actualización. Las incompatibilidades pendientes se resolvieron posteriormente en la [actualización a TypeScript 7](typescript7-update-20261012.md), que describe las versiones vigentes y su validación.

Se revisaron los nueve manifests del workspace y las versiones `latest` publicadas. Se actualizaron 21 paquetes externos distintos, con 56 cambios de versión resuelta en los importadores del lockfile, además de pnpm 12.0.0 → 12.11.2. Las dependencias con incompatibilidades identificadas conservaron su versión anterior, conforme a lo solicitado.

La comparación parte del estado local al iniciar esta tarea; conserva los cambios previos de refactorización y limpieza de warnings. Esta actualización modifica manifests, configuración de pnpm, lockfile y documentación, sin cambios adicionales al código de la aplicación. El lockfile se generó exclusivamente con pnpm.

## Versiones actualizadas

Las versiones anteriores de esta tabla son las realmente resueltas en el lockfile, aunque algunos manifests usaban rangos más antiguos.

| Paquete                   | Anterior        | Actual  | Alcance                           |
| ------------------------- | --------------- | ------- | --------------------------------- |
| `next`                    | 16.3.4          | 16.4.0  | Web, admin y vendor               |
| `eslint-config-next`      | 16.3.4          | 16.4.0  | Frontends, UI y order-reference   |
| `react`                   | 19.2.8          | 19.3.0  | Frontends y peers compartidos     |
| `react-dom`               | 19.2.8          | 19.3.0  | Frontends y peer de UI            |
| `@types/react`            | 19.2.18         | 19.3.0  | Frontends, UI y theme-sync        |
| `@types/react-dom`        | 19.2.5 / 19.2.7 | 19.3.0  | Frontends y UI                    |
| `@types/node`             | 24.13.3         | 26.6.5  | Frontends y API                   |
| `radix-ui`                | 1.1.2 / 1.6.7   | 1.8.0   | Web, vendor y UI                  |
| `lucide-react`            | 1.40.0          | 1.55.0  | Frontends y UI                    |
| `tailwind-merge`          | 3.6.0           | 3.7.0   | Frontends y UI                    |
| `@stripe/react-stripe-js` | 6.9.0           | 7.0.0   | Web                               |
| `@stripe/stripe-js`       | 9.15.0          | 10.0.0  | Web                               |
| `libphonenumber-js`       | 1.13.12         | 1.13.15 | Web y API                         |
| `algoliasearch`           | 5.56.0          | 5.59.0  | API                               |
| `resend`                  | 6.26.0          | 6.32.1  | API                               |
| `@swc/core`               | 1.16.1          | 1.16.18 | API                               |
| `jest`                    | 29.7.0          | 30.5.2  | API                               |
| `@types/jest`             | 29.5.14         | 30.0.0  | API                               |
| `tsx`                     | 4.23.13         | 4.23.15 | Frontends y theme-sync            |
| `prettier`                | 3.9.6           | 3.9.10  | Raíz                              |
| `railway`                 | 3.11.0          | 3.13.1  | SDK de infraestructura de la raíz |

`tailwindcss` y `@tailwindcss/postcss` ya resolvían 4.3.3, y `@swc/jest` ya resolvía 0.2.39. Sus rangos se actualizaron sin contarlos como nuevos cambios de versión instalada. El resto de dependencias que ya estaba en `latest` se mantuvo.

pnpm 12.11.2 está declarado en la raíz y los tres frontends, y se comprobó su ejecución mediante Corepack. Los peers de React de UI y theme-sync se alinearon con 19.3.0; React 18 de la API se conservó por los requisitos de Medusa.

## Versiones conservadas y motivo

| Grupo o paquete                        | Conservado                     | Latest revisado | Motivo                                                                                                                                      |
| -------------------------------------- | ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Paquetes `@medusajs/*`                 | 2.18.0                         | 2.21.2          | Mercur 2.3.3 exige core-flows `>=2.17 <2.19`; actualizar Medusa por separado falla al cargar el parche nativo de Mercur.                    |
| Paquetes `@mercurjs/*`                 | 2.3.3                          | 2.3.7           | El parche local de core no aplica a 2.3.7. La actualización exige migraciones y revisión de cambios financieros.                            |
| `react`, `react-dom` y tipos, solo API | 18.3.1; tipos 18.3.31 / 18.3.7 | 19.3.0          | Los paquetes Medusa y draft-order instalados requieren React 18.                                                                            |
| `eslint`                               | 9.39.5                         | 10.12.0         | Los plugins de Medusa y del conjunto Next no admiten ESLint 10 en sus peers. También eleva el mínimo de Node.                               |
| `typescript`                           | 5.9.3                          | 7.0.2           | TypeScript 7 elimina la API del compilador usada por los generadores locales, ts-node y Medusa; typescript-eslint admite TypeScript `<6.1`. |
| `vite`                                 | 5.4.21                         | 8.3.4           | El plugin de admin instalado requiere Vite 5; incluso su versión nueva revisada no admite Vite 8. Se conserva el override existente.        |
| `ioredis`                              | 5.11.1                         | 6.0.0           | Medusa declara peer de la versión 5; la 6 cambia el protocolo predeterminado a RESP3 y el código actual no fija ese protocolo.              |
| `http-proxy-middleware`                | 3.0.7                          | 4.2.0           | La versión 4 es ESM y exige Node `^22.15                                                                                                    |     | ^24 |     | >=26`, incompatible con el mínimo declarado del repo. No se encontró consumidor directo; la retención responde al contrato de compatibilidad, no a un fallo de ejecución demostrado. |
| `stripe`, servidor                     | 15.12.0                        | 23.0.0          | El SDK nuevo cambia la versión predeterminada de la API financiera. Los clientes actuales no fijan `apiVersion`.                            |

También se conserva el override `fdir@6.1.1>picomatch: 3.0.1`, porque ese fdir declara peer de picomatch 3. Las cuatro entradas de `patchedDependencies` y los archivos de patches existentes quedaron intactos.

Se descargaron los paquetes nativos nuevos fuera del repositorio y se comprobó cada parche con `git apply --check`: framework 2.21.2, payment 2.21.2 y payout-stripe-connect 2.3.7 admiten sus respectivos parches; **core de Mercur 2.3.7 falla** en RBAC, payouts, validadores y checkout. La aplicación necesita los hooks financieros del parche actual, por lo que no se eliminó para permitir la actualización.

Mercur 2.3.6 cambia la distribución de pagos por orden y 2.3.7 cambia la creación e idempotencia de payouts, además de requerir migraciones. La actualización de este grupo debe incluir el port de los patches, revisión de migraciones, autorización y pruebas financieras. Las correcciones publicadas en esas versiones también quedan pendientes de esa migración. Evidencia: [Mercur 2.3.6](https://github.com/mercurjs/mercur/releases/tag/v2.3.6), [Mercur 2.3.7](https://github.com/mercurjs/mercur/releases/tag/v2.3.7) y [Medusa 2.21.0](https://github.com/medusajs/medusa/releases/tag/v2.21.0).

Otros cambios incompatibles documentados: [TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [ioredis 6](https://github.com/redis/ioredis/releases/tag/v6.0.0), [http-proxy-middleware 4](https://github.com/chimurai/http-proxy-middleware/releases/tag/v4.0.0) y [changelog del SDK Stripe 23](https://github.com/stripe/stripe-node/blob/v23.0.0/CHANGELOG.md).

## Stripe del navegador

La pareja React Stripe 7 / Stripe.js 10 se actualizó tras comprobar que el storefront no usa las APIs eliminadas (`PaymentRequestButtonElement` y `paymentMethodTypes`). Los componentes y métodos utilizados siguen presentes, y tipos, pruebas locales y compilación del storefront pasan. Fuentes: [React Stripe 7](https://github.com/stripe/react-stripe-js/releases/tag/v7.0.0) y [Stripe.js 10](https://github.com/stripe/stripe-js/releases/tag/v10.0.0).

El salto cambia la familia de Stripe.js cargada a Endive. Stripe permite actualizar los SDK de cliente y servidor gradualmente, pero estas comprobaciones locales no sustituyen una validación de pagos contra Stripe TEST. No se ejecutaron pagos ni suites financieras externas. El SDK del servidor y los flujos financieros de la aplicación permanecen en sus versiones actuales. Véase [versionado de Stripe.js](https://docs.stripe.com/sdks/stripejs-versioning).

## Configuración de instalación

- Se actualizó la extensión de peers de Next a `next@16.4.0`.
- pnpm agregó excepciones de antigüedad para las versiones exactas de SWC 1.16.18 y Radix 1.8.0 con sus componentes. No se desactivaron globalmente las políticas de instalación.
- Se declaró `allowBuilds['@parcel/watcher'] = false`: se usan sus binarios publicados. El script inspeccionado solo compila cuando se solicita explícitamente una compilación desde fuente; la carga del binario de Windows se comprobó correctamente.
- SWC 1.16.18 pasó su instalación nativa y una transformación de TypeScript. La instalación final con lockfile congelado pasó con pnpm 12.11.2.

## Validación ejecutada

| Comprobación                                                       | Resultado                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                   | Aprobado                                                           |
| `pnpm peers check`                                                 | Sin conflictos de peers                                            |
| `pnpm outdated -r`                                                 | Solo quedan los grupos conservados de la tabla anterior            |
| `pnpm lint`                                                        | Aprobado; API: 0 errores, 49 warnings ya existentes                |
| `pnpm typecheck`                                                   | Aprobado en todos los paquetes incluidos por el comando raíz       |
| `pnpm build`                                                       | Web, admin, vendor y API compilados correctamente                  |
| `pnpm test:api`                                                    | 316 unitarios en 40 suites + 6 pruebas de generadores de contratos |
| `pnpm test:admin`                                                  | 45 pruebas aprobadas                                               |
| `pnpm test:vendor`                                                 | 78 pruebas aprobadas                                               |
| `pnpm test:web`                                                    | 131 pruebas aprobadas                                              |
| `pnpm test:ui`                                                     | 14 pruebas aprobadas                                               |
| `pnpm test:branding`                                               | 8 pruebas aprobadas                                                |
| Tests de HTTPS de Railway con `tsx --test`                         | 13 pruebas aprobadas                                               |
| Typecheck aislado de `.railway/railway.ts`                         | Aprobado con `tsc --noEmit --strict`                               |
| Descubrimiento Jest de integraciones con `--listTests --runInBand` | 22 suites HTTP y 7 de módulos reconocidas; sin ejecutarlas         |
| Identidad del constructor de inventario                            | Export público, clase nativa y superclass local coinciden          |
| `git diff --exit-code -- patches`                                  | Patches sin cambios                                                |
| `git diff --check`                                                 | Sin errores de whitespace                                          |

Total: **611 pruebas aprobadas**. No se ejecutaron migraciones, integraciones con persistencia, servicios remotos de Railway ni operaciones financieras externas. Se conservaron los procesos de desarrollo que ya estaban abiertos; reiniciar `pnpm dev` permite cargar las nuevas versiones.
