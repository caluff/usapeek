import { z } from "@medusajs/framework/zod";
import { MedusaError } from "@medusajs/framework/utils";

const actionUrl = z.url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}, "Action URL must use HTTP or HTTPS without credentials");
const verificationSchema = z.object({
  verification_url: actionUrl,
  expires_at: z.union([z.string().datetime({ offset: true }), z.date()]),
});
const resetSchema = z.object({ reset_url: actionUrl });
const orderConfirmationSchema = z.object({
  order_number: z.string().min(1),
  order_url: actionUrl,
});
const shipmentSchema = z.object({
  order_number: z.string().min(1),
  order_url: actionUrl,
  tracking_numbers: z.array(z.string()),
});
const applicationSchema = z.object({
  application_id: z.string().trim().min(1),
  status: z.enum(["submitted", "changes_requested", "approved", "rejected"]),
  reason: z.string().nullable().optional(),
});

const APPLICATION_MESSAGES = {
  submitted: { subject: "usapeek: recibimos tu solicitud", message: "Recibimos tu solicitud para vender en usapeek. Te avisaremos por correo cuando cambie su estado. Podés consultar el avance en la sección para vender de tu cuenta." },
  changes_requested: { subject: "usapeek: tu solicitud necesita cambios", message: "Revisá los comentarios y actualizá tu solicitud desde la sección para vender de tu cuenta de usapeek antes de volver a enviarla." },
  approved: { subject: "usapeek: tu solicitud fue aprobada", message: "Tu solicitud para vender en usapeek fue aprobada. Ya podés ingresar al portal de vendedores con tu cuenta." },
  rejected: { subject: "usapeek: novedades sobre tu solicitud", message: "Tu solicitud para vender en usapeek no fue aprobada. Podés consultar el estado y los comentarios en la sección para vender de tu cuenta." },
} as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function render(subject: string, paragraphs: string[], action?: { label: string; url: string }) {
  const content = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, "<br>")}</p>`).join("");
  return {
    subject,
    html: `<!doctype html><html lang="es"><body><h1>${escapeHtml(subject)}</h1>${content}${action ? `<p><a href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a></p>` : ""}</body></html>`,
    text: [subject, ...paragraphs, ...(action ? [`${action.label}: ${action.url}`] : [])].join("\n\n"),
  };
}

export function renderNotification(template: string, data: Record<string, unknown> | null | undefined) {
  switch (template) {
    case "order-confirmed": {
      const input = orderConfirmationSchema.parse(data);
      return render(`usapeek: recibimos tu pedido ${input.order_number}`, [
        "Recibimos tu pedido. Podés consultar su estado y seguir el envío desde el siguiente enlace, sin iniciar sesión.",
        "Este enlace es privado y vence en 90 días. Guardá este correo y evitá compartirlo.",
      ], { label: "Seguir mi pedido", url: input.order_url });
    }
    case "order-shipped": {
      const input = shipmentSchema.parse(data);
      return render(`usapeek: tu pedido ${input.order_number} fue enviado`, [
        "Se envió un paquete de tu pedido. Podés consultar los detalles y el seguimiento desde el siguiente enlace, sin iniciar sesión.",
        ...input.tracking_numbers.map((number) => `Número de seguimiento: ${number}`),
        "Este enlace es privado y vence en 90 días. Guardá este correo y evitá compartirlo.",
      ], { label: "Seguir mi pedido", url: input.order_url });
    }
    case "auth-email-verification": {
      const input = verificationSchema.parse(data);
      return render("usapeek: verificá tu correo", [
        "Confirmá tu dirección de correo para continuar en usapeek.",
        `Este enlace vence el ${new Date(input.expires_at).toISOString()} (UTC).`,
        "Si no solicitaste esta verificación, podés ignorar este correo.",
      ], { label: "Verificar correo", url: input.verification_url });
    }
    case "auth-password-reset": {
      const input = resetSchema.parse(data);
      return render("usapeek: restablecé tu contraseña", [
        "Usá el enlace para elegir una nueva contraseña para tu cuenta de usapeek.",
        "Si no solicitaste este cambio, podés ignorar este correo. Tu contraseña seguirá siendo la misma.",
      ], { label: "Restablecer contraseña", url: input.reset_url });
    }
    case "vendor-application-submitted":
    case "vendor-application-changes_requested":
    case "vendor-application-approved":
    case "vendor-application-rejected": {
      const input = applicationSchema.parse(data);
      if (template !== `vendor-application-${input.status}`) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Notification template does not match application status");
      const message = APPLICATION_MESSAGES[input.status];
      return render(message.subject, [message.message, `Solicitud: ${input.application_id}`, ...(input.reason ? [`Comentarios: ${input.reason}`] : [])]);
    }
    default:
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unsupported email notification template");
  }
}
