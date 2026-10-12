import type { Metadata } from "next";

import { AdminResetForm } from "@/components/admin/admin-auth-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminReset } from "@/lib/auth-sdk";

export const metadata: Metadata = {
  title: "Nueva contraseña",
  description:
    "Establece una nueva contraseña para recuperar el acceso a tu cuenta de operador de USAPEEK.",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Nueva contraseña</CardTitle>
          <CardDescription>El enlace es temporal y de un solo uso.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminResetForm hasToken={Boolean(await getAdminReset())} />
        </CardContent>
      </Card>
    </main>
  );
}
