# Stripe LIVE en main: preparación y activación

La preparación técnica separa TEST y LIVE sin activar cobros reales. El cierre
histórico F01–F12 sigue acreditando TEST, USD y operación manual; las pruebas
simuladas de esta preparación no sustituyen la verificación de Stripe ni una
compra real controlada.

## Estado seguro mientras se constituye la empresa

Solo Railway **main** usa esta configuración en API y worker:

| Variable                              | Valor de preparación                               |
| ------------------------------------- | -------------------------------------------------- |
| `STRIPE_MODE`                         | `live`                                             |
| `STRIPE_LIVE_ENABLED`                 | `false`                                            |
| `STRIPE_ACCOUNT_ID`                   | `acct_1UCQvoLrhMC0RSIh` (cuenta principal usapeek) |
| `STRIPE_API_KEY`                      | Vacía                                              |
| `STRIPE_WEBHOOK_SECRET`               | Vacía                                              |
| `STRIPE_PAYOUT_WEBHOOK_SECRET`        | Vacía                                              |
| `STRIPE_AUTOMATIC_JOBS_ENABLED`       | `false`                                            |
| `STRIPE_AUTOMATIC_SETTLEMENT_ENABLED` | `false`                                            |

La clave pública `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` del storefront permanece
vacía. Sin clave secreta no se registra el proveedor Stripe. Una clave LIVE con
la activación apagada, sin cuenta principal o con jobs automáticos encendidos
provoca un error de configuración. No se debe encender la activación para
superar un error de arranque.

Develop conserva su sandbox, sus credenciales y su comportamiento. La ausencia
de `STRIPE_MODE` significa `test`; una clave LIVE no es válida bajo ese modo.
No se crean sandboxes adicionales. No copiar claves ni secretos de webhook
entre los dos entornos. La cuenta, el modo de los eventos y los objetos de
Stripe deben coincidir con el entorno.

Los paneles omiten el modo al consultar sus informes: el backend selecciona el
modo configurado. Los registros financieros conservan el modo y la cuenta en
sus claves; las claves TEST existentes mantienen su formato original. Las
proyecciones no convierten registros TEST en LIVE.

## Paso siguiente: empresa y cuenta principal

Cuando la empresa esté constituida, su representante debe completar la
activación de la [cuenta principal usapeek](https://dashboard.stripe.com/acct_1UCQvoLrhMC0RSIh/settings/business-details) en el Dashboard de Stripe con sus
datos legales reales, identidad y la cuenta bancaria de la empresa. Revisar
los requisitos pendientes que muestre Stripe y sus permisos de cobro y pagos.
No enviar documentos, contraseñas ni datos bancarios por el chat.

No completar ni aceptar declaraciones legales con datos provisionales. En
esta preparación no se modifica la entidad legal, se invita a personas ni se
aceptan términos en nombre de la empresa. La verificación de vendedores Connect
es independiente de la activación de la plataforma.

## Activación posterior, en orden

1. Revisar que la cuenta principal siga siendo la indicada y que Stripe permita
   las operaciones requeridas. Confirmar el país, USD y el flujo Connect Express
   existente; no cambiar el modelo de pagos durante la activación.
2. Desplegar la versión preparada de main y ejecutar sus migraciones Medusa
   mediante el predeploy de API, con Stripe todavía desactivado. La migración
   amplía cuatro restricciones de modo y conserva los datos y permisos. Su
   reversión debe rechazar la presencia de filas LIVE; no borrar datos para
   forzarla. No ejecutar esta migración contra develop como parte de este paso.
3. Crear destinos de webhook en **LIVE** para la cuenta principal: eventos de
   pagos en `https://api.usapeek.com/hooks/payment/stripe_stripe` y eventos de
   cuentas conectadas (`account.updated`) en
   `https://api.usapeek.com/hooks/payout`.
   Confirmar las rutas con los proveedores instalados antes de crear destinos;
   conservar el formato snapshot compatible con la versión API fijada. Usar
   los secretos LIVE de cada destino, nunca los de develop.
4. Preparar la clave secreta LIVE y ambos secretos únicamente en las variables
   compartidas de Railway main, como cambios pendientes sin desplegar. Preparar
   la clave pública `pk_live_…` del mismo modo/cuenta en el storefront. Las
   referencias de API y worker apuntan a las variables compartidas de main.
   Aplicar esas credenciales junto con la activación del paso 6: aplicarlas antes
   con la activación apagada haría fallar el arranque, de forma intencionada.
   No registrar secretos en Git ni en salidas.
5. Mantener apagados ambos automatismos financieros. Revisar vendedores,
   comisiones, inventario, envíos, permisos del operador y políticas del sitio.
   El soporte actual de LIVE es manual; una activación no habilita las tareas
   automáticas, que continúan limitadas a TEST.
6. Con autorización expresa para comenzar a operar, establecer
   `STRIPE_LIVE_ENABLED=true` en el mismo despliegue de las credenciales
   preparadas, encender Redis/API/worker y las aplicaciones,
   verificar identidad de plataforma, salud y entregas firmadas de webhooks.
7. Realizar una compra LIVE pequeña y autorizada, verificar autorización,
   captura manual, registro único, entrega del webhook y reembolso. Verificar
   por separado las transferencias Connect y la conciliación. Un evento de
   prueba o una respuesta HTTP 200 no acredita un pago o depósito bancario.

Si surge una incidencia, apagar el acceso al checkout y los servicios que
escriben en Stripe; no cambiar main a claves TEST sobre datos LIVE. Conciliar
los resultados inciertos con el journal antes de reintentar. No cambiar
idempotency keys ni reproducir operaciones económicas históricas.

## Validación local de la preparación

Se usan las integraciones nativas HTTP/módulos con PostgreSQL y Redis TLS
temporales, sin datos compartidos. Los transportes de Stripe simulados bloquean
solicitudes externas; las claves `sk_live_…` utilizadas en estas pruebas son
ficticias. Las suites relevantes son `stripe-webhook-durability`,
`payment-webhook-durability`, `finance-effect-durability` y
`recovery-journal.integration`. Cada variante HTTP se ejecuta en su propio
proceso, con el opt-in `disposable-local` y reserva exclusiva de Redis DB15.

Las variantes LIVE de las suites de webhooks requieren respectivamente
`STRIPE_WEBHOOK_DURABILITY_MODE=live` y
`PAYMENT_WEBHOOK_DURABILITY_MODE=live`. La suite financiera utiliza
`FINANCE_EFFECT_DURABILITY_MODE=live`; estas variables de pruebas no se deben
configurar en Railway.
Las fixtures LIVE simuladas usan `ordinary`: la clasificación `qa_fixture`
continúa restringida al entorno local TEST.

La preparación no requiere iniciar los servicios desplegados. Al terminar,
main y develop deben conservar cero despliegues activos o pendientes.
