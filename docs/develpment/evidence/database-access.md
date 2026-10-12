# F06 — Backend-only database access

Fecha: 2026-09-19. Estado: implementado; integración SQL aislada verificada. Aplicación remota pendiente de autorización específica. No certifica la exposición externa de Data API.

## Diagnóstico actual

Inspección de metadatos en una transacción `BEGIN READ ONLY` contra la conexión de desarrollo: 209 tablas en `public`, todas del propietario backend; 201 permiten SELECT a `anon`. No hay vistas, tablas externas ni rutinas SECURITY DEFINER en ese esquema. Las aplicaciones consumen Medusa/Mercur, no la Data API de Supabase. Storage usa el servicio S3 y su esquema independiente.

## Cambio y alcance

`packages/api/src/modules/commerce-automation/migrations/Migration20260919120000.ts` endurece el esquema `public` dedicado a Medusa. Se conserva acceso explícito del propietario, se elimina acceso al esquema de `PUBLIC`, `anon` y `authenticated`, se habilita RLS y se revocan grants públicos sobre relaciones y rutinas propias. Los objetos de extensiones quedan fuera del recorrido de modificaciones individuales.

La migración falla antes de alterar permisos si hay un propietario no revisado, un esquema distinto o un consumidor no propietario sin BYPASSRLS cuyo grant se rompería al habilitar RLS. Es necesario definir previamente su política explícita. El backend actual usa el propietario; no se exige ampliar privilegios de ningún rol. Los grants explícitos a consumidores backend con BYPASSRLS se conservan y se prueban con SELECT/UPDATE efectivos.

Los defaults de tablas/secuencias futuras se revocan para el creador de la migración. PostgreSQL no permite restar el EXECUTE global de funciones mediante un REVOKE por esquema: la denegación de USAGE/CREATE en `public` protege también funciones/procedimientos futuros y objetos de otros creadores. No se cambian defaults globales del propietario que afectarían esquemas ajenos. Si posteriormente se reabre el esquema a roles públicos, se necesita revisar todos sus objetos y defaults; no basta modificar un GRANT aislado.

La comprobación final rechaza permisos heredados que todavía den acceso al esquema a roles públicos. Todo el bloque SQL es atómico. `down()` rechaza una reapertura automática; cualquier restauración requiere grants explícitos revisados. No se modifican datos comerciales.

## Verificación

Suite `src/modules/commerce-automation/__tests__/database-access.integration.spec.ts`, PostgreSQL 17.11 real dedicado en loopback con TLS validado. Bases aleatorias `closure_access_*` creadas y eliminadas exclusivamente por la suite; propietarios de fixture sin superuser ni BYPASSRLS. Proveedores externos deshabilitados.

Comando, después de cargar la configuración desechable en el mismo proceso:

```powershell
$env:DATABASE_ACCESS_TESTS = 'disposable-local'
pnpm --filter @usapeek/api test:integration:modules --runTestsByPath src/modules/commerce-automation/__tests__/database-access.integration.spec.ts
```

Resultado: **6 PASS**, incluyendo lectura/escritura denegadas, vistas/rutinas/secuencias, objetos futuros, CRUD propietario, consumidor backend explícito, conservación de otro esquema, propietario desconocido, consumidor sin política, fallo tardío con rollback y negativa a rollback inseguro. Se ejecuta el SQL de la clase de migración; no es una simulación del motor SQL.

Suite `integration-tests/http/database-hardening.spec.ts`: runner completo de Medusa sobre PostgreSQL/Redis TLS desechables, todas las migraciones y enlaces nativos cargados. **2 PASS**: health HTTP, CRUD mediante módulo de clientes, permisos denegados para tablas nativas de cliente/pago/autenticación y tabla futura, y SELECT efectivo rechazado con rol público. Cada ejecución posee una base y plantilla aleatorias `closure_schema_*`. Los roles `anon` y `authenticated` son fixtures NOLOGIN del clúster desechable; no se crean roles remotos.

```powershell
$env:DATABASE_ACCESS_TESTS = 'disposable-local'
pnpm --filter @usapeek/api test:integration:http --runTestsByPath integration-tests/http/database-hardening.spec.ts
```

Gates API: lint PASS (51 advertencias, ninguna falla), typecheck PASS, build PASS; 68 suites / 883 pruebas unitarias PASS y 3 pruebas de scripts de deployment PASS. La primera ejecución de la suite HTTP detectó una firma incorrecta de `updateCustomers` en el fixture, corregida contra la implementación instalada antes del resultado PASS.

Pendiente: autorizar/aplicar posteriormente en la base compartida y verificar allí sus consumidores. La integración local no significa que se corrigieron los permisos remotos ni que se verificó una llamada externa a Data API. No se alteraron permisos ni datos remotos.

## Fuentes

