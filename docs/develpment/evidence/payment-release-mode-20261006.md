# Modo de liberación en Pagos — 2026-10-06

Alcance: selector global Manual/Automático en el admin, análogo al modo de cobro.
No modifica el plazo autorizado de 72 horas ni el calendario bancario de Stripe.
No añade un botón de transferencia manual: conserva el flujo operativo existente
de `settle-order-finance.ts`, con inspección previa y ejecución explícita.

## Comportamiento y persistencia

- Pagos → Liberaciones → Modo de liberación reutiliza `SettingsOption`, el diálogo
  compartido y un límite de Suspense local. La etiqueta abre la explicación;
  la flecha abre el editor. Cancelar descarta el borrador y devuelve el foco.
- GET/POST `/admin/payment-release-settings` usan autenticación nativa, lectura
  `store.read` y escritura `store.update` + `payment.update`. El servidor valida
  el cuerpo estricto y la existencia del operador; el actor no se toma del cuerpo.
- `Store.metadata.usapeek_payment_release` contiene modo, revisión UUID y actor.
  La escritura usa `updateStoresWorkflow` y conserva los otros metadatos. Una
  revisión obsoleta se rechaza; enviar el mismo modo no renueva la revisión.
- El worker consulta la elección persistida sin reinicio. El flag de entorno
  `STRIPE_AUTOMATIC_SETTLEMENT_ENABLED` queda como valor inicial únicamente si
  todavía no existe una elección guardada. Su valor inicial forma parte de la
  revisión inicial para rechazar un editor abierto bajo otro valor del flag.
- Automático requiere configuración Stripe TEST válida y jobs generales
  desactivados. Una integración ausente/LIVE/incompatible impide habilitarlo y
  mantiene el ejecutor detenido. Manual puede seleccionarse aunque no esté
  disponible la integración automática.
- Con integración TEST segura, los nuevos eventos de finalización registran el
  reloj también en Manual. Cambiar el modo no reinicia relojes; Automático puede
  liberar pedidos anteriores que tengan reloj y ya cumplan el plazo. No hay
  backfill de pedidos históricos sin reloj ni jobs/eventos forzados al guardar.
- Ambos editores y la ejecución automática completa comparten un bloqueo por
  propietario sin expiración. Una transferencia en curso impide guardar otro
  modo. Un proceso muerto puede dejarlo bloqueado: requiere revisión y prueba
  de todos los escritores detenidos, sin takeover automático por antigüedad.
- La ruta nativa HTTP `POST /admin/stores/:id` rechaza cualquier reemplazo de
  metadata, incluso null, vacío o claves ajenas, porque el flujo instalado puede
  reemplazar y borrar la configuración financiera. Sus demás campos permanecen
  disponibles. No se añade ni reemplaza ningún hook nativo de Mercur.

## Validación

La tabla registra los resultados anteriores a la incorporación del trabajo
paralelo de Google One Tap. La repetición global posterior de tipos API quedó
bloqueada por ese código ajeno; la repetición focalizada final de release/capture
settings pasó **19/19**, sin skips.

| Comprobación                                                       | Resultado                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                                                        | PASS; 58 warnings preexistentes de API, cero errores. API final: 59 por un archivo nuevo ajeno de Google One Tap, cero errores |
| Typechecks de todos los paquetes/apps                              | PASS; los fallos nuevos de tipo en dos pruebas se corrigieron y API se repitió con éxito                                       |
| `pnpm build:api`, `pnpm build:admin`                               | PASS tras corregir el acceso Array.at no admitido por el target de API                                                         |
| `pnpm --filter @usapeek/api test:unit`                             | PASS, 9 suites / 87 tests                                                                                                      |
| Helpers admin de capture/release con `tsx --test`                  | PASS, 10 tests                                                                                                                 |
| HTTP release settings nativo con opt-in aislado                    | PASS, 9/9, sin skips; autorización, persistencia, revisiones, bypass de Store y lock Redis por propietario sin expiración      |
| Reloj PostgreSQL, suite `automatic-settlement.integration.spec.ts` | PASS, 13/13, sin skips; plazo, persistencia, invariantes y replay                                                              |

El navegador local verificó Manual, apertura del editor, selección Automático
sin guardar, Cancelar, reapertura conservando Manual, cierre por Escape y retorno
de foco, además del diálogo informativo. Captura externa:
`C:/Users/dcalu/.codex/tmp/payment-release-mode-20261006/screenshots/pagos-modo-liberacion.jpg`.
No se guardó Automático en la copia de desarrollo ni se ejecutó una transferencia.

La infraestructura de pruebas es una reserva nueva vacía con identidades
`marketplace-release-mode-20261006-*`, PostgreSQL/Redis TLS en puertos loopback
55432/56379 y Redis DB15. Los runners crean bases UUID; los proveedores están
desactivados en bootstrap. La disponibilidad TEST se simula solo con valores
locales y sin pedidos/pagos. El `.env` raíz y las infraestructuras ajenas se
preservan. No hay migraciones de producto ni dependencias nuevas.

Recibos externos en `C:/Users/dcalu/.codex/tmp/payment-release-mode-20261006/private/`:
HTTP `http-3db91086039e4a4eb3751ad81996017c/summary.json` y reloj
`clock-b635744696364969a2cdeab0f42ecb8d/summary.json`. Respectivamente registran
140 y 36 conexiones loopback, cero conexiones prohibidas y `.env` intacto.
La prueba Redis confirmó PTTL=-1 mientras la operación mantiene el bloqueo,
rechazo de otro propietario, 409 de ambos editores y PTTL=-2 al terminar.
Los dos contenedores nuevos quedaron detenidos por sus identidades exactas;
la infraestructura dev y ajena se conservó, igual que volúmenes y evidencia.

## Límite de esta evidencia

Este informe registra el checkpoint del selector original. La ampliación posterior
del mismo día incorpora el plazo configurable y repite los checks sobre el árbol
actual: los tipos globales de API ya pasan. Consultar la
[evidencia posterior](payment-release-delay-20261006.md) para ese estado y su migración.

En aquel checkpoint, una repetición de `pnpm typecheck:api` falló después de incorporarse código
ajeno de Google One Tap en paralelo: exportación/importación de `GoogleAuthService`,
miembros `config_`/`getSigningKey_`, opciones de locking y tipos de pruebas/input.
Los checks de tipos/build anteriores y las integraciones registradas pasaron
antes de esas nuevas ediciones. No se modificó ese trabajo para cerrar el selector
de Pagos; aquel bloqueo quedó superado en la ampliación posterior enlazada arriba.

Estos resultados validan el selector, su autorización y la persistencia; no
certifican una transferencia Stripe nueva después de 72 horas reales. La
verificación del pedido original TEST #16 sigue pausada por su cambio de entorno,
según [su evidencia](automatic-settlement-e2e-20261003.md). LIVE y preparación de
producción mantienen sus límites anteriores. Los cambios paralelos del usuario
se conservan; esta sesión no publica cambios al remoto.
