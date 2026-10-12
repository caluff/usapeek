import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ProductNotFound() {
  return (
    <div className="space-y-4 rounded-lg border p-6">
      <h1 className="text-xl font-semibold">Producto no encontrado</h1>
      <Button asChild variant="outline">
        <Link href="/dashboard/product-review">Volver al catálogo</Link>
      </Button>
    </div>
  );
}
