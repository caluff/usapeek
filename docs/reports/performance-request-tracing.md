# Diagnóstico de peticiones y permisos

Guía de diagnóstico vigente, aunque se encuentra en `reports`. No acredita mediciones nuevas de rendimiento. Para el estado de desarrollo y las verificaciones por ejecutar, consultar el [índice documental](../README.md) y el [progreso](../develpment/development-progress.md).

## Instrumentación opt-in

`PERFORMANCE_TRACE_ENABLED=true` en el entorno del proceso API activa
`performanceTrace`. Está apagada por defecto. No se cambia Redis, no se envía
telemetría a terceros y no se necesita instalar un collector.

Cada respuesta expone `X-Request-Id` y genera un registro `performance.http` al
terminar o abortar. Solo se acepta un identificador UUID entrante; otros valores
se sustituyen por uno nuevo. El registro incluye método, plantilla de ruta,
estado HTTP, duración desde la entrada al middleware y grupos de llamadas
Medusa `query.graph`/`query.index`: entidad, iniciadas, completadas, errores y
duración acumulada. Nunca incluye filtros, argumentos, resultados, SQL, URL real,
query string, cuerpo, cabeceras de autenticación ni mensajes de error.

El proxy Query vive únicamente en `req.scope`; no modifica la instancia global
ni instrumenta otros requests/workers. Se conservan `this`, argumentos,
resultados y excepciones originales. Hay un máximo de 32 grupos por petición.

Para correlacionar una navegación, inspeccionar en Network las peticiones a la
API y buscar su `X-Request-Id` en los logs. Las llamadas Next → API ocurren en el
servidor: deben correlacionarse con su propio cliente/log, no confundirse con el
request del navegador a Next. El middleware no modifica SDKs del frontend.

## Límites de las métricas

- `duration_ms` mide desde este middleware, no DNS/TLS, descarga del navegador,
  render de Next, ni middleware que ya se hubiese ejecutado antes.
- La suma de tiempos de Query puede exceder el total HTTP porque llamadas
  independientes corren en paralelo. No restarla del total para afirmar tiempo
  de red, CPU o pool.
- Un `graph` no equivale a una consulta SQL: puede ejecutar varias consultas,
  ORM, enlaces y cachés. Los servicios de módulo llamados directamente tampoco
  están incluidos en esos contadores.
- No hay spans SQL/pool/Redis/servicios externos ni p95 de producción. Para
  atribuirlos hace falta instrumentación de esos clientes y observación desde
  el despliegue real. No se registra SQL sin redactar para obtenerlos.
- No se publica una duración total ficticia en `Server-Timing`: el total real
  solo se conoce en `finish`/`close`, cuando las cabeceras ya se enviaron.
- Apagar el flag al terminar el diagnóstico evita coste adicional de logs.

## Permisos y acceso optimizados

El patch versionado de Medusa 2.18.0 comparte una promesa por rol entre las
comprobaciones de ruta y campos únicamente en scopes HTTP GET/HEAD. La siguiente
petición vuelve a leer políticas con caché de Query desactivada. Los contenedores
de workflows, jobs y mutaciones no se incorporan a esta memoización; no hay un
TTL global de siete días ni nuevas lecturas/escrituras Redis para permisos.

El patch Mercur 2.3.3 prepara los roles predeterminados una sola vez por instancia
de servicio/proceso; peticiones concurrentes comparten la inicialización y un
fallo permite reintentar. Una primera petición fría todavía puede pagar ese
coste. La navegación estable no vuelve a inicializar bindings. La inicialización
nativa de alta/invitaciones sigue vigente. Reiniciar o ejecutar esos workflows
puede reponer bindings predeterminados, igual que el inicializador nativo: esta
optimización no convierte esos roles en plantillas personalizables persistentes.

Mercur lee la membresía, miembro y tienda actuales con caché desactivada. El
guard de la aplicación puede reutilizar esas relaciones en GET/HEAD, comprobando
identificadores, miembro activo, tienda abierta y aprobación completa. No usa el
resultado de otra tienda/miembro ni una caché compartida entre peticiones.
