import Link from "next/link";

export default function StoreNotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Tienda no encontrada</h1>
      <p className="text-sm text-muted-foreground">
        La tienda no existe o ya no está disponible.
      </p>
      <Link
        href="/dashboard/stores"
        className="text-sm text-primary hover:underline"
      >
        Volver a tiendas
      </Link>
    </div>
  );
}
