export const vendorRoutes = [
  { id: "dashboard", label: "Inicio", href: "/seller" },
  { id: "catalog", label: "Catálogo", href: "/seller/catalog" },
  { id: "orders", label: "Pedidos", href: "/seller/orders" },
  {
    id: "settlements",
    label: "Cobros",
    href: "/seller/settlements",
    children: [
      { label: "Pendientes", href: "/seller/settlements" },
      { label: "Cobrados", href: "/seller/settlements/paid" },
    ],
  },
  { id: "inventory", label: "Inventario", href: "/seller/inventory" },
  { id: "settings", label: "Ajustes", href: "/seller/settings" },
] as const;

export type VendorRouteId = (typeof vendorRoutes)[number]["id"];
