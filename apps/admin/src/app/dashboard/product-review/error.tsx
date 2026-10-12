"use client";

import { Button } from "@/components/ui/button";
import { FeedbackToast } from "@/components/feedback-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ProductReviewError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card role="alert">
      <FeedbackToast status="error" message="No pudimos cargar el catálogo. Comprueba la conexión y los permisos de tu cuenta." />
      <CardHeader>
        <CardTitle>No pudimos cargar el catálogo</CardTitle>
        <CardDescription>
          Comprueba la conexión y los permisos de tu cuenta para acceder a
          productos y cambios pendientes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={reset}>Reintentar</Button>
      </CardContent>
    </Card>
  );
}
