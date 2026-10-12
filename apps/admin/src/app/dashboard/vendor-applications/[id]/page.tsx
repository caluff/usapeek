import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ApplicationDetail } from "@/features/vendor-applications/components/application-detail";
import { retrieveVendorApplication } from "@/features/vendor-applications/data";
import { isApplicationId } from "@/features/vendor-applications/helpers";

export const metadata: Metadata = {
  title: "Revisar solicitud",
  description:
    "Revisa una solicitud de vendedor y gestiona su aprobación desde USAPEEK Admin.",
};

export default async function VendorApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isApplicationId(id)) notFound();
  const { application } = await retrieveVendorApplication(id);
  return (
    <ApplicationDetail application={application} mutationId={randomUUID()} />
  );
}