- [Supabase: seguridad de Data API](https://supabase.com/docs/guides/api/securing-your-api).
- [PostgreSQL: ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).
- [PostgreSQL: Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

La estructura sigue las migraciones de seguridad ya presentes en commerce-automation, catalog-media y vendor-onboarding. Skills Medusa/db-migrate y Supabase/Postgres revisadas; defaults y seguridad contrastados con documentación actual mediante Context7.

## Actualización — 2026-10-04: funciones de inmutabilidad

El estado «aplicación remota pendiente» anterior corresponde a la inspección del
19 de septiembre. La aplicación del hardening general el 3 de octubre está
documentada en [automatic-settlement-20261003.md](automatic-settlement-20261003.md#activación-efectiva---2026-10-03-0747-utc).

El 4 de octubre Daniel autorizó fijar el `search_path` de las dos funciones de
inmutabilidad y retirar el permiso público innecesario de la función financiera.
La confirmación recibida de la investigación Supabase de esta misma sesión registra
`harden_immutable_trigger_functions`, versión `20261004072026`, aplicada remotamente:

- `public.reject_finance_sale_snapshot_update()` y
  `public.reject_order_completion_update()` tienen `search_path = ''`.
- Solo la primera pierde `EXECUTE` de `PUBLIC`; los grants explícitos de
  `postgres`/`service_role` se conservan.
- Cuerpos, OIDs, propietarios y triggers permanecen intactos. Las 217 tablas
  mantienen RLS y el límite de grants; `anon`/`authenticated` siguen sin acceso
  al esquema `public`.
- Advisor remoto: **0 ERROR, 0 WARN, 217 INFO** de RLS sin políticas, esperados
  para estas tablas privadas del backend.

La aplicación remota fue realizada por Supabase **fuera del ledger Medusa**.
`Migration20261004072026.ts`, en `commerce-automation/migrations`, registra las
mismas tres sentencias en el repositorio para instalaciones futuras. No requiere
recrear funciones o triggers; puede ejecutarse posteriormente sin conflicto
cuando el ajuste ya existe. El nombre coincidente no sincroniza ambos ledgers.
No se ejecutó esta migración mediante Medusa contra la base remota, ni se modificó
su ledger desde esta tarea. Su `down()` rechaza una reapertura automática; cualquier
reversión exige revisar explícitamente los settings y grants deseados.

### Verificación local ejecutada

Código actual, incluidos los cambios existentes del usuario, copiado a un workspace
aislado sin `.env`. Se reutilizaron las dependencias instaladas y pnpm 12.0.0, sin
instalación ni cambios del lockfile. Build y tipos no escribieron en `.medusa` o
`.mercur` del repositorio original. Los preloads bloquearon destinos remotos y
lecturas de `.env`; cero intentos de conexión bloqueados en los checks finales.

| Comprobación | Resultado |
| --- | --- |
| `pnpm run lint`, desde `packages/api` | PASS: 0 errores, 58 advertencias. Una nueva recomienda MedusaError en el down() que rechaza rollback; se conserva Error por consistencia con la migración de hardening anterior. |
| `pnpm run build`, desde `packages/api` | PASS: backend compilado. |
| `pnpm run typecheck`, después del build | PASS. |
| `pnpm run test:integration:modules --runTestsByPath src/modules/commerce-automation/__tests__/immutable-trigger-hardening.integration.spec.ts src/modules/commerce-automation/__tests__/database-access.integration.spec.ts --no-cache` | PASS: 2 suites, **9 pruebas**, 0 fallos y 0 omitidas. |

Las pruebas SQL se ejecutaron con `DATABASE_ACCESS_TESTS=disposable-local`, el
entorno aislado exigido por `integration-tests/setup.js`, PostgreSQL 17 de imagen
local fijada por digest y TLS validado. El contenedor era exclusivo de esta tarea,
ligado a loopback:55432 y con datos en memoria; se eliminó al terminar. Estas suites
no usan Redis ni proveedores externos. No se utilizaron datos comerciales.

Las tres pruebas nuevas ejecutan las definiciones originales de funciones/triggers
y el SQL de la migración nueva. Verifican aplicación repetida, `search_path`,
permisos efectivos, conservación del grant explícito backend y del ACL del reloj,
identidad/cuerpos/propietarios, triggers y defaults. También comprueban ambos errores
originales `P0001`, datos inmutables, CRUD ajeno y negativa a rollback inseguro.
Las otras seis pruebas cubren el hardening general existente.

Recibos locales saneados bajo
`C:/Users/dcalu/Documents/Codex/2026-10-04/task/private/automatic-settlement-runs/`:
`tests-1791099033822`, `lint-1791099061711`, `build-1791099087373`,
`typecheck-1791099131596`. Los intentos iniciales de preparar el runner fallaron
por rutas/permisos del runtime y metadata de pnpm de la copia; no se cuentan como
PASS. La infraestructura histórica de pruebas ya no existía, por lo que se creó
el contenedor temporal propio descrito arriba.

Comparación SHA256 antes de actualizar esta evidencia: **1.149 archivos conservados**,
incluidos los overlays existentes de `.mercur`. No se hizo commit, push, arranque
de la aplicación habitual ni ejecución de migraciones remotas. No se ejecutó la
suite HTTP completa ni un smoke de las tres interfaces: la validación de este
cambio fue focal y la confirmación remota procede de Supabase, separadamente.

Referencias: [ALTER FUNCTION, PostgreSQL 17](https://www.postgresql.org/docs/17/sql-alterfunction.html)
y [seguridad de Data API, Supabase](https://supabase.com/docs/guides/api/securing-your-api).
