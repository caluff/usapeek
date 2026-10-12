import Link from "next/link";

export default function OrderNotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Pedido no encontrado</h1>
      <Link href="/dashboard/orders" className="text-sm underline">
        Volver a pedidos
      </Link>
    </div>
  );
}
