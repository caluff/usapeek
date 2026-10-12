# Repository cleanup — 2026-10-03

El usuario solicita conservar sólo la infraestructura necesaria y este checkout,
subir todos los cambios a `origin/develop` y eliminar todos los tests unitarios.
La autorización incluye los cambios locales de UI, configuración e instrucciones
que estaban pendientes. No se publican secretos ni documentos personales.

## Resultado local

- Docker: conserva únicamente `marketplace-v2-redis-1`, sano, puerto6379 y su
  volumen original. Retirados los dos contenedores QA del2 de octubre, sus cuatro
  volúmenes y las dos redes aisladas de septiembre/octubre. No se hizo prune
  global. PostgreSQL habitual sigue en Supabase; no requiere contenedor local.
- QA: backup PostgreSQL nuevo800.153bytes, SHA256
  `1E8A83D047046A02FF95DCFE846ED450D196A53530719AB80DEF413E3B7F82BA`,
  formato custom e inventario verificados. Redis detenido antes de copiar sus
  tres archivos persistentes,44.318.180bytes. Recibos privados bajo
  `C:/Users/dcalu/.codex/tmp/marketplace-closure-20261002/private/backups/`.
  No se afirma una restauración nueva de esos respaldos.
- Worktrees: retirados17db/1965/4af6/873f/b714; sólo queda el checkout habitual
  `C:/Users/dcalu/repos/marketplace-v2`, rama develop. Cambios no confirmados y
  archivos locales preservados en cinco snapshots/bundles verificados,
  10.964.929bytes, bajo
  `C:/Users/dcalu/.codex/tmp/marketplace-cleanup-20261003/worktrees/`.
  Las ramas originales y refs de recuperación se conservan localmente. Los
  cambios funcionales de esas ramas ya tienen equivalentes en develop.
- Git dejó junctions de dependencias tras retirar los checkouts. La revisión
  automática rechazó borrarlos recursivamente (`blocked by policy`). Se movieron
  reversiblemente al respaldo:35.686junctions, cero archivos regulares y cero
  bytes de contenido de dependencias. Las cinco rutas antiguas quedaron ausentes.
- Retirados185 archivos unitarios y tres auxiliares exclusivos. Conservadas12
  suites HTTP y tres suites de módulos, con fixtures necesarios. Comandos y
  documentación ajustados; no se agregaron dependencias ni nuevos unit tests.
- Preflight global de integración rechaza infraestructura compartida, exige
  PostgreSQL55432/Redis TLS56379 DB15, y preserva la exclusión de proveedores
  antes de inicializar Medusa. Evita que el nuevo `pnpm test` use el `.env`
  habitual. La infraestructura QA se retiró después de ejecutar las integraciones.
- `test.pdf` es un documento personal ajeno al proyecto: preservado localmente y
  excluido por una regla específica de `.gitignore`. El `.env` continúa ignorado.

## Validación y publicación

Artefactos privados en
`C:/Users/dcalu/.codex/tmp/marketplace-closure-20261002/`:

| Comprobación | Resultado |
| --- | --- |
| Lint raíz | PASS,0errores/57warnings API; `cleanup-lint-ae35ce17-47bd-4be1-afe2-7c68b8fb15a0`. |
| Tipos raíz finales | PASS; `cleanup-typecheck-cbc068d2-7f8d-4beb-ae42-720df0f62aa9`. |
| Peers | PASS; `cleanup-peers-60c8b1f1-d3af-432a-bdae-9a635226a54a`. |
| Builds web/admin/vendor | PASS con Webpack; `cleanup-build-855a8e43-4d37-4114-b2a8-db7b5bcdb1d1`. |
| API lint/build final | PASS después del preflight y ajuste de scripts; `cleanup-final-api-32d4f547-96e6-405c-9d61-d396f9ac1766`. |
| Contratos auth/finance/search/onboarding | PASS. Auth/search/onboarding comparaban CRLF frente a LF; normalización alineada con el generador financiero, sin cambiar tipos. Se conserva el primer fallo de auth en `cleanup-contracts-fab56ee1-6d86-406c-b29a-277fda46337b`. |
| Integraciones reales | **113/113 PASS**,87HTTP+26PostgreSQL,15suites; `private/integration-runs/oct2-cleanup-final-1`. Bases nuevas, Redis QA reservado, TLS y proveedores externos bloqueados. Stripe en esas suites está simulado. |
| Preflight negativo | Configuración habitual rechazada antes de importar metadata/arrancar Medusa;9 comprobaciones temporales del guard PASS, sin nuevos archivos unitarios. |
| Disponibilidad posterior | Tres vistas conservan procesos; API9000 disponible. Inspección readonly15:02UTC: worker eventos1/jobs1, cron natural15:02:03, `automation_ready:true`; mismo fingerprint de14operaciones financieras, cero payouts nuevos. `oct3-after-repository-cleanup-1/proof.json`. |
| Revisión de publicación | Código, lockfile, UI compartida, instrucciones y contrato de rutas existente coherentes; escaneo de cambios pendientes e historial saliente sin secretos reales detectados; diff check PASS. |

Los gates offline usan configuración sintética y suprimen lecturas del `.env`;
las únicas conexiones externas permitidas durante builds son fuentes públicas.
No se certifica QA visual nuevo ni una transferencia automática real tras72h.

El primer push fue rechazado por la protección de secretos de GitHub: tres
claves ficticias de las integraciones aparecían también en el historial local.
Se sustituyeron por identificadores de prueba cortos aceptados por la validación
y el SDK instalados. Los secretos de firma y las guardas de simulación no cambian.
Las113 assertions anteriores se ejecutaron antes de este cambio de literales;
no se volvieron a levantar los servicios QA eliminados para repetirlas.

Los125 commits pendientes se conservan en la rama local
`codex/backup-develop-before-publish-20261003` y en el bundle verificado
`C:/Users/dcalu/.codex/tmp/marketplace-cleanup-20261003/develop-before-publish.bundle`.
La publicación agrupa todos sus cambios en un commit limpio sobre origin/develop,
sin force ni excepciones a la protección de secretos. El resultado remoto se
comprueba tras el push; no se suben snapshots, respaldos, credenciales ni el PDF
personal.

Push normal completado: `origin/develop` y HEAD coinciden en
`e3a28e305174b7b8a7aa1d21aa0a8220185df10a`; ahead/behind0/0 y working tree limpio
al terminar. Recibo privado `marketplace-cleanup-20261003/publication-verified.json`.
