"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useFeedbackToast } from "@/components/feedback-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PORTAL_ERROR = { status: "error", message: "No pudimos abrir el portal. Inténtalo nuevamente en unos momentos." };

export default function SellerError() {
  useFeedbackToast(PORTAL_ERROR);
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-10">
      <Card className="w-full max-w-md" role="alert">
        <CardHeader>
          <CardTitle>No pudimos abrir el portal</CardTitle>
          <CardDescription>
            El servicio puede estar temporalmente fuera de servicio. Intenta
            nuevamente en unos momentos. Si el problema continúa, contacta al
            soporte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
