# Envíos administrados por vendedores

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

Fecha de QA: 2026-09-07 (UTC).

## Alcance

Verificación inicial del flujo de envíos, hoy descrito en la
[guía de operación vendor](../vendor-operations.md).
El vendedor configura perfiles y tarifas desde `Ajustes → Envíos`, y selecciona
el perfil al crear una oferta. Puede renombrar perfiles, crear varias tarifas,
editar su precio y condiciones, y desactivarlas para nuevas compras.

Estados Unidos y USD son valores fijos, validados en el servidor. Se utiliza el
único almacén aprobado; los vínculos con el proveedor manual, el canal de ventas
y la zona de servicio US se preparan mediante workflows nativos. El operador no
tiene que configurar los envíos de cada tienda.

## Verificación

- Creación real de un perfil y una tarifa temporal: correcta.
- Lectura nativa: zona US, proveedor `manual_manual`, precio USD y reglas
  `enabled_in_store` / `is_return` correctos.
- Navegador autenticado: edición del precio, desactivación y toast de éxito
  comprobados. El precio conserva su identificador después de editarlo.
- Intentos de enviar otro país o moneda: HTTP 400.
- Intento de modificar un perfil inexistente/no propio: HTTP 404.
- Intento de eludir la configuración usando el POST nativo de perfiles: HTTP 403.
- La QA detectó que actualizar el objeto anidado del tipo de envío no persistía
  su descripción. Se corrigió usando el workflow nativo específico de tipos,
  conservando su identificador y bloqueando la edición de tipos compartidos.
  La relectura real confirma que nombre, etiqueta y descripción persisten.
- Repetición en navegador tras la corrección: editar descripción, guardar y
  recargar conserva el nuevo valor.
- API: lint, typecheck y build correctos; 37 suites y 494 pruebas aprobadas.
  Se conservan seis advertencias de lint preexistentes.
- Vendor: lint, typecheck, build y 98 pruebas aprobadas.
- `git diff --check`: correcto.

## Limpieza de QA

Se eliminaron por los endpoints nativos exclusivamente la opción y el perfil
temporales creados durante esta prueba. La relectura confirma cero perfiles y
tarifas en la tienda de prueba, igual que al comenzar. No queda una tarifa
preasignada. Se conserva la infraestructura técnica válida del almacén y su
zona US, preparada para la configuración del vendedor.

## Límites

- Tarifas fijas elegidas por el vendedor, incluido cero para envío gratuito.
  Cotización automática de transportistas y compra de etiquetas no incluidas.
- Las configuraciones avanzadas existentes se protegen contra sobrescrituras.
- No se agregan jobs ni consultas periódicas a Redis. El bloqueo de una
  mutación no utiliza espera con sondeo.
- No se realizaron compras, cobros ni envíos reales durante esta QA.
