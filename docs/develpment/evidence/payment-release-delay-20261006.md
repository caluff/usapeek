# Tiempo de espera configurable de liberación — 2026-10-06

## Alcance y decisión

El operador puede configurar el plazo de liberación automática desde **Pagos →
Liberaciones**: Inmediato (0), 1, 2, 3 o un entero entre 0 y 365 días. Modo y plazo
pueden guardarse juntos al activar Automático. Con Automático guardado aparece
la fila Tiempo de espera. Manual conserva el último plazo; valor inicial 3.

El usuario confirmó **solo nuevas finalizaciones**. La primera observación
verificada y persistida registra el plazo vigente con el reloj del pedido.
Cada día equivale a 24 horas transcurridas, incluidos fines de semana/feriados.
Cero no ejecuta una transferencia en el editor ni en el subscriber: deja el
pedido elegible para el siguiente ciclo natural, con los controles financieros
existentes. Entrega tardía y backlog pueden retrasarlo. Los pedidos anteriores,
reintentos y cambios posteriores de modo/plazo conservan su fecha y token.

## Implementación

- Store guarda `delay_days` junto con modo, revisión y actor. Metadatos anteriores
  sin plazo se leen como 3 sin reescritura. POST exige un número entero explícito,
  permisos de operador y revisión vigente. Noop conserva la revisión.
- La elección se lee bajo el bloqueo compartido de pagos al registrar el reloj.
  El módulo recibe el plazo y no consulta Store. PostgreSQL guarda
  `release_delay_days`, inmutable junto con instantes y vínculo financiero.
- Eligibility usa el plazo del pedido, nunca el ajuste global actual. La prueba
  automática persistida incluye ese snapshot. El contrato histórico de payouts
  sin ese campo conserva el valor 3 al interpretarse.
- La fuente, huella y comparación de concurrencia de la proyección del vendedor
  incluyen el plazo. Su interfaz muestra las fechas individuales y no promete
  una espera fija de 72 horas.
- `Migration20261006171340`, generada con Medusa, añade un entero NOT NULL DEFAULT
  3 sin UPDATE de relojes existentes. CHECK exige rango 0–365, instantes finitos
  y diferencia exacta `release_delay_days × 86400` segundos. Conserva trigger,
  RLS, privilegios e índices. Down rechaza plazos distintos de 3 incluso en filas
  eliminadas; no reescribe ni borra relojes para permitir rollback.

## Verificación ejecutada

| Comprobación | Resultado |
| --- | --- |
| `pnpm lint` raíz | PASS; API con 59 warnings existentes, cero errores |
| `pnpm typecheck` raíz | PASS; todas las apps y paquetes |
| `pnpm typecheck:api` y `pnpm build:api` tras revisión final | PASS |
| Lint dirigido y `pnpm typecheck:admin` tras compactar ayudas | PASS |
| API `test:unit` | PASS, 12 suites / 122 pruebas |
| Helpers release admin | PASS, 10/10 |
| HTTP nativo release settings | PASS, 17/17, sin skips |
| Reloj PostgreSQL | PASS, 19/19, sin skips |
| Registry del vendedor | PASS, 13/13, sin skips |
| Generación/migración nativas y pruebas SQL de up/down | PASS, 14 verificaciones |
| `finance:contracts:check` | PASS |

Las integraciones HTTP/reloj/registry utilizaron exclusivamente infraestructura
vacía reservada con PostgreSQL/Redis TLS y bases UUID. Cubren plazos 0/1/2/3/365,
límites exactos, valores inválidos, persistencia/reinicio, replay con ajuste
distinto, clocks inmutables, permisos, revisiones, noop, carreras, Store bypass,
lock Redis sin expiración y fuentes alteradas. Un primer test nuevo falló por
`-1::text` tras interpolación de MikroORM; se corrigió con CAST y la suite pasó.

Recibos externos bajo
`C:/Users/dcalu/.codex/tmp/payment-release-mode-20261006/private/`:

