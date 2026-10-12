"use client";

import { Button } from "@/components/ui/button";
import { useFeedbackToast } from "@/components/feedback-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PAGE_ERROR = { status: "error", message: "No pudimos abrir esta página. Inténtalo nuevamente. Si tu acceso cambió, vuelve a iniciar sesión." };

export default function WorkspaceError({ reset }: { reset: () => void }) {
  useFeedbackToast(PAGE_ERROR);
  return (
    <Card>
      <CardHeader>
        <CardTitle>No pudimos abrir esta página</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p role="alert" className="text-sm text-muted-foreground">
          Inténtalo nuevamente. Si tu acceso cambió, vuelve a iniciar sesión.
        </p>
        <Button onClick={reset}>Reintentar</Button>
      </CardContent>
    </Card>
  );
}
