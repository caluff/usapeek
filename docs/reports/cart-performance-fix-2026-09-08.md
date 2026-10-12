# Corrección de latencia del carrito

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

Fecha: 8 de septiembre de 2026.

## Evidencia y causa

La investigación inicial está en [el informe de mediciones](./cart-performance-2026-09-08.md). Desde el navegador, agregar un producto tardó 14,53 s sin carrito y 10,43 s con carrito existente. El POST nativo consumía 6,94–7,97 s; después, el storefront esperaba otros 2,16–2,38 s de recarga RSC.

La API estaba en el este de Estados Unidos y PostgreSQL detrás del pooler Supabase de AWS us-west-2. Un muestreo observó 89 sentencias de negocio y solo 15,98 ms de ejecución acumulada dentro de PostgreSQL; ese dato no incluye transporte, espera del pool ni procesamiento del framework.

Se movió exclusivamente la API a Railway us-west2 (California), manteniendo el mismo commit 6ed1756 para comparar. Esa región es más cercana a Oregon, aunque no es la misma región de AWS.

| Muestra consecutiva | Cliente SDK | Proxy HTTP Railway |
| --- | ---: | ---: |
| Primera, carrito vacío | 5,343 s | 4,603 s |
| Añadir unidad | 4,685 s | 3,996 s |
| Añadir unidad | 4,080 s | 3,394 s |
| Añadir unidad | 3,920 s | 3,373 s |

Estas muestras prueban una mejora sustancial al cambiar la región. No son una prueba de carga ni un p95. El pool PostgreSQL se comparte entre peticiones y conserva hasta cuatro conexiones; min=0 e idleTimeout=30 s pueden añadir conexión inicial después de inactividad, pero no explican por sí solos las tres peticiones consecutivas separadas por menos de cinco segundos.

## Cambios

- El POST nativo de Mercur ahora respeta la selección validada de campos. El storefront solicita id y cantidades en lugar de reconstruir la representación completa del carrito. Se preservan las validaciones nativas de oferta, precio, stock y venta pausada, los workflows, hooks y compensaciones. Otros consumidores conservan la respuesta completa por defecto.
- La comprobación previa solicita únicamente identidad, moneda, finalización y país. Crear un carrito y añadir una oferta siguen siendo operaciones nativas separadas: el flujo de creación no acepta offer_id con las mismas garantías de Mercur.
- Añadir usa un Route Handler del propio storefront que gestiona la cookie HttpOnly y consume Medusa mediante el SDK. Devuelve un contador confirmado sin invalidar y renderizar de nuevo la ficha completa. Se mantienen validación de origen, entrada y errores, y no se reintenta automáticamente una mutación de resultado incierto.
- Cambiar cantidades en el carrito solicita una respuesta mínima y limita la invalidación a /cart.
- Se reemplazó Map.groupBy en el agrupamiento de envíos, que fallaba en el Node 20 del despliegue. Una prueba ejecuta el agrupamiento con esa función explícitamente ausente.

## Validación

El primer bloque pasó lint, typecheck, tests y build de web y API; también el empaquetado autónomo de producción de API y pnpm peers check. La revisión cubrió las restricciones de campos de la ruta nativa y respuestas de stock insuficiente.

Las mediciones publicadas después de desplegar todos los cambios se registran a continuación.

## Medición después del primer despliegue

API d375ad3 en us-west2 y web d375ad3 publicados. Tres POST directos solicitando id y cantidades tardaron 3,388 / 3,023 / 3,141 s desde Uruguay; el proxy Railway midió 2,703 / 2,491 / 2,464 s. El cuerpo de la respuesta nativa tenía 74 bytes.

En navegador, añadir una unidad a un carrito existente tardó **3,065 s hasta quedar confirmado y habilitado el botón** (antes 10,429 s, reducción del 70,6 %). Hubo una sola petición del navegador: POST /api/cart/items. No hubo long tasks ni recarga posterior de la ficha. La API registró 145 ms de comprobación previa y 2.519 ms del POST. El resto corresponde al transporte y al storefront; no son spans suficientes para separar cada milisegundo.

