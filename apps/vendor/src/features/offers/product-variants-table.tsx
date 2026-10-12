"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVariantsView } from "./product-variants-card";
import { organizeVariants } from "./product-variants-view";
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
import { PresentationEditorProvider } from "../catalog/presentation-editor";
import { useConfirmDiscardWithin } from "../workspace/unsaved-changes";

export type ProductVariantRow = {
  id: string;
  title: string;
  values: string[];
  price: ReactNode;
  stock: ReactNode;
  priceAmount?: number;
  stockQuantity?: number;
  createdAt: string;
  updatedAt: string;
  form?: ReactNode;
  inventoryLink?: ReactNode;
};

const PAGE_SIZE = 10;

function VariantEditor({ row }: { row: ProductVariantRow }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const confirmDiscard = useConfirmDiscardWithin();
  const panelId = useId();
  function close() {
    setIsOpen(false);
  }
  function requestClose() {
    if (!isBusy) confirmDiscard(close, regionRef.current);
  }
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (next) setIsOpen(true);
        else requestClose();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Editar ${row.title}`}>
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-3xl"
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{row.title}</DialogTitle>
        </DialogHeader>
        <PresentationEditorProvider
          value={{
            close,
            setBusy: setIsBusy,
            open: () => setIsOpen(true),
            canEdit: true,
            panelId,
          }}
        >
          <div ref={regionRef} id={panelId} className="space-y-4">
            {row.form}
            {row.inventoryLink}
          </div>
        </PresentationEditorProvider>
      </DialogContent>
    </Dialog>
  );
}

export function ProductVariantsTable({
  options,
  rows,
}: {
  options: string[];
  rows: ProductVariantRow[];
}) {
  const { query, filter, sort, page, setPage } = useVariantsView();
  const filtered = organizeVariants(rows, query, filter, sort);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const offset = currentPage * PAGE_SIZE;
  const visible = filtered.slice(offset, offset + PAGE_SIZE);
  const columns = options.length + 6;
  return (
    <div>
      <div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              {options.map((option) => (
                <TableHead key={option}>{option}</TableHead>
              ))}
              <TableHead className="text-right">Precio (USD)</TableHead>
              <TableHead className="text-right">Existencias</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead>Actualizado</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length ? (
              visible.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  {row.values.map((value, index) => (
                    <TableCell key={index} className="text-muted-foreground">
                      {value || "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">
                    {row.price}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.stock}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.createdAt}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.updatedAt}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.form ? (
                      <VariantEditor row={row} />
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No disponible
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns}
                  className="py-8 text-center text-muted-foreground"
                >
                  {rows.length
                    ? "No hay variantes con esta búsqueda o filtro."
                    : "Este producto aún no tiene variantes."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-xs text-muted-foreground">
        <p role="status">
          {filtered.length
            ? `${offset + 1}–${offset + visible.length} de ${filtered.length} variantes`
            : "0 variantes"}
        </p>
        {pageCount > 1 ? (
          <nav
            aria-label="Páginas de variantes"
            className="flex items-center gap-2"
          >
            <Button
              variant="outline"
              size="icon"
              aria-label="Página anterior"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span>
              Página {currentPage + 1} de {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Página siguiente"
              disabled={currentPage === pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
