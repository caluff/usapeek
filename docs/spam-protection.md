# Protección contra spam

Los formularios de registro y recuperación del storefront incluyen un campo
trampa `website`, oculto y fuera del recorrido de teclado. Las server actions
lo comprueban antes de llamar al SDK. La recuperación siempre devuelve el mismo
mensaje, incluso cuando el campo trampa está lleno o el backend rechaza el envío.

La API aplica límites adicionales con Redis, también a llamadas directas. Los
presupuestos se consumen atómicamente entre procesos y caducan automáticamente.
Los intentos bloqueados no incrementan ni prolongan las ventanas. Las claves
contienen HMAC-SHA256 con el `COOKIE_SECRET` existente, sin correos ni IP en claro.
API y workers deben compartir Redis y ese secreto; rotarlo reinicia los límites.

| Operación                                  | Límite                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Autenticación                              | 120/minuto y 600/hora por red                                                                                     |
| Login email/contraseña                     | 12/15 minutos por combinación red/correo                                                                          |
| Registro                                   | 30/hora por red y 3/hora por correo                                                                               |
| Recuperación y solicitudes de verificación | 100/hora por red; 5/hora y 1/minuto por correo cuando el endpoint lo recibe                                       |
| Reenvío de verificación                    | 5/hora y 1/minuto por identidad autenticada, compartidos entre endpoints nativos, paneles y solicitud de vendedor |
| Confirmación de verificación y MFA         | 20/15 minutos por identidad; red si no hay identidad                                                              |
| Creación de perfil de cliente              | 100/hora por red y 5/hora por identidad                                                                           |
| Seguimiento/reclamación de pedidos         | 120/minuto por red y 60/minuto por identidad                                                                      |
| Guardado/envío de solicitud de vendedor    | 120/hora para guardar y 5/hora para enviar, por identidad                                                         |

La API responde `429` con `Retry-After` en segundos al superar un límite. Si
Redis falla, responde `503` y `Retry-After: 30`; no permite continuar sin protección.
Se conservan la autenticación, los validadores y los workflows nativos. El registro
de vendedores sigue sujeto al flag existente.

La red se obtiene de `req.ip`, según la configuración de proxy de Medusa. En
producción Railway, cuando están presentes los marcadores de su ingress HTTPS,
se utiliza su `X-Real-IP` validado como una única dirección IPv4/IPv6, evitando
fragmentar los contadores entre proxies internos. Fuera de Railway, o con
encabezados inválidos/duplicados, se conserva `req.ip`. No se confía en
`X-Forwarded-For`. Los marcadores no autentican llamadas privadas: los servicios
de la red privada del proyecto deben ser confiables. El
proxy de despliegue debe sustituir los encabezados de forwarding y ser el único
punto de entrada público del backend. Las llamadas del SDK desde el servidor web
comparten su IP de salida, por lo que los límites de red son agregados; los de
correo e identidad siguen siendo independientes. Esto no sustituye la protección
contra DDoS de la infraestructura ni detecta todos los bots. No requiere CAPTCHA
ni credenciales de proveedores externos.

## Verificación

Las pruebas unitarias de la política y de las server actions se retiraron por
solicitud del usuario. La integración descrita a continuación conserva su propio
alcance; no acredita el comportamiento del campo trampa en el frontend.

La suite `integration-tests/http/spam-protection.spec.ts` requiere el importador
local desechable descrito en las guías de integración del proyecto. Se habilita
con `SPAM_PROTECTION_TESTS=disposable-local`, PostgreSQL TLS localhost:55432,
Redis TLS localhost:56379/15 y proveedores externos deshabilitados. Comprueba
concurrencia, expiración y presupuestos atómicos con Redis real, además de límites
en rutas nativas de login, recuperación y verificación. Nunca ejecutarla contra
la base de desarrollo ni producción.