Cambiar cantidad de 8 a 9 en /cart tardó **3,606 s** hasta habilitar otra vez el control. El Server Action terminó en 3,593 s. Next también emitió prefetches pequeños tras invalidar la ruta; este camino conserva la recarga necesaria de cantidades y totales.

Una segunda [ventana de estadísticas SQL](./cart-performance-fix-sql-2026-09-08.json) aisló una mutación con carrito existente y dirección US: 85 sentencias de negocio y aproximadamente 6,12 ms de ejecución en PostgreSQL, excluyendo 9 lecturas de workflow y 2 de autenticación del pooler. Las consultas siguen siendo numerosas dentro del flujo nativo. La dirección y estado del carrito difieren del primer muestreo; no debe interpretarse la diferencia de número de SQL como comparación controlada.

El límite medido sigue siendo el POST nativo (~2,5 s), por lo que todavía no se garantiza una confirmación total menor de 2 s. No se sustituyó esa confirmación por un éxito ficticio ni se retiraron controles de stock/precio para aparentar rapidez.

## Navegador con web 9c51bbd

Dos repeticiones de añadir una unidad: **2,947 s y 3,037 s**. Carrito nuevo: **4,185 s**, incluido crear y persistir el carrito antes de añadir la oferta. No hubo long tasks durante los clics; dos eventos de 51/53 ms pertenecían a la carga inicial anterior. El contador recibió datos confirmados sin recargar la ficha.

Guardar la dirección existente y llegar a las opciones de envío: **5,419 s**, frente a 15,134 s en el muestreo inicial (no es un A/B de idéntico estado). Seleccionar el envío y mostrar Revisar y pagar: **6,609 s**. Se confirmó que ya no falla Map.groupBy en el runtime desplegado. No se inició un pago ni se creó un pedido. El checkout todavía conserva costes del flujo nativo y navegación RSC; no se presenta como un flujo completo de dos segundos.

La revisión del contador añadió sincronización de snapshots confirmados con lecturas posteriores del servidor, incluida hidratación tardía y carrito vacío, sin volver a consultar el catálogo.

## Hallazgo adicional de inventario

La prueba real de límite detectó un defecto previo de Mercur: con stock 20 y carrito 12, añadir 20 validaba únicamente el incremento 20 y dejaba 32. manage_inventory=true y allow_backorder=false se verificaron en la oferta completa; una proyección sin relaciones de inventario no basta para evaluar ese dato. La prueba no llegó a checkout ni reservó/cobró stock. Se redujo el carrito QA a una unidad por el SDK antes de continuar.

## Compatibilidad con el rediseño local del usuario

Se preservaron los cambios de diseño en cart/page, cart-item, quantity controls, order-summary, data y availability presentation. La integración solo sustituye la lectura completa de ofertas por una lectura del inventario de las ofertas del carrito y prioriza el vínculo canónico de oferta sobre metadata. No existe una URL publicada del rediseño.

Se usó el servidor de desarrollo ya abierto en localhost:3000, conectándolo temporalmente a la API publicada mediante su configuración pública. Al terminar se restauró apps/web/.env.local exactamente a su contenido anterior. No se inició otro servidor ni se publicó el rediseño.

| Acción con los botones nuevos | Tiempo visible en desarrollo local | Resultado |
| --- | ---: | --- |
| Aumentar | 6,551 s | 1 → 2; contador y total actualizados |
| Reducir | 5,468 s | 2 → 1; botón de eliminar disponible |
| Eliminar | 3,658 s | 1 → 0; carrito vacío y contador cero |

