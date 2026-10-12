# Cancelaciones y devoluciones

Implementación revisada el 7 de octubre de 2026 sobre Mercur 2.3.3 y Medusa 2.18.0.

## Base nativa y adaptación del pago compartido

Mercur divide la compra en pedidos por tienda y conserva una colección de pago
en el carrito. El workflow de cancelación de Medusa busca colecciones enlazadas
al pedido. Por eso llamar directamente a la cancelación nativa no devuelve el
dinero del pago compartido.

La aplicación conserva el coordinador financiero para atribuir capturas,
reembolsos y reversión de liquidaciones a una tienda. Una vez verificados esos
efectos, usa `cancelOrderWorkflow` para cancelar el pedido y liberar reservas.
Los SDK nativos siguen gestionando preparación, envío y recepción. El panel del
operador usa los workflows de Mercur al cancelar una preparación o recibir una
devolución: conocen el inventario de las ofertas, que el equivalente genérico
de Medusa no conoce.

No se añaden colecciones de pago a los pedidos hijos. Las rutas nativas que
cancelan o reembolsan directamente siguen protegidas por el coordinador.
Las modificaciones y los cambios que podrían exigir otro cobro permanecen
deshabilitados para estos pedidos.

## Recorrido del comprador

En Cuenta → Pedidos → detalle se puede cancelar un pedido abierto antes de
cualquier preparación. El servidor verifica la cuenta propietaria y vuelve a
comprobarla dentro del bloqueo del carrito. El comprador no puede cobrar ni
emitir un reembolso arbitrario.

Para productos incorrectos o dañados, el comprador selecciona artículos
enviados, cantidades y motivo. La solicitud crea un borrador nativo de
devolución y sus acciones de pedido. La tienda revisa el borrador, asigna su
almacén y lo aprueba o lo descarta. Tras aprobarlo, el comprador ve el destino
real de devolución y el estado de la recepción. No se exponen notas internas ni
evidencia financiera.

La misma solicitud puede reenviarse con su UUID original sin crear otra
devolución. Reutilizarlo con otros datos se rechaza. Las cantidades disponibles
descuentan solicitudes, recepciones y artículos dañados anteriores.
Los borradores descartados se conservan en el historial como cancelados; su
borrado lógico nativo no permite reutilizar el UUID para crear otra solicitud.

La antigua ruta Store `/store/returns` se bloquea: su workflow no verifica
la propiedad del pedido y permite controles logísticos que el comprador no
debe ejecutar.

## Recorrido de la tienda y del operador

Los paneles utilizan los pasos nativos: iniciar devolución, solicitar artículos,
confirmar o descartar la solicitud, iniciar recepción, registrar buen estado y
dañados, y confirmar o descartar el borrador de recepción. Solo los artículos
en buen estado incrementan el inventario. Las cantidades de recepciones
parciales se acumulan; el parche de Mercur corrige la sobrescritura presente en
la versión instalada.

Una devolución aprobada que aún no recibió unidades puede cancelarse con la
operación nativa. Se exige confirmación y ausencia de otros borradores; una
recepción ya registrada no se elimina con esa acción. Al cancelar, sus unidades
dejan de reservarse para devolución y el reembolso vuelve a evaluarse.

El reembolso es una acción separada, desde el bloque financiero del pedido.
Una devolución física abierta bloquea el reembolso hasta recibirla o cancelarla.
El importe nunca supera el saldo capturado de esa tienda. Los créditos y las
transacciones consideran las deducciones que ya registró la devolución nativa.
La liquidación de la tienda permanece retenida mientras haya una devolución
abierta o un saldo negativo nativo pendiente de reembolso. Los cambios de
devolución invalidan también su proyección de liquidaciones.

La identidad, el UUID y el motivo originales del comprador son inmutables en
las rutas nativas. Los otros campos de metadata mantienen la fusión nativa de
Medusa; no se permite vaciar el objeto ni sobrescribir ese bloque reservado.

Las solicitudes nuevas y los cambios de recepción invalidan las notificaciones
operativas de la tienda. Las colas de devoluciones permiten localizar pedidos
que requieren revisión, incluidos los que ya estaban completados.

## Interrupciones y límites

Una cancelación interrumpida después de reembolsar todo el saldo puede
recuperarse sin emitir otro reembolso ni cancelar de nuevo la autorización.
La conciliación comprueba captura, reembolsos atribuidos, contabilidad y
liquidación histórica, completa la cancelación nativa pendiente y libera el
bloqueo. Un resultado incierto requiere conciliación, no un nuevo intento de
mover dinero.

El transporte de vuelta se coordina con la tienda. No se genera una etiqueta
ni un cobro adicional de transporte. El reintegro de gastos adelantados que
excedan el saldo de la compra requiere otro medio financiero.
Los pedidos no recibidos, la escalada formal de reclamaciones, los reemplazos
y las cancelaciones automáticas por vencimiento no forman parte de este
circuito físico. Tampoco se habilitan pagos LIVE.

La validación HTTP utiliza PostgreSQL y Redis TLS desechables y un simulador
explícito de Stripe. Verifica persistencia, autorización, compensación e
inventario; no equivale a ejecutar operaciones con el proveedor real.

## Validación del 7 de octubre de 2026

- `pnpm lint`: PASS, cero errores y 69 warnings existentes de API.
- `pnpm typecheck`: PASS en todas las aplicaciones y paquetes.
- `pnpm test`: 243/243 unitarias de API, 30 suites.
- `test:orders`: 27/27 en admin y 27/27 en vendor; formularios de cancelación y
  devolución del comprador: 6/6.
- `finance-effect-durability.spec.ts`: 12/12 casos HTTP del alcance; los nueve
  casos anteriores quedaron fuera de esta selección focalizada.
- `pnpm build:api`, `finance:contracts:check`, `pnpm peers check` y
  `git diff --check`: PASS.
- La recepción de tres unidades en dos tandas, con una dañada, repone solo dos
  unidades de inventario. El reembolso posterior de US$69 no crea otro crédito
  ni afecta los US$31 de la otra tienda; su reintento no repite efectos.
- Cancelar una preparación sin envío restaura inventario y reservas una sola
  vez. Las solicitudes descartadas conservan UUID e historial, y las rutas
  nativas rechazan alteraciones de los datos originales del comprador.
- PostgreSQL y Redis TLS exclusivos de prueba eliminados al terminar;
  servicios de desarrollo conservados. No se realizaron pagos reales ni
  comprobación visual de estos nuevos controles en el navegador.
