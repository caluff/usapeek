"use client";

import Link from "next/link";
import { FeedbackToast } from "@/components/feedback-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function VendorApplicationsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card role="alert">
      <FeedbackToast status="error" message="No pudimos cargar las solicitudes. Comprueba tu sesión y tus permisos." />
      <CardHeader>
        <CardTitle>No pudimos cargar las solicitudes</CardTitle>
        <CardDescription>
          Comprueba tu sesión y tus permisos. Si el servicio acaba de
          instalarse, el backend debe tener sus migraciones aplicadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button onClick={reset}>Reintentar</Button>
        <Button variant="outline" asChild>
          <Link href="/login?next=%2Fdashboard%2Fvendor-applications">
            Revisar acceso
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
