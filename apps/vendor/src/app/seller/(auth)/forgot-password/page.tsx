import type { Metadata } from "next";
import { VendorForgotForm } from "@/components/vendor/vendor-auth-forms";
import { VendorAuthShell } from "@/components/vendor/vendor-auth-shell";

export const metadata: Metadata = {
  title: "Recuperar acceso",
  description: "Solicita instrucciones para recuperar el acceso a tu cuenta de vendedor de USAPEEK.",
};
export default function ForgotVendorPasswordPage() { return <VendorAuthShell title="Recuperar acceso" description="Recibirás instrucciones si el correo pertenece a un miembro habilitado."><VendorForgotForm /></VendorAuthShell>; }
