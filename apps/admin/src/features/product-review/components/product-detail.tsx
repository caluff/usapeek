import Link from "next/link";
import { FileDiff, MessageSquare, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { retrieveProductForReview } from "../data";
import { ProductReviewActions } from "./product-review-actions";
import { ProductStatusBadge } from "./status-badge";
import {
  ProductChangeDetails,
  ProductReviewImages,
} from "./image-change-preview";

const SECTION_TITLE =
  "text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]";

export function ProductReviewDetail({
  product,
  productChange,
}: Awaited<ReturnType<typeof retrieveProductForReview>>) {
  const updatedAt = product.updated_at
    ? new Date(product.updated_at).toISOString()
    : "";
  const comments =
    product.changes?.filter((change) => change.external_note) ?? [];
  const specifications = (
    [
      ["Material", product.material],
      ["Peso (g)", product.weight],
      ["Largo (mm)", product.length],
      ["Ancho (mm)", product.width],
      ["Alto (mm)", product.height],
    ] as const
  ).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 space-y-3">
          <h1 className="break-words text-2xl font-semibold tracking-tight">
            {product.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <ProductStatusBadge status={product.status} />
            {productChange && (
              <Badge variant="warning">Cambios pendientes</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {productChange && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost">
                  <FileDiff aria-hidden="true" />
                  Ver cambios pendientes
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl" aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>Cambios pendientes del vendedor</DialogTitle>
                </DialogHeader>
                {productChange.external_note && (
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {productChange.external_note}
                  </p>
                )}
                {productChange.actions?.length ? (
                  <ol className="space-y-6">
                    {productChange.actions
                      .slice()
                      .sort((left, right) => left.ordering - right.ordering)
                      .map((action) => (
                        <li key={action.id}>
                          <h3 className="mb-3 text-sm font-semibold">
                            {action.action}
                          </h3>
                          <ProductChangeDetails details={action.details} />
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Esta revisión no incluye operaciones de cambio.
                  </p>
                )}
              </DialogContent>
            </Dialog>
          )}
          {comments.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost">
                  <MessageSquare aria-hidden="true" />
                  Comentarios ({comments.length})
                </Button>
              </DialogTrigger>
              <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>Comentarios registrados</DialogTitle>
                </DialogHeader>
                <ul className="space-y-5">
                  {comments.map((change) => (
                    <li
                      key={change.id}
                      className="whitespace-pre-wrap break-words text-sm leading-6"
                    >
                      {change.external_note}
                    </li>
                  ))}
                </ul>
              </DialogContent>
            </Dialog>
          )}
          <ProductReviewActions
            productId={product.id}
            title={product.title}
            status={product.status}
            updatedAt={updatedAt}
            changeId={productChange?.id}
          />
        </div>
      </header>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <section
          aria-label={`Imágenes de ${product.title}`}
          className="min-w-0"
        >
          <ProductReviewImages
            value={
              product.images?.length
                ? product.images
                : product.thumbnail
                  ? [{ url: product.thumbnail }]
                  : []
            }
            label={`Imágenes de ${product.title}`}
            prominent
            showLabel={false}
          />
        </section>

        <div className="min-w-0 space-y-9">
          <section
            aria-labelledby="product-content-title"
            className="space-y-5"
          >
            <h2 id="product-content-title" className={SECTION_TITLE}>
              Información del producto
            </h2>
            {productChange && (
              <p className="text-sm text-muted-foreground">
                Este es el contenido actual. Los cambios pendientes aún no se
                han aplicado.
              </p>
            )}
            {product.subtitle && (
              <p className="text-base font-medium leading-6">
                {product.subtitle}
              </p>
            )}
            <p className="max-w-prose whitespace-pre-wrap break-words text-sm leading-7">
              {product.description || "Sin descripción"}
            </p>
            <dl className="space-y-5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <dt className="font-medium">Identificador del catálogo</dt>
                <dd className="min-w-0 break-all text-muted-foreground">
                  {product.handle || "Sin identificador"}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <dt className="font-medium">Categorías</dt>
                <dd className="flex flex-wrap gap-2">
                  {product.categories?.length ? (
                    product.categories.map((category) => (
                      <Badge key={category.id} variant="neutral">
                        {category.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">
                      Sin categorías
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="product-stores-title" className="space-y-5">
            <h2 id="product-stores-title" className={SECTION_TITLE}>
              Tiendas vinculadas
            </h2>
            {product.sellers?.length ? (
              <ul className="flex flex-wrap gap-3">
                {product.sellers.map((seller) => (
                  <li key={seller.id}>
                    <Button asChild variant="ghost">
                      <Link
                        href={`/dashboard/stores/${encodeURIComponent(seller.id)}`}
                      >
                        <Store aria-hidden="true" />
                        {seller.name}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay tiendas informadas en el catálogo.
              </p>
            )}
          </section>

          {specifications.length > 0 && (
            <section
              aria-labelledby="product-specifications-title"
              className="space-y-5"
            >
              <h2 id="product-specifications-title" className={SECTION_TITLE}>
                Características
              </h2>
              <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {specifications.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-4 text-sm"
                  >
                    <dt className="font-medium">{label}</dt>
                    <dd className="break-words text-muted-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>

      <section
        aria-labelledby="product-variants-title"
        className="min-w-0 space-y-5"
      >
        <h2 id="product-variants-title" className={SECTION_TITLE}>
          Variantes{" "}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {product.variants?.length ?? 0}
          </span>
        </h2>
        {product.variants?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variante</TableHead>
                <TableHead>SKU</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.variants.map((variant) => (
                <TableRow key={variant.id}>
                  <TableCell className="font-medium">{variant.title}</TableCell>
                  <TableCell className="break-all text-muted-foreground">
                    {variant.sku || "Sin SKU"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Sin variantes</p>
        )}
      </section>
    </div>
  );
}
