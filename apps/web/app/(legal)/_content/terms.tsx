import type { LegalSection } from "../_components/legal-document";

export const TERMS_SECTIONS: readonly LegalSection[] = [
  {
    id: "servicio",
    title: "Servicio y territorio",
    content: (
      <p>
        usapeek permite comprar productos ofrecidos por distintas tiendas. La
        operación se realizará desde Florida, Estados Unidos, y las ventas se
        dirigirán exclusivamente a compradores en Estados Unidos. La tienda
        correspondiente se identifica en el detalle de cada pedido.
      </p>
    ),
  },
  {
    id: "cuenta-y-compras",
    title: "Cuenta y compras",
    content: (
      <>
        <p>
          Debes tener al menos 18 años para crear una cuenta o realizar una
          compra en usapeek. Puedes comprar como invitado o mediante una cuenta.
          El acceso con Google permite iniciar sesión o crear una cuenta.
        </p>
        <p>
          La cuenta permite consultar los pedidos asociados y administrar datos
          personales, direcciones y favoritos. El proceso de compra presenta los
          productos, sus cantidades, la modalidad de entrega disponible y el
          importe total en dólares estadounidenses. Una compra con productos de
          distintas tiendas puede generar pedidos separados por tienda.
        </p>
      </>
    ),
  },
  {
    id: "cancelacion",
    title: "Cancelación",
    content: (
      <p>
        Puedes solicitar la cancelación de tu pedido hasta que la tienda empiece
        a prepararlo. Este límite a la cancelación voluntaria no elimina los
        derechos legales que te correspondan por incidencias. Puedes solicitarla
        desde el detalle del pedido en tu cuenta.
      </p>
    ),
  },
  {
    id: "incidencias",
    title: "Devoluciones y reclamaciones",
    content: (
      <>
        <p>
          Todas las tiendas aplicarán la misma política de usapeek. No se
          ofrecen devoluciones voluntarias por cambio de opinión. Esta condición
          no limita los derechos que la legislación aplicable reconoce
          obligatoriamente al comprador.
        </p>
        <p>La política cubre las siguientes incidencias:</p>
        <ul>
          <li>Productos incorrectos.</li>
          <li>Productos dañados o defectuosos.</li>
          <li>Pedidos no recibidos.</li>
        </ul>
        <p className="mt-4">
          Comunica el problema cuanto antes. Los plazos y garantías legales
          aplicables se respetan; esta política no establece un límite general
          de tres o siete días desde la entrega para todos los casos.
        </p>
      </>
    ),
  },
  {
    id: "atencion",
    title: "Atención de reclamaciones",
    content: (
      <>
        <p>
          Las reclamaciones se presentarán desde el pedido correspondiente en la
          cuenta del comprador. Si compraste como invitado, necesitarás iniciar
          sesión y asociar el pedido a tu cuenta. Desde el detalle del pedido
          puedes solicitar la devolución de productos incorrectos, dañados o
          defectuosos. El canal para pedidos no recibidos y la solicitud de
          intervención de usapeek todavía están pendientes de implementación.
        </p>
        <p>
          La tienda responsable atenderá primero la reclamación y dispondrá de
          <strong> 3 días hábiles para dar una primera respuesta</strong>. Este
          plazo se refiere a la atención inicial y no a la resolución
          definitiva.
        </p>
        <p>
          Se consideran hábiles los días de lunes a viernes, excluyendo los
          festivos federales de Estados Unidos, según la zona horaria de Miami.
          El plazo comienza el siguiente día hábil después de presentar la
          reclamación y vence al finalizar el tercer día hábil. Por ejemplo, una
          reclamación presentada el lunes deberá recibir una primera respuesta
          como máximo al terminar el jueves, si no hay festivos.
        </p>
        <p>
          Si existe desacuerdo o falta esa primera respuesta dentro del plazo,
          podrás pedir que usapeek intervenga. Este procedimiento no condiciona
          el ejercicio de derechos legales externos a la plataforma.
        </p>
      </>
    ),
  },
  {
    id: "reembolsos",
    title: "Reembolsos y reemplazos",
    content: (
      <>
        <p>
          Cuando proceda una devolución cubierta, la tienda responsable pagará
          el envío de devolución. El comprador adelantará ese gasto y la tienda
          se lo reembolsará, además del reembolso que corresponda por la compra.
        </p>
        <p>
          Si procede reembolsar todo el pedido de una tienda por una incidencia
          cubierta, se devolverán los productos, sus impuestos y el envío
          original cobrado para ese pedido. Si la compra incluye pedidos de
          otras tiendas, esta regla se aplica al pedido afectado.
        </p>
        <p>
          Si se acuerda un reembolso parcial expresado como porcentaje, se
          calculará sobre el total pagado por ese pedido, incluido el envío. Por
          ejemplo, el{" "}
          <strong>60 % de un pedido de USD 110 equivale a USD 66</strong>. Este
          acuerdo no limita los derechos obligatorios del comprador.
        </p>
        <p>
          Cuando la solución requiera devolver físicamente el producto, la
          tienda emitirá el reembolso después de recibirlo y revisarlo,
          respetando los plazos legales obligatorios. Esta condición no se
          aplica a pedidos que el comprador nunca recibió.
        </p>
        <p>
          La tienda podrá ofrecer un reemplazo como alternativa al reembolso,
          siempre que el cliente lo acepte y su aceptación quede registrada. La
          tienda pagará el envío del reemplazo, sin cobrar al comprador un nuevo
          envío por recibirlo.
        </p>
      </>
    ),
  },
  {
    id: "comunicaciones",
    title: "Privacidad y comunicaciones",
    content: (
      <p>
        El tratamiento de datos se describe en la política de privacidad. Los
        correos dirigidos a compradores se limitarán a pedidos, cuenta y
        seguridad. No se enviarán correos promocionales.
      </p>
    ),
  },
  {
    id: "por-completar",
    title: "Apartados por completar",
    content: (
      <>
        <p>Antes de que esta versión entre en vigor, deben completarse:</p>
        <ul>
          <li>
            El nombre legal del responsable, su domicilio y un contacto público.
          </li>
          <li>
            El papel contractual de usapeek y las tiendas, las condiciones para
            vendedores y las garantías aplicables a los productos.
          </li>
          <li>
            El canal para pedidos no recibidos, la intervención de usapeek y la
            gestión de reemplazos.
          </li>
          <li>
            Las instrucciones de transporte de devolución, el plazo para revisar
            el producto y emitir el reembolso, y el medio y momento para
            devolver el gasto de transporte adelantado.
          </li>
          <li>Las condiciones de pedidos de recogida que no se retiren.</li>
          <li>
            La fecha de entrada en vigor y la forma de comunicar y aceptar los
            términos y sus cambios.
          </li>
        </ul>
      </>
    ),
  },
];
