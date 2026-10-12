# Términos y privacidad de usapeek

Los documentos de esta carpeta registran los acuerdos y pendientes de los textos
legales. Hay versiones visibles para revisión en `/terms` y `/privacy`, enlazadas
desde el footer de la tienda e identificadas como borradores. No han entrado en
vigor ni acreditan que las funciones pendientes estén implementadas.

- [Borrador de términos y condiciones](terms-and-conditions.draft.md).
- [Borrador de política de privacidad](privacy-policy.draft.md).
- [Flujos pendientes de atención al comprador y privacidad](pending-workflows.md).
- [Contenido de términos en la tienda](<../../apps/web/app/(legal)/_content/terms.tsx>)
  y [contenido de privacidad](<../../apps/web/app/(legal)/_content/privacy.tsx>).

## Decisiones confirmadas por el propietario

| Tema | Decisión |
| --- | --- |
| Operación | Desde Florida, Estados Unidos. |
| Mercado | Ventas exclusivamente en Estados Unidos. |
| Alcance de la política | Común para todas las tiendas. |
| Cambio de opinión | No se ofrecen devoluciones voluntarias por este motivo; se conservan los derechos obligatorios aplicables. |
| Incidencias cubiertas | Productos incorrectos, dañados o defectuosos y pedidos no recibidos. |
| Plazo para reclamar | Aplicar lo exigido legalmente. No se aprobó un límite comercial uniforme de 3 o 7 días desde la entrega. |
| Primera atención | La tienda responsable atiende primero. |
| Canal de reclamación | Solo desde la cuenta del comprador. No añadir apertura de reclamaciones al seguimiento privado sin sesión. Para compras como invitado, facilitar el acceso y la asociación del pedido a la cuenta antes de reclamar. |
| Intervención de usapeek | El comprador puede pedirla si hay desacuerdo o falta de primera respuesta dentro del plazo acordado. |
| Primera respuesta de la tienda | 3 días hábiles. No es un plazo de resolución ni el plazo del comprador para reclamar. |
| Calendario de atención | Lunes a viernes, excluyendo festivos federales de EEUU, en la zona horaria de Miami. |
| Cómputo de la primera respuesta | Desde el siguiente día hábil después de presentar la reclamación; vence al finalizar el tercer día hábil. Ejemplo sin festivos: una reclamación presentada el lunes vence el jueves, según la hora de Miami. |
| Cancelación voluntaria | El comprador puede solicitarla hasta que la tienda empiece a preparar el pedido, además de sus derechos legales por incidencias. |
| Envío de devolución | Cuando procede la devolución cubierta, el comprador adelanta el coste del envío y la tienda responsable le devuelve ese gasto. |
| Momento del reembolso con devolución física | Después de recibir y revisar el producto devuelto, respetando los plazos legales obligatorios. No se aplica a pedidos que el comprador nunca recibió. |
| Reemplazo | Puede ofrecerse si el cliente lo acepta; no imponerlo como única solución. |
| Envío original en un reembolso completo | Se devuelve también el envío original cobrado cuando procede reembolsar todo el pedido de la tienda por una incidencia cubierta. |
| Reembolso parcial acordado como porcentaje | El porcentaje se aplica al total pagado por el pedido, incluido el envío. Ejemplo: el 60 % de un total de USD 110 supone reembolsar USD 66. No se aprobó calcular automáticamente ese porcentaje según el precio de los artículos afectados. |
| Envío del reemplazo | Lo paga la tienda responsable; el comprador no paga de nuevo por recibir el reemplazo aceptado. |
| Correos a compradores | Solo pedidos, cuenta y seguridad. No se autorizan promociones. |
| Edad mínima | 18 años para crear una cuenta y comprar. |
| Solicitudes de privacidad | Opción dentro de la cuenta, con revisión de la solicitud. Función pendiente. |
| Identidad y contacto | Nombre legal, domicilio postal y correo público pendientes. No inventar estos datos. |

Estas decisiones proceden de la conversación con el propietario. La indicación
«mínimo legal» exige revisar las normas aplicables a la operación, al producto y
al comprador; operar desde Florida no determina por sí solo todos los derechos
de compradores de otros estados.

## Decisiones pendientes

### Pendientes de concretar

- Nombre legal, domicilio, correo de contacto y dominio público definitivo.
- Acceso y asociación de pedidos para compradores invitados que quieran
  reclamar desde su cuenta; forma de comunicar decisiones y conservar la
  aceptación de un reemplazo. El canal de reclamación está aprobado.
- Reglas de pedidos de recogida no retirados.
- Registro operativo del inicio de preparación y canal de solicitud de
  cancelación. No confundir abrir un diálogo con empezar a preparar ni asumir
  que estar listo para enviar identifica necesariamente cuándo se empezó.
