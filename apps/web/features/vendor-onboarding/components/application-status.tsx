import type { ApplicationResponse } from "@usapeek/vendor-onboarding-contracts"
import { ArrowUpRight, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { STATUS_LABELS } from "../presentation"
import { ApplicationReview } from "./application-review"

export function ApplicationStatus({
  response,
  vendorUrl,
}: {
  response: ApplicationResponse
  vendorUrl: string | null
}) {
  const application = response.application
  const approved =
    application?.status === "approved" ||
    response.applicant.existing_vendor_access
  const canAccess =
    application?.can_access_vendor || response.applicant.existing_vendor_access
  const description = approved
    ? "Tu cuenta de comprador sigue disponible. En el panel de vendedores podrás completar el perfil, configurar una ubicación y preparar tus primeros productos."
    : application?.status === "rejected"
      ? "Revisamos tu solicitud y no fue aprobada. Esta decisión cierra la solicitud; no necesitas crear otra cuenta."
      : "Recibimos tu solicitud. El equipo de usapeek revisará los datos y aquí podrás consultar la decisión o las correcciones necesarias."
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Store
            className="size-7 text-brand-accent-text"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="text-xs tracking-widest text-muted-foreground uppercase">
            {application
              ? STATUS_LABELS[application.status]
              : "Acceso de vendedor"}
          </p>
          <h2 className="text-2xl font-medium tracking-tight">
            {approved
              ? application?.seller?.name || "Tu espacio para vender"
              : application?.status === "rejected"
                ? "Resultado de la revisión"
                : "Tu solicitud está en revisión"}
          </h2>
        </CardHeader>
        <CardContent className="space-y-5 pb-6">
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
            {description}
          </p>
          {application?.review?.reason ? (
            <div className="border-l-2 border-brand-accent pl-4">
              <h3 className="text-sm font-semibold">Motivo de la decisión</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                {application.review.reason}
              </p>
            </div>
          ) : null}
          {approved ? (
            <>
              <p className="text-sm leading-6">
                Accede a tu tienda con la sesión actual de tu cuenta.
              </p>
              {canAccess && vendorUrl ? (
                <Button asChild>
                  <a href={vendorUrl}>
                    Ir al panel de vendedores
                    <ArrowUpRight aria-hidden="true" className="size-4" />
                  </a>
                </Button>
              ) : (
                <p
                  role="status"
                  className="text-sm leading-6 text-muted-foreground"
                >
                  {!canAccess
                    ? "La solicitud fue aprobada, pero el acceso de la tienda no está habilitado actualmente. Contacta al equipo de usapeek."
                    : "El enlace al panel de vendedores aún no está configurado. El equipo de usapeek debe habilitarlo."}
                </p>
              )}
              <p className="text-xs leading-6 text-muted-foreground">
                La aprobación de tu solicitud es independiente del estado
                operativo de la tienda y de la revisión de tus productos.
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>
      {application ? (
        <details className="border border-border p-5">
          <summary className="cursor-pointer text-sm font-semibold">
            Ver datos enviados · revisión {application.submission_revision}
          </summary>
          <div className="mt-6">
            <ApplicationReview
              data={application.submitted_data ?? application.data}
              email={response.applicant.email}
            />
          </div>
        </details>
      ) : null}
    </div>
  )
}
