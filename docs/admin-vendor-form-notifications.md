# Notificaciones de formularios — admin y vendor

Guía revisada el 2026-10-06. La verificación fechada al final conserva los
resultados de la entrega inicial de 2026-09-05; no certifica los formularios
incorporados después ni representa una nueva ejecución.

## Implementado

- Sonner 2.0.8 con el patrón shadcn, un Toaster por aplicación dentro del proveedor de tema, cierre accesible y posición inferior derecha.
- Colores semánticos success, destructive, warning e información, adaptados al tema claro/oscuro.
- Admin: acceso/MFA, recuperación y verificación de correo, decisiones sobre solicitudes, moderación de productos, categorías propuestas y edición de comisión global.
- Vendor: acceso/MFA, recuperación y verificación, selección de tienda y formularios conectados mediante `MutationForm`/`notifyFeedback`; también ofertas, opciones de envío y entrada a Connect. La pantalla de almacén ahora consulta/revalida el almacén aprobado y no permite crear ubicaciones libremente.
- Avisos de sesión vencida y boundaries de errores, sin mostrar detalles internos de excepciones inesperadas.
- Los errores junto a los campos y los enlaces de recuperación/continuación se conservan. Las mutaciones notifican después de recibir su resultado, no antes de guardar.
- Se conserva el evento que actualiza el indicador de solicitudes pendientes en admin.

Los controles financieros de pedidos tienen su propio estado local, confirmación,
historial y resultado. No debe suponerse que todos los formularios nuevos usan
toasts: el feedback visible y la conservación de la solicitud durante un retry
son parte del contrato del componente. Las operaciones pendientes o inciertas no
deben anunciarse como completas. Revisar
[el flujo financiero](order-finance.md) antes de cambiar esos controles.

Fuentes principales:

- `apps/admin/src/lib/feedback.ts` y `src/components/feedback-toast.tsx`.
- `apps/vendor/src/lib/feedback.ts` y `src/features/workspace/mutation-form.tsx`.
- `apps/admin/src/features/orders/finance-panel.tsx` y
  `apps/vendor/src/features/orders/finance-panel.tsx`.

El cierre de UX funcional bajo fallos/respuestas lentas y los tests integrados
pertenece a Phase 6 del
[plan de desarrollo](develpment/development-implementation-plan.md). No se han
iniciado fases ni certificado Financial Readiness con esta revisión documental.

## Verificación histórica · 2026-09-05

- Admin: lint, typecheck, 53 pruebas y build correctos.
- Vendor: lint, typecheck, 49 pruebas y build correctos; incluye selección del tipo de toast, estados silenciosos, intentos repetidos, permisos y operaciones existentes.
- `pnpm peers check`: sin problemas de dependencias pares.
- Navegador: warning por sesión vencida y error por contraseña corta en ambas aplicaciones; se conservó aria-invalid y el error de campo.
- Success de admin y MutationForm de vendor verificado mediante respuesta de Server Action simulada en el navegador. No se guardaron cambios de negocio, no se enviaron correos ni se modificó inventario.
- Scripts locales de QA en `.cache/admin-feedback-qa.cjs` y `.cache/vendor-feedback-qa.cjs` (ignorados por Git).

Los avisos no consultan Redis ni ejecutan polling. Los indicadores de carga no anuncian éxito. Una redirección de autenticación sigue siendo una navegación, no un guardado ficticio.

El indicador de revisiones pendientes se comparte en la navegación admin y
se actualiza mediante los eventos SSE de solicitudes/catálogo, al recuperar
visibilidad y después de una decisión local. Un fallo de lectura conserva el
último resultado o muestra estado sin confirmar; no inventa un recuento cero.

Para investigar navegación lenta, usar la
[guía de diagnóstico de peticiones](reports/performance-request-tracing.md).
Los pendientes vigentes se centralizan en la
[auditoría de cierre](develpment/development-completion-audit.md).
