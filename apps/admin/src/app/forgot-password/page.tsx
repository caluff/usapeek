import type { Metadata } from "next";

import { AdminForgotForm } from "@/components/admin/admin-auth-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Recuperar acceso",
  description:
    "Solicita instrucciones para recuperar el acceso a tu cuenta de operador de USAPEEK.",
};

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Recuperar acceso</CardTitle>
          <CardDescription>
            Recibirás instrucciones si el correo pertenece a un operador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminForgotForm />
        </CardContent>
      </Card>
    </main>
  );
}
