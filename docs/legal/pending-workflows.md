# Flujos pendientes de atención al comprador y privacidad

Las políticas acordadas necesitan los flujos siguientes para funcionar en la
aplicación. Este listado distingue las funciones que ya existen, el trabajo
pendiente y las decisiones que aún debe tomar el propietario. Mostrar los
borradores legales en el footer no implementa estos procesos.

Las decisiones completas están en el [registro de acuerdos](README.md) y en el
[borrador de términos](terms-and-conditions.draft.md).

## Reclamaciones y atención

1. **Abrir una reclamación desde la cuenta — pendiente de implementar.** El
   comprador podrá reclamar desde su pedido por producto incorrecto, dañado o
   defectuoso, o por no recibirlo. Falta el formulario, la presentación del caso,
   su seguimiento y el acceso de la tienda responsable. El detalle actual permite
   consultar productos, envío, importes y reembolsos, pero no abrir reclamaciones.
   No se acordó un límite general de tres o siete días para reclamar; debe
   respetarse el derecho aplicable a cada caso.

2. **Acceso de invitados antes de reclamar — base implementada y recorrido
   pendiente de completar.** Ya se puede asociar un pedido de invitado desde su
   enlace privado vigente, iniciando sesión con Google y el mismo correo usado
   al comprar. La ruta `/account/orders/claim` sirve para asociar ese pedido;
   no es un formulario de reclamaciones. La reclamación se abrirá exclusivamente
   desde la cuenta. Falta guiar al invitado hasta su pedido y definir cómo
   atenderlo si el enlace venció o no puede completar esa asociación.

3. **Primera respuesta de la tienda — pendiente de implementar.** Registrar la
   reclamación, comunicarla a la tienda y mostrar la fecha límite. Los tres días
   hábiles empiezan el siguiente día hábil y vencen al terminar el tercero, de
   lunes a viernes, excluyendo festivos federales de EEUU, según la hora de Miami.
   Por ejemplo, presentada un lunes sin festivos, vence el jueves. Falta el
   calendario, el registro de la primera respuesta y la detección del vencimiento.
   Este plazo no obliga a resolver el caso en tres días.

4. **Intervención de usapeek — pendiente de implementar.** El comprador podrá
   solicitarla si hay desacuerdo o la tienda no responde dentro del plazo.
   Falta la solicitud de intervención, la vista del administrador, la comunicación
   con ambas partes y el registro de la decisión. No se aprobó un plazo fijo para
   resolver la reclamación ni sustituir los derechos legales externos por este
   circuito.

## Devoluciones y soluciones

5. **Devolución física y revisión — pendiente de implementar y concretar.**
   Cuando el caso requiera devolver el producto, faltan instrucciones, destino,
   seguimiento de la devolución, confirmación de recepción y resultado de la
   revisión. Está aprobado reembolsar después de recibir y revisar el artículo,
   respetando los plazos legales obligatorios. Faltan el plazo para esa revisión
   y el de emisión del reembolso. Esta condición no se aplica a un pedido que
   el comprador nunca recibió. El reembolso financiero actual no registra por sí
   solo la devolución física ni repone inventario.

6. **Devolver el gasto del envío de devolución — pendiente de implementar y
   concretar.** El comprador adelanta el transporte y la tienda responsable le
   devuelve ese gasto. Falta decidir cómo presenta y se valida el comprobante,
   cómo se paga ese importe adicional y en qué momento. No debe asumirse que
   puede añadirse al reembolso del pago original: la operación financiera actual
   no permite devolver más que el saldo realmente cobrado y atribuible al pedido.

7. **Reembolso completo o porcentual — operación por importe implementada;
   aplicación de la nueva política pendiente.** La tienda y el administrador ya
   pueden reembolsar un importe total o parcial, con motivo, confirmación e
   historial. Falta vincular esa operación con la reclamación y mostrar el cálculo
   acordado antes de confirmarlo. En un reembolso completo cubierto se devuelve
   también el envío original del pedido de la tienda. Si se acuerda un porcentaje,
   se aplica al total pagado, incluido el envío: el 60 % de USD 110 son USD 66.
   No se aprobó deducir automáticamente el porcentaje a partir del precio de los
   artículos. Deben conservarse los límites por saldo cobrado y reembolsos
   anteriores; las pruebas financieras actuales corresponden a Stripe TEST.

