# Optimización de rendimiento — implementación y verificación

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

Fecha: 2026-09-08. Continúa el [diagnóstico inicial](performance-audit-2026-09-08.md).

## Resultado

Se ejecutaron las optimizaciones de código de mayor impacto sin cambiar reglas
de negocio, permisos, inventario ni la infraestructura de colas. No se considera
cerrado todo el plan: quedan la configuración de infraestructura y la medición
interna de las esperas residuales.

Comparación local con `pnpm dev`, la misma base y las mismas cuentas de QA:

| Vista | Antes | Después | Lectura del resultado |
|---|---:|---:|---|
| Vendor: catálogo | 6.239 s | 2.743 / 2.773 / 2.992 s | Mediana 2.773 s; aproximadamente 56% menos |
| Vendor: detalle de producto | 14.581 s de documento | 6.770 s en la segunda muestra; tercera ~6.7 s en log Next | Aproximadamente 54% menos; primera muestra 8.210 s, incluyendo compilación |
| Vendor: inventario | 7.7–9.1 s, logs anteriores | ~2.9 s, log Next | Comparación orientativa, no baseline controlado equivalente |
| Vendor: almacén | ~8.1 s, log anterior | ~2.8 s, log Next | Comparación orientativa; se elimina una etapa HTTP |
| Admin: solicitudes | 4.090 s + un POST adicional solapado de 3.781 s | 4.070 / 4.002 / 3.983 s; sin ese POST | Menos trabajo, pero la carga principal prácticamente no mejora |
| Store: inicio anónimo | 3.015 s | 1.870 / 1.860 s en caliente | Primera muestra tras reinicio: 3.779 s; no presentar la mejora caliente como garantía en frío |

Son muestras diagnósticas, no resultados de producción, pruebas de carga ni p95.
El documento puede seguir descargándose mientras Suspense ya muestra partes de
la pantalla. Estos tiempos no equivalen al tiempo hasta el primer contenido ni
a una medición de LCP. No se suman solicitudes que se solapan.

## Cambios implementados

### Permisos y acceso — P1.1 / P1.2

- Patch versionado de Medusa 2.18.0: las comprobaciones equivalentes de permisos
  de ruta y campos comparten una promesa por rol dentro del mismo GET/HEAD.
  La siguiente petición vuelve a leer políticas. No se añade un TTL global ni
  caché de permisos en Redis, y no se incorpora a mutaciones o workflows.
- Patch de Mercur 2.3.3: el bootstrap de roles predeterminados se comparte una
  vez por instancia de servicio/proceso, con reintento si falla. No se ejecutan
  sus tres lecturas en cada recurso durante la navegación estable. La primera
  petición fría todavía puede inicializarlo.
- Reutilización del contexto nativo de miembro/membresía/tienda en las lecturas
  autorizadas, verificando identidad, pertenencia, actividad y aprobación.
  Se mantiene el control de acceso vigente y el aislamiento entre vendedores.
- Los patches se registran en pnpm y están presentes en las resoluciones de
  framework utilizadas por API, Medusa y Mercur; no son ediciones sueltas de
  `node_modules` que se perderían al instalar.

Evidencia posterior del detalle: siete HTTP Next → API, frente a ocho antes.
La segunda muestra registra 71 ejecuciones SQL / 21.50 ms de ejecución acumulada
frente a 140 / 55.524 ms en el diagnóstico. Son deltas globales de
`pg_stat_statements` durante esas ventanas, no spans SQL exclusivos de la ruta.
La instrumentación por request confirma una llamada Query de permisos por rol
en cada endpoint protegido medido. Las consultas RBAC de la ventana pasan de
36 a 18; desaparece el bootstrap por recurso en caliente.

No se utiliza el antiguo conteo SQL del catálogo para comparar: aquella ventana
se solapaba con la navegación del login. Las tres ventanas posteriores del
catálogo registraron 13 consultas cada una y 3.21–3.73 ms de ejecución SQL.

### Vendor — P1.3 y renderizado progresivo

- Eliminado el GET previo de listado de producto que antecedía al detalle y a
  determinadas mutaciones. El endpoint final y sus subrutas ya comprueban la
  visibilidad y la pertenencia en backend; los tests cubren ese contrato.
