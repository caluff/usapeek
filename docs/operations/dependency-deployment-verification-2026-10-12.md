# Publicación y verificación de dependencias

Ejecutado el 2026-10-12 en Railway `usapeek`, entorno `production`, región
`us-east4-eqdc4a`. El usuario autorizó publicar todos los cambios, verificar los
servicios, apagarlos y fusionar `develop` en `main`.

## Cambios publicados

- `aee4b2c`: actualización del toolchain y dependencias, optimizaciones del
  runtime, refactorizaciones previas y eliminación solicitada de tests unitarios.
- `f78b991`: inclusión de `.pnpmfile.mjs` y parches en la capa de instalación de
  Railpack. Soluciona `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` conservando la
  instalación con lockfile congelado. Los cinco servicios observan estos archivos.

## Despliegue y migraciones

Los seis servicios llegaron a `SUCCESS`, con una réplica activa cada uno, sin
réplicas caídas ni alertas activas. API y worker confirmaron sus conexiones Redis.

Medusa aplicó 14 migraciones de módulos. La sincronización de enlaces pidió
confirmación para ampliar `product_variant_inventory_item.required_quantity`
a `numeric`. Se inspeccionó el plan nativo completo: esa era su única operación
pendiente; no incluía borrar tablas ni columnas. Se aplicó exclusivamente esa
operación con el planificador nativo de Medusa. La tabla tenía cero filas antes
y después, con el mismo fingerprint de cantidades. El intento que esperaba
entrada interactiva fue abortado y la API se desplegó nuevamente. El segundo
predespliegue confirmó enlaces e índices actualizados y ningún script pendiente.

## Verificación

- Build raíz y comprobación de peers correctos antes de publicar.
- 15 comprobaciones remotas correctas: salud de API; región USD/US; productos,
  categorías, ofertas y búsqueda; rechazo 401 de rutas protegidas de cliente,
  operador y vendedor; home, búsqueda, producto y ambos accesos; optimizador de
  imágenes. Las páginas principales devolvieron 200 y encabezados HSTS.
- Navegador: búsqueda inicial con dos productos y consulta `Producto 1` con un
  resultado; accesos Admin/Vendor renderizados; sin avisos ni errores de consola.
- Logs de los despliegues verificados sin errores de aplicación. En la ventana
  HTTP inspeccionada hubo 135 solicitudes y ninguna respuesta 5xx. Los tres 401
  pertenecían a las pruebas deliberadas de autorización.
- Persisten avisos de lint y subdependencias obsoletas durante el build. No
  impidieron compilar ni desplegar. Los fallos iniciales permanecen en el
  historial de Railway; fueron resueltos antes del apagado.

Estas comprobaciones cubren arranque, conexiones y navegación/lectura pública.
No constituyen una nueva prueba de operaciones financieras, sesiones
autenticadas, correos externos ni recuperación de respaldos.

## Apagado

Se retiraron únicamente los despliegues: primero los tres frontends, luego
worker/API y finalmente Redis. Railway confirmó los seis servicios `offline`,
cero despliegues activos y ninguna operación pendiente. Se conservaron servicios,
configuración, fuentes GitHub y el volumen Redis existente de 5.000 MB en `/data`.
Los servicios siguen conectados a `develop`; publicar `main` no debe levantarlos.
