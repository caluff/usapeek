# Acceso con Google

La tienda, el panel de operadores y el portal de vendedores admiten Google junto al acceso existente con correo y contraseña. La integración usa los proveedores nativos de Medusa 2.18.0 y las sesiones HttpOnly de cada aplicación.

Guía vigente actualizada el 2026-10-06. Describe código y configuración esperada; no confirma el estado actual de Google Cloud ni una nueva ejecución del flujo. Consultar [Autenticación](../AUTHENTICATION.md) para las sesiones y Resend, y [el progreso de desarrollo](develpment/development-progress.md) para verificaciones pendientes. F05 está cerrado: los caminos de login comparten adopción validada del carrito antes de publicar la sesión; logout limpia carrito y comprobante. Un login OAuth correcto por sí solo no sustituye esas guardas.

El login de la tienda conserva su panel izquierdo y presenta el formulario de correo y contraseña a la derecha, seguido del acceso con Google. El icono local `apps/web/public/icons/google.png` procede de los [recursos oficiales de Google](https://developers.google.com/identity/branding-guidelines).

## Configuración local

Guardar únicamente en el `.env` ignorado de la raíz:

```dotenv
GOOGLE_CLIENT_ID=<client-id de una aplicación web de Google>
GOOGLE_CLIENT_SECRET=<client-secret>
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

Cada frontend usa su `.env.local`, con valores públicos:

| Aplicación    | `NEXT_PUBLIC_GOOGLE_CALLBACK_URL`            |
| ------------- | -------------------------------------------- |
| `apps/web`    | `http://localhost:3000/auth/google/callback` |
| `apps/admin`  | `http://localhost:7000/auth/google/callback` |
| `apps/vendor` | `http://localhost:7001/auth/google/callback` |

En los tres frontends, `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000`. La tienda también necesita su `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` existente. No copiar secretos a los frontends.

En Google Cloud Console → Google Auth Platform:

1. Configurar Branding y Audience. Para usuarios externos a una organización, elegir External; en pruebas, agregar los correos de prueba.
2. Crear un cliente de tipo **Web application**.
3. Registrar las tres URLs locales de la tabla como **Authorized redirect URIs**, con coincidencia exacta. El flujo de redirección del servidor no necesita cargar Google Identity Services en el navegador.
4. Para One Tap en la tienda, registrar también `http://localhost` y `http://localhost:3000` como **Authorized JavaScript origins**, en el mismo cliente web. En producción, registrar el origen HTTPS de la tienda. [Configuración oficial de Google](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

El backend registra Google cuando están presentes las tres variables. Si solo se configura alguna, falla al arrancar con un mensaje que identifica los nombres faltantes. El botón se muestra cuando el frontend tiene una URL de callback válida. Reiniciar los procesos después de cambiar variables si no se recargan automáticamente:

```powershell
pnpm dev
```

## Comportamiento de las cuentas

- Un cliente nuevo puede crear su cuenta mediante Google; se utiliza el workflow nativo de registro de Medusa.
- En la tienda y ambos paneles, un Gmail verificado por el proveedor nativo se vincula automáticamente a la cuenta existente de correo y contraseña del mismo tipo de actor cuando coincide exactamente el correo normalizado y hay una única identidad compatible. Se conserva la identidad original, incluidos datos, contraseña, verificación, MFA y relación cliente–vendedor. No se eliminan puntos ni sufijos del correo para buscar coincidencias.
- Los otros correos mantienen la confirmación de la cuenta existente. Google también admite correos de proveedores externos, para los que un `email_verified` histórico no acredita por sí solo la titularidad actual. La integración nativa instalada no conserva `hd`, por lo que no se infiere la titularidad de Google Workspace por el dominio.
- El panel de operadores y el de vendedores nunca crean usuarios, miembros ni permisos durante el acceso con Google. Se comprueban las cuentas y membresías existentes.
- Cliente y vendedor usan el proveedor `google`. Operadores usan otra instancia nativa, `google-admin`, con las mismas credenciales OAuth. Esto permite usar una misma cuenta Google en una cuenta de operador y otra de cliente sin mezclar sus identidades o segundos factores.
- Una identidad Google ya asociada a otra cuenta no se fusiona ni reemplaza la sesión durante la vinculación.
- Las solicitudes de vendedor existentes admiten el correo verificado del proveedor Google. Se mantienen la aprobación y los controles de membresía.

## Flujo y protección

### Acceso desde el perfil al panel de vendedores

En `/account/sell`, **Ir al panel de vendedores** utiliza la sesión de cliente actual, tanto si se inició con contraseña como con Google. La API comprueba que la misma identidad tenga un miembro activo y acceso a una tienda habilitada antes de emitir un código de un solo uso, válido como máximo 60 segundos. No se crean permisos ni se vinculan cuentas por correo durante este acceso.

El navegador envía el código por formulario POST al portal configurado; no se incluyen tokens ni códigos en la URL. El portal acepta únicamente el origen de la tienda configurado y canjea el código para establecer su sesión HttpOnly habitual. Se mantienen la verificación del miembro y la selección de tienda cuando hay varias membresías.

Se usan las variables públicas existentes `NEXT_PUBLIC_VENDOR_URL` de la tienda y `NEXT_PUBLIC_STOREFRONT_URL` del portal vendedor. En local deben valer `http://localhost:7001` y `http://localhost:3000`, respectivamente; en Railway deben contener los orígenes HTTPS reales. No hacen falta secretos adicionales. El documento de traspaso usa `Referrer-Policy: strict-origin` para que el POST conserve el encabezado `Origin`; cambiarlo a `no-referrer` impide validar el origen.

### Acceso con Google

El botón ejecuta una Server Action que llama a `sdk.auth.login`, valida la URL devuelta y guarda una cookie HttpOnly temporal con `state`, destino local y, para vinculación, el hash de la sesión que la inició. El callback compara el estado y su vencimiento antes de llamar a `sdk.auth.callback`. Un cambio de sesión invalida la vinculación.

`POST /auth/google/complete` recibe un bearer token Google validado por Medusa y el tipo de actor. Para un Gmail verificado, busca la cuenta del mismo tipo y su identidad de correo y contraseña sin ambigüedades; para la vinculación explícita exige además un token de la cuenta existente que haya completado sus verificaciones. El workflow mueve el proveedor a esa identidad y devuelve un token sin permisos; `sdk.auth.refresh` aplica las verificaciones y MFA nativos antes de que el frontend consulte el perfil y establezca la sesión.

### One Tap en el inicio de la tienda

En `/`, cuando la sesión está resuelta y no hay cliente conectado, la tienda carga el componente oficial Google Identity Services sin bloquear el contenido de la página. El botón de la barra muestra **Iniciar sesión** en escritorio y conserva su icono en móvil. Sigue disponible si Google no muestra el aviso.

El aviso usa la posición predeterminada junto al acceso de la esquina superior derecha. Con FedCM, el navegador controla su presentación y posición; Google puede suprimirlo por ausencia de una sesión Google, preferencias del navegador o un cierre anterior. No se fuerza su aparición ni se sustituye por un diálogo propio. [Posición del aviso](https://developers.google.com/identity/gsi/web/guides/change-position).

`POST /auth/google/one-tap/transaction` crea una transacción de diez minutos. La Server Action conserva su prueba cifrada en una cookie HttpOnly por nonce y entrega al navegador solo el ID público del cliente y el nonce. Cada pestaña consume únicamente su propia cookie. El componente devuelve el ID token de Google a otra Server Action, que canjea ambos mediante `sdk.auth.login("customer", "google", ...)`. La API utiliza el verificador criptográfico nativo de Google, comprueba el nonce, vencimiento, emisión y correo verificado, y consume la prueba una sola vez con el bloqueo compartido de Medusa antes de consultar o modificar identidades.

One Tap reutiliza la identidad `google`, la creación o vinculación existente, MFA, verificación de correo y adopción validada del carrito. Solo se acepta para clientes; el acceso de los paneles conserva OAuth. No requiere variables públicas nuevas ni copiar secretos a la tienda. La sesión se establece únicamente después de consultar el perfil autorizado.

La suite aislada `packages/api/integration-tests/http/google-one-tap.spec.ts` comprueba el verificador RSA real, credenciales inválidas, prueba alterada o vencida, replay concurrente, creación de clientes, vinculación y MFA nativos. Usa fixtures locales y no autentica cuentas Google reales. Las pruebas unitarias del flujo de sesión compartido se retiraron por solicitud del usuario.

Verificación del 2026-10-06: One Tap HTTP **22/22**, Google OAuth HTTP **23/23**, módulos **53/53** y unidades API **97/97**. Frontend: **12/12** pruebas de Google y cookies por pestaña, más **10/10** regresiones del comprobante. Lint y typecheck raíz y build API aprobados. El comando general `pnpm test:api` se detuvo en la guarda de aislamiento al alcanzar módulos con la configuración de desarrollo; módulos y HTTP se ejecutaron después en PostgreSQL y Redis TLS descartables. Se restauraron los contenedores QA a su estado detenido.

En el navegador integrado se verificaron el botón, navegación al login, barra sin desbordamiento a 320 y 390 px, carga de GIS y bootstrap HTTP 200. El navegador reportó `UiDismissedNoEmbargo` para el aviso FedCM. No se completó un acceso con Google real ni se certificó la configuración actual de Authorized JavaScript origins en Google Cloud.

En desarrollo, el indicador de Next permanece habilitado. Solo el mensaje exacto `[GSI_LOGGER]: FedCM get() rejects with NetworkError: Error retrieving a token.` se conserva como `console.warn`, para que la indisponibilidad del aviso opcional no registre una incidencia de Next. Los demás mensajes y objetos de error siguen pasando por el manejador original. El filtro se instala antes de cargar GIS, una sola vez por página, y permanece activo para mensajes asíncronos posteriores al cierre del aviso. Producción conserva el comportamiento del SDK. Las pruebas unitarias de este filtro se retiraron por solicitud del usuario.

### Nombres de los perfiles de admin y vendor

Las cuentas existentes de operadores y miembros completan únicamente los campos de nombre y apellido vacíos con `given_name` y `family_name` persistidos por el proveedor nativo de Google. Se conservan los nombres guardados, la identidad original, los permisos y MFA. Cuando Google solo aporta `name`, se usa completo como nombre de presentación sin separar ni inventar un apellido. Si no aporta un nombre válido, el perfil permanece pendiente de completar.

El enriquecimiento ocurre después de una vinculación válida o al repetir el callback de una cuenta ya vinculada. También está disponible mediante `POST /auth/account/profile/google`, con cuerpo vacío y sesión completa de operador o miembro, para completar el perfil después de MFA o con una sesión existente. La API comprueba identidad, actor, correo y actividad del miembro; sin proveedor Google vinculado responde `{ updated: false }`. Rechaza sesiones parciales y asociaciones ajenas; no acepta nombres enviados por el cliente.

Las actualizaciones reutilizan `updateUsersWorkflow` de Medusa y `updateMemberWorkflow` de Mercur, con su compensación nativa y una lectura reciente de los nombres existentes. Un fallo del enriquecimiento no revierte una vinculación válida ni impide el acceso; los campos faltantes siguen pendientes. La tienda conserva su comportamiento previo.

Verificación del 2026-10-06: suites HTTP de Google y verificación de correo, **36/36 pruebas aprobadas** en PostgreSQL y Redis TLS locales aislados. Incluyen nombres vacíos/parciales/guardados, fallback de nombre completo, ausencia de datos, vinculación explícita, perfiles ya vinculados después de MFA nativo y protección del actor. No se llamó a Google, no se enviaron correos y no se modificaron cuentas reales.

Los contratos de esta ruta se publican en `@usapeek/api/auth-contracts`. Para regenerarlos o comprobarlos:

```powershell
pnpm --filter @usapeek/api run auth:contracts:generate
pnpm --filter @usapeek/api run auth:contracts:check
```

## Prueba manual

1. Abrir `http://localhost:3000/login`, `http://localhost:7000/login` o `http://localhost:7001/seller/login`.
2. Pulsar **Continuar con Google** sin rellenar el formulario de contraseña.
3. Completar el acceso en Google con una cuenta de prueba autorizada.
4. Para un Gmail con cuenta existente del mismo panel o de cliente, comprobar que entra directamente y conserva sus datos, sin pedir la contraseña. Si hay MFA, debe solicitar el segundo factor.
5. Cuando corresponda la vinculación explícita, aparecerá **Vincula Google a tu cuenta** en la tienda. Escribir el correo y la contraseña actuales y pulsar **Confirmar mi cuenta**; luego confirmar **Vincular Google** con la misma cuenta de Google. Esta pantalla no ofrece repetir el acceso con Google antes de confirmar la cuenta. Volver a entrar con Google tras cerrar sesión.
6. Comprobar que conserva datos y permisos y que un vendedor inactivo no obtiene acceso.
7. Cancelar un intento y comprobar el mensaje local. Reutilizar un callback o cambiar su `state` debe fallar sin crear sesión.
8. Con sesión de cliente y acceso de vendedor aprobado, abrir `/account/sell` y pulsar **Ir al panel de vendedores**. Debe abrir su tienda o el selector de tiendas sin pedir otra contraseña. Repetir con una sesión iniciada mediante Google. Un miembro desactivado o una tienda sin acceso no debe obtener sesión de vendedor mediante el traspaso.

La suite HTTP `packages/api/integration-tests/http/google-auth.spec.ts` usa una base PostgreSQL descartable y Redis TLS local dedicado. Está desactivada por defecto para no ejecutar fixtures contra la base compartida; las variables y comprobaciones de aislamiento están en el encabezado del archivo. Consultar la [guía de integraciones HTTP](../packages/api/integration-tests/http/README.md) antes de ejecutarla.

## Railway

`.railway/railway.ts` contiene las referencias de configuración. Antes de desplegar, definir las variables compartidas `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y:

```dotenv
GOOGLE_CALLBACK_URL=https://usapeek-web.up.railway.app/auth/google/callback
```

API y worker consumen las tres variables. Cada frontend recibe su callback público correspondiente. Registrar también en el cliente OAuth de Google:

```text
https://usapeek-web.up.railway.app/auth/google/callback
https://usapeek-admin.up.railway.app/auth/google/callback
https://usapeek-vendor.up.railway.app/auth/google/callback
```

Los dominios anteriores se configuraron en Railway y Google Cloud durante el [renombrado a usapeek](operations/usapeek-rename-2026-10-05.md). Se conservaron también los tres callbacks locales. El proyecto Google Cloud, el cliente OAuth y la marca de consentimiento se llaman `usapeek`; el ID del proyecto y las credenciales conservan su identidad. Los orígenes están incluidos en CORS. Las variables `NEXT_PUBLIC_*` se incorporan al build, por lo que los frontends deben reconstruirse al cambiarlas. Los seis servicios de Railway permanecen apagados; este cambio de configuración no certifica un nuevo login en producción.

## Fuentes de implementación

- [Configuración Google](../packages/api/src/lib/google-auth-configuration.ts) y [registro de proveedores](../packages/api/medusa-config.ts).
- [Ruta de completion](../packages/api/src/api/auth/google/complete/route.ts), [workflow](../packages/api/src/workflows/complete-google-auth.ts) y [step de vinculación](../packages/api/src/workflows/steps/complete-google-auth.ts).
- [Transacción OAuth de la tienda](../apps/web/lib/google-auth.ts), [operador](../apps/admin/src/lib/google-auth.ts) y [vendedor](../apps/vendor/src/lib/google-auth.ts).
- [Traspaso desde la tienda](../apps/web/lib/vendor-session.ts) y [recepción en el portal](../apps/vendor/src/lib/storefront-session.ts).

Referencias: [proveedor Google de Medusa](https://docs.medusajs.com/resources/commerce-modules/auth/auth-providers/google), [OAuth para aplicaciones de servidor de Google](https://developers.google.com/identity/protocols/oauth2/web-server), [verificación de identidad y titularidad del correo](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
