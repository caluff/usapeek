import type { ProductDTO } from "@mercurjs/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "../workspace/components";
import { formatDate } from "../workspace/presentation";

export function ProductChangeHistory({
  changes,
}: {
  changes: NonNullable<ProductDTO["changes"]>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Observaciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.length ? (
          changes.map((change) => (
            <TableRow key={change.id}>
              <TableCell className="whitespace-nowrap align-top">
                {formatDate(change.created_at)}
              </TableCell>
              <TableCell className="align-top">
                <StatusBadge status={change.status} />
              </TableCell>
              <TableCell className="min-w-48 whitespace-pre-wrap break-words align-top">
                {change.external_note || change.declined_reason || "—"}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              colSpan={3}
              className="py-8 text-center text-muted-foreground"
            >
              No hay cambios registrados.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