- Detalle y opciones se consultan en paralelo. Categorías, perfiles de envío y
  ubicación empiezan antes, sin esperar al resultado combinado del producto.
- Nuevo GET `/vendor/warehouse`: devuelve la proyección del almacén único tras
  validar su asignación canónica y exclusiva. Sustituye listado → detalle por
  una petición. Almacén inexistente o asignación ambigua siguen fallando de forma
  explícita; el cliente no elige arbitrariamente la primera ubicación.
- Contadores, pedidos y preparación de la tienda se renderizan en límites
  Suspense locales; se comparte la petición de pedidos entre consumidores.
- Invalidaciones de acciones más acotadas y eliminado el refresco cliente
  redundante de la actualización de Stripe.

La cascada residual del detalle está identificada: contexto de tienda ~0.219 s,
detalle ~3.931 s y ofertas ~2.378 s, con los demás recursos en paralelo. La API
nativa de ofertas acepta `variant_id`, no `product_id`; las ofertas todavía
esperan a conocer las variantes. No se inventó un filtro no soportado ni se
cargaron todas las ofertas de la tienda para ocultar esa dependencia.

### Store, onboarding y admin — P2.1 / P2.2 / P2.3

- Regiones y categorías se comparten por render. Header y footer dejan de
  depender del catálogo completo, y los productos no esperan categorías.
- Formulario e historial de solicitud tienen Suspense local. Categorías y
  direcciones no bloquean los primeros pasos; su promesa se inicia y consume en
  los componentes correspondientes, sin fingir que sus datos ya están listos.
- Backend reutiliza el acceso aprobado al componer la respuesta de solicitud y
  paraleliza lecturas independientes. Una cola admin vacía no consulta clientes.
- Admin comparte `getCurrentAdmin` por render y siembra el indicador con datos
  del servidor. La cola y el indicador reutilizan la consulta equivalente.
  Desaparece el POST inicial que repetía identidad y cola al hidratar.
- Eliminados refrescos cliente adicionales donde la Server Action ya revalida
  y devuelve el árbol actualizado. Se preservan las invalidaciones necesarias
  cuando cambian navegación, estado de solicitud o contadores.

No se añadió caché persistente de regiones/categorías: las aplicaciones se
despliegan por separado y aún falta un contrato de invalidación entre ellas.
Tampoco se memoizan lecturas de autorización entre requests. La reconstrucción
completa posterior a ciertas mutaciones de onboarding sigue siendo mejorable.

### Lotes, cancelación, medios y Stripe — P2.4 / P3

- Elegibilidad de ofertas: variantes, perfiles y vendedor se consultan en lote,
  y las restricciones de producto se verifican agrupadas. Crear ofertas de un
  vendedor requiere cuatro consultas de elegibilidad, no cuatro por oferta.
  Las actualizaciones agrupan por vendedor y conservan validaciones por entidad.
- Atributos referenciados se obtienen en una consulta, manteniendo pertenencia,
  vigencia y validación de valores. Se prueban lotes y mezclas entre vendedores.
- Uploads de imágenes agrupados dentro del límite backend de 5 MiB por lote;
  se preservan archivos ya enviados ante fallos parciales y el submit conjunto.
  No se subió el límite global del backend para acomodar lotes enormes.
- El timeout del catálogo aborta el transporte SDK real. Ya no se limita a
  devolver un fallback mientras la petición sigue trabajando en segundo plano.
- Imágenes de productos mediante Next Image con origen y ruta pública de
  Storage explícitamente permitidos. La configuración pública no contiene
  credenciales de Storage.
- Webhook Stripe: verificación criptográfica local antes de aceptar el evento,
  sin recuperar remotamente la cuenta en ese guard. El camino exitoso pasa de
  tres a dos recuperaciones de cuenta: se mantienen la del subscriber nativo y
  la lectura fresca bajo lock de la reconciliación. La reducción se verifica
  mediante tests, no mediante eventos reales enviados en esta sesión.

### Instrumentación — P0 parcial

Añadida instrumentación opt-in `PERFORMANCE_TRACE_ENABLED=true`, apagada por
defecto: request-id, duración del middleware y llamadas Query por entidad,
acotadas por request y sin filtros, SQL, cuerpos o credenciales. No añade
comandos Redis ni envía telemetría externa.

