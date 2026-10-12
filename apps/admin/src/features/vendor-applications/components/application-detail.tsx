import type {
  AdminApplicationView,
  DraftData,
} from "@usapeek/vendor-onboarding-contracts";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { applicationDate } from "../helpers";
import { ApplicationReviewForm } from "./review-form";
import { ApplicationStatusBadge } from "./status-badge";
import { CategoryProposalForm } from "./category-proposal-form";

function DataItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
        {value || "No indicado"}
      </dd>
    </div>
  );
}

function ApplicationSnapshot({
  data,
  email,
}: {
  data: DraftData;
  email: string;
}) {
  const address = data.activity.business_address;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Responsable de la tienda</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2">
            <DataItem
              label="Nombre"
              value={`${data.responsible.first_name} ${data.responsible.last_name}`.trim()}
            />
            <DataItem label="Correo de la cuenta" value={email} />
            <DataItem label="Teléfono" value={data.responsible.phone} />
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Presentación de la tienda</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2">
            <DataItem label="Nombre comercial" value={data.store.name} />
            <DataItem label="Identificador público" value={data.store.handle} />
            <div className="sm:col-span-2">
              <DataItem label="Descripción" value={data.store.description} />
            </div>
            <DataItem label="Sitio web" value={data.store.website_url} />
            <DataItem
              label="Moneda"
              value={data.activity.currency_code.toUpperCase()}
            />
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Actividad y dirección comercial</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2">
            <DataItem
              label="Tipo de vendedor"
              value={
                data.activity.business_type === "company"
                  ? "Empresa"
                  : "Individual"
              }
            />
            {data.activity.business_type === "company" && (
              <DataItem
                label="Nombre de la empresa"
                value={data.activity.company_name}
              />
            )}
            <div className="sm:col-span-2">
              <DataItem label="Actividad" value={data.activity.description} />
            </div>
            <DataItem
              label="Categorías seleccionadas (IDs)"
              value={data.activity.category_ids.join(", ")}
            />
            {data.activity.category_suggestion?.trim() ? (
              <DataItem
                label="Categoría propuesta"
                value={data.activity.category_suggestion}
              />
            ) : null}
            <DataItem
              label="Dirección"
              value={[
                address.address_1,
                address.address_2,
                `${address.city}, ${address.province} ${address.postal_code}`,
                address.country_code.toUpperCase(),
              ]
                .filter(Boolean)
                .join("\n")}
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

const EVENT_LABELS = {
  submitted: "Solicitud enviada",
  changes_requested: "Cambios solicitados",
  approved: "Solicitud aprobada",
  rejected: "Solicitud rechazada",
};

export function ApplicationDetail({
  application,
  mutationId,
}: {
  application: AdminApplicationView;
  mutationId: string;
}) {
  const snapshot = application.submitted_data ?? application.data;
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/vendor-applications">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Solicitudes
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {snapshot.store.name || "Solicitud en borrador"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Revisión {application.submission_revision} · Enviada{" "}
            {applicationDate(application.submitted_at)} (UTC)
          </p>
        </div>
        <ApplicationStatusBadge status={application.status} />
      </div>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        {application.submitted_data
          ? "Estos son los datos de la última versión enviada, conservados para esta revisión. Los borradores posteriores no sustituyen este registro."
          : "Este borrador aún no fue enviado. No admite aprobación ni rechazo."}
      </p>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ApplicationSnapshot
          data={snapshot}
          email={application.customer.email}
        />
        <div className="space-y-5">
          {application.submitted_data?.activity.category_suggestion?.trim() ? (
            <CategoryProposalForm
              key={`category:${application.id}:${application.version}`}
              applicationId={application.id}
              version={application.version}
              suggestion={
                application.submitted_data.activity.category_suggestion
              }
            />
          ) : null}
          <ApplicationReviewForm
            key={`${application.id}:${application.version}`}
            application={{
              id: application.id,
              version: application.version,
              status: application.status,
              approval_state: application.approval_state,
            }}
            mutationId={mutationId}
          />
          {application.seller && (
            <Card>
              <CardHeader>
                <CardTitle>Tienda vinculada</CardTitle>
                <CardDescription>
                  El acceso utiliza una sesión de vendedor independiente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  <DataItem label="Tienda" value={application.seller.name} />
                  <DataItem
                    label="Estado nativo de Mercur"
                    value={application.seller.status}
                  />
                  <DataItem
                    label="Identificador"
                    value={application.seller.id}
                  />
                </dl>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Historial de la solicitud</CardTitle>
          <CardDescription>
            Envíos y decisiones registrados por el backend. Fechas en UTC.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {application.history.length ? (
            <ol className="space-y-6">
              {application.history.map((event) => (
                <li key={event.id} className="border-l-2 border-border pl-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">
                      {EVENT_LABELS[event.type]} · revisión{" "}
                      {event.submission_revision}
                    </h3>
                    <time
                      dateTime={event.created_at}
                      className="text-xs text-muted-foreground"
                    >
                      {applicationDate(event.created_at)}
                    </time>
                  </div>
                  {event.reason && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                      {event.reason}
                    </p>
                  )}
                  {event.reviewer_id && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Operador: {event.reviewer_id}
                    </p>
                  )}
                  {event.submitted_data && (
                    <details className="mt-3">
                      <summary className="w-fit cursor-pointer text-sm font-medium text-primary focus-visible:outline-2">
                        Ver datos enviados en esta revisión
                      </summary>
                      <div className="mt-4">
                        <ApplicationSnapshot
                          data={event.submitted_data}
                          email={application.customer.email}
                        />
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay envíos ni decisiones registrados.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