8. **Reemplazo aceptado por el comprador — pendiente de implementar.** La
   tienda puede ofrecerlo y paga su envío. Falta presentar la propuesta, registrar
   la aceptación del comprador, gestionar el nuevo producto y envío y cerrar el
   caso cuando corresponda. No se impondrá el reemplazo como única solución.

## Cancelación y recogida

9. **Solicitud de cancelación antes de comenzar la preparación — pendiente de
   implementar.** Está aprobado que el comprador la solicite hasta que la tienda
   empiece a preparar. Faltan el control dentro de la cuenta y un registro
   operativo inequívoco del inicio de preparación, con su validación en el
   servidor. Abrir un diálogo o marcar el paquete como preparado no determina
   necesariamente cuándo empezó ese trabajo. La cancelación administrativa
   actual exige un pedido abierto y cancelar las preparaciones activas; esa
   operación no implementa el nuevo límite de solicitud del comprador.

10. **Pedidos de recogida que el comprador no retira — pendiente de decidir.**
    Hay gestión de recogida en la aplicación, pero no se ha acordado cuánto
    tiempo reservar el pedido, qué avisos enviar ni qué hacer si nunca se retira.
    Esas reglas deben decidirse antes de automatizar una cancelación o reembolso.

## Privacidad y acceso

11. **Solicitudes de privacidad y eliminación — pendiente de implementar y
    concretar.** Está aprobada una opción dentro de la cuenta, con revisión antes
    de actuar. Falta presentar la solicitud, verificar la identidad, atenderla
    desde administración y comunicar el resultado. El perfil actual permite
    editar nombre, apellido y teléfono, y administrar direcciones; no incluye
    una solicitud de eliminación. Falta definir los plazos de conservación por
    categoría, las excepciones para obligaciones legales y operaciones o
    reclamaciones pendientes, y el tratamiento de copias de seguridad. También
    falta una vía para invitados o personas que no pueden acceder a su cuenta.

12. **Condición de tener 18 años o más — pendiente de implementar.** La edad
    mínima está aprobada para crear una cuenta y comprar. Falta definir y aplicar
    el mecanismo adecuado en registro, Google y compra como invitado, y el
    procedimiento si se detectan datos de menores. No se ha acordado exigir un
    documento de identidad ni recoger una fecha de nacimiento completa.

13. **Comunicaciones y tecnologías de privacidad — configuración y revisión
    pendientes.** Los correos aprobados son de pedidos, cuenta y seguridad.
    Ya existen correos de pedidos y seguimiento cuando el proveedor está
    habilitado; los avisos de reclamación, devolución, reemplazo y privacidad
    dependerán de los flujos anteriores. Falta cerrar el inventario de datos,
    proveedores, cookies y conservación que debe reflejar la política. No se
    han autorizado correos promocionales; el uso futuro de medición no esencial
    y sus controles sigue pendiente.

## Textos legales definitivos

14. **Aceptación, versiones y contacto — pendiente de concretar e implementar.**
    Faltan el nombre legal, domicilio y contacto público, el papel contractual y
    fiscal de usapeek y las tiendas, y las condiciones aplicables a vendedores,
    productos y garantías. Falta establecer la fecha de entrada en vigor y la
    aceptación y comunicación de versiones en los puntos que correspondan. No
    se ha acordado arbitraje obligatorio, tribunal exclusivo ni una limitación
    específica de responsabilidad. Los borradores visibles para revisión deben
    seguir identificados como tales hasta completar estos puntos y comprobar
    que sus canales y promesas coinciden con la aplicación.

## Referencias de la implementación actual

- [Operaciones financieras](../order-finance.md) y
  [validaciones financieras](../../packages/api/src/lib/order-finance/policy.ts).
- [Detalle del pedido del comprador](../../apps/web/app/account/orders/[id]/page.tsx).
- [Asociación de un pedido de invitado](../order-tracking.md) y
  [función de asociación](../../apps/web/features/order-tracking/account-link.ts).
- [Preparaciones del vendedor](../../apps/vendor/src/features/orders/order-management.tsx).
- [Perfil del comprador](../../apps/web/features/account/components/profile-form.tsx).
- [Borrador de política de privacidad](privacy-policy.draft.md).
