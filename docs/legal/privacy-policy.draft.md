# Borrador de política de privacidad de usapeek

Documento interno incompleto. Recoge categorías observadas en la aplicación y
los apartados que deben completarse. No autoriza nuevas finalidades de uso ni
presenta controles pendientes como si ya estuvieran disponibles.

## Responsable y alcance

usapeek operará desde Florida, Estados Unidos, con ventas exclusivamente en
Estados Unidos. Faltan el nombre legal del responsable, su domicilio y un canal
público de contacto para privacidad.

Pendiente: completar esos datos y revisar los derechos aplicables según el
alcance real del negocio, los estados atendidos y los tipos de datos tratados.

## Datos utilizados por la aplicación

- Cuenta: nombre, apellido, correo electrónico, teléfono cuando se proporciona
  e información necesaria para autenticar la sesión.
- Google: datos de identidad y perfil que entrega el proveedor al iniciar
  sesión, incluido el correo y los datos de perfil disponibles. Verificar el
  inventario completo antes de publicar la lista final.
- Pedidos: productos, cantidades, precios, modalidad de entrega, direcciones,
  teléfono de contacto, estados, seguimiento y operaciones financieras
  relacionadas con la compra.
- Preferencias: favoritos guardados en la cuenta y selección de tema visual.
- Datos técnicos: identificadores de sesión y carrito, controles temporales de
  autenticación y enlaces privados de seguimiento. Completar el inventario de
  registros del servidor, proveedores y copias de seguridad.

El formulario de pago utiliza componentes de Stripe. Debe revisarse el conjunto
de datos y metadatos de pago que conservan Stripe, la API y los registros antes
de afirmar que una categoría concreta nunca se almacena.

## Finalidades observadas

La aplicación utiliza los datos para gestionar cuentas y sesiones, mantener el
carrito, tramitar pedidos, facilitar su preparación y entrega, mostrar el
seguimiento, registrar reembolsos y administrar preferencias del comprador.

Los correos dirigidos a compradores se limitarán a comunicaciones de pedidos,
cuenta y seguridad. La decisión del propietario excluye correos promocionales.

## Tiendas y proveedores

Los paneles de las tiendas permiten consultar información de sus pedidos para
gestionarlos. La política final debe describir qué datos reciben, para qué los
usan y qué responsabilidades asume cada parte.

La integración actual incluye Google para autenticación, Stripe para pagos,
Resend para correos cuando está habilitado, Railway para alojamiento y
Supabase para base de datos y almacenamiento. Confirmar la configuración
efectiva al publicar, los datos enviados, otros destinatarios, sus ubicaciones
y las condiciones aplicables. Los nombres de proveedores no sustituyen ese
inventario.

## Cookies y almacenamiento del navegador

La aplicación usa cookies para la sesión, el carrito y la autenticación. La
cookie del carrito tiene una duración configurada de 30 días y el comprobante
local de compra, de 24 horas. También hay cookies temporales para Google,
verificación, recuperación y asociación de pedidos.

La preferencia de tema se conserva en el navegador. Google One Tap puede cargar
el componente de Google en la página inicial; los componentes de pago también
contactan con su proveedor. Por ello, la política final debe cubrir estas
integraciones y no limitarse a declarar que solo existen cookies propias.

Pendiente: inventario completo de tecnologías de terceros, clasificación,
duraciones y controles necesarios. La caducidad de una cookie no significa que
se haya eliminado el pedido o la cuenta del servidor.

## Conservación y derechos

El perfil permite editar nombre, apellido y teléfono; la cuenta también permite
administrar direcciones. El correo de la cuenta no se cambia desde ese formulario.
La solicitud de eliminación de cuenta y el circuito de atención de otros derechos
de privacidad todavía no están implementados.

El canal acordado es una opción dentro de la cuenta para presentar la solicitud,
con revisión antes de actuar. La política pública podrá explicar el acceso
concreto cuando esa opción funcione.

Pendiente: definir verificación de identidad,
atención y conservación por categoría de datos, incluidas las excepciones
necesarias para obligaciones legales, operaciones pendientes y reclamaciones.
No se promete eliminación inmediata o total de registros financieros y copias
de seguridad. Falta la vía para compradores invitados y personas que no puedan
acceder a la cuenta; aún no hay correo público de soporte.

## Menores y cambios de la política

La creación de cuentas y las compras se limitan a personas de 18 años o más.
Esta decisión exige controles y un procedimiento para atender datos de menores
que se detecten; el texto por sí solo no implementa esas medidas.

Pendiente: tratamiento de solicitudes relacionadas con menores, fecha de entrada
en vigor, versión y forma de comunicar cambios materiales.

## Referencias de la aplicación

- [Autenticación](../../AUTHENTICATION.md) y [Google](../google-auth.md).
- [Seguimiento de pedidos](../order-tracking.md).
- [Cookies del carrito](../../apps/web/features/cart/server-state.ts) y
  [comprobante](../../apps/web/features/cart/actions.ts).
- [Perfil](../../apps/web/features/account/components/profile-form.tsx) y
  [favoritos](../../apps/web/features/account/favorites.ts).
- [Google One Tap](../../apps/web/components/auth/google-one-tap.tsx).
- [Formulario de pago](../../apps/web/features/checkout/components/payment-step.tsx).
- [Acuerdos, pendientes y fuentes jurídicas](README.md).
