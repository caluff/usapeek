import type { LegalSection } from "../_components/legal-document"

export const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    id: "responsable",
    title: "Responsable y alcance",
    content: (
      <p>
        usapeek operará desde Florida, Estados Unidos, con ventas exclusivamente
        en Estados Unidos. El nombre legal del responsable, su domicilio y el
        contacto público para privacidad están pendientes de completar.
      </p>
    ),
  },
  {
    id: "datos",
    title: "Datos utilizados",
    content: (
      <>
        <p>La aplicación utiliza las siguientes categorías de información:</p>
        <ul>
          <li>
            <strong>Cuenta:</strong> nombre, apellido, correo electrónico,
            teléfono cuando se proporciona e información de autenticación.
          </li>
          <li>
            <strong>Google:</strong> datos de identidad y perfil disponibles al
            iniciar sesión, incluido el correo electrónico.
          </li>
          <li>
            <strong>Pedidos:</strong> productos, cantidades, precios, modalidad
            de entrega, direcciones, teléfono de contacto, estados, seguimiento
            y operaciones financieras relacionadas con la compra.
          </li>
          <li>
            <strong>Preferencias:</strong> favoritos guardados en la cuenta y
            selección del tema visual.
          </li>
          <li>
            <strong>Datos técnicos:</strong> identificadores de sesión y
            carrito, controles temporales de autenticación y enlaces privados de
            seguimiento.
          </li>
        </ul>
        <p className="mt-4">
          El formulario de pago utiliza componentes de Stripe. El inventario
          completo de datos de pago, registros técnicos y datos recibidos de
          proveedores está pendiente de revisión antes de cerrar esta política.
        </p>
      </>
    ),
  },
  {
    id: "finalidades",
    title: "Uso de la información",
    content: (
      <>
        <p>
          Los datos se utilizan para gestionar cuentas y sesiones, mantener el
          carrito, tramitar pedidos, facilitar su preparación y entrega, mostrar
          el seguimiento, registrar reembolsos y administrar las preferencias
          del comprador.
        </p>
        <p>
          Los correos dirigidos a compradores se limitarán a comunicaciones de
          pedidos, cuenta y seguridad. No se enviarán correos promocionales.
        </p>
      </>
    ),
  },
  {
    id: "destinatarios",
    title: "Tiendas y proveedores",
    content: (
      <>
        <p>
          Las tiendas pueden consultar información de sus propios pedidos para
          gestionarlos. El alcance de los datos que reciben y las
          responsabilidades de cada parte deben completarse en la versión final.
        </p>
        <p>
          La aplicación integra Google para autenticación, Stripe para pagos,
          Resend para correos cuando está habilitado, Railway para alojamiento y
          Supabase para base de datos y almacenamiento. La lista completa de
          destinatarios, datos enviados y ubicaciones de tratamiento todavía
          debe verificarse.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies y navegador",
    content: (
      <>
        <p>
          Se utilizan cookies para la sesión, el carrito y la autenticación. La
          cookie del carrito tiene una duración configurada de 30 días y el
          comprobante local de compra, de 24 horas. También existen cookies
          temporales para Google, verificación, recuperación y asociación de
          pedidos.
        </p>
        <p>
          La preferencia de tema se conserva en el navegador. El acceso rápido
          con Google One Tap solo carga el componente de Google en la página
          inicial después de que lo permitas en las preferencias de cookies.
          Puedes rechazarlo y seguir utilizando el inicio de sesión habitual.
          Los componentes de pago también contactan con su proveedor al utilizar
          el checkout.
        </p>
        <p>
          El banner permite aceptar los servicios opcionales, utilizar solo las
          cookies necesarias o configurar la elección. Esta preferencia se
          guarda en el almacenamiento local del navegador durante 180 días;
          puedes revisarla y cambiarla desde Preferencias de cookies, al final
          de la página. Si el navegador bloquea el almacenamiento, la elección
          se aplica únicamente durante la visita actual.
        </p>
        <p>
          La caducidad de una cookie no elimina el pedido ni la cuenta del
          servidor. El inventario completo de tecnologías de terceros, sus
          duraciones y los controles necesarios está pendiente de completar.
        </p>
      </>
    ),
  },
  {
    id: "derechos",
    title: "Conservación y derechos",
    content: (
      <>
        <p>
          Desde el perfil puedes editar el nombre, apellido y teléfono. La
          cuenta también permite administrar direcciones; el correo no se cambia
          desde ese formulario.
        </p>
        <p>
          Se prevé añadir una opción dentro de la cuenta para solicitar su
          eliminación y ejercer derechos de privacidad, con revisión antes de
          actuar. Esta opción todavía no está disponible.
        </p>
        <p>
          Deben concretarse los periodos de conservación por categoría de datos,
          la verificación de identidad y las excepciones necesarias para
          obligaciones legales, operaciones pendientes y reclamaciones, así como
          el tratamiento de las copias de seguridad.
        </p>
        <p>
          También está pendiente el canal para compradores invitados y personas
          que no puedan acceder a su cuenta. No se promete una eliminación
          inmediata o total de registros financieros o copias de seguridad.
        </p>
      </>
    ),
  },
  {
    id: "menores",
    title: "Edad mínima",
    content: (
      <p>
        La creación de cuentas y las compras se limitarán a personas de 18 años
        o más. Los controles correspondientes y el procedimiento para atender
        datos de menores que se detecten todavía deben completarse.
      </p>
    ),
  },
  {
    id: "por-completar",
    title: "Apartados por completar",
    content: (
      <>
        <p>Antes de cerrar esta política, deben completarse:</p>
        <ul>
          <li>
            La identidad, el domicilio y el contacto público del responsable.
          </li>
          <li>
            El inventario de datos, destinatarios, tecnologías de terceros y
            ubicaciones de tratamiento.
          </li>
          <li>
            Los periodos de conservación y el procedimiento para atender
            solicitudes de privacidad y eliminación de cuenta.
          </li>
          <li>
            Los derechos y controles aplicables según los estados atendidos y
            los datos utilizados, incluido cualquier futuro uso de publicidad o
            medición no esencial.
          </li>
          <li>
            El procedimiento para atender datos de menores que se detecten.
          </li>
          <li>
            La fecha de entrada en vigor y la forma de comunicar cambios
            materiales en esta política.
          </li>
        </ul>
      </>
    ),
  },
]
