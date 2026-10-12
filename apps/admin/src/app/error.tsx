"use client";

import { RefreshCw } from "lucide-react";
import { FeedbackToast } from "@/components/feedback-toast";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AdminError() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <FeedbackToast status="error" message="No pudimos cargar el panel. Intenta nuevamente en unos momentos." />
      <Card className="w-full max-w-md" role="alert">
        <CardHeader>
          <CardTitle>No pudimos cargar el panel</CardTitle>
          <CardDescription>
            El servicio puede estar temporalmente fuera de servicio. Intenta
            nuevamente en unos momentos. Si el problema continúa, contacta al
            soporte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
