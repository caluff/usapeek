import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleLoginForm } from "@/components/admin/google-login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentAdmin } from "@/lib/auth-sdk";
import { safeRedirectPath } from "@/lib/auth-utils";

export const metadata: Metadata = {
  title: "Vincular Google",
  description:
    "Vincula Google con tu cuenta de operador para acceder a USAPEEK Admin.",
};

export default async function LinkGooglePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirectPath((await searchParams).next, "/dashboard");
  const admin = await getCurrentAdmin();
  if (!admin) redirect(`/login?next=${encodeURIComponent(`/auth/google/link?next=${encodeURIComponent(next)}`)}`);
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>Vincular Google</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm">Conectarás Google con tu cuenta de operador {admin.email}. Selecciona la cuenta de Google que tenga el mismo correo.</p>
          <GoogleLoginForm next={next} link />
          <Link href={next} className="mt-4 flex min-h-11 items-center justify-center text-sm underline">Cancelar</Link>
        </CardContent>
      </Card>
    </main>
  );
}