- Instrucciones y destino de devolución, tiempo de revisión del artículo
  recibido y plazo de emisión del reembolso, respetando los derechos obligatorios.
  Está aprobado emitirlo después de recibir y revisar el producto cuando haya
  devolución física, pero no se ha fijado un número de días para esos pasos.
- Medio, comprobante y momento para devolver al comprador el gasto de envío de
  devolución que adelantó. Es un gasto adicional al reembolso acordado por la
  compra; no asumir que se puede devolver mediante una operación que exceda el
  importe capturado del pago original.
- Retención por categoría de datos, solicitudes de acceso/corrección/eliminación,
  excepciones legales y tratamiento de copias de seguridad.
- Vía para solicitudes de privacidad de compradores invitados o personas que
  no pueden acceder a su cuenta; la vía dentro de la cuenta está aprobada.
- Uso futuro de publicidad o medición no esencial y los controles que requiera.
- Condiciones específicas para vendedores, papel contractual y fiscal de cada
  parte, categorías de productos permitidas y garantías aplicables.
- Fecha de entrada en vigor, versión y forma de comunicar y aceptar los textos.
  No se ha acordado arbitraje obligatorio, tribunal exclusivo ni limitaciones
  de responsabilidad específicas.

## Implementación observada

La tienda y el administrador ya pueden ejecutar reembolsos totales o parciales
desde el detalle de un pedido, con motivo, confirmación e historial. La
integración financiera documentada sigue limitada a Stripe TEST. Reembolsar no
registra por sí solo una devolución física ni repone inventario.

El comprador consulta pedidos, seguimiento y reembolsos, pero falta el circuito
de solicitud, respuesta de la tienda, desacuerdo e intervención de usapeek. Los
3 días hábiles y la aceptación del reemplazo aún no están implementados. La
cuenta permite editar el perfil y direcciones; falta la solicitud de eliminación
y el circuito de atención de derechos de privacidad. La restricción de edad
acordada debe reflejarse y verificarse en los accesos y compras que corresponda.

Referencias del repositorio:

- [Operaciones financieras](../order-finance.md).
- [Detalle de pedido del comprador](../../apps/web/app/account/orders/[id]/page.tsx).
- [Finanzas del vendedor](../../apps/vendor/src/features/orders/finance-panel.tsx).
- [Finanzas del administrador](../../apps/admin/src/features/orders/finance-panel.tsx).
- [Perfil del comprador](../../apps/web/features/account/components/profile-form.tsx).
- [Footer existente](../../apps/web/components/site-footer.tsx).

## Referencias para revisión jurídica

Consultadas el 6 de octubre de 2026; las versiones enlazadas no sustituyen la
revisión de vigencia y aplicabilidad antes de publicar.

- [Florida Statutes 672.607, edición 2025](https://www.flsenate.gov/Laws/Statutes/2025/672.607):
  la notificación de incumplimientos tras aceptar los bienes se relaciona con
  un tiempo razonable desde que se descubre o debería descubrirse el problema.
  No establece una ventana general de tres días desde la entrega.
- [Florida Statutes 501.142, edición 2025](https://www.flsenate.gov/Laws/Statutes/2025/0501.142):
  contempla información de políticas de reembolso en establecimientos minoristas.
  Su regla de siete días en determinadas circunstancias no es un plazo universal
  para reclamar defectos. Revisar su alcance sobre la venta online y la
  visibilidad de la política antes de comprar; un enlace en el footer no resuelve
  por sí solo esa revisión.
- [FTC sobre garantías](https://www.ftc.gov/business-guidance/resources/businesspersons-guide-federal-warranty-law):
  distingue garantías y obligaciones que pueden variar por estado.
- [FTC sobre pedidos por Internet](https://www.ftc.gov/legal-library/browse/rules/mail-internet-or-telephone-order-merchandise-rule):
  regula plazos de expedición y opciones ante retrasos; no confundir envío con
  entrega ni sustituir esas obligaciones por el plazo interno de atención.
- [FTC sobre protección de información](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business):
  recomienda limitar la conservación a necesidades legítimas y establecer una
  política de retención y eliminación. Las duraciones concretas siguen pendientes.

## Versión definitiva e implementación pendientes

Completar los datos del responsable y las decisiones abiertas; revisar
jurídicamente los textos para los estados y productos atendidos; implementar o
habilitar los canales prometidos; verificarlos y actualizar los textos visibles
para que puedan entrar en vigor. La redacción debe reflejar lo operativo en ese
momento. Mantener sincronizados los acuerdos de esta carpeta y el contenido de
las páginas de la tienda. Mostrar estos borradores no modifica los flujos
financieros, las cuentas, los datos ni los servicios desplegados.
