import type { Metadata } from "next"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { FeedbackToast } from "@/components/feedback-toast"
import { AccountHeading } from "@/features/account/components/account-heading"
import { ApplicationHistory } from "@/features/vendor-onboarding/components/application-history"
import { ApplicationStatus } from "@/features/vendor-onboarding/components/application-status"
import { ApplicationWizard } from "@/features/vendor-onboarding/components/application-wizard"
import {
  getApplication,
  getApplicationFormData,
  getApplicationNotifications,
} from "@/features/vendor-onboarding/data"
import { vendorPanelUrl } from "@/features/vendor-onboarding/presentation"
import { getVerificationCode } from "@/lib/auth-sdk"

export const metadata: Metadata = {
  title: "Solicitud de vendedor",
  description:
    "Prepara tu solicitud para vender en USAPEEK, completa los datos de tu negocio y consulta el estado de la revisión.",
  robots: { index: false, follow: false },
}

export default function SellPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string; vendor?: string }>
}) {
  return (
    <div className="max-w-4xl">
      <AccountHeading title="Vender en usapeek" />
      <Suspense fallback={null}>
        <VendorSessionFeedback searchParams={searchParams} />
      </Suspense>
      <Suspense
        fallback={
          <Skeleton className="h-96 w-full" aria-label="Cargando solicitud" />
        }
      >
        <ApplicationFormSection />
      </Suspense>
      <Suspense
        fallback={
          <Skeleton
            className="mt-10 h-20 w-full"
            aria-label="Cargando novedades"
          />
        }
      >
        <ApplicationHistorySection searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function ApplicationFormSection() {
  const response = await getApplication()
  const editable =
    !response.applicant.existing_vendor_access &&
    (!response.application || response.application.can_edit)
  const [form, verificationCode] = await Promise.all([
    editable ? getApplicationFormData() : null,
    editable ? getVerificationCode() : null,
  ])
  return (
    <>
      {form ? (
        <ApplicationWizard
          key={response.application?.id ?? "new"}
          response={response}
          customer={form.customer}
          resources={form.resources}
          options={form.options}
          hasCode={Boolean(verificationCode)}
        />
      ) : (
        <ApplicationStatus
          response={response}
          vendorUrl={vendorPanelUrl(process.env.NEXT_PUBLIC_VENDOR_URL)}
        />
      )}
    </>
  )
}

async function VendorSessionFeedback({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
  if ((await searchParams).vendor !== "unavailable") return null
  return <p role="alert" className="mb-6 text-sm text-destructive">No pudimos abrir tu tienda. Vuelve a intentarlo; tu acceso puede haber cambiado.</p>
}

async function ApplicationHistorySection({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>
}) {
  const requestedOffset = Number((await searchParams).offset)
  const offset =
    Number.isSafeInteger(requestedOffset) && requestedOffset > 0
      ? Math.min(requestedOffset, 100000)
      : 0
  const history = await getApplicationNotifications(offset).catch(() => null)
  if (history) return <ApplicationHistory data={history} />
  return (
    <>
      <FeedbackToast
        feedback={{
          status: "error",
          message:
            "No pudimos cargar las novedades de tu solicitud. Recarga la página para volver a intentarlo.",
        }}
      />
      <p role="status" className="mt-8 border border-border p-4 text-sm">
        No pudimos cargar las novedades de tu solicitud. Recarga la página para
        volver a intentarlo.
      </p>
    </>
  )
}