Se utilizó temporalmente durante la comparación y se retiró el flag del proceso
al terminar. Se dejó `pnpm dev` funcionando en los cuatro puertos; la API devolvió
`GET /health` → 200 `OK` tras el reinicio normal. Consulte
[alcance y uso de las trazas](performance-request-tracing.md). No sustituye spans
SQL/pool/Redis: las esperas anteriores al middleware y los servicios de módulo
llamados directamente no están incluidas en sus contadores Query.

## Verificación ejecutada

- `pnpm lint`: correcto; seis warnings API preexistentes de imports internos.
- Typecheck de web, admin y vendor: correcto. Se corrigió un fixture de test
  incompleto detectado por API y se volvió a ejecutar `pnpm typecheck:api`: correcto.
- `pnpm test`: 766 pruebas correctas (web 58, admin 66, vendor 102, API 532,
  tema compartido 8). Después se agregaron cinco casos de regresión de rutas y
  aislamiento; las dos suites afectadas se ejecutaron de nuevo: 57/57 correctos.
- `pnpm build`: correctas las cuatro aplicaciones, incluido el backend.
- `pnpm peers check` y `git diff --check`: correctos.
- QA en Chromium: login vendor/admin y lecturas de catálogo, detalle,
  inventario, almacén, solicitudes e inicio del store. Las navegaciones medidas
  devolvieron HTTP 200 sin excepciones JavaScript. El admin no lanzó el POST
  adicional del indicador. Las muestras comienzan después de resolver el login.
- Navegación real por sidebar, esperando a terminar la respuesta RSC y a que
  aparezcan los datos: inventario mostró el encabezado en 845 ms y contenido
  en 3.206 s; catálogo, encabezado en 845 ms y tabla en 2.457 s. Sin errores de
  carga visibles. Son muestras adicionales, no comparaciones de la tabla anterior.
- Sin creación de pedidos, cobros, correos, uploads ni cambios de productos en
  la comparación. Las estadísticas PostgreSQL se leyeron con conexión read-only,
  sin resetear contadores. No se añadieron procesos Medusa ni workers paralelos.

Los tests de permisos, visibilidad, revocación, aislamiento, lotes, abort,
webhook firmado y almacén validan las garantías de los cambios. No se afirma una
QA end-to-end de todas las mutaciones ni una prueba de carga de producción.

## Pendiente, en orden de impacto

1. **Infraestructura de desarrollo / Redis.** El consumo periódico de los
   workers BullMQ y sus comprobaciones de delayed/stalled jobs continúa. No se
   desactivaron mecanismos de recuperación, jobs ni locks para reducir cuota.
   Elegir explícitamente Redis local para desarrollo o un servicio con un modelo
   de coste adecuado, manteniendo los workers funcionales. Antes de cambiar URL,
   planificar los trabajos pendientes del Redis anterior. Verificar consumo
   con métricas de Railway, no extrapolando contadores de `INFO`.
2. **Colocación y esperas internas.** API local sigue hablando con PostgreSQL
   remoto; el RTT de referencia ronda 212 ms. Medir adquisición del pool,
   reconexiones, ORM y Redis con spans correlacionados y comparar desde la región
   de despliegue. No aumentar el pool ni añadir índices sin evidencia nueva.
3. **Admin y detalle residual.** Admin conserva aproximadamente cuatro segundos
   de carga principal. Hay controles de reviewer y permisos nativos que aún
   hacen lecturas separadas. En producto quedan detalle → variantes → ofertas.
   Consolidar sin relajar la autorización; no basta con otro spinner.
4. **Onboarding y escala.** Acotar lecturas existenciales de preparación de la
   tienda y reducir la reconstrucción de respuesta tras mutaciones. Validar con
   un catálogo representativo; la base auditada tiene dos productos.
5. **Caché persistente e invalidación entre apps.** Definir propagación de cambios
   de categorías/región antes de compartir datos persistentes entre despliegues.
6. **Verificación restante.** p50/p95 en producción y carga concurrente, mutaciones
   end-to-end de lotes/uploads/reintentos y webhooks reales controlados. Medir
   imágenes/LCP aparte de la descarga de HTML.

No se cambiaron credenciales, región de servicios, política de comisiones,
flujos de cobro, trabajos pendientes ni reglas de envío. No se realizó commit ni
push. Se preservaron los cambios previos del worktree y el trabajo de envíos de
la otra sesión.
