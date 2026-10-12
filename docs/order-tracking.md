# Seguimiento de pedidos por correo

El evento nativo `order.placed` envía una confirmación por pedido con un enlace
privado de seguimiento. El checkout dividido de Mercur 2.3.3 emite este evento
por cada tienda, y Medusa publica los eventos después de completar el workflow:
una compra que se revierte no envía una confirmación.

El aviso `shipment.created` usa el mismo acceso para compradores con cuenta e
invitados. Ambos correos usan el proveedor Resend y la deduplicación persistida
del módulo de notificaciones. Los reintentos conservan el enlace y la clave de
idempotencia; un error del proveedor no bloquea la finalización del checkout.
No se envían confirmaciones de pedidos históricos al desplegar este cambio.

## Acceso privado

- El enlace abre `/orders/track#token=…`, sin iniciar sesión. El fragmento queda
  en el navegador: no se envía en la URL HTTP ni en los encabezados de referencia.
  La página transmite el token al servidor en el cuerpo de una petición POST.
- El token HMAC contiene el identificador de un pedido, un resumen protegido de
  su correo y el vencimiento. Usa una clave derivada de `JWT_SECRET` con un
  propósito exclusivo. Por sí solo no sirve para iniciar sesión o modificar el
  pedido; la asociación a una cuenta exige además una sesión de Google válida.
- Dura 90 días desde la creación del pedido o del envío correspondiente. Rotar
  `JWT_SECRET` invalida todos los enlaces emitidos; cambiar el correo del pedido
  invalida los enlaces de su destinatario anterior.
- `POST /store/order-tracking` verifica firma y vencimiento antes de consultar
  datos. Comprueba el destinatario actual y excluye borradores. Devuelve solo
  referencia, estado, productos, total y seguimiento de paquetes; no devuelve
  direcciones, correo, teléfono ni datos de pago o del proveedor de envío.
- La vista usa `no-store`, `noindex` y `no-referrer`. Los enlaces del transportista
  aceptan únicamente HTTPS sin credenciales. El comprador debe conservar el
  enlace privado; cualquier persona a la que se lo comparta puede ver ese
  seguimiento hasta su vencimiento.

El timeline conecta los cuatro pasos y muestra la fecha real de cada paso
completado. Los contadores nativos por artículo determinan si la preparación,
el envío o la entrega se completaron para todo el pedido. La fecha corresponde
al último paquete activo que completó ese paso; los paquetes cancelados se
excluyen. La preparación usa `packed_at` y, para registros históricos, la fecha
de creación del paquete. Los pasos pendientes o sin una fecha válida no muestran
fecha. En móvil el timeline se presenta verticalmente.

## Configuración

La vista ofrece acceso con Google para iniciar sesión o crear una cuenta y
asociar el pedido de ese enlace a la cuenta. Exige el mismo correo que se usó
al comprar, una sesión de Google válida y el enlace privado vigente. Reutiliza
la transferencia nativa de Medusa para un único pedido de invitado; no cambia
su correo, otros pedidos, el carrito histórico ni el grupo de compra. Un pedido
de otra cuenta registrada no puede asociarse así.

El token se guarda durante diez minutos en una cookie `HttpOnly` limitada a
`/account/orders/claim`. Los parámetros del acceso con Google contienen solo
esa ruta, nunca el token. Tras completar el acceso y los pasos de seguridad
requeridos, la vista protegida asocia el pedido con un POST y abre su detalle en
la cuenta. El pedido también aparece en `Mis pedidos`. El enlace privado sigue
permitiendo consultar su estado sin sesión.

Se mantiene la configuración existente de correo en el `.env` raíz ignorado o
en las variables de API/worker del despliegue:

| Variable | Uso |
| --- | --- |
| `AUTH_EMAIL_ENABLED=true` | Habilita el proveedor de correo existente. |
| `RESEND_API_KEY` | Clave de envío del proveedor. |
| `RESEND_FROM_EMAIL` | Remitente en un dominio verificado; `AUTH_EMAIL_FROM` es el fallback existente. |
| `STOREFRONT_URL` | Origen público de la tienda. En desarrollo puede ser `http://localhost:3000`. |
| `JWT_SECRET` | Secreto de firma del backend ya requerido por Medusa. |

La aceptación por Resend no garantiza la llegada a la bandeja de entrada. Se
conservan los reintentos del event bus y la recuperación de notificaciones
documentada en `packages/api/src/modules/resend/README.md`. No se añaden motores
de reintento ni procesos de reenvío masivo.

## Validación

Las pruebas unitarias de acceso, correo y frontend se retiraron por solicitud del
usuario. Se conserva `packages/api/integration-tests/http/order-tracking.spec.ts`,
que usa PostgreSQL/Redis aislados y workflows Medusa reales con proveedores
externos deshabilitados. Revisar su cabecera y la
[guía de integraciones HTTP](../packages/api/integration-tests/http/README.md)
antes de ejecutarla. No usar la base habitual ni equiparar esta integración con
la cobertura de las pruebas retiradas.

```powershell
pnpm --filter @usapeek/api tracking:contracts:check
```