- `http-5e070bed78094597b7bd94a7c98ff6e9/summary.json`: 17 PASS, 150 conexiones loopback.
- `clock-d25b5aeef2b74f048e1b00bb3a4feeb1/summary.json`: 19 PASS, 48 conexiones loopback.
- `registry-b63022c0793a46bab1c1efe2da6bf5d8/summary.json`: 13 PASS, 31 conexiones loopback.
- `delay-migration-3115d4943d3a42fa971748c5ea60c49d/verification.json`: 14 comprobaciones,
  102 conexiones loopback. CLI generó el cambio y aplicó 223 migraciones sobre
  una base UUID nueva, incluidas 11 del módulo; sin links/scripts ni proveedores.

Todos registran cero conexiones prohibidas y `.env` intacto. La comprobación SQL
demostró que la migración preserva también el clock legacy y su fila física,
acepta 0/1/2/3/365, rechaza rango/NULL/fracción/deadline incorrecto/infinito y
conserva privacidad e inmutabilidad. Los dos contenedores QA exactos quedaron
detenidos; la infraestructura habitual sigue funcionando.

## Aplicación local y navegador

Se aplicó **únicamente la nueva migración de commerceAutomation** al PostgreSQL
local de desarrollo, puerto 5432, con el migrador nativo `MedusaAppMigrateUp`
restringido a ese módulo. El preflight comprobó TLS con certificado verificado,
modo Manual y única migración pendiente del módulo. La huella de la fila del
reloj existente permaneció idéntica excluyendo la columna nueva, que tomó 3.
No se iniciaron jobs, subscribers ni proveedores con el migrador.

Recibo externo `infrastructure/local-delay-migration.json` y auditoría
`private/local-delay-21b544aae54d4d9e9115a8ace9a4ba88/network.json`: 4 conexiones
solo al PostgreSQL local, cero denegadas; `.env` intacto. La base remota original
no se modificó.

El navegador verificó el editor en Manual, borrador Automático con plazo 3,
presets 0/1/2/3, entero personalizado 5 y bloqueo de guardar para -1/0.5/366.
Cancelar descartó modo/plazo y devolvió foco a la flecha; la configuración real
permaneció Manual. Las ayudas se compactaron para mantener visibles los botones
en la ventana disponible. Captura del borrador Inmediato, **sin guardar**:
`C:/Users/dcalu/.codex/tmp/payment-release-mode-20261006/screenshots/pagos-plazo-liberacion.jpg`.

## Ajuste del editor solicitado después del QA

Las opciones visibles son ahora Inmediato, 3 días y Una semana (7). El campo
numérico permanece en la misma fila, a la derecha, separado por una línea
vertical; no hay botón Personalizado. Se eliminaron la ayuda «0–365 días enteros.
0: próximo ciclo automático.» y la descripción introductoria del diálogo de modo.
La validación de 0–365 días y la aplicación solo a nuevas finalizaciones siguen
vigentes.

Lint y typecheck de admin aprobados con el diseño final. Las 10 pruebas del helper
aprobaron tras añadir la etiqueta Una semana. El navegador comprobó las opciones
0/3/7, el valor escrito 5, la alineación y el separador. Cancelar conservó Manual
y devolvió el foco a su flecha. Captura del borrador sin guardar:
`C:/Users/dcalu/.codex/tmp/payment-release-mode-20261006/screenshots/pagos-plazos-input-inline.jpg`.

## Límite

La verificación cubre configuración, autorización, reloj y proyecciones. No movió
dinero ni consultó Stripe y no certifica una transferencia nueva después del
plazo. El seguimiento del pedido original TEST #16 conserva sus 72 horas y sigue
pausado por el cambio de entorno. Saldo Connect y retiro bancario siguen siendo
operaciones distintas. LIVE y producción mantienen los límites de cierre previos.
Los cambios paralelos del usuario se preservaron; sin dependencias nuevas ni push.
