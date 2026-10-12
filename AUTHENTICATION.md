# Autenticación

Guía vigente actualizada el 2026-10-03; no acredita una nueva prueba de login, correo
o configuración remota. El estado de cierre y las verificaciones pendientes se
siguen en [Development Progress](docs/develpment/development-progress.md).

Las tres aplicaciones usan el Medusa JS SDK con JWT y almacenamiento
`nostore`. Los Server Actions guardan el JWT en una cookie `HttpOnly`,
`SameSite=Lax` y con un nombre distinto para cada actor. Los proxies solo hacen
una comprobación optimista de presencia y expiración; los layouts protegidos
validan la identidad contra Medusa/Mercur antes de renderizar.

| Aplicación    | Actor      | Cookie de sesión            | Validación protegida                                                                           |
| ------------- | ---------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/web`    | `customer` | `mv2_web_customer_session`  | `sdk.store.customer.retrieve()`                                                                |
| `apps/admin`  | `user`     | `mv2_admin_user_session`    | `sdk.admin.user.me()`                                                                          |
| `apps/vendor` | `member`   | `mv2_vendor_member_session` | `/vendor/sellers`, `/vendor/sellers/select` y `/vendor/members/me` mediante `sdk.client.fetch` |

El contexto de vendedor se guarda por separado en
`mv2_vendor_seller_context`. Cada restauración comprueba que la membresía siga
activa y pertenezca al seller seleccionado. La autorización y el aislamiento
definitivos continúan a cargo del backend.

Las respuestas multietapa del SDK se procesan sin habilitar políticas nuevas en
el backend: `verification_required` abre la verificación de correo,
`mfa_required` conserva temporalmente el desafío en una cookie `HttpOnly`, y
`location` presenta un enlace únicamente cuando es una URL HTTP(S) válida.

## Variables requeridas

- `NEXT_PUBLIC_MEDUSA_BACKEND_URL`
- `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (solo `apps/web`)
- `STOREFRONT_URL`
- `ADMIN_URL`
- `VENDOR_URL`
- `STORE_CORS`
- `ADMIN_CORS`
- `VENDOR_CORS`
- `AUTH_CORS`
- `SERVER_ACTIONS_ALLOWED_ORIGINS` (opcional, lista separada por comas para
  dominios públicos adicionales o dominios personalizados)

En Railway, los builds de Next incluyen automáticamente el dominio exacto de
`RAILWAY_PUBLIC_DOMAIN` en `serverActions.allowedOrigins`. Esto permite que la
protección CSRF de Server Actions reconozca el origen público aunque el reverse
proxy use otro `x-forwarded-host`; no se aceptan comodines globales.

## Correo de autenticación

Los subscribers de `auth.password_reset` y `auth.verification_requested` están
implementados para los templates lógicos `auth-password-reset` y
`auth-email-verification`. El proveedor Resend ya está implementado y se registra
en Medusa cuando `AUTH_EMAIL_ENABLED` es exactamente `true`. Para habilitarlo,
guardar en el `.env` ignorado de la raíz:

- `AUTH_EMAIL_ENABLED=true`
- `RESEND_API_KEY` (privada)
- `RESEND_FROM_EMAIL` (remitente; `AUTH_EMAIL_FROM` es solo el fallback legado)

La configuración incompleta o inválida impide el arranque cuando está habilitado.
La entrega depende además de la autorización de la clave y del remitente en
Resend: la aceptación del envío no confirma recepción en la bandeja del usuario.
Si no se habilita, permanece el canal local `feed`. Los enlaces de recuperación y
verificación se construyen con la URL correspondiente al actor. El frontend
retira el token o código de la URL en el primer request, lo guarda brevemente en
una cookie `HttpOnly` y nunca lo persiste en almacenamiento del navegador ni lo
registra en logs de la aplicación.

La deduplicación, los reintentos y los estados de entrega ambiguos se describen
en [el proveedor Resend](packages/api/src/modules/resend/README.md). No tratar
una notificación `pending` como entregada ni reenviarla sin conciliar primero.

## Google y acceso al portal vendedor

El [flujo Google](docs/google-auth.md) está conectado en las tres aplicaciones.
Clientes y miembros usan `google`; operadores usan `google-admin`. El login de
los paneles no crea permisos. La tienda también permite acceder al portal
vendedor desde `/account/sell` mediante un código de un solo uso y comprobación
backend de la membresía; no transmite el JWT por la URL.

El registro genérico de vendedores permanece deshabilitado. El acceso del
vendedor procede del [flujo de solicitud y aprobación](docs/vendor-operations.md),
no de registrarse libremente en el panel.

## Aislamiento de identidad y carrito

**F05 está cerrado** en el alcance de desarrollo: `clearCustomerSession()`
elimina también las cookies de carrito y comprobante mediante `clearCartSession()`.
Antes de publicar una sesión nueva, `setCustomerSession()` verifica al comprador
y adopta el carrito con las guardas nativas de ownership; no asigna a otra persona
un carrito ya perteneciente a un comprador. El comprobante anterior se elimina
al cambiar de sesión. Errores transitorios preservan el carrito invitado para
reintentar el login. La separación de cookies entre aplicaciones por sí sola no
sustituye estas comprobaciones ni la autorización backend.

Las regresiones de identidad y el cierre Phase 2/F12 están documentados en
[el progreso](docs/develpment/development-progress.md) y la
[matriz final](docs/develpment/evidence/development-closure-20261003.md).

## Fuentes de código y verificación

- [SDK y sesión de cliente](apps/web/lib/auth-sdk.ts), [acciones](apps/web/app/auth-actions.ts).
- [SDK de operador](apps/admin/src/lib/auth-sdk.ts) y [SDK de vendedor](apps/vendor/src/lib/auth-sdk.ts).
- [Configuración backend](packages/api/medusa-config.ts), [enlaces de correo](packages/api/src/lib/auth-email.ts).
- [Configuración Resend](packages/api/src/modules/resend/configuration.ts) y [adaptador de entrega](packages/api/src/lib/deliver-email-notification.ts).

Los comandos generales por aplicación están en el [README](README.md).
La suite HTTP de Google requiere infraestructura descartable y está documentada
en [Google Auth](docs/google-auth.md); no debe ejecutarse contra la base compartida.
