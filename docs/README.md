# Documentación del proyecto

Revisión documental: **2026-10-06**. **F01–F12 / Phase 1–6 DONE** y
**Financial Readiness: PASS para Stripe TEST, USD y operación manual**, según
la matriz de cierre y el progreso. Pagos permite Manual/Automático y una espera
de 0–365 días para futuras finalizaciones (valor inicial 3); los pedidos ya
registrados conservan su plazo. La configuración y persistencia se verificaron
en [pruebas aisladas](develpment/evidence/payment-release-delay-20261006.md).
La prueba integral del pedido original con 72 horas
reales permanece **NEEDS VERIFICATION**. LIVE y preparación de producción no
están certificados. Actualizar documentación no equivale a repetir QA.

La [verificación integral pausada](develpment/evidence/automatic-settlement-e2e-20261003.md)
registra el pedido nuevo TEST #16 completado y el vencimiento real del 6 de
octubre, 12:51 de Uruguay. La comprobación previa al plazo pasó; la transferencia
posterior y otro ciclo sin duplicados permanecen pendientes tras el cambio de
entorno. El selector no certifica esa transferencia ni habilita LIVE.

## Punto de entrada para implementar

| Documento                                                               | Uso y regla de mantenimiento                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [Auditoría de cierre](develpment/development-completion-audit.md)       | Base histórica F01–F17, evidencia y definición de cierre. Solo corregir errores factuales demostrados; no borrar hallazgos resueltos |
| [Plan de implementación](develpment/development-implementation-plan.md) | Seis fases obligatorias P0/P1 y dependencias. Registrar cambios justificados de secuencia o alcance                                  |
| [Progreso](develpment/development-progress.md)                          | Handoff mutable: decisiones, archivos, migraciones, tests, resultados, bloqueos y siguiente acción de cada sesión                    |

Se conserva el nombre de carpeta `develpment` solicitado por el usuario.
Una nueva sesión debe leer esos tres archivos, el código y las instrucciones
`AGENTS.md` aplicables. Los números «Phase 1» de informes antiguos se refieren
a otro trabajo. El estado vigente de las fases financieras consta en el progreso;
sus checkpoints previos y resultados unitarios se conservan como historia.

## Guías vigentes

| Tema                              | Referencias                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arquitectura, arranque y comandos | [README raíz](../README.md), [instrucciones del repositorio](../AGENTS.md)                                                                                                                             |
| Desarrollo local                  | [PostgreSQL, Redis y arranque de la API](local-development.md) |
| Sesiones, actores y correo        | [Autenticación](../AUTHENTICATION.md), [Google OAuth](google-auth.md), [Resend](../packages/api/src/modules/resend/README.md)                                                                          |
| Búsqueda                          | [Algolia](algolia-search.md), [módulo de indexación](../packages/api/src/modules/algolia/README.md)                                                                                                    |
| Operación de vendedores           | [Guía vendor](vendor-operations.md), [README vendor](../apps/vendor/README.md)                                                                                                                         |
| Permisos de catálogo              | [Supervisado y Autorizado por tienda](catalog-permissions.md) |
| Operación administrativa          | [README admin](../apps/admin/README.md), [feedback de formularios](admin-vendor-form-notifications.md)                                                                                                 |
| Pedidos                           | [Flujo de pedidos](orders-flow.md), [cancelaciones y reembolsos](order-finance.md), [seguimiento privado y asociación a la cuenta](order-tracking.md) |
| Documentos legales                | [Términos y privacidad en vista previa](legal/README.md), [flujos pendientes](legal/pending-workflows.md) |
| Backend                           | [Rutas](../packages/api/src/api/README.md), [workflows](../packages/api/src/workflows/README.md), [módulos](../packages/api/src/modules/README.md), [links](../packages/api/src/links/README.md)       |
| Procesamiento asíncrono           | [Subscribers](../packages/api/src/subscribers/README.md), [jobs](../packages/api/src/jobs/README.md)                                                                                                   |
| Diagnóstico y pruebas             | [Scripts operativos](../packages/api/src/scripts/README.md), [tests de integración](../packages/api/integration-tests/http/README.md), [trazado de peticiones](reports/performance-request-tracing.md) |
| Tema e imágenes de medios de pago | [Theme sync](../packages/theme-sync/README.md), [assets de pagos](../apps/web/public/payment-methods/README.md)                                                                                        |
| Infraestructura ya declarada      | [Railway](../.railway/README.md); referencia existente, fuera de las fases obligatorias de cierre                                                                                                      |

Las guías describen el código actual y señalan sus límites conocidos. Sus
instrucciones de configuración no demuestran el estado remoto de ningún entorno.
La auditoría conserva las prioridades y requisitos originales; para conocer su
resolución, las extensiones autorizadas y las verificaciones pendientes prevalece
el progreso con su evidencia. La limpieza del 2026-10-12 retiró los tests unitarios
y preservó las integraciones; no interpretar los comandos de informes anteriores
como el inventario actual de pruebas.

## Planes e informes históricos

La limpieza del 2026-10-06 retira 23 planes e informes iniciales sustituidos por
las guías y la evidencia de cierre. Su contenido permanece recuperable en Git.
Se conservan los contratos de recuperación, las pruebas financieras y de
concurrencia, y los diagnósticos que aportan evidencia propia. Sus resultados
solo corresponden a las revisiones, fixtures y entornos descritos; no son una
verificación del estado actual.

- [Onboarding](plans/vendor-onboarding.md): contrato histórico detallado de solicitudes, identidad y recuperación. [Migración a Railway](plans/migration-to-railway.md): propuesta de infraestructura pendiente, separada del despliegue ya declarado.
- [Informes conservados](reports): evidencia de finanzas, almacén, correo, inventario, envíos y rendimiento.
- QA financiera: [cancelaciones y reembolsos](reports/qa-order-finance-2026-09-12.md), [captura y reversiones](reports/qa-order-finance-extension-2026-09-12.md), [auditoría de seguridad de pagos](reports/qa-payment-safety-2026-09-12.md).
- Cierre y recorridos: [matriz F01–F12](develpment/evidence/development-closure-20261003.md), [checkout nativo](develpment/evidence/native-checkout-browser-20260922.md), [envíos vendor](reports/vendor-managed-shipping-qa.md).
- Primeras interfaces: [informe admin](../apps/admin/IMPLEMENTATION_REPORT.md) e [informe vendor](../apps/vendor/IMPLEMENTATION.md). Sus descripciones de mocks corresponden a la implementación inicial, no al estado completo actual.

`reports/performance-request-tracing.md` es una guía de diagnóstico vigente
ubicada en esa carpeta, no un certificado de rendimiento actual.

## Material que se conserva sin reescribir

`docs/skills` y las skills instaladas contienen instrucciones especializadas;
se leen cuando lo exige `AGENTS.md`. Los avisos de terceros y las instrucciones
generadas por herramientas conservan su procedencia. No se actualizan versiones,
licencias o recomendaciones de terceros mediante esta revisión documental.

Al cambiar una funcionalidad, actualizar su guía y el progreso con evidencia
de esa sesión. No duplicar resultados de tests en varios documentos como estado
permanente y no guardar tokens, credenciales ni valores de entorno sensibles.