Son tiempos de desarrollo: las llamadas del servidor web salen desde Uruguay hacia la API remota, y no equivalen al tiempo del storefront publicado. El diseño permaneció visible durante cada operación, con loading limitado a los controles. En producción, con la interfaz previamente publicada pero los mismos Server Actions, actualizar había medido 3,606 s y eliminar midió **1,923 s**.

La consulta de disponibilidad anterior obtenía precios y todas las ofertas de los productos. La nueva filtra también por los IDs de las ofertas del carrito y solicita las relaciones de inventario necesarias, sin calculated_price. Se conserva una sola promesa compartida entre controles y la paginación. En seis lecturas alternadas la mediana del cliente bajó de 674 a 486 ms y el cuerpo de 2260 a 563 bytes; ambas devolvieron stock 20. Pedir inventory_quantity sin sus relaciones devuelve incorrectamente cero en el helper nativo, por lo que no se hizo esa simplificación. El stock visible es orientativo y la validación nativa sigue siendo autoritativa.

Los valores agregados están en [los datos de la corrección](./cart-performance-fix-data-2026-09-08.json).

## Corrección de inventario y validación final

Commit 88a4754 corrige ADD y UPDATE en los hooks nativos existentes. ADD agrupa las cantidades actuales por oferta y suma todos los incrementos; UPDATE suma las otras líneas de esa oferta y sustituye la cantidad de la línea objetivo. La lectura de líneas en ADD se ejecuta en paralelo con la lectura de ofertas que ya existía, bajo el lock nativo de carrito. Se conservan multiplicadores de inventario, backorders, ofertas sin inventario gestionado y compensaciones; DELETE no se modifica.

Pruebas: stock 20 / existentes 12 + agregar 20 rechaza; +8 acepta; otras líneas 12 / objetivo actualizado a 9 rechaza y a 8 acepta. El workflow real con hooks de Mercur y de la aplicación cargados rechaza antes de escribir y libera el lock.

Validación conjunta final: 100 pruebas web, lint web, typecheck web y build web; 49 suites / 597 pruebas API más 3 de empaquetado, lint API (7 advertencias previas), typecheck API, build:api:deploy y pnpm peers check. La copia aislada de producción incluye ambos cambios de inventario. No se detectaron conflictos de merge ni errores de espacios en el diff. Los archivos del rediseño del usuario siguen en su trabajo local; los commits publicados contienen nuestras correcciones y el nuevo helper compatible.

## Verificación del despliegue final 88a4754

Los cinco servicios Railway finalizaron en SUCCESS. API: 605dc29d-399f-4a36-be1b-b866966a249b. Web: 8c0934eb-2786-4b8a-ba64-6d7c5a21a778. Worker: d359f68b-55dc-4027-a0a5-d978439775f6.

| Acción publicada, después de corregir stock | Clic → resultado visible | API: comprobación previa | API: mutación | API: lectura para renderizar |
| --- | ---: | ---: | ---: | ---: |
| Añadir al carrito existente | **3,020 s** | 127 ms | 2527 ms | No necesaria |
| Actualizar cantidad 1 → 2 | **3,376 s** | 141 ms | 2446 ms | 351 ms |
| Eliminar el producto | **1,869 s** | 140 ms | 1128 ms | 194 ms |

El tiempo restante incluye transporte, respuesta del storefront y renderizado. Añadir produce una sola petición del navegador y no recarga la ficha. Actualizar/eliminar conservan su respuesta RSC con los totales, más prefetches del framework. Volver atrás a la ficha después de eliminar mostró contador cero. Las muestras confirman la mejora, pero no constituyen un p95 ni una garantía universal de dos segundos.

La prueba real de inventario confirmó stock 20, inventario gestionado y backorder deshabilitado: 12+20 rechazado con HTTP400 y carrito todavía12; 12+8 aceptado con20; actualizar a21 rechazado sin cambiar20; actualizar a2 aceptado. Se vaciaron ambos carritos QA y se verificó completed_at=null, sin líneas ni sesiones de pago. No se creó ningún pedido.
