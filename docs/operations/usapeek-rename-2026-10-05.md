# Renombrado a usapeek — 2026-10-05

## Marca y repositorio

La marca visible de storefront, operador, vendedor y plantillas de correo es
`usapeek`. Los paquetes del workspace usan `@usapeek/*`; los imports, scripts,
configuración de Next.js y lockfile están sincronizados. La reinstalación se
realizó con `pnpm install --offline --ignore-scripts`, sin agregar dependencias.
Los nombres predeterminados de nuevos conjuntos de envío y recogida también
usan la marca nueva; la búsqueda existente sigue reutilizando conjuntos guardados.

El repositorio es [caluff/usapeek](https://github.com/caluff/usapeek), y el remoto
local `origin` apunta a `https://github.com/caluff/usapeek.git`. Los cinco servicios
de aplicación de Railway reconocen ese repositorio y mantienen `develop`.
Los cambios de código están en el working tree: no se hizo commit ni push.

## Servicios y autenticación

| Recurso                            | Nombre / URL actual                                |
| ---------------------------------- | -------------------------------------------------- |
| Supabase principal, North Virginia | `usapeek` / `hbqenwcbsmpsjjfqjxac`                 |
| Supabase de recuperación, Oregon   | `usapeek-backup-oregon` / `pwytfdbvcpamkthyesqr`   |
| Proyecto Railway                   | `usapeek` / `0b5d408b-ca21-4f5a-88aa-5dabcfc4788b` |
| Storefront                         | `https://usapeek-web.up.railway.app`               |
| Operador                           | `https://usapeek-admin.up.railway.app`             |
| Vendedor                           | `https://usapeek-vendor.up.railway.app`            |
| API                                | `https://usapeek-api.up.railway.app`               |

Las variables públicas de backend, enlaces storefront–vendedor, callbacks,
`VENDOR_PUBLIC_URL` y los cuatro CORS usan los dominios nuevos. Se conservaron
los orígenes locales y las referencias compartidas del backend.
Las variables se aplicaron con `skipDeploys:true`.

Railway devuelve los dominios nuevos con estado `ACTIVE`, pero su snapshot
`Environment.config` y las variables automáticas `RAILWAY_PUBLIC_DOMAIN`,
`RAILWAY_STATIC_URL` y `RAILWAY_SERVICE_*_URL` aún muestran los hostnames anteriores.
Un patch limitado a los mapas de dominios, confirmado sin despliegues, no cambió
ese snapshot. No se sobrescribieron variables automáticas del proveedor. La
aplicación usa sus URLs explícitas nuevas; `SERVER_ACTIONS_ALLOWED_ORIGINS` está
definida por frontend con el hostname nuevo y tiene prioridad sobre el fallback
automático de Railway. La regeneración del snapshot del proveedor debe comprobarse
en el próximo despliegue; no se afirma que ya haya ocurrido.

Los DNS privados de los frontends son `usapeek-web`, `usapeek-admin` y
`usapeek-vendor` bajo `railway.internal`. Se revisaron los tres cambios de nombre
y se confirmaron con `environmentPatchCommitStaged(skipDeploys:true)`.

Google Cloud, el cliente OAuth y la marca de consentimiento se llaman `usapeek`.
Los tres dominios autorizados y callbacks HTTPS coinciden con Railway, con la ruta
`/auth/google/callback`; los tres callbacks de localhost permanecen registrados.
Se conservaron el ID del proyecto Google y las credenciales existentes. Google
indica que la propagación puede tardar de cinco minutos a varias horas.

La definición `.railway/railway.ts` refleja el proyecto, repositorio, dominios y
callbacks nuevos. Las regiones permanecen en US East y North Virginia.
El cambio de nombre de Supabase mantiene sus referencias, URLs y credenciales.

## Compatibilidad conservada

Estos identificadores conservan su valor porque referencian datos o recursos
existentes; no son nombres visibles de la aplicación:

- Las ocho claves persistidas `marketplace_v2_*` de pausas, archivado, envío,
  cobertura, recogida y snapshots. Cambiarlas exige una migración de los datos
  y de sus lectores.
- Cookies de autenticación `mv2_*`, cookies del carrito/comprobante y contratos
  de headers/eventos. No se invalidaron sesiones por cambiar la marca.
- El índice Algolia local `marketplace_v2_dev_products_local_dcalu` y sus réplicas.
  La clave disponible está restringida al índice actual; una sustitución requiere
  crear e indexar el destino antes de cambiar la configuración.
- Referencias de Supabase, IDs de servicios/volúmenes y etiqueta histórica de la
  credencial S3. No se rotaron credenciales ni se movieron datos.
- La carpeta física del checkout, los hosts Orca registrados y nombres/volúmenes
  existentes de Docker Compose. Cambiar el nombre efectivo de Compose crearía
  volúmenes nuevos vacíos. Los nombres en evidencias históricas conservan el
  contexto del momento en que se registraron.

La preferencia de tema y los recordatorios locales usan ahora `usapeek`.
El remitente local de Resend conserva la dirección y cambia solo el nombre visible.

## Validación y siguiente despliegue

- `pnpm lint`, `pnpm typecheck`, `pnpm build` y `pnpm peers check`: PASS.
- La API se reconstruyó después del ajuste final de nombres predeterminados de
  envío: PASS. Lint conserva 58 advertencias existentes y cero errores.
- Trece verificaciones funcionales puras: PASS, sin red. Incluyen siete
  plantillas de correo, validación/escape, lectura de pausas persistidas,
  preferencias de tema y resolución de paquetes.
- Doce casos adicionales de configuración de Server Actions: PASS. Verifican
  prioridad del dominio explícito, fallback automático, Orca local y validación.
  Se repitieron lint, typecheck y build de los tres frontends tras ese ajuste;
  todos pasaron. La definición de Railway también pasó una comprobación TypeScript.
- No se ejecutó la suite HTTP/SQL: requiere PostgreSQL TLS en `55432` y Redis TLS
  en `56379/15`; solo estaban disponibles los servicios de desarrollo en
  `5432` y `6379`. No se usó la base compartida para pruebas de integración.

Los seis servicios de Railway permanecen apagados. No se desplegó el código nuevo
ni se certificó un login OAuth o flujo de negocio en las URLs nuevas. El próximo
despliegue debe publicar los cambios del workspace y reconstruir los tres
frontends para incorporar sus variables públicas nuevas.
