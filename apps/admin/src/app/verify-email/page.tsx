import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminVerifyForm } from "@/components/admin/admin-auth-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminVerificationCode, getCurrentAdmin } from "@/lib/auth-sdk";
import { safeRedirectPath } from "@/lib/auth-utils";

export const metadata: Metadata = {
  title: "Verificar correo",
  description:
    "Confirma tu dirección de correo con el código de verificación de tu cuenta de operador de USAPEEK.",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getCurrentAdmin()) redirect("/dashboard/settings");
  const next = safeRedirectPath((await searchParams).next, "/dashboard");
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Verificar correo</CardTitle>
          <CardDescription>
            Confirma el código de tu identidad de operador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminVerifyForm
            hasCode={Boolean(await getAdminVerificationCode())}
            next={next}
          />
        </CardContent>
      </Card>
    </main>
  );
}
